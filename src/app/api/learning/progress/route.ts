import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOptionalServerSession } from "@/lib/auth/getOptionalServerSession";

/**
 * GET /api/learning/progress
 * 获取当前用户的学习进度统计。
 * @param {NextRequest} _request 当前请求对象。
 * @returns {Promise<NextResponse>} 进度概览与分类统计响应。
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getOptionalServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userId = session.user.id;
    const [progressRecords, chapters, totalPublishedDocuments, bookmarks] = await Promise.all([
      prisma.learningProgress.findMany({
        where: { userId },
        select: {
          documentId: true,
          status: true,
          score: true,
          document: {
            select: {
              chapterId: true,
            },
          },
        },
      }),
      prisma.chapter.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          documents: {
            where: { status: "PUBLISHED" },
            select: { id: true },
          },
        },
      }),
      prisma.document.count({
        where: { status: "PUBLISHED" },
      }),
      prisma.favorite.findMany({
        where: { userId },
        include: {
          document: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              chapter: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
    ]);

    const viewedStatuses = new Set(["IN_PROGRESS", "COMPLETED"]);
    const totalViewed = progressRecords.filter((item) => viewedStatuses.has(item.status)).length;
    const totalAttempted = progressRecords.filter((item) => item.score !== null).length;
    const totalMastered = progressRecords.filter((item) => item.status === "COMPLETED").length;
    const totalBookmarked = bookmarks.length;

    const progressByChapter = new Map<string, { viewed: number; mastered: number }>();
    for (const item of progressRecords) {
      const chapterId = item.document.chapterId;
      if (!chapterId) {
        continue;
      }
      const current = progressByChapter.get(chapterId) ?? { viewed: 0, mastered: 0 };
      if (viewedStatuses.has(item.status)) {
        current.viewed += 1;
      }
      if (item.status === "COMPLETED") {
        current.mastered += 1;
      }
      progressByChapter.set(chapterId, current);
    }

    return NextResponse.json({
      overview: {
        totalViewed,
        totalAttempted,
        totalMastered,
        totalBookmarked,
        totalPublishedQuestions: totalPublishedDocuments,
        masteryRate:
          totalPublishedDocuments > 0 ? Math.round((totalMastered / totalPublishedDocuments) * 100) : 0,
      },
      categoryProgress: chapters.map((chapter) => {
        const stats = progressByChapter.get(chapter.id) ?? { viewed: 0, mastered: 0 };
        const totalQuestions = chapter.documents.length;
        return {
          categoryId: chapter.id,
          categoryName: chapter.name,
          totalQuestions,
          masteredCount: stats.mastered,
          viewedCount: stats.viewed,
          masteryRate: totalQuestions > 0 ? Math.round((stats.mastered / totalQuestions) * 100) : 0,
        };
      }),
      bookmarks: bookmarks.map((item) => ({
        questionId: item.document.id,
        title: item.document.title,
        difficulty: item.document.difficulty,
        categoryName: item.document.chapter?.name ?? "未分章",
      })),
    });
  } catch (error) {
    console.error("[GET /api/learning/progress] error:", error);
    return NextResponse.json({ error: "获取进度失败" }, { status: 500 });
  }
}

/**
 * POST /api/learning/progress
 * 记录用户的文档学习进度与收藏状态。
 * @param {NextRequest} request 当前请求对象。
 * @returns {Promise<NextResponse>} 进度写入结果。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getOptionalServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const {
      questionId,
      viewed,
      attempted,
      correct,
      mastered,
      bookmarked,
    }: {
      questionId: string;
      viewed?: boolean;
      attempted?: boolean;
      correct?: boolean;
      mastered?: boolean;
      bookmarked?: boolean;
    } = body;

    if (!questionId) {
      return NextResponse.json({ error: "缺少题目ID" }, { status: 400 });
    }

    const existingDocument = await prisma.document.findUnique({
      where: { id: questionId },
      select: { id: true },
    });
    if (!existingDocument) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    const existingProgress = await prisma.learningProgress.findUnique({
      where: {
        userId_documentId: {
          userId,
          documentId: questionId,
        },
      },
      select: {
        status: true,
        score: true,
      },
    });

    let nextStatus = existingProgress?.status ?? "NOT_STARTED";
    if (mastered === true) {
      nextStatus = "COMPLETED";
    } else if (viewed || attempted) {
      nextStatus = nextStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
    } else if (mastered === false && nextStatus === "COMPLETED") {
      nextStatus = "IN_PROGRESS";
    }

    const nextScore =
      typeof correct === "boolean" ? (correct ? 100 : 0) : existingProgress?.score ?? null;

    const progress = await prisma.learningProgress.upsert({
      where: {
        userId_documentId: {
          userId,
          documentId: questionId,
        },
      },
      update: {
        status: nextStatus,
        score: nextScore,
      },
      create: {
        userId,
        documentId: questionId,
        status: nextStatus,
        score: nextScore,
      },
    });

    if (typeof bookmarked === "boolean") {
      if (bookmarked) {
        await prisma.favorite.upsert({
          where: {
            userId_documentId: {
              userId,
              documentId: questionId,
            },
          },
          update: {},
          create: {
            userId,
            documentId: questionId,
          },
        });
      } else {
        await prisma.favorite.deleteMany({
          where: {
            userId,
            documentId: questionId,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      progress: {
        questionId: progress.documentId,
        viewed: progress.status !== "NOT_STARTED",
        attempted: progress.score !== null,
        correct: progress.score === null ? null : progress.score >= 60,
        mastered: progress.status === "COMPLETED",
        bookmarked: bookmarked ?? false,
        attemptCount: progress.score === null ? 0 : 1,
      },
    });
  } catch (error) {
    console.error("[POST /api/learning/progress] error:", error);
    return NextResponse.json({ error: "记录进度失败" }, { status: 500 });
  }
}
