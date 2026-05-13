import {
  AgentRunRole,
  AgentRunStatus,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createInAppNotification } from "@/lib/notifications/inAppNotifications";

/**
 * 统一提取接口异常信息。
 * @param {unknown} error 捕获到的异常对象。
 * @returns {string} 可安全输出的错误文本。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * 将淘汰原因写成统一的轮次摘要，便于后续复盘和阻断重入。
 * @param reason 本次结束原因。
 * @returns 可直接落库的轮次摘要。
 */
function buildTerminationSummary(reason: string): string {
  const normalizedReason = reason.trim() || "候选人在当前轮次中途退出。";
  return `当前轮次已终止：${normalizedReason}`;
}

/**
 * 为“正常结束当前全流程”生成统一的流程收口快照，避免列表仍停留在进行中状态。
 * @param input 当前结束时的阶段信息与结束原因。
 * @returns 可直接写入计划 orchestration 的收口快照。
 */
function buildCompletedPlanClosureSnapshot(input: {
  stageId: string;
  roundId: string;
  stageLabel: string;
  stageOrder: number | null;
  stageType: string | null;
  terminationReason: string;
  previousStageReviews: Array<Record<string, unknown>>;
  previousPlanningSummary: Record<string, unknown>;
  nowIso: string;
}): Record<string, unknown> {
  const completionTitle = "本轮面试已结束";
  const completionMessage =
    input.terminationReason.trim() ||
    `${input.stageLabel || "当前轮次"}已结束，本次流程已按完成态收口。`;

  return {
    ...input.previousPlanningSummary,
    orchestration: {
      ...(asRecord(input.previousPlanningSummary.orchestration) || {}),
      latestDecision: {
        stageId: input.stageId || null,
        roundId: input.roundId || null,
        stageLabel: input.stageLabel || "当前轮次",
        decision: "MANUAL_FINISH",
        summary: completionTitle,
        verdictReason: completionMessage,
        nextAction: "VIEW_REPORT_AND_REVIEW",
        generatedAt: input.nowIso,
      },
      stageReviews: [
        ...input.previousStageReviews.filter((item) => asRecord(item)?.stageId !== input.stageId),
        {
          stageId: input.stageId || null,
          roundId: input.roundId || null,
          stageOrder: input.stageOrder,
          stageLabel: input.stageLabel || "当前轮次",
          stageType: input.stageType || null,
          decision: "MANUAL_FINISH",
          adjudicationSummary: completionTitle,
          verdictReason: completionMessage,
          focusAreas: ["查看报告", "回看评审结论", "进入复盘中心"],
          actionItems: [
            {
              title: "查看本轮报告",
              desc: "先阅读结构化报告，再根据反馈决定下一步训练动作。",
            },
          ],
          completedAt: input.nowIso,
          nextAction: "VIEW_REPORT_AND_REVIEW",
        },
      ],
      pendingNextStage: null,
      globalFeedback: [completionMessage],
      finalStatus: "COMPLETED",
      updatedAt: input.nowIso,
    },
  };
}

/**
 * 将任意可序列化对象稳定转换为 Prisma JSON 值。
 * @param {T} value 任意可序列化对象。
 * @returns {Prisma.InputJsonValue} 可写入 Prisma JSON 字段的值。
 */
function toPrismaJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 将未知 JSON 值安全收口为普通对象。
 * @param {unknown} value 原始值。
 * @returns {Record<string, unknown> | null} 普通对象或 `null`。
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionAuth = await getServerSession(authOptions);
    if (!sessionAuth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const session = await prisma.interviewSession.findUnique({
      where: { id },
      include: {
        messages: true,
        report: true,
      },
    });

    if (!session || session.userId !== sessionAuth.user.id) {
      return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ data: session });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionAuth = await getServerSession(authOptions);
    if (!sessionAuth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existingSession = await prisma.interviewSession.findUnique({
      where: { id },
    });

    if (!existingSession || existingSession.userId !== sessionAuth.user.id) {
      return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
    }

    const body = await req.json();
    const terminationReason =
      typeof body.terminationReason === "string" ? body.terminationReason : "";
    const isEliminatedExit = body.status === "eliminated_exited";
    const isCompletedExit = body.status === "completed";
    const now = new Date();
    const planId = typeof body.planId === "string" ? body.planId.trim() : "";
    const stageId = typeof body.stageId === "string" ? body.stageId.trim() : "";
    const roundId = typeof body.roundId === "string" ? body.roundId.trim() : "";
    const sourceLaunchId =
      typeof body.sourceLaunchId === "string" ? body.sourceLaunchId.trim() : "";
    const roomKey = typeof body.roomKey === "string" ? body.roomKey.trim() : "";
    if (
      (planId && existingSession.planId && existingSession.planId !== planId) ||
      (stageId && existingSession.stageId && existingSession.stageId !== stageId) ||
      (roundId && existingSession.roundId && existingSession.roundId !== roundId) ||
      (sourceLaunchId &&
        existingSession.sourceLaunchId &&
        existingSession.sourceLaunchId !== sourceLaunchId) ||
      (roomKey && existingSession.roomKey && existingSession.roomKey !== roomKey)
    ) {
      return NextResponse.json(
        { error: "Session room identity mismatch" },
        { status: 409 }
      );
    }
    const plan =
      (isEliminatedExit || isCompletedExit) && planId
        ? await prisma.interviewPlan.findFirst({
            where: {
              id: planId,
              userId: sessionAuth.user.id,
            },
            include: {
              stages: {
                orderBy: {
                  stageOrder: "asc",
                },
              },
            },
          })
        : null;
    const normalizedPlanningSummary = asRecord(plan?.planningSummary) || {};
    const orchestration = asRecord(normalizedPlanningSummary.orchestration) || {};
    const stageReviews = Array.isArray(orchestration.stageReviews)
      ? orchestration.stageReviews.filter((item) => Boolean(asRecord(item)))
      : [];
    const exitedStage =
      plan?.stages.find((item) => item.id === stageId) ||
      plan?.stages.find((item) => item.status === "ACTIVE") ||
      null;
    const exitNoticeTitle = "摸摸头，这一轮已记为未通过";
    const exitNoticeMessage = `${
      exitedStage?.stageLabel || "当前轮次"
    }已因主动结束而终止，本次流程已按淘汰收口。建议先查看反馈，把关键问题补强后再继续冲刺。`;
    const exitSnapshot = {
      latestDecision: {
        stageId: stageId || null,
        roundId: roundId || null,
        stageLabel: exitedStage?.stageLabel || "当前轮次",
        decision: "EXITED_FAIL",
        summary: exitNoticeTitle,
        verdictReason: exitNoticeMessage,
        nextAction: "STOP_CURRENT_PROCESS_AND_REVIEW",
        generatedAt: now.toISOString(),
      },
      stageReviews: [
        ...stageReviews.filter((item) => asRecord(item)?.stageId !== stageId),
        {
          stageId: stageId || null,
          roundId: roundId || null,
          stageOrder: exitedStage?.stageOrder || null,
          stageLabel: exitedStage?.stageLabel || "当前轮次",
          stageType: exitedStage?.stageType || null,
          decision: "EXITED_FAIL",
          adjudicationSummary: exitNoticeTitle,
          verdictReason: exitNoticeMessage,
          focusAreas: ["稳定作答", "面试耐受度", "结束前状态管理"],
          actionItems: [
            {
              title: "回看本轮终止原因",
              desc: "先复盘是什么让你在本轮中途结束，再决定下一次面试前如何做准备和节奏管理。",
            },
          ],
          completedAt: now.toISOString(),
          nextAction: "STOP_CURRENT_PROCESS_AND_REVIEW",
        },
      ],
      pendingNextStage: null,
      globalFeedback: [exitNoticeMessage],
      finalStatus: "COMPLETED",
      updatedAt: now.toISOString(),
    };
    const completedPlanSnapshot = buildCompletedPlanClosureSnapshot({
      stageId,
      roundId,
      stageLabel: exitedStage?.stageLabel || "当前轮次",
      stageOrder: exitedStage?.stageOrder || null,
      stageType: exitedStage?.stageType || null,
      terminationReason,
      previousStageReviews: stageReviews,
      previousPlanningSummary: normalizedPlanningSummary,
      nowIso: now.toISOString(),
    });

    const [, updatedSession] = await prisma.$transaction([
      ...((isEliminatedExit || isCompletedExit) && roundId
        ? [
            prisma.interviewRound.updateMany({
              where: {
                id: roundId,
                plan: {
                  userId: sessionAuth.user.id,
                },
              },
              data: {
                status: isEliminatedExit ? "ABORTED" : "DONE",
                endedAt: now,
                roundSummary: isEliminatedExit
                  ? buildTerminationSummary(terminationReason)
                  : terminationReason.trim() || "当前轮次已正常结束。",
              },
            }),
          ]
        : []),
      ...((isEliminatedExit || isCompletedExit) && stageId
        ? [
            prisma.interviewPlanStage.updateMany({
              where: {
                id: stageId,
                plan: {
                  userId: sessionAuth.user.id,
                },
              },
              data: {
                status: isEliminatedExit ? "BLOCKED" : "COMPLETED",
              },
            }),
          ]
        : []),
      ...((isEliminatedExit || isCompletedExit) && planId
        ? [
            prisma.interviewPlanStage.updateMany({
              where: {
                planId,
                stageOrder: {
                  gt: exitedStage?.stageOrder || 0,
                },
                status: {
                  in: ["PENDING", "READY", "ACTIVE"],
                },
              },
              data: {
                status: "SKIPPED",
              },
            }),
            prisma.interviewPlan.updateMany({
              where: {
                id: planId,
                userId: sessionAuth.user.id,
              },
              data: {
                status: "COMPLETED",
                planningSummary: toPrismaJson(
                  isEliminatedExit
                    ? {
                        ...normalizedPlanningSummary,
                        orchestration: exitSnapshot,
                      }
                    : completedPlanSnapshot
                ),
              },
            }),
          ]
        : []),
      ...(isEliminatedExit && planId && roundId
        ? [
            prisma.interviewInsightReport.create({
              data: {
                planId,
                roundId,
                reportType: "PLAN_EXIT_NOTICE",
                summary: exitNoticeTitle,
                highlights: toPrismaJson(["候选人主动结束当前轮次，流程已终止。"]),
                risks: toPrismaJson(["本次流程未完成关键轮次验证，已按淘汰收口。"]),
                actionItems: toPrismaJson([
                  {
                    title: "查看反馈后再重开流程",
                    desc: "优先完成复盘和薄弱点补强，再重新进入下一次全流程面试。",
                  },
                ]),
                radarSnapshot: toPrismaJson({
                  decision: "EXITED_FAIL",
                  reason: terminationReason,
                }),
              },
            }),
            prisma.interviewAgentRun.create({
              data: {
                planId,
                stageId: stageId || null,
                roundId,
                agentRole: AgentRunRole.PLANNER,
                status: AgentRunStatus.COMPLETED,
                modelName: "session/exit-elimination-orchestrator",
                input: toPrismaJson({
                  reason: terminationReason,
                  sessionId: id,
                }),
                output: toPrismaJson(exitSnapshot),
                startedAt: now,
                finishedAt: now,
              },
            }),
          ]
        : []),
      prisma.interviewSession.update({
        where: { id },
        data: {
          status: body.status,
          score: body.score,
          mode: body.mode,
          planId:
            typeof body.planId === "string" && body.planId.trim()
              ? body.planId.trim()
              : existingSession.planId,
          stageId:
            typeof body.stageId === "string" && body.stageId.trim()
              ? body.stageId.trim()
              : existingSession.stageId,
          roundId:
            typeof body.roundId === "string" && body.roundId.trim()
              ? body.roundId.trim()
              : existingSession.roundId,
          sourceLaunchId:
            sourceLaunchId
              ? sourceLaunchId
              : existingSession.sourceLaunchId,
          roomKey:
            roomKey
              ? roomKey
              : existingSession.roomKey,
        },
      }),
    ]);

    if (isEliminatedExit && planId) {
      await createInAppNotification(prisma, {
        userId: sessionAuth.user.id,
        type: "interview_eliminated",
        title: exitNoticeTitle,
        content: exitNoticeMessage,
        actionPath: `/feedback?planId=${planId}`,
        metadata: {
          planId,
          stageId: stageId || null,
          roundId: roundId || null,
          decision: "EXITED_FAIL",
        },
      });
    }

    return NextResponse.json({ data: updatedSession });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionAuth = await getServerSession(authOptions);
    if (!sessionAuth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existingSession = await prisma.interviewSession.findUnique({
      where: { id },
    });

    if (!existingSession || existingSession.userId !== sessionAuth.user.id) {
      return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
    }

    await prisma.interviewSession.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Session deleted successfully" });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
