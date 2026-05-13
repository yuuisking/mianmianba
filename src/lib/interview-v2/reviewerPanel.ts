import { AgentRunRole, AgentRunStatus, Prisma } from "@prisma/client";
import type { getDeepseekClient } from "@/lib/ai/deepseek";
import { createInAppNotification } from "@/lib/notifications/inAppNotifications";
import prisma from "@/lib/prisma";

export type RoundReviewerVote = "PASS" | "FAIL";

export type RoundReviewerDecision = {
  reviewerId: string;
  reviewerName: string;
  lens: string;
  vote: RoundReviewerVote;
  score: number;
  confidence: number;
  rationale: string;
  strengths: string[];
  improvements: string[];
};

export type RoundReviewActionItem = {
  title: string;
  desc: string;
};

export type RoundReviewPanelResult = {
  passed: boolean;
  passVotes: number;
  failVotes: number;
  totalReviewers: number;
  averageScore: number;
  reviewers: RoundReviewerDecision[];
  adjudicationSummary: string;
  verdictReason: string;
  focusAreas: string[];
  actionItems: RoundReviewActionItem[];
};

type ReviewerProfile = {
  id: string;
  name: string;
  lens: string;
  objective: string;
};

type PlanningSummaryShape = {
  orchestration?: {
    latestDecision?: Record<string, unknown> | null;
    stageReviews?: Array<Record<string, unknown>>;
    pendingNextStage?: Record<string, unknown> | null;
    globalFeedback?: string[];
    finalStatus?: string | null;
    updatedAt?: string | null;
  };
};

const reviewerProfiles: ReviewerProfile[] = [
  {
    id: "technical-depth",
    name: "技术深度评审 Agent",
    lens: "技术严谨性、原理深度、方案取舍与边界处理",
    objective: "判断候选人的技术深度是否达到当前轮次要求。",
  },
  {
    id: "business-scenario",
    name: "业务场景评审 Agent",
    lens: "业务语境贴合度、场景判断、风险意识、落地可行性",
    objective: "判断候选人是否真正理解业务约束并能给出可落地方案。",
  },
  {
    id: "communication-structure",
    name: "表达结构评审 Agent",
    lens: "表达结构、信息完整度、重点突出度、临场沟通稳定性",
    objective: "判断候选人的表达是否足以支撑真实面试通过。",
  },
];

/**
 * 将未知数组清洗为字符串列表，避免脏数据直接落库。
 * @param value 原始值。
 * @returns 清洗后的字符串列表。
 */
function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * 将原始分值限制在合法范围内。
 * @param value 原始数值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 限制后的数值。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 将普通对象稳定转换为 Prisma JSON 值。
 * @param value 任意可序列化对象。
 * @returns 可写入 Prisma JSON 字段的值。
 */
function toPrismaJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 将未知 JSON 安全收口为普通对象。
 * @param value 原始值。
 * @returns 普通对象或 `null`。
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 将计划摘要解析为可追加编排信息的对象。
 * @param planningSummary 计划摘要 JSON。
 * @returns 标准化后的计划摘要对象。
 */
function normalizePlanningSummary(
  planningSummary: Prisma.JsonValue | null
): PlanningSummaryShape & Record<string, unknown> {
  const summary = asRecord(planningSummary) || {};
  const orchestration = asRecord(summary.orchestration);
  const stageReviews = Array.isArray(orchestration?.stageReviews)
    ? orchestration.stageReviews.filter(
        (item): item is Record<string, unknown> => Boolean(asRecord(item))
      )
    : [];

  return {
    ...summary,
    orchestration: {
      latestDecision: asRecord(orchestration?.latestDecision) || null,
      stageReviews,
      pendingNextStage: asRecord(orchestration?.pendingNextStage) || null,
      globalFeedback: normalizeStringList(orchestration?.globalFeedback),
      finalStatus:
        typeof orchestration?.finalStatus === "string" ? orchestration.finalStatus : null,
      updatedAt:
        typeof orchestration?.updatedAt === "string" ? orchestration.updatedAt : null,
    },
  };
}

/**
 * 对单个评审 Agent 发起独立评审，请求其仅从本评审视角投票。
 * @param input 当前评审所需上下文。
 * @returns 单个评审 Agent 的结构化结论。
 */
