import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, QuestionStatus, QuestionDifficulty, InterviewFrequency } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkPermission } from "@/lib/permissions";

const prisma = new PrismaClient();

/**
 * GET /api/admin/learning/questions
 * 获取题目列表（管理员，支持筛选）
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const kbId = searchParams.get("kbId");
    const categoryId = searchParams.get("categoryId");
    const status = searchParams.get("status") as QuestionStatus | null;
    const difficulty = searchParams.get("difficulty") as QuestionDifficulty | null;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

    const where: Record<string, unknown> = {};
    if (kbId) where.kbId = kbId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (difficulty) where.difficulty = difficulty;

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true } },
          knowledgeBase: { select: { id: true, name: true } },
        },
      }),
      prisma.question.count({ where }),
    ]);

    return NextResponse.json({
      questions: questions.map((q) => ({
        id: q.id,
        title: q.title,
        difficulty: q.difficulty,
        tags: q.tags,
        status: q.status,
        interviewFrequency: q.interviewFrequency,
        category: q.category,
        knowledgeBase: q.knowledgeBase,
        createdAt: q.createdAt.toISOString(),
        updatedAt: q.updatedAt.toISOString(),
        publishedAt: q.publishedAt?.toISOString() || null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/learning/questions] error:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

/**
 * POST /api/admin/learning/questions
 * 创建题目
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    const {
      kbId,
      categoryId,
      title,
      difficulty = "medium",
      tags = [],
      answerKeyPoints = [],
      answerDetailed = "",
      answerCodeExample,
      answerDiagram,
      relatedQuestionIds = [],
      interviewFrequency = "medium",
      sourceUrl,
      status = "draft",
    } = body;

    if (!kbId || !categoryId || !title?.trim()) {
      return NextResponse.json({ error: "知识库ID、分类ID和标题不能为空" }, { status: 400 });
    }

    const question = await prisma.question.create({
      data: {
        kbId,
        categoryId,
        title: title.trim(),
        difficulty: difficulty as QuestionDifficulty,
        tags,
        answerKeyPoints,
        answerDetailed: answerDetailed.trim(),
        answerCodeExample: answerCodeExample?.trim() || null,
        answerDiagram: answerDiagram?.trim() || null,
        relatedQuestionIds,
        interviewFrequency: interviewFrequency as InterviewFrequency,
        sourceUrl: sourceUrl?.trim() || null,
        status: status as QuestionStatus,
        publishedAt: status === "published" ? new Date() : null,
      },
    });

    return NextResponse.json({
      id: question.id,
      title: question.title,
      status: question.status,
      createdAt: question.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/admin/learning/questions] error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
