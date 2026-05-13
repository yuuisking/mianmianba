import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions/completions";
import { searchKnowledgeBase } from "@/lib/knowledge/volc";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import type { InterviewMessage } from "@/lib/interview/config";
import { interviewFeatureFlags } from "@/lib/config/featureFlags";
import {
  buildClosureJudgeAgentPrompt,
  buildComposerAgentPrompt,
  buildEvidenceAgentPrompt,
  buildGuardAgentPrompt,
  buildPlannerAgentPrompt,
} from "@/lib/interview/agentPrompts";
import {
  buildInterviewSystemPrompt,
  type InterviewRuntimeContext,
  type InterviewRuntimeExperienceInsight,
  inspectInterviewReplyQuality,
} from "@/lib/interview/prompt";
import { evaluateInterviewTurnPolicy } from "@/lib/interview/turnPolicy";
import { processInterviewPlanLifecycle } from "@/lib/interview-v2/lifecycle";
import prisma from "@/lib/prisma";

/**
 * 将面试消息内容归一化为单段纯文本，避免数组格式在多处重复处理。
 * @param message 原始消息对象。
 * @returns 可直接发送给模型的文本内容。
 */
function flattenMessageContent(message: {
  content: string[] | string;
}): string {
  return Array.isArray(message.content) ? message.content.join("\n") : message.content;
}

/**
 * 将任意文本裁剪为稳定字符串，避免空值或多余空白污染运行时链路。
 * @param {string | null | undefined} value 原始文本。
 * @returns {string} 清洗后的字符串。
 */
function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 粗略判断候选人是否明显答非所问，作为结束裁决 Agent 的辅助信号输入。
 * @param latestQuestion 最近一轮面试官问题。
 * @param latestAnswer 最近一轮候选人回答。
 * @returns 是否存在明显偏题迹象。
 */
function looksOffTopic(latestQuestion: string, latestAnswer: string): boolean {
  const question = normalizeText(latestQuestion).toLowerCase();
  const answer = normalizeText(latestAnswer).toLowerCase();
  if (!question || !answer || answer.length < 12) {
    return false;
  }

  const normalizedQuestionTokens = question
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const normalizedAnswerTokens = new Set(
    answer
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  );

  const overlapCount = normalizedQuestionTokens.filter((token) =>
    normalizedAnswerTokens.has(token)
  ).length;

  return normalizedQuestionTokens.length >= 3 && overlapCount === 0;
}

/**
 * 清洗面经洞察中的内部策略短语，确保它们不会直接进入用户可见题干。
 * @param {string | null | undefined} value 原始文本。
 * @returns {string} 清洗后的文本。
 */
function sanitizeInsightText(value: string | null | undefined): string {
  let normalized = normalizeText(value);
  for (const pattern of [
    "AI 面试官会优先根据这一轮的高频考察点、历史追问风格与岗位关键词生成问题。",
    "AI 面试官会",
    "高频考察点",
    "历史追问风格",
    "岗位关键词",
    "策略",
    "prompt",
  ]) {
    normalized = normalized.replaceAll(pattern, "");
  }
  return normalized.replace(/\s+/g, " ").trim();
}

type InterviewTurnPlan = {
  focusArea?: string;
  questionGoal?: string;
  questionStyle?: string;
  roleTrack?: string;
  mustCover?: string[];
  askAngle?: string;
};

type InterviewTurnEvidence = {
  userVisibleTopic?: string;
  evidenceBullets?: string[];
  mustAvoid?: string[];
  sourceCitations?: string[];
};

type InterviewQuestionBlueprint = {
  askAngle?: string;
  interviewerIntent?: string;
  toneGuide?: string;
  answerContract?: string[];
  followUpHooks?: string[];
  mustAvoid?: string[];
};

type InterviewGuardResult = {
  approved?: boolean;
  rewriteAdvice?: string[];
  leakageRisks?: string[];
  finalToneGuide?: string;
};

type InterviewTurnBlueprint = {
  userVisibleTopic?: string;
  askAngle?: string;
  interviewerIntent?: string;
  toneGuide?: string;
  answerContract?: string[];
  followUpHooks?: string[];
  mustAvoid?: string[];
  rewriteAdvice?: string[];
  leakageRisks?: string[];
};

type InterviewClosureJudgeResult = {
  action?: "continue" | "offer_coding" | "end_interview";
  shouldEnd?: boolean;
  confidence?: number;
  offTopicCount?: number;
  reason?: string;
  candidateFacingTransition?: string;
};

type PlanningSummaryShape = {
  experienceCollection?: {
    insights?: InterviewRuntimeExperienceInsight[];
  };
  orchestration?: {
    globalFeedback?: string[];
    stageReviews?: Array<{
      stageOrder?: number;
      stageLabel?: string;
      adjudicationSummary?: string;
      verdictReason?: string;
    }>;
  };
};

type LoadedInterviewRuntimeContext = InterviewRuntimeContext & {
  currentRoundStatus?: string | null;
  currentStageStatus?: string | null;
  codingRequired?: boolean;
};

/**
 * 将未知 JSON 安全收口为普通对象，避免直接在运行时访问 Prisma Json 字段。
 * @param value 原始 JSON 值。
 * @returns 普通对象；无法识别时返回 `null`。
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 将未知值规范成字符串列表，便于写入运行时反馈摘要。
 * @param value 原始字段。
 * @returns 过滤后的字符串列表。
 */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

/**
 * 从计划摘要 JSON 中恢复面经洞察，供当前轮次 prompt 直接消费。
 * @param planningSummary 计划摘要 JSON。
 * @returns 面经洞察数组。
 */
function extractRuntimeExperienceInsights(
  planningSummary: unknown
): InterviewRuntimeExperienceInsight[] {
  const summary = asRecord(planningSummary) as PlanningSummaryShape | null;
  if (!summary?.experienceCollection?.insights) {
    return [];
  }

  return summary.experienceCollection.insights
    .map((item) => ({
      stageType: typeof item?.stageType === "string" ? item.stageType : null,
      title: sanitizeInsightText(typeof item?.title === "string" ? item.title : ""),
      summary: sanitizeInsightText(typeof item?.summary === "string" ? item.summary : ""),
      tags: toStringList(item?.tags),
      sourceLabel:
        typeof item?.sourceLabel === "string" ? item.sourceLabel.trim() : null,
      freshnessLabel:
        typeof item?.freshnessLabel === "string" ? item.freshnessLabel.trim() : null,
    }))
    .filter((item) => item.title || item.summary);
}

/**
 * 从计划摘要中恢复全局编排 Agent 写入的逐轮反馈，优先供下一轮 prompt 消费。
 * @param planningSummary 计划摘要 JSON。
 * @param currentStageOrder 当前轮次顺序。
 * @returns 可注入 prompt 的上一轮反馈列表。
 */