async function evaluateSingleReviewer(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  reviewer: ReviewerProfile;
  companyName: string;
  roleName: string;
  targetLevel: string;
  stageLabel: string;
  focus: string;
  transcript: string;
  questionTranscript: string;
}): Promise<RoundReviewerDecision> {
  const prompt = `
你是【${input.reviewer.name}】。
你的唯一评审视角是：${input.reviewer.lens}
你的目标是：${input.reviewer.objective}

面试上下文：
- 目标公司：${input.companyName || "未提供"}
- 目标岗位：${input.roleName || "未提供"}
- 目标级别：${input.targetLevel || "未提供"}
- 当前轮次：${input.stageLabel || "未提供"}
- 本轮重点：${input.focus || "未提供"}

面试官提问记录：
${input.questionTranscript || "暂无"}

候选人问答转写：
${input.transcript || "暂无"}

请你作为独立评审，只从自己的视角给出投票，不要替其他评审补位。

只返回 JSON：
{
  "vote": "PASS",
  "score": 0,
  "confidence": 0,
  "rationale": "为什么投这一票",
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["改进点1", "改进点2"]
}
`.trim();

  const completion = await input.openai.chat.completions.create({
    model: "deepseek-chat",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是严格的面试评审 Agent，只输出 JSON。vote 仅允许 PASS 或 FAIL；score 和 confidence 范围为 0 到 10。",
      },
      { role: "user", content: prompt },
    ],
  });

  const parsed = JSON.parse(
    completion.choices[0]?.message?.content || "{}"
  ) as Partial<RoundReviewerDecision>;

  return {
    reviewerId: input.reviewer.id,
    reviewerName: input.reviewer.name,
    lens: input.reviewer.lens,
    vote: parsed.vote === "FAIL" ? "FAIL" : "PASS",
    score: clamp(Number(parsed.score || 0), 0, 10),
    confidence: clamp(Number(parsed.confidence || 0), 0, 10),
    rationale:
      typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "本评审未返回明确理由。",
    strengths: normalizeStringList(parsed.strengths),
    improvements: normalizeStringList(parsed.improvements),
  };
}

/**
 * 让裁决 Agent 在既定多数票结论下输出统一的轮次总结和改进行动。
 * @param input 当前裁决所需上下文。
 * @returns 裁决 Agent 的结构化总结。
 */
async function adjudicateReviewerPanel(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  companyName: string;
  roleName: string;
  stageLabel: string;
  forcedDecision: RoundReviewerVote;
  reviewers: RoundReviewerDecision[];
}): Promise<{
  adjudicationSummary: string;
  verdictReason: string;
  focusAreas: string[];
  actionItems: RoundReviewActionItem[];
}> {
  const reviewerDigest = input.reviewers
    .map(
      (item) =>
        `- ${item.reviewerName}（${item.lens}）: ${item.vote}；分数 ${item.score}/10；理由：${item.rationale}；亮点：${item.strengths.join(" / ") || "无"}；改进点：${item.improvements.join(" / ") || "无"}`
    )
    .join("\n");

  const prompt = `
你是面试裁决 Agent。
注意：最终通过与否已经由多数票决定，你不能推翻票决，只能在该结果下给出统一总结。

裁决上下文：
- 目标公司：${input.companyName || "未提供"}
- 目标岗位：${input.roleName || "未提供"}
- 当前轮次：${input.stageLabel || "未提供"}
- 已确定的多数票结论：${input.forcedDecision}

评审团结果：
${reviewerDigest}

请只返回 JSON：
{
  "adjudicationSummary": "给候选人看的本轮总结",
  "verdictReason": "为什么过或不过",
  "focusAreas": ["后续重点1", "后续重点2"],
  "actionItems": [
    { "title": "改进动作标题", "desc": "具体怎么练" }
  ]
}
`.trim();

  const completion = await input.openai.chat.completions.create({
    model: "deepseek-chat",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是面试裁决 Agent，只输出 JSON，不要推翻既定多数票结论。",
      },
      { role: "user", content: prompt },
    ],
  });

  const parsed = JSON.parse(
    completion.choices[0]?.message?.content || "{}"
  ) as Partial<{
    adjudicationSummary: string;
    verdictReason: string;
    focusAreas: string[];
    actionItems: RoundReviewActionItem[];
  }>;

  return {
    adjudicationSummary:
      typeof parsed.adjudicationSummary === "string" &&
      parsed.adjudicationSummary.trim()
        ? parsed.adjudicationSummary.trim()
        : "评审团已完成本轮裁决。",
    verdictReason:
      typeof parsed.verdictReason === "string" && parsed.verdictReason.trim()
        ? parsed.verdictReason.trim()
        : "当前结论由评审团多数票决定。",
    focusAreas: normalizeStringList(parsed.focusAreas).slice(0, 4),
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems
          .map((item) => ({
            title:
              typeof item?.title === "string" && item.title.trim()
                ? item.title.trim()
                : "",
            desc:
              typeof item?.desc === "string" && item.desc.trim()
                ? item.desc.trim()
                : "",
          }))
          .filter((item) => item.title || item.desc)
          .slice(0, 4)
      : [],
  };
}

