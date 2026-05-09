import { callDeepSeek } from "@/lib/ai/deepseek";

export type AssessmentMode = "self_test" | "interview" | "follow_up";
export type AssessmentLevel = "needs_review" | "partially_mastered" | "mastered";
export type AssessmentNextActionType = "review_section" | "follow_up" | "retry";

export type AssessmentCriterionInput = {
  criterion: string;
  points: number;
  description?: string;
};

export type AssessmentCriterionScore = {
  criterion: string;
  score: number;
  fullScore: number;
  feedback: string;
};

export type AssessmentInput = {
  questionId: string;
  question: string;
  mode: AssessmentMode;
  userAnswer: string;
  expectedPoints: string[];
  bonusPoints: string[];
  commonMistakes: string[];
  standardAnswer: string;
  scoringCriteria?: AssessmentCriterionInput[];
  nextFollowUpQuestion?: string | null;
  reviewTarget?: string | null;
};

export type AssessmentNextAction = {
  type: AssessmentNextActionType;
  target: string;
  reason: string;
};

export type AssessmentResult = {
  score: number;
  level: AssessmentLevel;
  hitPoints: string[];
  missingPoints: string[];
  wrongPoints: string[];
  expressionFeedback: string;
  recommendedAnswer: string;
  improvedAnswer: string;
  whyThisAnswer: string;
  criterionScores: AssessmentCriterionScore[];
  nextAction: AssessmentNextAction;
};

/**
 * 提取模型返回中的第一个 JSON 对象，兼容 Markdown 代码块和前后说明文字。
 * @param {string} value 模型原始返回文本。
 * @returns {string | null} 可直接 JSON.parse 的对象字符串。
 */
