import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getBankDetail } from "@/lib/learning/bankStudio";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ kbId: string }>;
};

/**
 * Returns one admin-facing learning bank payload including chapters, documents, review tasks and latest AI tasks.
 * @param {Request} _req Incoming request.
 * @param {RouteContext} context Route params context.
 * @returns {Promise<Response>} JSON response containing one bank dashboard payload.
 */
export async function GET(_req: Request, context: RouteContext): Promise<Response> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { kbId } = await context.params;
    const detail = await getBankDetail(kbId);
    if (!detail.bank) {
      return NextResponse.json({ success: false, error: "题库不存在。" }, { status: 404 });
    }

    const documents = await prisma.document.findMany({
      where: { topicBankId: kbId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        summary: true,
        difficulty: true,
        frequency: true,
        status: true,
        qualityScore: true,
        updatedAt: true,
        chapter: {
          select: {
            id: true,
            name: true,
          },
        },
        tags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        versions: {
          orderBy: [{ version: "desc" }],
          select: {
            id: true,
            version: true,
            createdAt: true,
            createdByType: true,
          },
        },
        reviewTasks: {
          orderBy: [{ updatedAt: "desc" }],
          take: 1,
          select: {
            id: true,
            reviewType: true,
            status: true,
            updatedAt: true,
            comment: true,
          },
        },
        sourceMaterials: {
          select: {
            id: true,
          },
        },
      },
    });
    const documentIds = documents.map((item) => item.id);

    const [reviewTasks, aiTasks] = await Promise.all([
      prisma.reviewTask.findMany({
        where: {
          document: {
            topicBankId: kbId,
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 8,
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
        where: {
          targetType: "document",
          targetId: {
            in: documentIds.length > 0 ? documentIds : ["__never__"],
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          taskType: true,
          status: true,
          targetId: true,
          createdAt: true,
          finishedAt: true,
          errorMessage: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      bank: detail.bank,
      categories: detail.tree.map((item) => ({
        id: item.id,
        name: item.title,
        description: item.description,
        questionCount: item.questions.length,
        featuredQuestionTitles: item.questions.slice(0, 3).map((question) => question.title),
      })),
      documents: documents.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        difficulty: item.difficulty,
        interviewFrequency: item.frequency,
        status: item.status,
        qualityScore: item.qualityScore,
        tags: item.tags.map((tag) => tag.tag.name),
        categoryId: item.chapter?.id ?? "uncategorized",
        categoryName: item.chapter?.name ?? "未分组",
        versionCount: item.versions.length,
        latestVersion: item.versions[0]?.version ?? 0,
        latestVersionAt: item.versions[0]?.createdAt.toISOString() ?? null,
        latestVersionSource: item.versions[0]?.createdByType ?? null,
        latestReview: item.reviewTasks[0]
          ? {
              id: item.reviewTasks[0].id,
              reviewType: item.reviewTasks[0].reviewType,
              status: item.reviewTasks[0].status,
              comment: item.reviewTasks[0].comment,
              updatedAt: item.reviewTasks[0].updatedAt.toISOString(),
            }
          : null,
        sourceCount: item.sourceMaterials.length,
        updatedAt: item.updatedAt.toISOString(),
      })),
      reviewTasks: reviewTasks.map((item) => ({
        id: item.id,
        documentId: item.documentId,
        documentTitle: item.document.title,
        reviewType: item.reviewType,
        status: item.status,
        reviewerId: item.reviewerId,
        comment: item.comment,
        updatedAt: item.updatedAt.toISOString(),
      })),
      aiTasks: aiTasks.map((item) => ({
        id: item.id,
        taskType: item.taskType,
        status: item.status,
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
        error: error instanceof Error ? error.message : "获取题库工坊详情失败。",
      },
      { status: 500 }
    );
  }
}

/**
 * Deletes one generated bank and its bound studio runs from the file-first store.
 * @param {Request} _req Incoming request.
 * @param {RouteContext} context Route params context.
 * @returns {Promise<Response>} JSON response confirming the deletion result.
 */
export async function DELETE(_req: Request, context: RouteContext): Promise<Response> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { kbId } = await context.params;
    const deletedBank = await prisma.topicBank.deleteMany({ where: { id: kbId } });
    if (deletedBank.count === 0) {
      return NextResponse.json({ success: false, error: "题库不存在。" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "题库已删除。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "删除题库失败。",
      },
      { status: 500 }
    );
  }
}