function extractOrchestrationFeedback(
  planningSummary: unknown,
  currentStageOrder: number | null | undefined
): string[] {
  if (!currentStageOrder) {
    return [];
  }

  const summary = asRecord(planningSummary) as PlanningSummaryShape | null;
  const stageReviews = Array.isArray(summary?.orchestration?.stageReviews)
    ? summary?.orchestration?.stageReviews || []
    : [];
  const fromStageReviews = stageReviews
    .filter((item) =>
      typeof item?.stageOrder === "number" ? item.stageOrder < currentStageOrder : false
    )
    .map((item) => {
      const stageLabel =
        typeof item?.stageLabel === "string" && item.stageLabel.trim()
          ? item.stageLabel.trim()
          : "上一轮";
      const feedback =
        typeof item?.adjudicationSummary === "string" && item.adjudicationSummary.trim()
          ? item.adjudicationSummary.trim()
          : typeof item?.verdictReason === "string" && item.verdictReason.trim()
            ? item.verdictReason.trim()
            : "";
      return feedback ? `${stageLabel}：${feedback}` : "";
    })
    .filter(Boolean);

  if (fromStageReviews.length > 0) {
    return fromStageReviews;
  }

  return toStringList(summary?.orchestration?.globalFeedback);
}

/**
 * 读取当前全流程运行时上下文，补齐公司、岗位、轮次、上一轮反馈和最新面经洞察。
 * @param input 当前登录用户与画像中的计划标识。
 * @returns 可直接注入 prompt 的运行时上下文。
 */
async function loadInterviewRuntimeContext(input: {
  userId: string;
  profile: {
    interviewPlanId?: string;
    interviewStageId?: string;
    interviewRoundId?: string;
    launchFlowMode?: string;
    companyName?: string;
    targetRoleName?: string;
    role?: string;
    currentStageType?: string;
    currentStageLabel?: string;
    experienceInsights?: InterviewRuntimeExperienceInsight[];
  } | null;
}): Promise<LoadedInterviewRuntimeContext | null> {
  const planId =
    typeof input.profile?.interviewPlanId === "string"
      ? input.profile.interviewPlanId.trim()
      : "";
  if (!planId) {
    const fallbackInsights = Array.isArray(input.profile?.experienceInsights)
      ? input.profile.experienceInsights
      : [];
    if (
      input.profile?.launchFlowMode === "full_flow" ||
      fallbackInsights.length > 0
    ) {
      return {
        planId: undefined,
        launchFlowMode:
          input.profile?.launchFlowMode === "full_flow" ? "full_flow" : "stage",
        companyName: input.profile?.companyName || null,
        roleName:
          input.profile?.targetRoleName || input.profile?.role || null,
        stageType: input.profile?.currentStageType || null,
        stageLabel: input.profile?.currentStageLabel || null,
        experienceInsights: fallbackInsights,
      };
    }
    return null;
  }

  await processInterviewPlanLifecycle({
    userId: input.userId,
    planId,
  });

  const plan = await prisma.interviewPlan.findFirst({
    where: {
      id: planId,
      userId: input.userId,
    },
    include: {
      stages: {
        orderBy: {
          stageOrder: "asc",
        },
      },
      rounds: {
        include: {
          stage: {
            select: {
              id: true,
              stageType: true,
              stageOrder: true,
              stageLabel: true,
              codingRequired: true,
              strategySummary: true,
              status: true,
            },
          },
          reports: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!plan) {
    return null;
  }

  const stageId =
    typeof input.profile?.interviewStageId === "string"
      ? input.profile.interviewStageId.trim()
      : "";
  const roundId =
    typeof input.profile?.interviewRoundId === "string"
      ? input.profile.interviewRoundId.trim()
      : "";
  const currentStage =
    plan.stages.find((item) => item.id === stageId) ||
    plan.rounds.find((item) => item.id === roundId)?.stage ||
    plan.stages[0] ||
    null;
  const currentRound =
    plan.rounds.find((item) => item.id === roundId) ||
    plan.rounds.find((item) => item.stage.id === currentStage?.id) ||
    null;
  const previousStageFeedbackFromOrchestration = extractOrchestrationFeedback(
    plan.planningSummary,
    currentStage?.stageOrder || null
  );
  const previousStageFeedback =
    previousStageFeedbackFromOrchestration.length > 0
      ? previousStageFeedbackFromOrchestration
      : plan.rounds
          .filter((item) =>
            currentStage?.stageOrder
              ? item.stage.stageOrder < currentStage.stageOrder
              : false
          )
          .map((item) => {
            const latestReport = item.reports[0]?.summary?.trim() || "";
            const roundSummary = item.roundSummary?.trim() || "";
            const feedbackText =
              latestReport ||
              roundSummary ||
              "该轮已结束，下一轮需继续验证候选人的关键能力与风险点。";
            return `${item.stage.stageLabel}：${feedbackText}`;
          })
          .filter(Boolean);

  return {
    planId: plan.id,
    launchFlowMode: plan.mode === "FULL_FLOW" ? "full_flow" : "stage",
    companyName: plan.companyName || input.profile?.companyName || null,
    roleName:
      plan.roleName ||
      input.profile?.targetRoleName ||
      input.profile?.role ||
      null,
    stageId: currentStage?.id || null,
    stageType: currentStage?.stageType || input.profile?.currentStageType || null,
    stageLabel:
      currentStage?.stageLabel || input.profile?.currentStageLabel || null,
    stageOrder: currentStage?.stageOrder || null,
    roundId: roundId || null,
    stageStrategySummary: currentStage?.strategySummary || null,
    previousStageFeedback,
    experienceInsights: extractRuntimeExperienceInsights(plan.planningSummary),
    currentRoundStatus: currentRound?.status || null,
    currentStageStatus: currentStage?.status || null,
    codingRequired: Boolean(currentStage?.codingRequired),
  };
}

/**
 * 当候选人真正进入当前轮次问答时，把全流程计划状态推进到进行中。
 * @param runtimeContext 当前轮次运行时上下文。
 * @returns 无返回值。
 */
async function syncInterviewRuntimeStatus(
  runtimeContext: InterviewRuntimeContext | null
): Promise<void> {
  if (!runtimeContext?.planId) {
    return;
  }

  await prisma.$transaction([
    prisma.interviewPlan.updateMany({
      where: {
        id: runtimeContext.planId,
        status: {
          in: ["PLANNED", "PROFILE_READY"],
        },
      },
      data: {
        status: "IN_PROGRESS",
      },
    }),
    ...(runtimeContext.stageId
      ? [
          prisma.interviewPlanStage.updateMany({
            where: {
              id: runtimeContext.stageId,
              status: {
                in: ["READY", "PENDING"],
              },
            },
            data: {
              status: "ACTIVE",
            },
          }),
        ]
      : []),
    ...(runtimeContext.roundId
      ? [
          prisma.interviewRound.updateMany({
            where: {
              id: runtimeContext.roundId,
              status: "PENDING",
            },
            data: {
              status: "ASKING",
              startedAt: new Date(),
            },
          }),
        ]
      : []),
  ]);
}

/**
 * 将系统提示词与历史消息统一拼成可直接发送给模型的消息数组。
 * @param systemPrompt 当前轮次最终生效的系统提示词。
 * @param messages 当前房间历史消息。
 * @returns 发送给模型的完整消息数组。
 */
function buildApiMessages(
  systemPrompt: string,
  messages: Array<{ role: string; content: string[] | string }>
): ChatCompletionMessageParam[] {
  const apiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt }
  ];

  for (const msg of messages) {
    const contentStr = flattenMessageContent(msg);
    apiMessages.push({
      role: msg.role === "ai" ? "assistant" : "user",
      content: contentStr
    });
  }

  return apiMessages;
}

/**
 * 格式化最近若干轮对话，供规划器识别这一轮该问什么。
 * @param messages 当前房间历史消息。
 * @returns 简短对话摘录。
 */
function formatRecentDialogue(
  messages: Array<{ role: string; content: string[] | string }>
): string {
  return messages
    .slice(-6)
    .map((message) => {
      const speaker = message.role === "ai" ? "面试官" : "候选人";
      return `${speaker}: ${flattenMessageContent(message)}`;
    })
    .join("\n");
}

/**
 * 从历史消息中提取最近一条用户回答。
 * @param messages 当前房间历史消息。
 * @returns 最近一条候选人发言。
 */
function getLatestUserMessage(
  messages: Array<{ role: string; content: string[] | string }>
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "ai") {
      return flattenMessageContent(message).trim();
    }
  }

  return "";
}

