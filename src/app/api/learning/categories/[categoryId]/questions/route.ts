import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getFallbackCategoryQuestions,
  normalizeQuestionDifficulty,
} from "@/lib/learning/questionBankFallback";

/**
 * 构造分类题目列表接口的稳定返回体。
 * @param {object} input 列表数据与分页数据。
 * @returns {{ questions: typeof input.questions; pagination: typeof input.pagination }} 与前台约定一致的返回对象。
 */
function buildQuestionsResponse(input: {
  questions: Array<{
    id: string;
    title: string;
    difficulty: "easy" | "medium" | "hard";
    tags: string[];
    interviewFrequency: "high" | "medium" | "low";
    createdAt: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}): {
  questions: Array<{
    id: string;
    title: string;
    difficulty: "easy" | "medium" | "hard";
    tags: string[];
    interviewFrequency: "high" | "medium" | "low";
    createdAt: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
} {
  return input;
}

/**
 * GET /api/learning/categories/[categoryId]/questions
 * 获取分类下的题目列表（支持分页、难度筛选）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
): Promise<NextResponse> {
  const { categoryId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
  const difficulty = normalizeQuestionDifficulty(searchParams.get("difficulty"));
  const kbId = searchParams.get("kbId");

  try {
    const where = {
      categoryId,
      status: "published" as const,
      ...(kbId ? { kbId } : {}),
      ...(difficulty ? { difficulty } : {}),
    };

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          difficulty: true,
          tags: true,
          interviewFrequency: true,
          createdAt: true,
        },
      }),
      prisma.question.count({ where }),
    ]);

    if (total > 0) {
      return NextResponse.json(
        buildQuestionsResponse({
          questions: questions.map((q) => ({
            ...q,
            createdAt: q.createdAt.toISOString(),
          })),
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        })
      );
    }

    const fallbackResult = getFallbackCategoryQuestions({
      categoryId,
      kbId,
      page,
      pageSize,
      difficulty,
    });

    if (fallbackResult) {
      return NextResponse.json(buildQuestionsResponse(fallbackResult));
    }

    return NextResponse.json(
      buildQuestionsResponse({
        questions: questions.map((q) => ({
        ...q,
        createdAt: q.createdAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    );
  } catch (error) {
    console.error("[GET /api/learning/categories/[categoryId]/questions] error:", error);
    const fallbackResult = getFallbackCategoryQuestions({
      categoryId,
      kbId,
      page,
      pageSize,
      difficulty,
    });
    if (fallbackResult) {
      return NextResponse.json(buildQuestionsResponse(fallbackResult));
    }

    return NextResponse.json({ error: "获取题目列表失败" }, { status: 500 });
  }
}