/**
 * 运行 3 位独立评审 Agent 的轮次评审，并由裁决 Agent 生成统一结论。
 * @param input 当前轮次评审所需上下文。
 * @returns 多评审投票结果。
 */
export async function runRoundReviewerPanel(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  companyName: string;
  roleName: string;
  targetLevel: string;
  stageLabel: string;
  focus: string;
  transcript: string;
  questionTranscript: string;
}): Promise<RoundReviewPanelResult> {
  const reviewers = await Promise.all(
    reviewerProfiles.map((reviewer) =>
      evaluateSingleReviewer({
        openai: input.openai,
        reviewer,
        companyName: input.companyName,
        roleName: input.roleName,
        targetLevel: input.targetLevel,
        stageLabel: input.stageLabel,
        focus: input.focus,
        transcript: input.transcript,
        questionTranscript: input.questionTranscript,
      })
    )
  );

  const passVotes = reviewers.filter((item) => item.vote === "PASS").length;
  const failVotes = reviewers.length - passVotes;
  const passed = passVotes >= Math.floor(reviewers.length / 2) + 1;
  const forcedDecision: RoundReviewerVote = passed ? "PASS" : "FAIL";
  const averageScore =
    reviewers.length > 0
      ? Number(
          (
            reviewers.reduce((sum, item) => sum + item.score, 0) / reviewers.length
          ).toFixed(1)
        )
      : 0;

  const adjudication = await adjudicateReviewerPanel({
    openai: input.openai,
    companyName: input.companyName,
    roleName: input.roleName,
    stageLabel: input.stageLabel,
    forcedDecision,
    reviewers,
  });

  return {
    passed,
    passVotes,
    failVotes,
    totalReviewers: reviewers.length,
    averageScore,
    reviewers,
    adjudicationSummary: adjudication.adjudicationSummary,
    verdictReason: adjudication.verdictReason,
    focusAreas: adjudication.focusAreas,
    actionItems: adjudication.actionItems,
  };
}

/**
 * 将多评审结果落库到 v2 轮次运行记录、评分卡和复盘报告，供后续流程与复盘中心消费。
 * @param input 当前评审结果及轮次标识。
 * @returns 无返回值。
 */
