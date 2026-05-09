"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AssessmentResult } from "@/lib/learning/assessmentEngine";
import type { InterviewContent, SelfTest } from "@/lib/learning/content-contract";

type AssessmentSuccessResponse = {
  success: boolean;
  assessment: AssessmentResult;
  sessionId?: string | null;
  requestId?: string;
};

type AssessmentFailureResponse = {
  success: false;
  errorCode?: string;
  message?: string;
  retryable?: boolean;
  requestId?: string;
  fallback?: {
    hitPoints?: string[];
    missingPoints?: string[];
  };
  error?: string;
};

type AssessmentApiResponse = AssessmentSuccessResponse;

type AssessmentFailureState = {
  message: string;
  errorCode?: string;
  retryable: boolean;
  requestId?: string;
};

type SelfTestAssessmentCardProps = {
  questionId: string;
  kbId: string;
  categoryId: string;
  test: SelfTest;
  index: number;
};

type InterviewTrainingPanelProps = {
  questionId: string;
  kbId: string;
  categoryId: string;
  title: string;
  interviewContent?: InterviewContent;
  targetedPracticePath: string;
  onBackToDeep: () => void;
};

type InterviewStage = "draft" | "scored" | "improved" | "followup";

class AssessmentRequestError extends Error {
  code?: string;
  retryable: boolean;
  requestId?: string;

  /**
   * 创建统一学习评估失败错误，便于前台展示结构化失败态。
   * @param {{ message: string; code?: string; retryable?: boolean; requestId?: string }} options 错误元信息。
   */
  constructor(options: { message: string; code?: string; retryable?: boolean; requestId?: string }) {
    super(options.message);
    this.name = "AssessmentRequestError";
    this.code = options.code;
    this.retryable = options.retryable ?? true;
    this.requestId = options.requestId;
  }
}

/**
 * 将掌握度等级映射为前台可读文案。
 * @param {AssessmentResult["level"]} level 评估等级。
 * @returns {{ text: string; tone: string }} 展示所需的文案和样式色调。
 */
function getAssessmentLevelMeta(level: AssessmentResult["level"]): { text: string; tone: string } {
  if (level === "mastered") {
    return { text: "已掌握", tone: "good" };
  }
  if (level === "partially_mastered") {
    return { text: "部分掌握", tone: "warn" };
  }
  return { text: "需要回看", tone: "danger" };
}

/**
 * 生成面试回答框架提示，帮助用户先答再看答案。
 * @param {InterviewContent | undefined} interviewContent 当前题目的面试内容。
 * @returns {string[]} 可直接展示的回答框架。
 */
function buildInterviewFramework(interviewContent?: InterviewContent): string[] {
  const essential = interviewContent?.essentialPoints.map((item) => item.point) ?? [];
  return [
    "先用一句话直接给结论，不要一上来先铺背景。",
    `第二步补核心原理：${essential.slice(0, 2).join("；") || "把关键机制讲清楚。"} `,
    "第三步补真实场景、边界风险和工程取舍，让答案从“知道”升级到“会用”。",
  ];
}

/**
 * 统计回答中命中的要点数量，供面试评分态快速展示。
 * @param {string[]} sourcePoints 标准要点列表。
 * @param {string[]} hitPoints 当前评估命中的点。
 * @returns {number} 命中数量。
 */
function countMatchedPoints(sourcePoints: string[], hitPoints: string[]): number {
  if (sourcePoints.length === 0 || hitPoints.length === 0) {
    return 0;
  }

  return sourcePoints.filter((point) => hitPoints.some((item) => item.includes(point) || point.includes(item))).length;
}

/**
 * 调用统一学习评估接口，返回结构化评估结果。
 * @param {Record<string, unknown>} payload 请求参数。
 * @returns {Promise<AssessmentApiResponse>} 统一评估响应。
 */
async function requestAssessment(payload: Record<string, unknown>): Promise<AssessmentApiResponse> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("/api/learning/assessment", requestInit);
    const rawText = await response.text();
    let parsed: AssessmentSuccessResponse | AssessmentFailureResponse | null = null;

    if (rawText.trim()) {
      try {
        parsed = JSON.parse(rawText) as AssessmentSuccessResponse | AssessmentFailureResponse;
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          continue;
        }
        throw new AssessmentRequestError({
          message: error instanceof Error ? error.message : "学习评估返回解析失败",
          code: "INVALID_JSON",
          retryable: true,
        });
      }
    }

    if (!response.ok || (parsed && parsed.success === false)) {
      const failure = parsed && parsed.success === false ? parsed : null;
      throw new AssessmentRequestError({
        message: failure?.message || failure?.error || rawText || "学习评估失败",
        code: failure?.errorCode || `HTTP_${response.status}`,
        retryable: failure?.retryable ?? response.status >= 500,
        requestId: failure?.requestId,
      });
    }

    if (parsed && parsed.success) {
      return parsed;
    }

    if (attempt === 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      continue;
    }
  }

  throw new AssessmentRequestError({
    message: "学习评估返回为空，请重试",
    code: "EMPTY_RESPONSE",
    retryable: true,
  });
}