function extractJsonObject(value: string): string | null {
  const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const startIndex = text.indexOf("{");
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

/**
 * 根据评分数值映射掌握度等级。
 * @param {number} score 百分制得分。
 * @returns {AssessmentLevel} 掌握度等级。
 */
function deriveAssessmentLevel(score: number): AssessmentLevel {
  if (score >= 85) {
    return "mastered";
  }
  if (score >= 60) {
    return "partially_mastered";
  }
  return "needs_review";
}

/**
 * 为下一步动作生成稳定建议，避免前端各自猜测掌握度后的流转。
 * @param {AssessmentInput} input 当前评估输入。
 * @param {number} score 百分制得分。
 * @param {string[]} missingPoints 当前遗漏点。
 * @returns {AssessmentNextAction} 下一步动作建议。
 */
function buildNextAction(input: AssessmentInput, score: number, missingPoints: string[]): AssessmentNextAction {
  if (score >= 85 && input.nextFollowUpQuestion?.trim()) {
    return {
      type: "follow_up",
      target: input.nextFollowUpQuestion.trim(),
      reason: "主问题已基本掌握，可以继续追问，验证是否真的能展开到项目与边界层。",
    };
  }

  if (score >= 60) {
    return {
      type: "retry",
      target: missingPoints[0] ?? input.reviewTarget ?? "回到关键必答点，再用自己的话重答一遍。",
      reason: "已经有基础，但遗漏点仍明显，建议先针对遗漏点重答。",
    };
  }

  return {
    type: "review_section",
    target: input.reviewTarget ?? missingPoints[0] ?? "先回到深读正文里的核心原理、工程落地和常见误区部分。",
    reason: "当前回答还没覆盖核心点，建议先回看文档再重新组织表达。",
  };
}

/**
 * 从打分点中提炼一个适合做简单字符串命中的关键词。
 * @param {string} value 打分点或错误点原文。
 * @returns {string} 可用于兜底命中的关键短语。
 */
function toMatchNeedle(value: string): string {
  const segments = value
    .split(/[，。；：、（）()]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .sort((left, right) => right.length - left.length);
  return segments[0] ?? value.trim().slice(0, 12);
}

/**
 * 在模型失败时使用规则化兜底评分，保证训练流程不断。
 * @param {AssessmentInput} input 当前评估输入。
 * @returns {AssessmentResult} 基础可用的兜底评估结果。
 */
function buildFallbackAssessmentResult(input: AssessmentInput): AssessmentResult {
  const answer = input.userAnswer.trim();
  const hitPoints = input.expectedPoints.filter((item) => {
    const needle = toMatchNeedle(item);
    return needle.length > 0 && answer.includes(needle);
  });
  const missingPoints = input.expectedPoints.filter((item) => !hitPoints.includes(item));
  const wrongPoints = input.commonMistakes.filter((item) => {
    const needle = toMatchNeedle(item);
    return needle.length > 0 && answer.includes(needle);
  });
  const criterionScores = (input.scoringCriteria ?? []).map((criterion) => {
    const hit = answer.includes(toMatchNeedle(criterion.criterion));
    return {
      criterion: criterion.criterion,
      score: hit ? criterion.points : 0,
      fullScore: criterion.points,
      feedback: hit
        ? `已覆盖「${criterion.criterion}」相关表达。`
        : criterion.description || `还没有明确说明「${criterion.criterion}」。`,
    } satisfies AssessmentCriterionScore;
  });
  const ratio =
    input.expectedPoints.length > 0 ? hitPoints.length / input.expectedPoints.length : answer.length > 20 ? 0.7 : 0.3;
  const score = Math.max(
    20,
    Math.min(100, Math.round(ratio * 80 + Math.min(input.bonusPoints.length, 2) * 5 - wrongPoints.length * 8))
  );
  const level = deriveAssessmentLevel(score);

  return {
    score,
    level,
    hitPoints,
    missingPoints,
    wrongPoints,
    expressionFeedback:
      level === "mastered"
        ? "表达已经比较顺，可以继续补充项目细节和边界取舍。"
        : "建议先按“结论 -> 原理 -> 场景 -> 边界/风险”的顺序重组表达，减少跳跃叙述。",
    recommendedAnswer: input.standardAnswer.trim(),
    improvedAnswer: input.standardAnswer.trim(),
    whyThisAnswer:
      input.mode === "self_test"
        ? "这道题不是只看你知不知道名词，而是看你能不能把关键机制、边界和工程含义一起讲出来。"
        : "面试评分看的是“核心点是否命中 + 表达是否成体系”，而不是只背某一句标准话术。",
    criterionScores,
    nextAction: buildNextAction(input, score, missingPoints),
  };
}

/**
 * 生成统一学习评估引擎的提示词，供自测、面试和追问共用。
 * @param {AssessmentInput} input 当前评估输入。
 * @returns {string} 结构化评分提示词。
 */
function buildAssessmentPrompt(input: AssessmentInput): string {
  return [
    "你是 Assessment Engine / 学习评估引擎，请严格只输出 JSON，不要输出解释性前缀。",
    `评估模式：${input.mode}`,
    `题目：${input.question}`,
    "",
    "必答点：",
    input.expectedPoints.map((item) => `- ${item}`).join("\n") || "- 无",
    "",
    "加分点：",
    input.bonusPoints.map((item) => `- ${item}`).join("\n") || "- 无",
    "",
    "常见错误：",
    input.commonMistakes.map((item) => `- ${item}`).join("\n") || "- 无",
    "",
    "评分标准：",
    (input.scoringCriteria ?? [])
      .map((item) => `- ${item.criterion}（满分 ${item.points}）：${item.description ?? "请结合题目判断"}`)
      .join("\n") || "- 无",
    "",
    "推荐答案：",
    input.standardAnswer,
    "",
    "用户回答：",
    input.userAnswer,
    "",
    "请返回如下 JSON：",
    '{"score":number,"level":"needs_review|partially_mastered|mastered","hitPoints":[string],"missingPoints":[string],"wrongPoints":[string],"expressionFeedback":string,"recommendedAnswer":string,"improvedAnswer":string,"whyThisAnswer":string,"criterionScores":[{"criterion":string,"score":number,"fullScore":number,"feedback":string}],"nextAction":{"type":"review_section|follow_up|retry","target":string,"reason":string}}',
    "",
    "评分要求：",
    "1. score 使用 0-100 分。",
    "2. level 必须与 score 一致：85+ 为 mastered，60-84 为 partially_mastered，60 以下为 needs_review。",
    "3. hitPoints 写已经命中的核心点；missingPoints 写明显遗漏点；wrongPoints 写事实错误或误区。",
    "4. whyThisAnswer 要解释“为什么这道题应该这样答”，而不是重复标准答案。",
    "5. improvedAnswer 要在用户原回答基础上给一版更适合面试表达的答案。",
    "6. 如果输入模式是 interview 或 follow_up，且当前回答已基本掌握，同时给出一个 nextAction.type=follow_up 的追问建议；否则给 review_section 或 retry。",
  ].join("\n");
}

/**
 * 对单次学习回答执行统一评估，并输出稳定的结构化结果。
 * @param {AssessmentInput} input 当前评估输入。
 * @returns {Promise<AssessmentResult>} 统一结构化评估结果。
 */
export async function evaluateAssessment(input: AssessmentInput): Promise<AssessmentResult> {
  try {
    const response = await callDeepSeek({
      prompt: buildAssessmentPrompt(input),
      temperature: 0.2,
      maxTokens: 1400,
      timeoutMs: 18_000,
      maxRetries: 2,
      retryDelayMs: 800,
    });
    const jsonText = extractJsonObject(response);
    if (!jsonText) {
      return buildFallbackAssessmentResult(input);
    }

    const parsed = JSON.parse(jsonText) as Partial<AssessmentResult>;
    const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0;
    const normalizedResult: AssessmentResult = {
      score,
      level: deriveAssessmentLevel(score),
      hitPoints: Array.isArray(parsed.hitPoints) ? parsed.hitPoints.filter(Boolean) : [],
      missingPoints: Array.isArray(parsed.missingPoints) ? parsed.missingPoints.filter(Boolean) : [],
      wrongPoints: Array.isArray(parsed.wrongPoints) ? parsed.wrongPoints.filter(Boolean) : [],
      expressionFeedback: typeof parsed.expressionFeedback === "string" ? parsed.expressionFeedback.trim() : "",
      recommendedAnswer:
        typeof parsed.recommendedAnswer === "string" && parsed.recommendedAnswer.trim()
          ? parsed.recommendedAnswer.trim()
          : input.standardAnswer.trim(),
      improvedAnswer:
        typeof parsed.improvedAnswer === "string" && parsed.improvedAnswer.trim()
          ? parsed.improvedAnswer.trim()
          : input.standardAnswer.trim(),
      whyThisAnswer:
        typeof parsed.whyThisAnswer === "string" && parsed.whyThisAnswer.trim()
          ? parsed.whyThisAnswer.trim()
          : input.mode === "self_test"
            ? "这道题考的是你能不能把核心机制、边界和工程含义一起讲出来，而不是只背一个术语。"
            : "面试评分看的是核心点是否命中、表达是否有结构，以及你能否把原理和真实场景连起来。",
      criterionScores: Array.isArray(parsed.criterionScores)
        ? parsed.criterionScores
            .map((item) => {
              if (!item || typeof item !== "object") {
                return null;
              }
              const record = item as Partial<AssessmentCriterionScore>;
              if (typeof record.criterion !== "string" || !record.criterion.trim()) {
                return null;
              }
              return {
                criterion: record.criterion.trim(),
                score: typeof record.score === "number" ? record.score : 0,
                fullScore: typeof record.fullScore === "number" ? record.fullScore : 0,
                feedback: typeof record.feedback === "string" ? record.feedback.trim() : "",
              } satisfies AssessmentCriterionScore;
            })
            .filter((item): item is AssessmentCriterionScore => Boolean(item))
        : [],
      nextAction: buildNextAction(
        input,
        score,
        Array.isArray(parsed.missingPoints) ? parsed.missingPoints.filter(Boolean) : []
      ),
    };

    if (
      parsed.nextAction &&
      typeof parsed.nextAction === "object" &&
      typeof (parsed.nextAction as Partial<AssessmentNextAction>).type === "string" &&
      typeof (parsed.nextAction as Partial<AssessmentNextAction>).target === "string" &&
      typeof (parsed.nextAction as Partial<AssessmentNextAction>).reason === "string"
    ) {
      const nextAction = parsed.nextAction as AssessmentNextAction;
      normalizedResult.nextAction = {
        type:
          nextAction.type === "follow_up" || nextAction.type === "retry" || nextAction.type === "review_section"
            ? nextAction.type
            : normalizedResult.nextAction.type,
        target: nextAction.target.trim() || normalizedResult.nextAction.target,
        reason: nextAction.reason.trim() || normalizedResult.nextAction.reason,
      };
    }

    return normalizedResult;
  } catch (error) {
    console.warn("[assessmentEngine] fallback to rule-based assessment", {
      questionId: input.questionId,
      mode: input.mode,
      error: error instanceof Error ? error.message : String(error),
    });
    return buildFallbackAssessmentResult(input);
  }
}