/**
 * 从历史消息中提取最近一条 AI 提问。
 * @param messages 当前房间历史消息。
 * @returns 最近一条面试官提问。
 */
function getLatestAiMessage(
  messages: Array<{ role: string; content: string[] | string }>
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "ai") {
      return flattenMessageContent(message).trim();
    }
  }

  return "";
}

/**
 * 判断当前轮次是否属于技术面，技术面在准备收口时需要优先进入算法题。
 * @param stageType 当前轮次类型。
 * @returns 是否技术轮。
 */
function stageTypeRequiresCoding(stageType: string | null | undefined): boolean {
  const normalizedStageType = normalizeText(stageType).toUpperCase();
  return [
    "STAGE_INTERVIEW",
    "FIRST_ROUND",
    "SECOND_ROUND",
    "THIRD_ROUND",
  ].includes(normalizedStageType);
}

/**
 * 提取最近几轮问答对，供收口裁决 Agent 判断是否继续、转算法题或结束。
 * @param messages 当前对话消息。
 * @returns 最近若干轮问答文本。
 */
function buildRecentClosureTurns(
  messages: Array<{ role: string; content: string[] | string }>
): Array<{ interviewer: string; candidate: string }> {
  const turns: Array<{ interviewer: string; candidate: string }> = [];
  let pendingQuestion = "";

  for (const message of messages.slice(-10)) {
    const text = flattenMessageContent(message);
    if (message.role === "ai") {
      pendingQuestion = text;
      continue;
    }

    turns.push({
      interviewer: pendingQuestion,
      candidate: text,
    });
  }

  return turns.slice(-5);
}

/**
 * 粗略统计最近几轮里明显偏题的次数，作为 ClosureJudge 的辅助信号。
 * @param messages 当前对话消息。
 * @returns 偏题次数。
 */
function countRecentOffTopicSignals(
  messages: Array<{ role: string; content: string[] | string }>
): number {
  return buildRecentClosureTurns(messages).filter((turn) =>
    looksOffTopic(turn.interviewer, turn.candidate)
  ).length;
}

/**
 * 将 Agent 返回动作归一到当前前后端都能消费的动作集合。
 * @param action Agent 原始动作。
 * @param stageNeedsCoding 当前轮次是否要求结束前先算法题。
 * @param hasCodingSession 当前轮次是否已有算法题会话。
 * @returns 收口动作。
 */
function normalizeClosureAction(
  action: string | undefined,
  stageNeedsCoding: boolean,
  hasCodingSession: boolean
): "continue" | "offer_coding" | "end_interview" {
  if (
    action === "offer_coding" ||
    action === "offer_coding_before_end" ||
    action === "end_after_coding"
  ) {
    return hasCodingSession ? "end_interview" : "offer_coding";
  }

  if (action === "end_interview" || action === "end_interview_directly") {
    if (stageNeedsCoding && !hasCodingSession) {
      return "offer_coding";
    }
    return "end_interview";
  }

  return "continue";
}

/**
 * 使用收口裁决 Agent 综合规则信号、答非所问和轮次目标，判断是否继续、先转算法题或直接结束。
 * @param input 当前轮次上下文与信号。
 * @returns 结构化收口裁决结果；失败时返回 `null`。
 */
async function judgeInterviewTurnClosure(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  role: string;
  companyName?: string;
  stageLabel?: string;
  stageType?: string;
  latestAiQuestion: string;
  latestUserAnswer: string;
  recentDialogue: string;
  recentTurns: Array<{ interviewer: string; candidate: string }>;
  negativeSignalCount: number;
  positiveSignalCount: number;
  offTopicCount: number;
  codingRequired: boolean;
  hasCodingSession: boolean;
}): Promise<InterviewClosureJudgeResult | null> {
  const stageNeedsCoding =
    input.codingRequired || stageTypeRequiresCoding(input.stageType || null);
  const closurePrompt = `
你需要判断当前这轮技术面试是否应该继续追问、先转算法题再结束，还是已经可以直接结束。

上下文：
- 公司：${input.companyName || "未提供"}
- 岗位：${input.role || "未提供"}
- 当前轮次：${input.stageLabel || "未提供"}
- 当前轮次类型：${input.stageType || "未提供"}
- 最近一条面试官问题：${input.latestAiQuestion || "暂无"}
- 最近一条候选人回答：${input.latestUserAnswer || "暂无"}
- 最近连续低信息量信号数：${input.negativeSignalCount}
- 最近高信息量信号数：${input.positiveSignalCount}
- 最近明显答非所问次数：${input.offTopicCount}
- 当前轮次是否属于技术轮：${stageNeedsCoding ? "是" : "否"}
- 当前轮次是否已经有算法题会话：${input.hasCodingSession ? "是" : "否"}

最近几轮问答：
${input.recentTurns.length > 0 ? input.recentTurns.map((turn, index) => `${index + 1}. 面试官：${turn.interviewer || "无"}\n   候选人：${turn.candidate || "无"}`).join("\n") : "无"}

最近对话摘录：
${input.recentDialogue || "暂无"}

裁决规则：
1. 如果候选人明显连续答非所问、无法形成有效评估，允许主动收口。
2. 如果候选人回答质量很好、核心点已经覆盖充分，也允许主动收口。
3. 只要当前是技术轮，且你判断准备收口但尚未有算法题会话，就优先返回 offer_coding。
4. candidateFacingTransition 必须像真人面试官自然接话，不能暴露规则、Agent、阈值、系统。

只返回 JSON：
{
  "action": "continue | offer_coding | end_interview",
  "shouldEnd": false,
  "confidence": 0.0,
  "offTopicCount": 0,
  "reason": "内部原因",
  "candidateFacingTransition": "说给候选人的自然过渡话术"
}
`.trim();

  try {
    const completion = await input.openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildClosureJudgeAgentPrompt(),
        },
        {
          role: "user",
          content: closurePrompt,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as InterviewClosureJudgeResult;
    const action = normalizeClosureAction(
      typeof parsed.action === "string" ? parsed.action : undefined,
      stageNeedsCoding,
      input.hasCodingSession
    );

    return {
      action,
      shouldEnd: Boolean(parsed.shouldEnd) || action !== "continue",
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      offTopicCount:
        typeof parsed.offTopicCount === "number"
          ? parsed.offTopicCount
          : input.offTopicCount,
      reason: normalizeText(parsed.reason),
      candidateFacingTransition: normalizeText(parsed.candidateFacingTransition),
    };
  } catch (error) {
    console.error("Failed to judge interview closure", error);
    return null;
  }
}

