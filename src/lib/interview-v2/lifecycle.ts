import { AgentRunRole, AgentRunStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createInAppNotification } from "@/lib/notifications/inAppNotifications";
import { buildV2ReviewDashboardSnapshot } from "@/lib/interview-v2/reviewDashboard";

type PlanLifecycleNotice = {
  title: string;
  tone: "celebration" | "encouragement" | "reminder";
  message: string;
};

type PlanLifecycleResult = {
  processedPlanCount: number;
  missedStageCount: number;
  notices: Array<{
    planId: string;
    companyName: string | null;
    roleName: string | null;
    notice: PlanLifecycleNotice;
  }>;
};

/**
 * 将未知值安全收口为普通对象。
 * @param value 任意 JSON 值。
 * @returns 普通对象或 `null`。
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 生成未参面自动淘汰后的暖心通知文案。
 * @param stageLabel 当前轮次标题。
 * @returns 面向用户的通知文案。
 */
function buildMissedInterviewNotice(stageLabel: string): PlanLifecycleNotice {
  return {
    title: "摸摸头，这次先记为未通过",
    tone: "encouragement",
    message: `你预约的${stageLabel || "当前轮次"}已超过开始时间且未参加，系统已按真实招聘流程将本次流程记为未通过。别灰心，先去查看反馈，把关键薄弱点补强后再回来继续冲。`,
  };
}

/**
 * 将对象稳定转换为 Prisma JSON。
 * @param value 任意可序列化对象。
 * @returns Prisma 可接受的 JSON 值。
 */
function toPrismaJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 处理已到时间但未参加的轮次，将其标记为自动淘汰，并回写暖心通知与编排结果。
 * @param input 可选的当前时间与宽限分钟数。
 * @returns 处理摘要。
 */
