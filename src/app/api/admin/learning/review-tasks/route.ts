import { NextRequest, NextResponse } from "next/server";
import {
  approveLearningReviewTask,
  listLearningReviewTasks,
  rejectLearningReviewTask,
} from "@/lib/learning/reviewService";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * GET /api/admin/learning/review-tasks
 * 返回学习中心审核任务列表。
 * @param {NextRequest} request 请求对象。
 * @returns {Promise<NextResponse>} 审核任务响应。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const tasks = await listLearningReviewTasks({ status });
    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "获取审核任务失败。",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/learning/review-tasks
 * 处理学习中心审核任务。
 * @param {NextRequest} request 请求对象。
 * @returns {Promise<NextResponse>} 审核处理结果。
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = await request.json();
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    const comment = typeof body?.comment === "string" ? body.comment : undefined;

    if (!taskId || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "缺少有效的任务参数。" }, { status: 400 });
    }

    const result =
      action === "approve"
        ? await approveLearningReviewTask({
            taskId,
            reviewerId: authResult.user.id,
            comment,
          })
        : await rejectLearningReviewTask({
            taskId,
            reviewerId: authResult.user.id,
            comment: comment?.trim() || "未通过审核",
          });

    return NextResponse.json({
      success: true,
      task: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "处理审核任务失败。",
      },
      { status: 500 }
    );
  }
}