/**
 * 调用规划器先决定这一轮最该验证的能力点和发问角度，不直接预生成用户可见题干。
 * @param input 规划所需的岗位、模式与对话上下文。
 * @returns 结构化的提问计划。
 */
async function planInterviewTurn(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  mode: string;
  role: string;
  focus: string;
  topic: string;
  desc: string;
  companyName?: string;
  stageLabel?: string;
  stageType?: string;
  previousStageFeedback?: string[];
  experienceInsights?: InterviewRuntimeExperienceInsight[];
  latestUserAnswer: string;
  latestAiQuestion: string;
  recentDialogue: string;
}): Promise<InterviewTurnPlan | null> {
  const formattedInsights =
    input.experienceInsights && input.experienceInsights.length > 0
      ? input.experienceInsights
          .map((item) => {
            const tagsText =
              item.tags && item.tags.length > 0 ? `；标签：${item.tags.join(" / ")}` : "";
            return `- ${item.title}：${item.summary}${tagsText}`;
          })
          .join("\n")
      : "无";
  const formattedPreviousFeedback =
    input.previousStageFeedback && input.previousStageFeedback.length > 0
      ? input.previousStageFeedback.map((item) => `- ${item}`).join("\n")
      : "无";
  const plannerPrompt = `
你现在像一位经验很深的面试组长。请基于真实岗位与最近对话，先判断这一轮最该验证什么，再给主面试官一份“发问意图和切入口”，但不要直接替他把整道题写完。

上下文：
- 模式：${input.mode || "未提供"}
- 目标公司：${input.companyName || "未提供"}
- 目标岗位：${input.role || "未提供"}
- 当前轮次：${input.stageLabel || "未提供"}
- 当前轮次类型：${input.stageType || "未提供"}
- 本次重点：${input.focus || "未提供"}
- 当前主题：${input.topic || "未提供"}
- 训练目标：${input.desc || "未提供"}
- 最近一条候选人回答：${input.latestUserAnswer || "暂无"}
- 最近一条面试官问题：${input.latestAiQuestion || "暂无"}
- 上一轮反馈：
${formattedPreviousFeedback}
- 当前轮次真实面经洞察：
${formattedInsights}

最近对话摘录：
${input.recentDialogue || "暂无"}

要求：
1. 如果岗位是测试开发 / QA / SDET / 质量工程方向，发问角度必须落到测试策略、自动化、缺陷定位、回归、质量平台、稳定性或质量门禁语境。
2. 你的输出必须服务于一条具体、可回答、可继续追问的问题，不能服务于泛泛自我介绍或空泛概念题。
3. 如果候选人刚说不会、没做过、需要提示，应先给最小必要纠偏，再继续围绕同一主题。
4. 如果存在公司、轮次和面经洞察，必须优先贴合该公司岗位语境，禁止回退成“综合面试”类泛化问题。
5. 不要直接写给候选人的完整题目，不要出现主持稿、说明书或 prompt 话术。

只返回 JSON：
{
  "focusArea": "本轮核心验证点",
  "questionGoal": "为什么这轮要问这个",
  "questionStyle": "project|scenario|testing|troubleshooting|behavior",
  "roleTrack": "general|testing",
  "mustCover": ["关键词1", "关键词2"],
  "askAngle": "主面试官这一轮最自然的切入口"
}
`.trim();

  try {
    const completion = await input.openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildPlannerAgentPrompt(),
        },
        { role: "user", content: plannerPrompt }
      ]
    });

    const content = completion.choices[0]?.message?.content || "{}";
    return JSON.parse(content) as InterviewTurnPlan;
  } catch (error) {
    console.error("Failed to plan interview turn", error);
    return null;
  }
}

const INTERNAL_STRATEGY_LEAK_PATTERNS = [
  "AI 面试官会",
  "高频考察点",
  "历史追问风格",
  "岗位关键词生成问题",
  "策略",
  "prompt",
  "综合面试",
  "全流程面试",
  "阶段面试",
];

/**
 * 将检索结果整理成供提问多 Agent 消费的证据片段，避免直接把原始搜索结果全文塞进 prompt。
 * @param {Array<{ text?: string }>} searchResults 外部检索结果。
 * @returns {string} 可直接注入 Agent prompt 的检索摘要。
 */
function formatSearchEvidence(searchResults: Array<{ text?: string }>): string {
  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    return "无";
  }

  return searchResults
    .map((item) => normalizeText(item.text))
    .filter(Boolean)
    .slice(0, 4)
    .map((item) => `- ${item}`)
    .join("\n");
}

/**
 * 过滤题干中的内部策略词与不应暴露给候选人的控制语。
 * @param {string} questionText 原始题干。
 * @returns {string} 初步净化后的题干。
 */
function sanitizeUserVisibleQuestion(questionText: string): string {
  let sanitized = normalizeText(questionText);
  for (const pattern of INTERNAL_STRATEGY_LEAK_PATTERNS) {
    sanitized = sanitized.replaceAll(pattern, "");
  }
  return sanitized.replace(/\s+/g, " ").trim();
}

/**
 * 由证据 Agent 从上一轮反馈、真实面经和检索结果中提炼当前问题可直接使用的证据。
 * @param input 当前轮次上下文。
 * @returns {Promise<InterviewTurnEvidence | null>} 结构化证据摘要。
 */
async function collectInterviewTurnEvidence(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  role: string;
  companyName?: string;
  stageLabel?: string;
  stageType?: string;
  latestUserAnswer: string;
  latestAiQuestion: string;
  recentDialogue: string;
  previousStageFeedback?: string[];
  experienceInsights?: InterviewRuntimeExperienceInsight[];
  searchResults: Array<{ text?: string }>;
  plan: InterviewTurnPlan | null;
}): Promise<InterviewTurnEvidence | null> {
  const insightsText =
    input.experienceInsights && input.experienceInsights.length > 0
      ? input.experienceInsights
          .map((item) => `- ${item.title}：${item.summary}`)
          .join("\n")
      : "无";
  const feedbackText =
    input.previousStageFeedback && input.previousStageFeedback.length > 0
      ? input.previousStageFeedback.map((item) => `- ${item}`).join("\n")
      : "无";
  const searchEvidence = formatSearchEvidence(input.searchResults);
  const evidencePrompt = `
你是提问链里的 Evidence Agent。你的职责不是直接出题，而是把当前轮次可用的真实证据整理出来，供后续题目生成 Agent 使用。

上下文：
- 公司：${input.companyName || "未提供"}
- 岗位：${input.role || "未提供"}
- 轮次：${input.stageLabel || "未提供"}
- 轮次类型：${input.stageType || "未提供"}
- Planner 核心验证点：${input.plan?.focusArea || "未提供"}
- Planner 提问目标：${input.plan?.questionGoal || "未提供"}
- 最近一条候选人回答：${input.latestUserAnswer || "暂无"}
- 最近一条面试官问题：${input.latestAiQuestion || "暂无"}

上一轮反馈：
${feedbackText}

当前轮次真实面经：
${insightsText}

额外检索证据：
${searchEvidence}

最近对话：
${input.recentDialogue || "暂无"}

要求：
1. userVisibleTopic 必须是用户可见的真实问题主题，禁止出现“策略、高频考察点、AI 会、prompt”等内部词。
2. evidenceBullets 只保留后续出题真正要用到的 2-4 条证据。
3. mustAvoid 写出这轮最不该直接暴露给候选人的内部词或错误问法。

只返回 JSON：
{
  "userVisibleTopic": "当前最适合发问的用户可见主题",
  "evidenceBullets": ["证据1", "证据2"],
  "mustAvoid": ["禁止词1", "禁止词2"],
  "sourceCitations": ["来源1", "来源2"]
}
`.trim();

  try {
    const completion = await input.openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildEvidenceAgentPrompt(),
        },
        { role: "user", content: evidencePrompt },
      ],
    });
    const content = completion.choices[0]?.message?.content || "{}";
    return JSON.parse(content) as InterviewTurnEvidence;
  } catch (error) {
    console.error("Failed to collect interview turn evidence", error);
    return null;
  }
}

