import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * GET /api/admin/learning/ai-tasks
 * 返回学习中心 AI 任务列表。
 * @param {NextRequest} request 请求对象。
 * @returns {Promise<NextResponse>} AI 任务响应。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const targetId = request.nextUrl.searchParams.get("targetId");
    const tasks = await prisma.aiTask.findMany({
      where: targetId ? { targetId } : undefined,
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        taskType: true,
        status: true,
        targetType: true,
        targetId: true,
        errorMessage: true,
        retryCount: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      tasks: tasks.map((item) => ({
        id: item.id,
        taskType: item.taskType,
        status: item.status,
        targetType: item.targetType,
        targetId: item.targetId,
        errorMessage: item.errorMessage,
        retryCount: item.retryCount,
        createdAt: item.createdAt.toISOString(),
        startedAt: item.startedAt?.toISOString() ?? null,
        finishedAt: item.finishedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "获取 AI 任务失败。",
      },
      { status: 500 }
    );
  }
}