export async function processInterviewPlanLifecycle(input?: {
  userId?: string;
  planId?: string | null;
  now?: Date;
  graceMinutes?: number;
}): Promise<PlanLifecycleResult> {
  const now = input?.now || new Date();
  const graceMinutes = typeof input?.graceMinutes === "number" ? input.graceMinutes : 10;
  const dueAt = new Date(now.getTime() - graceMinutes * 60 * 1000);

  const overdueStages = await prisma.interviewPlanStage.findMany({
    where: {
      status: {
        in: ["READY", "ACTIVE"],
      },
      scheduledAt: {
        lte: dueAt,
      },
      plan: {
        ...(input?.userId ? { userId: input.userId } : {}),
        ...(input?.planId ? { id: input.planId } : {}),
        status: {
          in: ["PLANNED", "IN_PROGRESS"],
        },
      },
      rounds: {
        none: {
          status: {
            in: ["ASKING", "USER_ANSWERING", "FOLLOW_UP", "CODING", "SCORING", "DONE"],
          },
        },
      },
    },
    include: {
      plan: true,
      rounds: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  const notices: PlanLifecycleResult["notices"] = [];

  for (const stage of overdueStages) {
    const latestRound = stage.rounds[stage.rounds.length - 1] || null;
    const notice = buildMissedInterviewNotice(stage.stageLabel);
    const planningSummary = asRecord(stage.plan.planningSummary) || {};
    const orchestration = asRecord(planningSummary.orchestration) || {};
    const stageReviews = Array.isArray(orchestration.stageReviews)
      ? orchestration.stageReviews.filter((item) => Boolean(asRecord(item)))
      : [];
    const lifecycleSnapshot = {
      latestDecision: {
        stageId: stage.id,
        roundId: latestRound?.id || null,
        stageLabel: stage.stageLabel,
        decision: "MISSED",
        summary: notice.title,
        verdictReason: notice.message,
        nextAction: "AUTO_ELIMINATED_NO_SHOW",
        generatedAt: now.toISOString(),
      },
      stageReviews: [
        ...stageReviews.filter((item) => asRecord(item)?.stageId !== stage.id),
        {
          stageId: stage.id,
          roundId: latestRound?.id || null,
          stageOrder: stage.stageOrder,
          stageLabel: stage.stageLabel,
          stageType: stage.stageType,
          decision: "MISSED",
          adjudicationSummary: notice.title,
          verdictReason: notice.message,
          focusAreas: ["面试准时性", "下一轮时间管理", "面试准备节奏"],
          actionItems: [
            {
              title: "重新建立面试提醒机制",
              desc: "至少提前一天、提前一小时设置提醒，并为下一场训练预留完整面试时间。",
            },
          ],
          completedAt: now.toISOString(),
          nextAction: "AUTO_ELIMINATED_NO_SHOW",
        },
      ],
      pendingNextStage: null,
      globalFeedback: [notice.message],
      finalStatus: "COMPLETED",
      notice,
      updatedAt: now.toISOString(),
    };

    await prisma.$transaction(async (tx) => {
      await tx.interviewPlanStage.update({
        where: {
          id: stage.id,
        },
        data: {
          status: "BLOCKED",
        },
      });

      await tx.interviewPlanStage.updateMany({
        where: {
          planId: stage.planId,
          stageOrder: {
            gt: stage.stageOrder,
          },
          status: {
            in: ["PENDING", "READY", "ACTIVE"],
          },
        },
        data: {
          status: "SKIPPED",
        },
      });

      if (latestRound) {
        await tx.interviewRound.update({
          where: {
            id: latestRound.id,
          },
          data: {
            status: "ABORTED",
            endedAt: now,
            roundSummary: `未参面淘汰：${notice.message}`,
          },
        });

        await tx.interviewInsightReport.create({
          data: {
            planId: stage.planId,
            roundId: latestRound.id,
            reportType: "PLAN_LIFECYCLE_NOTICE",
            summary: notice.title,
            highlights: toPrismaJson([]),
            risks: toPrismaJson(["当前轮次超时未参加，流程已自动结束。"]),
            actionItems: toPrismaJson([
              {
                title: "查看反馈并重新预约",
                desc: "先回看本次流程问题，再重新进入训练链路。",
              },
            ]),
            radarSnapshot: toPrismaJson({
              decision: "MISSED",
              tone: notice.tone,
            }),
          },
        });

        await tx.interviewAgentRun.create({
          data: {
            planId: stage.planId,
            stageId: stage.id,
            roundId: latestRound.id,
            agentRole: AgentRunRole.PLANNER,
            status: AgentRunStatus.COMPLETED,
            modelName: "lifecycle/no-show-orchestrator",
            input: toPrismaJson({
              stageId: stage.id,
              scheduledAt: stage.scheduledAt?.toISOString() || null,
              graceMinutes,
            }),
            output: toPrismaJson(lifecycleSnapshot),
            startedAt: now,
            finishedAt: now,
          },
        });
      }

      await tx.interviewPlan.update({
        where: {
          id: stage.planId,
        },
        data: {
          status: "COMPLETED",
          planningSummary: toPrismaJson({
            ...planningSummary,
            orchestration: lifecycleSnapshot,
          }),
        },
      });

      await createInAppNotification(tx, {
        userId: stage.plan.userId,
        type: "interview_no_show",
        title: notice.title,
        content: notice.message,
        actionPath: `/feedback?planId=${stage.planId}`,
        metadata: {
          planId: stage.planId,
          stageId: stage.id,
          stageLabel: stage.stageLabel,
          decision: "MISSED",
        },
      });
    });

    notices.push({
      planId: stage.planId,
      companyName: stage.plan.companyName,
      roleName: stage.plan.roleName,
      notice,
    });
  }

  return {
    processedPlanCount: overdueStages.length,
    missedStageCount: overdueStages.length,
    notices,
  };
}

/**
 * 为指定计划解析最稳妥的反馈跳转地址。
 * 优先进入复盘中心；若当前样本还不足，则回退到复盘中心默认视图。
 * @param input 当前用户和计划标识。
 * @returns 最终可跳转的反馈地址。
 */
export async function resolvePlanFeedbackPath(input: {
  userId: string;
  planId: string;
}): Promise<string | null> {
  const plan = await prisma.interviewPlan.findFirst({
    where: {
      id: input.planId,
      userId: input.userId,
    },
  });

  if (!plan) {
    return null;
  }

  const role = plan.roleName?.trim() || "";
  const company = plan.companyName?.trim() || "";
  if (role || company) {
    const snapshot = await buildV2ReviewDashboardSnapshot({
      userId: input.userId,
      filters: {
        role: role || null,
        company: company || null,
      },
    });
    const hasReviewContent =
      snapshot.issues.length > 0 ||
      snapshot.evidences.length > 0 ||
      snapshot.historySessions.length > 0 ||
      snapshot.sampleSummaryCard.validSampleCount > 0;

    if (hasReviewContent) {
      const issueId = snapshot.issues[0]?.id || "";
      const evidenceId = snapshot.evidences.find((item) => item.issueId === issueId)?.id || "";
      const query = new URLSearchParams();
      if (role) {
        query.set("role", role);
      }
      if (company) {
        query.set("company", company);
      }
      if (issueId) {
        query.set("issueId", issueId);
      }
      if (evidenceId) {
        query.set("evidenceId", evidenceId);
      }
      return `/review?${query.toString()}`;
    }
  }

  return "/review";
}