/**
 * 由 Composer 基于 Planner 结论和证据摘要生成结构化提问蓝图，不直接预生成题干。
 * @param input 当前轮次提问上下文。
 * @returns {Promise<InterviewQuestionBlueprint | null>} 提问蓝图。
 */
async function composeInterviewBlueprint(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  role: string;
  companyName?: string;
  stageLabel?: string;
  stageType?: string;
  latestUserAnswer: string;
  latestAiQuestion: string;
  recentDialogue: string;
  plan: InterviewTurnPlan | null;
  evidence: InterviewTurnEvidence | null;
}): Promise<InterviewQuestionBlueprint | null> {
  const evidenceBullets =
    input.evidence?.evidenceBullets && input.evidence.evidenceBullets.length > 0
      ? input.evidence.evidenceBullets.map((item) => `- ${item}`).join("\n")
      : "无";
  const mustAvoid =
    input.evidence?.mustAvoid && input.evidence.mustAvoid.length > 0
      ? input.evidence.mustAvoid.map((item) => `- ${item}`).join("\n")
      : "无";
  const composePrompt = `
你现在像坐在主面试官旁边的备稿同事。你的任务不是替他说完整台词，而是把这一轮问题收敛成一份“提问蓝图”，让主面试官可以据此临场发问。

上下文：
- 公司：${input.companyName || "未提供"}
- 岗位：${input.role || "未提供"}
- 轮次：${input.stageLabel || "未提供"}
- 轮次类型：${input.stageType || "未提供"}
- Planner 核心验证点：${input.plan?.focusArea || "未提供"}
- Planner 提问目标：${input.plan?.questionGoal || "未提供"}
- Planner 必须覆盖：${input.plan?.mustCover?.join(" / ") || "无"}
- 用户可见主题：${input.evidence?.userVisibleTopic || input.plan?.focusArea || "未提供"}
- 最近一条候选人回答：${input.latestUserAnswer || "暂无"}
- 最近一条面试官问题：${input.latestAiQuestion || "暂无"}

证据摘要：
${evidenceBullets}

禁止暴露：
${mustAvoid}

最近对话：
${input.recentDialogue || "暂无"}

要求：
1. 不要直接输出给候选人的完整题目。
2. 蓝图必须能支撑主面试官问出一条具体、可回答、可继续追问的问题。
3. 不得出现“AI 面试官会、策略、高频考察点、历史追问风格、prompt”等内部词。
4. 一面优先项目真实性和基础；二面优先系统设计与取舍；三面优先业务判断和协同；HR 面优先动机与稳定性。
5. toneGuide 要像真实面试官，不要像培训老师、写作教练或主持稿。

只返回 JSON：
{
  "askAngle": "这一轮从哪里切入最自然",
  "interviewerIntent": "主面试官希望借这个问题确认什么",
  "toneGuide": "语气要求，例如直接、克制、自然、少废话",
  "answerContract": ["候选人回答时最好覆盖的点1", "点2"],
  "followUpHooks": ["后续可继续深挖的点1", "点2"],
  "mustAvoid": ["不要出现的问法1", "不要出现的词2"]
}
`.trim();

  try {
    const completion = await input.openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildComposerAgentPrompt(),
        },
        { role: "user", content: composePrompt },
      ],
    });
    const content = completion.choices[0]?.message?.content || "{}";
    return JSON.parse(content) as InterviewQuestionBlueprint;
  } catch (error) {
    console.error("Failed to compose interview blueprint", error);
    return null;
  }
}

/**
 * 由 Guard 对提问蓝图做审核和必要修正建议，确保最终实时输出不会泄漏内部策略。
 * @param input 当前轮次蓝图与上下文。
 * @returns {Promise<InterviewGuardResult | null>} 审核结果。
 */
async function guardInterviewQuestion(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  role: string;
  stageLabel?: string;
  stageType?: string;
  blueprint: InterviewQuestionBlueprint | null;
  evidence: InterviewTurnEvidence | null;
}): Promise<InterviewGuardResult | null> {
  if (!input.blueprint) {
    return null;
  }
  const serializedBlueprint = JSON.stringify(
    {
      askAngle: normalizeText(input.blueprint.askAngle),
      interviewerIntent: normalizeText(input.blueprint.interviewerIntent),
      toneGuide: normalizeText(input.blueprint.toneGuide),
      answerContract: (input.blueprint.answerContract || [])
        .map((item) => normalizeText(item))
        .filter(Boolean),
      followUpHooks: (input.blueprint.followUpHooks || [])
        .map((item) => normalizeText(item))
        .filter(Boolean),
      mustAvoid: (input.blueprint.mustAvoid || [])
        .map((item) => normalizeText(item))
        .filter(Boolean),
    },
    null,
    2
  );
  const guardPrompt = `
你现在像提问质检负责人。请检查这份提问蓝图会不会让主面试官说出跑题、泄漏内部话术、带页面标签或明显 AI 味的问法；如果有，给出修正建议，但不要代写完整题目。

上下文：
- 岗位：${input.role || "未提供"}
- 轮次：${input.stageLabel || "未提供"}
- 轮次类型：${input.stageType || "未提供"}
- 用户可见主题：${input.evidence?.userVisibleTopic || "未提供"}
- 禁止暴露：${input.evidence?.mustAvoid?.join(" / ") || "无"}

待审核蓝图：
${serializedBlueprint}

只返回 JSON：
{
  "approved": true,
  "rewriteAdvice": ["需要修正的点1", "需要修正的点2"],
  "leakageRisks": ["风险1", "风险2"],
  "finalToneGuide": "最终建议保留的问法气质"
}
`.trim();

  try {
    const completion = await input.openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildGuardAgentPrompt(),
        },
        { role: "user", content: guardPrompt },
      ],
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as InterviewGuardResult;
    return {
      approved: Boolean(parsed.approved),
      rewriteAdvice: Array.isArray(parsed.rewriteAdvice)
        ? parsed.rewriteAdvice.map((item) => normalizeText(item)).filter(Boolean)
        : [],
      leakageRisks: Array.isArray(parsed.leakageRisks)
        ? parsed.leakageRisks.map((item) => normalizeText(item)).filter(Boolean)
        : [],
      finalToneGuide: normalizeText(parsed.finalToneGuide),
    };
  } catch (error) {
    console.error("Failed to guard interview question", error);
    return {
      approved: false,
      rewriteAdvice: ["Guard 失败，本轮按已有蓝图执行，但仍需避免模板化和内部术语。"],
      leakageRisks: [],
      finalToneGuide: normalizeText(input.blueprint.toneGuide),
    };
  }
}