/**
 * 将未知错误收口为前台可展示的结构化失败态。
 * @param {unknown} error 任意异常对象。
 * @returns {AssessmentFailureState} 标准失败态信息。
 */
function toAssessmentFailureState(error: unknown): AssessmentFailureState {
  if (error instanceof AssessmentRequestError) {
    return {
      message: error.message,
      errorCode: error.code,
      retryable: error.retryable,
      requestId: error.requestId,
    };
  }

  return {
    message: error instanceof Error ? error.message : "学习评估失败，请稍后重试",
    retryable: true,
  };
}

/**
 * 复制用户当前回答，避免评分失败时内容丢失。
 * @param {string} value 要复制的文本。
 * @returns {Promise<boolean>} 是否复制成功。
 */
async function copyAnswerText(value: string): Promise<boolean> {
  if (typeof window === "undefined" || !value.trim()) {
    return false;
  }

  try {
    await window.navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 生成训练输入的本地缓存 key，避免评分失败时用户答案丢失。
 * @param {string} scope 缓存作用域。
 * @param {string} questionId 题目 ID。
 * @param {string} suffix 附加标识。
 * @returns {string} 本地缓存 key。
 */
function buildAnswerStorageKey(scope: string, questionId: string, suffix: string): string {
  return `learning-assessment:${scope}:${questionId}:${suffix}`;
}

/**
 * 读取本地缓存中的回答草稿。
 * @param {string} key 缓存 key。
 * @returns {string} 已缓存的回答。
 */
function readStoredAnswer(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * 写入本地缓存中的回答草稿。
 * @param {string} key 缓存 key。
 * @param {string} value 回答内容。
 * @returns {void}
 */
function writeStoredAnswer(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

/**
 * 删除已不再需要的回答草稿缓存。
 * @param {string} key 缓存 key。
 * @returns {void}
 */
function clearStoredAnswer(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

/**
 * 从评分要点中提取可用于降级命中检查的关键词。
 * @param {string} point 标准要点。
 * @returns {string[]} 关键词列表。
 */
function extractPointKeywords(point: string): string[] {
  const normalized = point.toLowerCase().trim();
  const tokens = normalized
    .split(/[\s,，。；;：:、/()（）\-]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  if (tokens.length === 0 && normalized.length >= 2) {
    return [normalized];
  }

  return Array.from(new Set(tokens));
}

/**
 * 判断用户回答是否覆盖某个评分点，用于 AI 评分失败时的本地降级命中检查。
 * @param {string} answer 用户回答。
 * @param {string} point 标准要点。
 * @returns {boolean} 是否命中。
 */
function matchesPoint(answer: string, point: string): boolean {
  const normalizedAnswer = answer.toLowerCase();
  const keywords = extractPointKeywords(point);
  return keywords.some((item) => normalizedAnswer.includes(item));
}

/**
 * 根据基础关键词命中结果生成降级评分，避免评分失败时前台完全空白。
 * @param {{ mode: "self_test" | "interview" | "follow_up"; userAnswer: string; expectedPoints: string[]; bonusPoints: string[]; standardAnswer: string; reviewTarget: string; nextFollowUpQuestion?: string | null }} options 降级评分输入。
 * @returns {AssessmentResult} 降级后的结果卡内容。
 */
function buildFallbackAssessmentResult(options: {
  mode: "self_test" | "interview" | "follow_up";
  userAnswer: string;
  expectedPoints: string[];
  bonusPoints: string[];
  standardAnswer: string;
  reviewTarget: string;
  nextFollowUpQuestion?: string | null;
}): AssessmentResult {
  const hitExpected = options.expectedPoints.filter((item) => matchesPoint(options.userAnswer, item));
  const hitBonus = options.bonusPoints.filter((item) => matchesPoint(options.userAnswer, item));
  const hitPoints = [...hitExpected, ...hitBonus];
  const missingPoints = options.expectedPoints.filter((item) => !hitExpected.includes(item));
  const expectedRatio = options.expectedPoints.length > 0 ? hitExpected.length / options.expectedPoints.length : 0.5;
  const bonusRatio = options.bonusPoints.length > 0 ? hitBonus.length / options.bonusPoints.length : 0;
  const score = Math.max(35, Math.min(92, Math.round(expectedRatio * 75 + bonusRatio * 15 + 10)));
  const level: AssessmentResult["level"] =
    score >= 85 ? "mastered" : score >= 60 ? "partially_mastered" : "needs_review";

  return {
    score,
    level,
    hitPoints,
    missingPoints,
    wrongPoints: [],
    expressionFeedback:
      "AI 评分暂时不可用，当前先给你基础命中检查。建议按“结论 -> 机制 -> 过程 -> 例子”这个顺序重答一遍。",
    recommendedAnswer: options.standardAnswer,
    improvedAnswer: options.standardAnswer,
    whyThisAnswer:
      options.mode === "self_test"
        ? "这是一份降级结果，先帮你看命中了哪些关键词；真正高质量回答还要把机制、边界和工程意义串起来。"
        : "这是一份降级结果，先帮你检查主干有没有说到；后续 AI 评分恢复后再看表达、结构和追问质量。",
    criterionScores: [],
    nextAction:
      options.mode !== "self_test" && options.nextFollowUpQuestion
        ? {
            type: "follow_up",
            target: options.nextFollowUpQuestion,
            reason: "主干命中检查已完成，建议继续用追问巩固表达。",
          }
        : {
            type: "review_section",
            target: options.reviewTarget,
            reason: "当前先返回基础命中检查，建议回看核心缺口后再重新作答。",
          },
  };
}

/**
 * 渲染统一评估结果卡片，供自测和面试模式复用。
 * @param {{ result: AssessmentResult; heading?: string; variant?: "self_test" | "interview" | "follow_up" }} props 评估结果与可选标题。
 * @returns {ReactNode} 反馈卡片。
 */
function AssessmentFeedbackCard(props: {
  result: AssessmentResult;
  heading?: string;
  variant?: "self_test" | "interview" | "follow_up";
}): ReactNode {
  const { result, heading, variant = "interview" } = props;
  const levelMeta = getAssessmentLevelMeta(result.level);
  const nextActionMeta =
    result.nextAction.type === "follow_up"
      ? {
          title: "下一轮追问",
          targetLabel: "建议追问",
        }
      : result.nextAction.type === "review_section"
        ? {
            title: "建议回看",
            targetLabel: "回看重点",
          }
        : {
            title: "建议重答",
            targetLabel: "重答重点",
          };

  const summaryItems = [
    { label: "命中点", value: String(result.hitPoints.length) },
    { label: "遗漏点", value: String(result.missingPoints.length) },
    { label: "事实错误", value: String(result.wrongPoints.length) },
    ...(result.criterionScores.length > 0 ? [{ label: "评分项", value: String(result.criterionScores.length) }] : []),
  ];

  return (
    <section className="learning-assessment-card">
      <div className="learning-assessment-card__head">
        <div>
          <span className="learning-assessment-card__eyebrow">{heading || "本题掌握报告"}</span>
          <strong>{result.score} / 100</strong>
        </div>
        <span className={`learning-assessment-card__level learning-assessment-card__level--${levelMeta.tone}`}>
          {levelMeta.text}
        </span>
      </div>

      <section className="learning-assessment-card__summary">
        {summaryItems.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      {result.hitPoints.length > 0 ? (
        <div className="learning-assessment-card__block">
          <h3>答得好的地方</h3>
          <ul>
            {result.hitPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.missingPoints.length > 0 ? (
        <div className="learning-assessment-card__block">
          <h3>{variant === "self_test" ? "还缺什么" : "还可以补什么"}</h3>
          <ul>
            {result.missingPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.wrongPoints.length > 0 ? (
        <div className="learning-assessment-card__block">
          <h3>事实错误</h3>
          <ul>
            {result.wrongPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.criterionScores.length > 0 ? (
        <div className="learning-assessment-card__block">
          <h3>评分标准拆解</h3>
          <div className="learning-assessment-card__criteria">
            {result.criterionScores.map((item) => (
              <article key={item.criterion}>
                <strong>
                  {item.criterion} · {item.score}/{item.fullScore}
                </strong>
                <p>{item.feedback}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {result.expressionFeedback ? (
        <div className="learning-assessment-card__block">
          <h3>表达建议</h3>
          <p>{result.expressionFeedback}</p>
        </div>
      ) : null}

      {result.whyThisAnswer ? (
        <div className="learning-assessment-card__block">
          <h3>为什么这样答</h3>
          <p>{result.whyThisAnswer}</p>
        </div>
      ) : null}

      {variant === "self_test" && result.recommendedAnswer ? (
        <div className="learning-assessment-card__block">
          <h3>推荐答案</h3>
          <p>{result.recommendedAnswer}</p>
        </div>
      ) : null}

      {variant !== "self_test" && result.improvedAnswer ? (
        <div className="learning-assessment-card__block">
          <h3>改进版回答</h3>
          <p>{result.improvedAnswer}</p>
        </div>
      ) : null}

      {variant === "self_test" &&
      result.improvedAnswer &&
      result.recommendedAnswer &&
      result.improvedAnswer !== result.recommendedAnswer ? (
        <div className="learning-assessment-card__block">
          <h3>更顺的表达</h3>
          <p>{result.improvedAnswer}</p>
        </div>
      ) : null}

      <div className="learning-assessment-card__next">
        <span>{nextActionMeta.title}</span>
        <p>{result.nextAction.reason}</p>
        <strong>
          {nextActionMeta.targetLabel}：{result.nextAction.target}
        </strong>
      </div>
    </section>
  );
}

/**
 * 渲染评分失败但回答已保留的提示卡，统一提供重试、查看参考和复制回答入口。
 * @param {{ title: string; failure: AssessmentFailureState; onRetry: () => void; onToggleReference?: () => void; referenceVisible?: boolean; onCopyAnswer?: () => void; copyLabel?: string }} props 失败态展示参数。
 * @returns {ReactNode} 失败提示卡片。
 */
function AssessmentFailureInline(props: {
  title: string;
  failure: AssessmentFailureState;
  onRetry: () => void;
  onToggleReference?: () => void;
  referenceVisible?: boolean;
  onCopyAnswer?: () => void;
  copyLabel?: string;
}): ReactNode {
  const { title, failure, onRetry, onToggleReference, referenceVisible = false, onCopyAnswer, copyLabel = "复制我的回答" } = props;

  return (
    <div className="learning-assessment-inline learning-assessment-inline--warning">
      <h3>{title}</h3>
      <p>{failure.message}</p>
      <p>你的回答已自动保存在本地草稿，当前先展示基础命中检查，避免这一轮训练直接中断。</p>
      {failure.errorCode || failure.requestId ? (
        <p className="learning-assessment-meta">
          {failure.errorCode ? `错误编号：${failure.errorCode}` : ""}
          {failure.errorCode && failure.requestId ? " · " : ""}
          {failure.requestId ? `请求号：${failure.requestId}` : ""}
        </p>
      ) : null}
      <div className="learning-assessment-actions">
        <button type="button" className="learning-rich-train-button" onClick={onRetry}>
          {failure.retryable ? "重新评分" : "重新提交"}
        </button>
        {onToggleReference ? (
          <button type="button" className="learning-text-action" onClick={onToggleReference}>
            {referenceVisible ? "收起参考答案" : "先看参考答案"}
          </button>
        ) : null}
        {onCopyAnswer ? (
          <button type="button" className="learning-text-action" onClick={onCopyAnswer}>
            {copyLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 渲染训练模式的简化评分标准，帮助用户边答边看关键命中点。
 * @param {{ essentialPoints: string[]; bonusPoints?: string[] }} props 评分标准数据。
 * @returns {ReactNode} 评分标准卡片。
 */
function AssessmentRubricCard(props: { essentialPoints: string[]; bonusPoints?: string[] }): ReactNode {
  const { essentialPoints, bonusPoints = [] } = props;

  if (essentialPoints.length === 0 && bonusPoints.length === 0) {
    return null;
  }

  return (
    <section className="learning-assessment-rubric">
      <div className="learning-assessment-rubric__head">
        <span>评分标准</span>
        <strong>先覆盖主干，再补加分点</strong>
      </div>
      {essentialPoints.length > 0 ? (
        <div className="learning-assessment-rubric__group">
          <h3>必答</h3>
          <ul>
            {essentialPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {bonusPoints.length > 0 ? (
        <div className="learning-assessment-rubric__group">
          <h3>加分</h3>
          <ul>
            {bonusPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * 单道自测题的交互卡片，统一走学习评估引擎。
 * @param {SelfTestAssessmentCardProps} props 自测题参数。
 * @returns {ReactNode} 自测交互组件。
 */
export function SelfTestAssessmentCard(props: SelfTestAssessmentCardProps): ReactNode {
  const { questionId, kbId, categoryId, test, index } = props;
  const storageKey = useMemo(() => buildAnswerStorageKey("self_test", questionId, String(index)), [index, questionId]);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AssessmentFailureState | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");

  useEffect(() => {
    setAnswer(readStoredAnswer(storageKey));
    setSubmitting(false);
    setError(null);
    setResult(null);
    setShowReference(false);
    setCopyFeedback("");
  }, [storageKey]);

  useEffect(() => {
    writeStoredAnswer(storageKey, answer);
  }, [answer, storageKey]);

  /**
   * 提交自测回答并获取结构化反馈。
   * @returns {Promise<void>} 提交结束。
   */
  async function handleSubmit(): Promise<void> {
    if (!answer.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const data = await requestAssessment({
        questionId,
        kbId,
        categoryId,
        mode: "self_test",
        selfTestIndex: index,
        userAnswer: answer.trim(),
      });
      setResult(data.assessment);
      clearStoredAnswer(storageKey);
    } catch (submissionError) {
      setError(toAssessmentFailureState(submissionError));
      setResult(
        buildFallbackAssessmentResult({
          mode: "self_test",
          userAnswer: answer.trim(),
          expectedPoints: test.gradingCriteria?.length
            ? test.gradingCriteria.map((item) => item.criterion).filter(Boolean)
            : ([test.question, test.hint].filter(Boolean) as string[]),
          bonusPoints: [],
          standardAnswer: test.answer || "评分服务暂时不可用，请先对照标准答案检查自己的回答。",
          reviewTarget: "回看本题核心要点、流程图解和工程落地后再重答一次。",
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 复制当前回答，便于评分失败时手动保存。
   * @returns {Promise<void>} 复制结束。
   */
  async function handleCopyAnswer(): Promise<void> {
    const copied = await copyAnswerText(answer);
    setCopyFeedback(copied ? "已复制回答" : "复制失败，请手动复制");
    window.setTimeout(() => setCopyFeedback(""), 1800);
  }

  return (
    <article className="learning-selftest-card">
      <span>{test.label || `自测题 ${index + 1}`}</span>
      <strong>{test.question}</strong>
      {test.hint ? <p>{test.hint}</p> : null}

      <textarea
        className="learning-assessment-textarea"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="先用自己的话回答，再看反馈。"
      />

      <div className="learning-assessment-actions">
        <button type="button" className="learning-rich-train-button" disabled={!answer.trim() || submitting} onClick={() => void handleSubmit()}>
          {submitting ? "评估中..." : "提交自测"}
        </button>
        <button
          type="button"
          className="learning-text-action"
          disabled={!test.answer}
          onClick={() => setShowReference((current) => !current)}
        >
          {showReference ? "收起参考答案" : error || result ? "先看参考答案" : "查看参考答案"}
        </button>
      </div>

      {!result ? <p className="learning-assessment-tip">先提交自测，系统会给你得分、命中点、遗漏点和推荐答案。回答草稿会自动保存。</p> : null}

      {error ? (
        <AssessmentFailureInline
          title="评分暂时失败，但你的回答已保留"
          failure={error}
          onRetry={() => void handleSubmit()}
          onToggleReference={() => setShowReference((current) => !current)}
          referenceVisible={showReference}
          onCopyAnswer={() => void handleCopyAnswer()}
          copyLabel={copyFeedback || "复制我的回答"}
        />
      ) : null}
      {showReference && test.answer ? (
        <div className="learning-assessment-inline">
          <h3>参考答案</h3>
          <p>{test.answer}</p>
        </div>
      ) : null}
      {result ? <AssessmentFeedbackCard result={result} heading="自测反馈" variant="self_test" /> : null}
    </article>
  );
}

/**
 * 文档页的面试训练面板，按“未作答 -> 已评分 -> 改进答案 -> 继续追问”四个状态运行。
 * @param {InterviewTrainingPanelProps} props 面试训练所需参数。
 * @returns {ReactNode} 面试模式训练面板。
 */
export function InterviewTrainingPanel(props: InterviewTrainingPanelProps): ReactNode {
  const { questionId, kbId, categoryId, title, interviewContent, targetedPracticePath, onBackToDeep } = props;
  const [followUpIndex, setFollowUpIndex] = useState(0);
  const mainStorageKey = useMemo(() => buildAnswerStorageKey("interview", questionId, "main"), [questionId]);
  const followUpStorageKey = useMemo(
    () => buildAnswerStorageKey("follow_up", questionId, String(followUpIndex)),
    [followUpIndex, questionId]
  );
  const [stage, setStage] = useState<InterviewStage>("draft");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AssessmentFailureState | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showFramework, setShowFramework] = useState(false);
  const [show30sAnswer, setShow30sAnswer] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const [followUpError, setFollowUpError] = useState<AssessmentFailureState | null>(null);
  const [followUpResult, setFollowUpResult] = useState<AssessmentResult | null>(null);
  const [followUpHistory, setFollowUpHistory] = useState<Array<{ question: string; answer: string; result: AssessmentResult }>>([]);
  const [copyMainFeedback, setCopyMainFeedback] = useState("");
  const [copyFollowUpFeedback, setCopyFollowUpFeedback] = useState("");

  const followUps = useMemo(() => interviewContent?.followUps ?? [], [interviewContent]);
  const framework = useMemo(() => buildInterviewFramework(interviewContent), [interviewContent]);
  const essentialPoints = useMemo(() => interviewContent?.essentialPoints.map((item) => item.point) ?? [], [interviewContent]);
  const bonusPoints = useMemo(() => interviewContent?.bonusPoints.map((item) => item.point) ?? [], [interviewContent]);
  const advancedPoints = useMemo(() => interviewContent?.advancedPoints.map((item) => item.point) ?? [], [interviewContent]);
  const rubricBonusPoints = useMemo(
    () => [...bonusPoints, ...advancedPoints],
    [advancedPoints, bonusPoints]
  );
  const mainScoreSummary = useMemo(() => {
    if (!result) {
      return [];
    }

    return [
      {
        label: "必答点命中",
        value: `${countMatchedPoints(essentialPoints, result.hitPoints)}/${essentialPoints.length}`,
      },
      {
        label: "加分点命中",
        value: `${countMatchedPoints(bonusPoints, result.hitPoints)}/${bonusPoints.length}`,
      },
      {
        label: "进阶点命中",
        value: `${countMatchedPoints(advancedPoints, result.hitPoints)}/${advancedPoints.length}`,
      },
    ];
  }, [advancedPoints, bonusPoints, essentialPoints, result]);

  useEffect(() => {
    setStage("draft");
    setAnswer(readStoredAnswer(mainStorageKey));
    setSubmitting(false);
    setError(null);
    setResult(null);
    setSessionId(null);
    setShowHint(false);
    setShowFramework(false);
    setShow30sAnswer(false);
    setFollowUpIndex(0);
    setFollowUpQuestion("");
    setFollowUpAnswer("");
    setFollowUpSubmitting(false);
    setFollowUpError(null);
    setFollowUpResult(null);
    setFollowUpHistory([]);
    setCopyMainFeedback("");
    setCopyFollowUpFeedback("");
  }, [mainStorageKey, questionId]);

  useEffect(() => {
    writeStoredAnswer(mainStorageKey, answer);
  }, [answer, mainStorageKey]);

  useEffect(() => {
    writeStoredAnswer(followUpStorageKey, followUpAnswer);
  }, [followUpAnswer, followUpStorageKey]);

  /**
   * 提交主问题回答并进入评分状态。
   * @returns {Promise<void>} 提交结束。
   */
  async function handleSubmitMainAnswer(): Promise<void> {
    if (!answer.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const data = await requestAssessment({
        questionId,
        kbId,
        categoryId,
        mode: "interview",
        userAnswer: answer.trim(),
      });
      setResult(data.assessment);
      setSessionId(data.sessionId ?? null);
      setStage("scored");
      clearStoredAnswer(mainStorageKey);
    } catch (submissionError) {
      setError(toAssessmentFailureState(submissionError));
      setResult(
        buildFallbackAssessmentResult({
          mode: "interview",
          userAnswer: answer.trim(),
          expectedPoints: essentialPoints,
          bonusPoints: [...bonusPoints, ...advancedPoints],
          standardAnswer: interviewContent?.answer2min || interviewContent?.answer30s || interviewContent?.advancedAnswer || title,
          reviewTarget: "回看必答点、加分点、进阶点和流程图解。",
          nextFollowUpQuestion: followUps[0]?.question || null,
        })
      );
      setStage("scored");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 准备进入追问状态，优先使用上一轮评分给出的下一题。
   * @returns {void}
   */
  function handleOpenFollowUp(): void {
    const nextQuestion =
      (followUpResult?.nextAction.type === "follow_up" ? followUpResult.nextAction.target : "") ||
      (result?.nextAction.type === "follow_up" ? result.nextAction.target : "") ||
      followUps[followUpIndex]?.question ||
      "";
    setFollowUpQuestion(nextQuestion);
    setFollowUpAnswer(readStoredAnswer(followUpStorageKey));
    setFollowUpError(null);
    setFollowUpResult(null);
    setStage("followup");
  }

  /**
   * 提交追问回答并继续生成下一轮建议。
   * @returns {Promise<void>} 提交结束。
   */
  async function handleSubmitFollowUp(): Promise<void> {
    if (!followUpAnswer.trim() || !followUpQuestion.trim()) {
      return;
    }

    setFollowUpSubmitting(true);
    setFollowUpError(null);
    try {
      const data = await requestAssessment({
        questionId,
        kbId,
        categoryId,
        mode: "follow_up",
        userAnswer: followUpAnswer.trim(),
        followUpIndex,
        followUpQuestion,
        sessionId,
      });
      setFollowUpResult(data.assessment);
      setSessionId(data.sessionId ?? sessionId);
      setFollowUpHistory((current) => [
        ...current,
        {
          question: followUpQuestion,
          answer: followUpAnswer.trim(),
          result: data.assessment,
        },
      ]);
      clearStoredAnswer(followUpStorageKey);
    } catch (submissionError) {
      const fallbackResult = buildFallbackAssessmentResult({
          mode: "follow_up",
          userAnswer: followUpAnswer.trim(),
          expectedPoints: followUps[followUpIndex]?.keyAnswer?.trim()
            ? [followUps[followUpIndex].keyAnswer!.trim()]
            : essentialPoints,
          bonusPoints,
          standardAnswer: interviewContent?.answer2min || interviewContent?.answer30s || interviewContent?.advancedAnswer || title,
          reviewTarget: "回看上一轮评分结果、必答点和改进版回答。",
          nextFollowUpQuestion: followUps[followUpIndex + 1]?.question || null,
        });
      setFollowUpError(toAssessmentFailureState(submissionError));
      setFollowUpResult(fallbackResult);
      setFollowUpHistory((current) => [
        ...current,
        {
          question: followUpQuestion,
          answer: followUpAnswer.trim(),
          result: fallbackResult,
        },
      ]);
    } finally {
      setFollowUpSubmitting(false);
    }
  }

  /**
   * 根据最新追问结果推进到下一轮追问。
   * @returns {void}
   */
  function handleContinueFollowUp(): void {
    const nextIndex = Math.min(followUpIndex + 1, Math.max(followUps.length - 1, 0));
    const nextQuestion =
      (followUpResult?.nextAction.type === "follow_up" ? followUpResult.nextAction.target : "") ||
      followUps[nextIndex]?.question ||
      "";
    setFollowUpIndex(nextIndex);
    setFollowUpQuestion(nextQuestion);
    setFollowUpAnswer("");
    setFollowUpResult(null);
    setFollowUpError(null);
  }

  /**
   * 复制主问题回答，便于评分失败时用户立即保留内容。
   * @returns {Promise<void>} 复制结束。
   */
  async function handleCopyMainAnswer(): Promise<void> {
    const copied = await copyAnswerText(answer);
    setCopyMainFeedback(copied ? "已复制回答" : "复制失败，请手动复制");
    window.setTimeout(() => setCopyMainFeedback(""), 1800);
  }

  /**
   * 复制追问回答，便于评分失败时用户立即保留内容。
   * @returns {Promise<void>} 复制结束。
   */
  async function handleCopyFollowUpAnswer(): Promise<void> {
    const copied = await copyAnswerText(followUpAnswer);
    setCopyFollowUpFeedback(copied ? "已复制回答" : "复制失败，请手动复制");
    window.setTimeout(() => setCopyFollowUpFeedback(""), 1800);
  }

  if (!interviewContent) {
    return null;
  }

  return (
    <section className="learning-rich-interview">
      <div className="learning-rich-interview__question">
        <span>面试模式</span>
        <h2>{interviewContent.question || title}</h2>
        <p>这里不是答案展示页，而是训练页。先答，再评分，再给改进版答案，最后继续追问。</p>
      </div>

      <div className="learning-rich-panel">
        <h2>问题变体</h2>
        <ul>
          {(interviewContent.questionVariants.length > 0 ? interviewContent.questionVariants : [interviewContent.question || title]).map(
            (item) => (
              <li key={item}>{item}</li>
            )
          )}
        </ul>
      </div>

      <div className="learning-rich-answer-grid">
        <article>
          <h3>必答点</h3>
          <ul>
            {interviewContent.essentialPoints.map((item) => (
              <li key={item.point}>{item.point}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>加分点</h3>
          <ul>
            {interviewContent.bonusPoints.map((item) => (
              <li key={item.point}>{item.point}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>进阶点</h3>
          <ul>
            {interviewContent.advancedPoints.map((item) => (
              <li key={item.point}>{item.point}</li>
            ))}
          </ul>
        </article>
      </div>

      {stage === "draft" ? (
        <section className="learning-rich-panel learning-rich-panel--tests">
          <h2>先试着回答</h2>
          <p className="learning-assessment-tip">先自己答，再看评分报告。系统会按必答点、加分点、进阶点给你反馈，回答草稿会自动保存。</p>
          <AssessmentRubricCard
            essentialPoints={interviewContent.essentialPoints.map((item) => item.point)}
            bonusPoints={rubricBonusPoints}
          />
          <textarea
            className="learning-assessment-textarea"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="先不要看完整答案，试着自己说一遍。"
          />
          <div className="learning-assessment-actions">
            <button type="button" className="learning-text-action" onClick={() => setShowHint((current) => !current)}>
              {showHint ? "收起提示" : "给我提示"}
            </button>
            <button type="button" className="learning-text-action" onClick={() => setShowFramework((current) => !current)}>
              {showFramework ? "收起框架" : "给我回答框架"}
            </button>
            <button type="button" className="learning-text-action" onClick={() => setShow30sAnswer((current) => !current)}>
              {show30sAnswer ? "收起 30 秒答案" : "我先看 30 秒答案"}
            </button>
            <button type="button" className="learning-rich-train-button" disabled={!answer.trim() || submitting} onClick={() => void handleSubmitMainAnswer()}>
              {submitting ? "评分中..." : "提交回答"}
            </button>
          </div>

          {showHint ? (
            <div className="learning-assessment-inline">
              <h3>提示 · 不直接给答案</h3>
              <ul>
                {interviewContent.essentialPoints.map((item) => (
                  <li key={item.point}>
                    {item.point}
                    {item.why ? `：${item.why}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showFramework ? (
            <div className="learning-assessment-inline">
              <h3>回答框架 · 帮你组织表达</h3>
              <ol>
                {framework.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {show30sAnswer && interviewContent.answer30s ? (
            <div className="learning-assessment-inline">
              <h3>30 秒答案 · 看完建议再自己答一遍</h3>
              <p>{interviewContent.answer30s}</p>
            </div>
          ) : null}

          {error ? (
            <AssessmentFailureInline
              title="评分暂时失败，但你的回答已保留"
              failure={error}
              onRetry={() => void handleSubmitMainAnswer()}
              onToggleReference={() => setShow30sAnswer((current) => !current)}
              referenceVisible={show30sAnswer}
              onCopyAnswer={() => void handleCopyMainAnswer()}
              copyLabel={copyMainFeedback || "复制我的回答"}
            />
          ) : null}
        </section>
      ) : null}

      {stage === "scored" && result ? (
        <>
          <section className="learning-assessment-summary">
            {mainScoreSummary.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </section>
          <AssessmentFeedbackCard result={result} heading="评分结果" variant="interview" />
          <div className="learning-assessment-actions">
            <button type="button" className="learning-rich-train-button" onClick={() => setStage("improved")}>
              看改进版答案
            </button>
            <button type="button" className="learning-text-action" onClick={handleOpenFollowUp}>
              继续追问
            </button>
            <button type="button" className="learning-text-action" onClick={() => setStage("draft")}>
              重新回答主问题
            </button>
          </div>
        </>
      ) : null}

      {stage === "improved" && result ? (
        <>
          <section className="learning-assessment-inline">
            <h3>你的原回答</h3>
            <p>{answer}</p>
          </section>
          <section className="learning-assessment-inline">
            <h3>改进版回答</h3>
            <p>{result.improvedAnswer}</p>
          </section>
          <section className="learning-assessment-inline">
            <h3>为什么这样改</h3>
            <p>{result.whyThisAnswer}</p>
          </section>
          <div className="learning-rich-answer-grid">
            {[
              ["30 秒版", interviewContent.answer30s],
              ["2 分钟版", interviewContent.answer2min],
              ["高级版", interviewContent.advancedAnswer],
            ].map(([label, content]) =>
              content ? (
                <article key={label}>
                  <h3>{label}</h3>
                  <p>{content}</p>
                </article>
              ) : null
            )}
          </div>
          <div className="learning-assessment-actions">
            <button type="button" className="learning-rich-train-button" onClick={handleOpenFollowUp}>
              进入追问
            </button>
            <button type="button" className="learning-text-action" onClick={() => setStage("scored")}>
              回到评分结果
            </button>
          </div>
        </>
      ) : null}

      {stage === "followup" ? (
        <section className="learning-rich-panel learning-rich-panel--tests">
          <h2>继续追问</h2>
          <div className="learning-assessment-inline">
            <h3>面试官追问</h3>
            <p>{followUpQuestion || followUps[followUpIndex]?.question || "请继续补充一个更贴近项目落地的例子。"}</p>
          </div>

          <textarea
            className="learning-assessment-textarea"
            value={followUpAnswer}
            onChange={(event) => setFollowUpAnswer(event.target.value)}
            placeholder="继续回答这一轮追问。"
          />

          <div className="learning-assessment-actions">
            <button
              type="button"
              className="learning-rich-train-button"
              disabled={!followUpAnswer.trim() || followUpSubmitting}
              onClick={() => void handleSubmitFollowUp()}
            >
              {followUpSubmitting ? "评分中..." : "提交追问回答"}
            </button>
            <button type="button" className="learning-text-action" onClick={() => setStage("improved")}>
              回看改进版
            </button>
          </div>

          {followUpError ? (
            <AssessmentFailureInline
              title="追问评分暂时失败，但你的回答已保留"
              failure={followUpError}
              onRetry={() => void handleSubmitFollowUp()}
              onCopyAnswer={() => void handleCopyFollowUpAnswer()}
              copyLabel={copyFollowUpFeedback || "复制我的回答"}
            />
          ) : null}
          {!followUpResult ? (
            <p className="learning-assessment-tip">提交后会返回这一轮追问的得分、遗漏点、表达建议和下一轮追问建议。回答草稿会自动保存。</p>
          ) : null}
          {followUpResult ? <AssessmentFeedbackCard result={followUpResult} heading="追问评分" variant="follow_up" /> : null}

          {followUpResult?.nextAction.type === "follow_up" ? (
            <div className="learning-assessment-actions">
              <button type="button" className="learning-rich-train-button" onClick={handleContinueFollowUp}>
                下一轮追问
              </button>
            </div>
          ) : null}

          {followUpHistory.length > 0 ? (
            <div className="learning-assessment-history">
              <h3>追问记录</h3>
              {followUpHistory.map((item, historyIndex) => (
                <article key={`${item.question}-${historyIndex}`}>
                  <strong>{item.question}</strong>
                  <p>{item.answer}</p>
                  <span>
                    {item.result.score} / 100 · {getAssessmentLevelMeta(item.result.level).text}
                  </span>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="learning-rich-train-actions">
        <Link href={targetedPracticePath} className="learning-rich-train-button" prefetch>
          去专项训练
        </Link>
        <button type="button" className="learning-text-action" onClick={onBackToDeep}>
          回到深读模式
        </button>
      </div>
    </section>
  );
}
