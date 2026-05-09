import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { learningDb } from "@/lib/db/learningDb";
import { learningStudio } from "@/lib/db/learningStudio";
import { getAdminBankStudioSummary } from "@/lib/learning/bankStudio";
import { clearLegacyLearningContent, seedLearningCenterV2 } from "@/lib/learning/v2Seeder";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

type GeneratePayload = {
  resetExisting?: boolean;
};

/**
 * Returns the redesigned admin learning dashboard summary.
 * @returns {Promise<Response>} JSON response containing banks and generation runs.
 */
export async function GET(): Promise<Response> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const [
      summary,
      documentCount,
      publishedDocumentCount,
      reviewTaskCount,
      pendingReviewTaskCount,
      aiTaskCount,
      recentDocuments,
      recentReviewTasks,
      recentAiTasks,
    ] = await Promise.all([
      getAdminBankStudioSummary(),
      prisma.document.count(),
      prisma.document.count({ where: { status: "PUBLISHED" } }),
      prisma.reviewTask.count(),
      prisma.reviewTask.count({ where: { status: "PENDING" } }),
      prisma.aiTask.count(),
      prisma.document.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 6,
        select: {
          id: true,
          title: true,
          status: true,
          difficulty: true,
          updatedAt: true,
          qualityScore: true,
          chapter: {
            select: {
              id: true,
              name: true,
            },
          },
          topicBank: {
            select: {
              id: true,
              name: true,
            },
          },
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.reviewTask.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 6,
        include: {
          document: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      prisma.aiTask.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 6,
        select: {
          id: true,
          taskType: true,
          status: true,
          targetType: true,
          targetId: true,
          createdAt: true,
          finishedAt: true,
          errorMessage: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      summary: {
        bankCount: summary.banks.length,
        documentCount,
        publishedDocumentCount,
        reviewTaskCount,
        pendingReviewTaskCount,
        aiTaskCount,
      },
      banks: summary.banks,
      recentDocuments: recentDocuments.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        difficulty: item.difficulty,
        qualityScore: item.qualityScore,
        bankId: item.topicBank.id,
        bankName: item.topicBank.name,
        chapterId: item.chapter?.id ?? null,
        chapterName: item.chapter?.name ?? "未分章",
        latestVersion: item.versions[0]?.version ?? 0,
        updatedAt: item.updatedAt.toISOString(),
      })),
      recentReviewTasks: recentReviewTasks.map((item) => ({
        id: item.id,
        documentId: item.documentId,
        documentTitle: item.document.title,
        reviewType: item.reviewType,
        status: item.status,
        reviewerId: item.reviewerId,
        comment: item.comment,
        updatedAt: item.updatedAt.toISOString(),
      })),
      recentAiTasks: recentAiTasks.map((item) => ({
        id: item.id,
        taskType: item.taskType,
        status: item.status,
        targetType: item.targetType,
        targetId: item.targetId,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt.toISOString(),
        finishedAt: item.finishedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "获取学习中心后台数据失败。",
      },
      { status: 500 }
    );
  }
}

/**
 * Starts one new multi-agent bank generation run and publishes the resulting bank into the file store.
 * @param {Request} req Incoming request.
 * @returns {Promise<Response>} JSON response containing the latest run and generated bank.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const payload = (await req.json().catch(() => ({}))) as GeneratePayload;
    const result = await seedLearningCenterV2({
      resetExisting: payload.resetExisting !== false,
    });

    return NextResponse.json({
      success: true,
      message: "学习中心 V2 标杆文档已导入 Prisma。",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "多 Agent 生成题库失败。",
      },
      { status: 500 }
    );
  }
}

/**
 * Resets the full learning-center file store and all studio run state.
 * @returns {Promise<Response>} JSON response confirming the reset action.
 */
export async function DELETE(): Promise<Response> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    await clearLegacyLearningContent();
    learningDb.resetAll();
    learningStudio.resetAll();

    return NextResponse.json({
      success: true,
      message: "学习中心 Prisma 学习数据和旧文件历史数据已清空。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "清空旧学习数据失败。",
      },
      { status: 500 }
    );
  }
}