/**
 * 运行提问多 Agent 链，输出供主面试官实时生成时消费的结构化蓝图。
 * @param input 当前轮次提问所需上下文。
 * @returns {Promise<InterviewTurnBlueprint | null>} 当前轮次蓝图。
 */
async function generateInterviewTurnBlueprintWithAgents(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  role: string;
  companyName?: string;
  stageLabel?: string;
  stageType?: string;
  previousStageFeedback?: string[];
  experienceInsights?: InterviewRuntimeExperienceInsight[];
  latestUserAnswer: string;
  latestAiQuestion: string;
  recentDialogue: string;
  searchResults: Array<{ text?: string }>;
  plan: InterviewTurnPlan | null;
}): Promise<InterviewTurnBlueprint | null> {
  const evidence = await collectInterviewTurnEvidence({
    openai: input.openai,
    role: input.role,
    companyName: input.companyName,
    stageLabel: input.stageLabel,
    stageType: input.stageType,
    latestUserAnswer: input.latestUserAnswer,
    latestAiQuestion: input.latestAiQuestion,
    recentDialogue: input.recentDialogue,
    previousStageFeedback: input.previousStageFeedback,
    experienceInsights: input.experienceInsights,
    searchResults: input.searchResults,
    plan: input.plan,
  });
  const blueprint = await composeInterviewBlueprint({
    openai: input.openai,
    role: input.role,
    companyName: input.companyName,
    stageLabel: input.stageLabel,
    stageType: input.stageType,
    latestUserAnswer: input.latestUserAnswer,
    latestAiQuestion: input.latestAiQuestion,
    recentDialogue: input.recentDialogue,
    plan: input.plan,
    evidence,
  });
  const guardResult = await guardInterviewQuestion({
    openai: input.openai,
    role: input.role,
    stageLabel: input.stageLabel,
    stageType: input.stageType,
    blueprint,
    evidence,
  });
  return {
    userVisibleTopic: sanitizeUserVisibleQuestion(evidence?.userVisibleTopic || ""),
    askAngle: normalizeText(blueprint?.askAngle || input.plan?.askAngle),
    interviewerIntent: normalizeText(blueprint?.interviewerIntent || input.plan?.questionGoal),
    toneGuide: normalizeText(guardResult?.finalToneGuide || blueprint?.toneGuide),
    answerContract: (blueprint?.answerContract || [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
    followUpHooks: (blueprint?.followUpHooks || [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
    mustAvoid: Array.from(
      new Set([
        ...(evidence?.mustAvoid || []),
        ...(blueprint?.mustAvoid || []),
      ].map((item) => normalizeText(item)).filter(Boolean))
    ),
    rewriteAdvice: (guardResult?.rewriteAdvice || [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
    leakageRisks: (guardResult?.leakageRisks || [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  };
}

/**
 * 将多 Agent 规划结果追加到系统提示词，强制当前轮次按蓝图实时生成问题。
 * @param systemPrompt 原始系统提示词。
 * @param plan 规划器输出。
 * @param blueprint 提问蓝图输出。
 * @returns 增强后的系统提示词。
 */
function appendInterviewPlanToSystemPrompt(
  systemPrompt: string,
  plan: InterviewTurnPlan | null,
  blueprint: InterviewTurnBlueprint | null
): string {
  if (!plan && !blueprint) {
    return systemPrompt;
  }

  return `${systemPrompt}

【当前轮次 Agent 团提问蓝图】
- 核心验证点：${plan?.focusArea || "未提供"}
- 提问目标：${plan?.questionGoal || "未提供"}
- 问题风格：${plan?.questionStyle || "未提供"}
- 岗位路线：${plan?.roleTrack || "未提供"}
- 自然切入口：${blueprint?.askAngle || plan?.askAngle || "未提供"}
- 用户可见主题：${blueprint?.userVisibleTopic || "未提供"}
- 题目里必须覆盖：${(plan?.mustCover || []).join(" / ") || "无"}
- 候选人回答时最好覆盖：${(blueprint?.answerContract || []).join(" / ") || "无"}
- 后续可追问点：${(blueprint?.followUpHooks || []).join(" / ") || "无"}
- 语气要求：${blueprint?.toneGuide || "直接、自然、像真人面试官"}
- 本轮避免出现：${(blueprint?.mustAvoid || []).join(" / ") || "无"}
- 质检修正建议：${(blueprint?.rewriteAdvice || []).join(" / ") || "无"}
- 泄漏风险提醒：${(blueprint?.leakageRisks || []).join(" / ") || "无"}

你现在必须根据上面这份蓝图，临场生成“这一轮真正说给候选人的下一句或下一小段追问”，并直接流式输出。
额外要求：
1. 只输出候选人能看到的话，不要输出计划、解释、标签、JSON、括号备注或内部步骤。
2. 不要提前写好整段长稿，不要像播报稿；像真人面试官一样承接上一轮后自然追问。
3. 一次只推进一个核心问题；允许 1 到 3 句，但必须围绕同一个验证点。
4. 不能偏离岗位路线、核心验证点和提问目标。`;
}

/**
 * 以真实流式方式生成当前轮次回复，并把增量文本直接推给前端。
 * @param input 流式生成所需的模型、消息和输出流对象。
 * @returns 聚合后的完整回复文本，以及是否降级到非流式。
 */
async function streamInterviewReplyText(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  apiMessages: ChatCompletionMessageParam[];
}): Promise<{ replyText: string; degradedToBuffered: boolean }> {
  let streamedReply = "";

  try {
    const stream = await input.openai.chat.completions.create({
      model: "deepseek-chat",
      messages: input.apiMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const deltaText = chunk.choices[0]?.delta?.content || "";
      if (!deltaText) {
        continue;
      }

      streamedReply += deltaText;
      input.controller.enqueue(input.encoder.encode(deltaText));
    }

    return {
      replyText: streamedReply.trim(),
      degradedToBuffered: false,
    };
  } catch (streamError) {
    console.error("Streaming chat completion failed, fallback to buffered mode", streamError);
    const completion = await input.openai.chat.completions.create({
      model: "deepseek-chat",
      messages: input.apiMessages,
    });
    const fallbackReply = completion.choices[0]?.message?.content?.trim() || "";
    if (fallbackReply) {
      input.controller.enqueue(input.encoder.encode(fallbackReply));
    }

    return {
      replyText: fallbackReply,
      degradedToBuffered: true,
    };
  }
}

/**
 * 生成流式问答链失败时返回给候选人的自然兜底话术，避免把内部异常直接暴露到前端。
 * @param {string} latestAiQuestion 最近一轮面试官问题。
 * @returns {string} 候选人可直接看到的过渡追问。
 */
function buildStreamingFailureFallbackReply(latestAiQuestion: string): string {
  const normalizedQuestion = normalizeText(latestAiQuestion);
  if (normalizedQuestion) {
    return `我先换个更直接的问法继续。刚才这个点你可以结合实际项目再展开一下：${normalizedQuestion}`;
  }

  return "我先换个更直接的问法继续。请你结合刚才提到的项目，挑一个你亲自负责且最能体现技术判断的场景，讲清楚背景、你的方案、落地中的取舍，以及最后的结果。";
}

/**
 * 处理面试房间聊天请求，并基于用户已确认的真实画像构造面试上下文。
 * @param request 当前聊天接口请求。
 * @returns 面试官流式回复，或明确的错误信息。
 */
export async function POST(request: Request) {
  try {
    const openai = getDeepseekClient();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      messages,
      profile,
      sessionId,
      roomKey,
      mode,
      topic,
      desc,
      questionLimit,
      durationLimitMinutes,
      completedRounds
    } = body;

    // Check for new session daily limit
    const cookieStore = await cookies();
    const today = new Date().toISOString().split('T')[0];
    const sessionCookieName = `sessions_${today}`;
    
    let sessionCount = parseInt(cookieStore.get(sessionCookieName)?.value || "0");

    // Consider it a new session if it's the first user reply (length == 2)
    // AI sends 1st message, user sends 1st reply -> messages.length === 2
    if (messages.length === 2) {
      if (sessionCount >= 999) {
        return NextResponse.json(
          { error: "今日面试次数已达上限（超过999次），请明天再来挑战！" },
          { status: 403 }
        );
      }
      // Increment session count
      sessionCount += 1;
    } else if (messages.length > 2) {
      // If they somehow bypass and try to continue when they already exceeded
      if (sessionCount > 999) {
         return NextResponse.json(
          { error: "今日面试次数已达上限（超过999次），请明天再来挑战！" },
          { status: 403 }
        );
      }
    }

    const resolvedRole =
      typeof profile?.role === "string" && profile.role.trim()
        ? profile.role.trim()
        : "";
    if (typeof sessionId === "string" && sessionId.trim()) {
      const existingSession = await prisma.interviewSession.findFirst({
        where: {
          id: sessionId.trim(),
          userId: session.user.id,
        },
        select: {
          roomKey: true,
          planId: true,
          stageId: true,
          roundId: true,
          mode: true,
        },
      });
      if (!existingSession) {
        return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
      }
      if (
        (typeof roomKey === "string" &&
          roomKey.trim() &&
          existingSession.roomKey &&
          existingSession.roomKey !== roomKey.trim()) ||
        (profile?.interviewPlanId &&
          existingSession.planId &&
          existingSession.planId !== profile.interviewPlanId) ||
        (profile?.interviewStageId &&
          existingSession.stageId &&
          existingSession.stageId !== profile.interviewStageId) ||
        (profile?.interviewRoundId &&
          existingSession.roundId &&
          existingSession.roundId !== profile.interviewRoundId)
      ) {
        console.error("Interview session room identity mismatch", {
          sessionId: sessionId.trim(),
          requestRoomKey: typeof roomKey === "string" ? roomKey.trim() : "",
          requestPlanId: profile?.interviewPlanId || "",
          requestStageId: profile?.interviewStageId || "",
          requestRoundId: profile?.interviewRoundId || "",
          existingSession,
        });
        return NextResponse.json(
          { error: "Session room identity mismatch" },
          { status: 409 }
        );
      }
    }
    const runtimeContext = await loadInterviewRuntimeContext({
      userId: session.user.id,
      profile,
    });
    if (
      runtimeContext?.currentRoundStatus === "ABORTED" ||
      runtimeContext?.currentStageStatus === "BLOCKED"
    ) {
      console.error("Interview runtime status blocked chat request", {
        sessionId: typeof sessionId === "string" ? sessionId.trim() : "",
        roomKey: typeof roomKey === "string" ? roomKey.trim() : "",
        currentRoundStatus: runtimeContext?.currentRoundStatus || "",
        currentStageStatus: runtimeContext?.currentStageStatus || "",
        runtimeRoundId: runtimeContext?.roundId || "",
        runtimeStageType: runtimeContext?.stageType || "",
      });
      return NextResponse.json(
        { error: "当前轮次已淘汰或已结束，不能继续进入本轮面试。" },
        { status: 409 }
      );
    }
    await syncInterviewRuntimeStatus(runtimeContext);
    const existingCodingSession =
      runtimeContext?.roundId
        ? await prisma.codingSession.findFirst({
            where: {
              roundId: runtimeContext.roundId,
              userId: session.user.id,
            },
            select: {
              id: true,
            },
          })
        : null;
    const turnPolicy = evaluateInterviewTurnPolicy({
      messages: messages as Array<InterviewMessage>,
      codingRequired: Boolean(runtimeContext?.codingRequired),
      hasCodingSession: Boolean(existingCodingSession),
      currentRoundStatus: runtimeContext?.currentRoundStatus,
    });
    const runtimeCompanyName =
      typeof runtimeContext?.companyName === "string" ? runtimeContext.companyName.trim() : "";
    const runtimeRoleName =
      typeof runtimeContext?.roleName === "string" ? runtimeContext.roleName.trim() : "";
    const runtimeStageLabel =
      typeof runtimeContext?.stageLabel === "string" ? runtimeContext.stageLabel.trim() : "";
    const runtimeInsightTitle = runtimeContext?.experienceInsights?.[0]?.title?.trim() || "";
    const domainContext =
      mode === "targeted"
        ? topic || desc || resolvedRole || "专项训练上下文"
        : [
            runtimeCompanyName,
            runtimeRoleName || resolvedRole,
            runtimeStageLabel,
            runtimeInsightTitle,
          ]
            .filter(Boolean)
            .join(" / ") || resolvedRole || "候选人真实简历上下文";

    const latestMessageObj = messages[messages.length - 1];
    const latestMessageContent = latestMessageObj
      ? flattenMessageContent(latestMessageObj)
      : "";
    const latestAiQuestion = getLatestAiMessage(
      messages as Array<{ role: string; content: string[] | string }>
    );
    const recentTurns = buildRecentClosureTurns(
      messages as Array<{ role: string; content: string[] | string }>
    );
    const recentDialogue = formatRecentDialogue(
      messages as Array<{ role: string; content: string[] | string }>
    );
    const offTopicCount = countRecentOffTopicSignals(
      messages as Array<{ role: string; content: string[] | string }>
    );
    const closureJudgeResult =
      interviewFeatureFlags.enableAgentEndJudge && latestMessageContent
        ? await judgeInterviewTurnClosure({
            openai,
            role: runtimeRoleName || resolvedRole,
            companyName: runtimeCompanyName,
            stageLabel: runtimeStageLabel,
            stageType: runtimeContext?.stageType || undefined,
            latestAiQuestion,
            latestUserAnswer: latestMessageContent,
            recentDialogue,
            recentTurns,
            negativeSignalCount:
              turnPolicy.action === "end_interview" ? 3 : turnPolicy.action === "offer_coding" ? 0 : 0,
            positiveSignalCount: turnPolicy.action === "offer_coding" ? 3 : 0,
            offTopicCount,
            codingRequired: Boolean(runtimeContext?.codingRequired),
            hasCodingSession: Boolean(existingCodingSession),
          })
        : null;
    const resolvedTurnAction =
      closureJudgeResult?.action && closureJudgeResult.action !== "continue"
        ? closureJudgeResult.action
        : turnPolicy.action;
    const resolvedTurnReason =
      closureJudgeResult?.candidateFacingTransition?.trim() ||
      turnPolicy.reason ||
      "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          if (resolvedTurnAction === "end_interview") {
            controller.enqueue(encoder.encode("__STATUS_GENERATING__"));
            controller.enqueue(
              encoder.encode(
                resolvedTurnReason ||
                  "这轮我先到这里。今天的核心信息我已经收集到了，本轮面试我先结束。你可以稍后查看本轮记录和反馈。"
              )
            );
            return;
          }

          if (resolvedTurnAction === "offer_coding") {
            controller.enqueue(encoder.encode("__STATUS_GENERATING__"));
            controller.enqueue(
              encoder.encode(
                resolvedTurnReason ||
                  "前面的项目问答先到这里。接下来我们进入一题限时算法题，我会重点看你的编码表达、边界处理和基本功。准备好后直接开始。"
              )
            );
            return;
          }

          let systemPrompt = "";
          let searchResults: Array<{ text?: string }> = [];
          
          // Before starting the final LLM stream, let's run the intent router.
          let routerResult = { needs_search: false };
          if (latestMessageContent) {
            try {
              const routerPrompt = `你是一个意图识别引擎。当前用户的面试岗位与领域上下文是：【${domainContext}】。
请判断用户的最新回复是否需要从外部知识库中检索信息（例如：包含不懂的最新技术名词、特定的专业术语、候选人主动提问求教，或者你需要为面试获取高质量的面试题等）。
注意：请基于该岗位的领域上下文（尤其是 AI、LLM 等现代技术栈）去理解用户的输入，如果涉及领域内的专有名词，应优先判定为需要检索。
请以 JSON 格式返回，包含一个布尔类型的字段 "needs_search"。例如：{"needs_search": true}`;

              const routerResponse = await openai.chat.completions.create({
                model: 'deepseek-chat',
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: routerPrompt },
                  { role: "user", content: latestMessageContent }
                ]
              });

              routerResult = JSON.parse(routerResponse.choices[0].message.content || '{"needs_search": false}');
              
              if (routerResult.needs_search) {
                // 向前端发送控制指令：开始检索
                controller.enqueue(encoder.encode('__STATUS_SEARCHING__'));
                
                searchResults = await searchKnowledgeBase(latestMessageContent);
                const promptPayload = buildInterviewSystemPrompt({
                  messages,
                  profile,
                  mode,
                  topic,
                  desc,
                  questionLimit,
                  durationLimitMinutes,
                  completedRounds,
                  searchResults,
                  runtimeContext
                });
                systemPrompt = promptPayload.systemPrompt;
              }
            } catch (err) {
              console.error("Intent Router or Knowledge Base search failed:", err);
            }
          }

          if (!systemPrompt) {
            const promptPayload = buildInterviewSystemPrompt({
              messages,
              profile,
              mode,
              topic,
              desc,
              questionLimit,
              durationLimitMinutes,
              completedRounds,
              searchResults: [],
              runtimeContext
            });
            systemPrompt = promptPayload.systemPrompt;
          }

          const recentMessages = messages as Array<{
            role: string;
            content: string[] | string;
          }>;
          const latestUserAnswer = getLatestUserMessage(recentMessages);
          const latestAiQuestion = getLatestAiMessage(recentMessages);
          const plan = await planInterviewTurn({
            openai,
            mode,
            role:
              runtimeRoleName ||
              (typeof profile?.role === "string" ? profile.role.trim() : "") ||
              domainContext,
            focus: typeof profile?.focus === "string" ? profile.focus.trim() : "",
            topic: typeof topic === "string" ? topic.trim() : "",
            desc: typeof desc === "string" ? desc.trim() : "",
            companyName: runtimeCompanyName,
            stageLabel: runtimeStageLabel,
            stageType:
              typeof runtimeContext?.stageType === "string"
                ? runtimeContext.stageType.trim()
                : "",
            previousStageFeedback: runtimeContext?.previousStageFeedback || [],
            experienceInsights: runtimeContext?.experienceInsights || [],
            latestUserAnswer,
            latestAiQuestion,
            recentDialogue: formatRecentDialogue(recentMessages)
          });
          const blueprint = await generateInterviewTurnBlueprintWithAgents({
            openai,
            role:
              runtimeRoleName ||
              (typeof profile?.role === "string" ? profile.role.trim() : "") ||
              domainContext,
            companyName: runtimeCompanyName,
            stageLabel: runtimeStageLabel,
            stageType:
              typeof runtimeContext?.stageType === "string"
                ? runtimeContext.stageType.trim()
                : "",
            previousStageFeedback: runtimeContext?.previousStageFeedback || [],
            experienceInsights: runtimeContext?.experienceInsights || [],
            latestUserAnswer,
            latestAiQuestion,
            recentDialogue: formatRecentDialogue(recentMessages),
            searchResults,
            plan,
          });
          const plannedSystemPrompt = appendInterviewPlanToSystemPrompt(
            systemPrompt,
            plan,
            blueprint
          );
          const apiMessages = buildApiMessages(
            plannedSystemPrompt,
            recentMessages
          );

          // 向前端发送控制指令：检索完毕，准备生成回答
          controller.enqueue(encoder.encode('__STATUS_GENERATING__'));
          const { replyText: finalReply, degradedToBuffered } =
            await streamInterviewReplyText({
              openai,
              controller,
              encoder,
              apiMessages,
            });
          const quality = inspectInterviewReplyQuality({
            replyText: finalReply,
            mode,
            role: typeof profile?.role === "string" ? profile.role : "",
            topic: typeof topic === "string" ? topic : "",
            desc: typeof desc === "string" ? desc : "",
            focus: typeof profile?.focus === "string" ? profile.focus : "",
            projects: Array.isArray(profile?.projects) ? profile.projects : [],
            latestUserAnswer
          });

          if (!quality.passed) {
            console.warn("Interview reply quality warning after streamed generation", {
              issues: quality.issues,
              degradedToBuffered
            });
          }
        } catch (err) {
          console.error("Interview stream pipeline failed, fallback to safe reply", err);
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("__STATUS_GENERATING__"));
          controller.enqueue(
            encoder.encode(buildStreamingFailureFallbackReply(latestAiQuestion))
          );
        } finally {
          controller.close();
        }
      }
    });

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    headers.set("x-interview-action", resolvedTurnAction);
    headers.set(
      "x-interview-action-reason",
      encodeURIComponent(resolvedTurnReason)
    );
    if (existingCodingSession?.id) {
      headers.set("x-coding-session-id", existingCodingSession.id);
    }

    if (messages.length === 2) {
      headers.set('Set-Cookie', `${sessionCookieName}=${sessionCount}; Max-Age=${60 * 60 * 24}; Path=/`);
    }

    return new Response(stream, { headers });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