export async function persistRoundReviewerPanel(input: {
  userId: string;
  planId?: string | null;
  stageId?: string | null;
  roundId?: string | null;
  panel: RoundReviewPanelResult;
}): Promise<void> {
  if (!input.planId || !input.stageId || !input.roundId) {
    return;
  }

  const planId = input.planId;
  const stageId = input.stageId;
  const roundId = input.roundId;

  const stage = await prisma.interviewPlanStage.findFirst({
    where: {
      id: stageId,
      planId,
      plan: {
        userId: input.userId,
      },
    },
    select: {
      id: true,
      planId: true,
      stageOrder: true,
      stageLabel: true,
      stageType: true,
      plan: {
        select: {
          planningSummary: true,
          status: true,
        },
      },
    },
  });

  if (!stage) {
    return;
  }

  const nextStage = await prisma.interviewPlanStage.findFirst({
    where: {
      planId,
      stageOrder: {
        gt: stage.stageOrder,
      },
    },
    orderBy: {
      stageOrder: "asc",
    },
    select: {
      id: true,
      stageLabel: true,
      stageType: true,
      scheduledAt: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const currentDecision = input.panel.passed ? "PASS" : "FAIL";
    const normalizedPlanningSummary = normalizePlanningSummary(stage.plan.planningSummary);
    const previousStageReviews = normalizedPlanningSummary.orchestration?.stageReviews || [];
    const stageReviewEntry = {
      stageId: input.stageId,
      roundId: input.roundId,
      stageOrder: stage.stageOrder,
      stageLabel: stage.stageLabel,
      stageType: stage.stageType,
      decision: currentDecision,
      passVotes: input.panel.passVotes,
      failVotes: input.panel.failVotes,
      totalReviewers: input.panel.totalReviewers,
      averageScore: input.panel.averageScore,
      adjudicationSummary: input.panel.adjudicationSummary,
      verdictReason: input.panel.verdictReason,
      focusAreas: input.panel.focusAreas,
      actionItems: input.panel.actionItems,
      reviewers: input.panel.reviewers,
      completedAt: now.toISOString(),
      nextAction: input.panel.passed
        ? nextStage
          ? "ADVANCE_TO_NEXT_STAGE"
          : "COMPLETE_PLAN"
        : "ELIMINATED_REVIEW",
      nextStage: input.panel.passed && nextStage
        ? {
            stageId: nextStage.id,
            stageLabel: nextStage.stageLabel,
            stageType: nextStage.stageType,
            scheduledAt: nextStage.scheduledAt?.toISOString() || null,
          }
        : null,
    };
    const mergedStageReviews = [
      ...previousStageReviews.filter((item) => item.stageId !== input.stageId),
      stageReviewEntry,
    ].sort((a, b) => {
      const left = typeof a.stageOrder === "number" ? a.stageOrder : 0;
      const right = typeof b.stageOrder === "number" ? b.stageOrder : 0;
      return left - right;
    });
    const globalFeedback = mergedStageReviews
      .map((item) => {
        const stageLabel =
          typeof item.stageLabel === "string" && item.stageLabel.trim()
            ? item.stageLabel.trim()
            : "上一轮";
        const summary =
          typeof item.adjudicationSummary === "string" && item.adjudicationSummary.trim()
            ? item.adjudicationSummary.trim()
            : typeof item.verdictReason === "string" && item.verdictReason.trim()
              ? item.verdictReason.trim()
              : "该轮已结束，下一轮需要继续验证关键能力与风险点。";
        return `${stageLabel}：${summary}`;
      })
      .filter(Boolean)
      .slice(-8);
    const nextPlanStatus = input.panel.passed
      ? nextStage
        ? "IN_PROGRESS"
        : "COMPLETED"
      : "COMPLETED";
    const orchestrationSnapshot = {
      latestDecision: {
        stageId: input.stageId,
        roundId: input.roundId,
        stageLabel: stage.stageLabel,
        decision: currentDecision,
        summary: input.panel.adjudicationSummary,
        verdictReason: input.panel.verdictReason,
        passVotes: input.panel.passVotes,
        failVotes: input.panel.failVotes,
        nextAction: stageReviewEntry.nextAction,
        generatedAt: now.toISOString(),
      },
      stageReviews: mergedStageReviews,
      pendingNextStage:
        input.panel.passed && nextStage
          ? {
              stageId: nextStage.id,
              stageLabel: nextStage.stageLabel,
              stageType: nextStage.stageType,
              scheduledAt: nextStage.scheduledAt?.toISOString() || null,
              status: "READY",
            }
          : null,
      globalFeedback,
      finalStatus: nextPlanStatus,
      updatedAt: now.toISOString(),
    };

    for (const reviewer of input.panel.reviewers) {
      await tx.interviewAgentRun.create({
        data: {
          planId: input.planId,
          stageId: input.stageId,
          roundId: input.roundId,
          agentRole: AgentRunRole.SCORER,
          status: AgentRunStatus.COMPLETED,
          modelName: `review-panel/${reviewer.reviewerId}`,
          input: toPrismaJson({
            reviewerName: reviewer.reviewerName,
            lens: reviewer.lens,
          }),
          output: toPrismaJson(reviewer),
          startedAt: now,
          finishedAt: now,
        },
      });
    }

    await tx.interviewAgentRun.create({
      data: {
        planId: input.planId,
        stageId,
        roundId,
        agentRole: AgentRunRole.SUMMARY,
        status: AgentRunStatus.COMPLETED,
        modelName: "review-panel/adjudicator",
        input: toPrismaJson({
          passVotes: input.panel.passVotes,
          failVotes: input.panel.failVotes,
          totalReviewers: input.panel.totalReviewers,
        }),
        output: toPrismaJson({
          passed: input.panel.passed,
          adjudicationSummary: input.panel.adjudicationSummary,
          verdictReason: input.panel.verdictReason,
          focusAreas: input.panel.focusAreas,
          actionItems: input.panel.actionItems,
        }),
        startedAt: now,
        finishedAt: now,
      },
    });

    await tx.interviewAgentRun.create({
      data: {
        planId: input.planId,
        stageId: input.stageId,
        roundId,
        agentRole: AgentRunRole.PLANNER,
        status: AgentRunStatus.COMPLETED,
        modelName: "review-panel/global-orchestrator",
        input: toPrismaJson({
          stageId: input.stageId,
          roundId: input.roundId,
          currentDecision,
          passVotes: input.panel.passVotes,
          failVotes: input.panel.failVotes,
        }),
        output: toPrismaJson(orchestrationSnapshot),
        startedAt: now,
        finishedAt: now,
      },
    });

    await tx.interviewScorecard.create({
      data: {
        roundId,
        totalScore: input.panel.averageScore * 10,
        technicalScore:
          reviewerProfiles.length > 0
            ? input.panel.reviewers[0]?.score || null
            : null,
        communicationScore: input.panel.reviewers[2]?.score || null,
        confidenceScore:
          input.panel.reviewers.length > 0
            ? input.panel.reviewers.reduce(
                (sum, item) => sum + item.confidence,
                0
              ) / input.panel.reviewers.length
            : null,
        rubricBreakdown: toPrismaJson({
          passVotes: input.panel.passVotes,
          failVotes: input.panel.failVotes,
          averageScore: input.panel.averageScore,
          reviewers: input.panel.reviewers,
        }),
      },
    });

    await tx.interviewInsightReport.create({
      data: {
        planId,
        roundId,
        reportType: "ROUND_REVIEW_PANEL",
        summary: input.panel.adjudicationSummary,
        highlights: toPrismaJson(
          Array.from(
            new Set(input.panel.reviewers.flatMap((item) => item.strengths))
          ).slice(0, 6)
        ),
        risks: toPrismaJson(
          Array.from(
            new Set(input.panel.reviewers.flatMap((item) => item.improvements))
          ).slice(0, 6)
        ),
        actionItems: toPrismaJson(input.panel.actionItems),
        radarSnapshot: toPrismaJson({
          passed: input.panel.passed,
          passVotes: input.panel.passVotes,
          failVotes: input.panel.failVotes,
          totalReviewers: input.panel.totalReviewers,
          averageScore: input.panel.averageScore,
          focusAreas: input.panel.focusAreas,
        }),
      },
    });

    await tx.interviewRound.update({
      where: {
        id: roundId,
      },
      data: {
        status: "DONE",
        endedAt: now,
        roundSummary: `${input.panel.passed ? "通过" : "淘汰"}：${input.panel.verdictReason}`,
      },
    });

    if (input.panel.passed) {
      await tx.interviewPlanStage.update({
        where: {
          id: stageId,
        },
        data: {
          status: "COMPLETED",
        },
      });

      if (nextStage) {
        await tx.interviewPlanStage.update({
          where: {
            id: nextStage.id,
          },
          data: {
            status: "READY",
          },
        });
      } else {
        await tx.interviewPlan.update({
          where: {
            id: planId,
          },
          data: {
            status: "COMPLETED",
            planningSummary: toPrismaJson({
              ...normalizedPlanningSummary,
              orchestration: orchestrationSnapshot,
            }),
          },
        });
      }
    } else {
      await tx.interviewPlanStage.update({
        where: {
          id: stageId,
        },
        data: {
          status: "BLOCKED",
        },
      });

      await tx.interviewPlan.update({
        where: {
          id: planId,
        },
        data: {
          status: "COMPLETED",
          planningSummary: toPrismaJson({
            ...normalizedPlanningSummary,
            orchestration: orchestrationSnapshot,
          }),
        },
      });

      await createInAppNotification(tx, {
        userId: input.userId,
        type: nextStage ? "interview_next_round_ready" : "interview_offer_result",
        title: nextStage ? `下一轮已安排：${nextStage.stageLabel}` : "🎉 恭喜你，当前流程已进入 Offer 结果",
        content: nextStage
          ? `${stage.stageLabel}已通过。接下来是${nextStage.stageLabel}，建议你先查看当前反馈，再按下一轮要求继续准备。`
          : `你已经完成全部关键轮次，当前流程已收口为 Offer 结果。去查看整套复盘，确认你的强项和最终亮点。`,
        actionPath: `/feedback?planId=${planId}`,
        metadata: {
          planId,
          stageId,
          nextStageId: nextStage?.id || null,
          decision: currentDecision,
        },
      });
    }
    if (input.panel.passed && nextStage) {
      await tx.interviewPlan.update({
        where: {
          id: planId,
        },
        data: {
          status: "IN_PROGRESS",
          planningSummary: toPrismaJson({
            ...normalizedPlanningSummary,
            orchestration: orchestrationSnapshot,
          }),
        },
      });

      await createInAppNotification(tx, {
        userId: input.userId,
        type: "interview_eliminated",
        title: "摸摸头，这一轮先记为未通过",
        content: `${stage.stageLabel}未通过。别灰心，建议先进入复盘中心查看面试官反馈，把关键薄弱点补强后再继续冲刺。`,
        actionPath: `/feedback?planId=${input.planId}`,
        metadata: {
          planId: input.planId,
          stageId: input.stageId,
          decision: currentDecision,
        },
      });
    }
  });
}
