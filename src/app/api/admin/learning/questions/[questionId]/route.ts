import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, QuestionStatus, QuestionDifficulty, InterviewFrequency } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkPermission } from "@/lib/permissions";

const prisma = new PrismaClient();

/**
 * GET /api/admin/learning/questions/[questionId]
 * 获取题目详情（管理员）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { questionId } = await params;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        category: { select: { id: true, name: true } },
        knowledgeBase: { select: { id: true, name: true } },
      },
    });

    if (!question) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 });
    }

    return NextResponse.json({
      id: question.id,
      kbId: question.kbId,
      categoryId: question.categoryId,
      title: question.title,
      difficulty: question.difficulty,
      tags: question.tags,
      answerKeyPoints: question.answerKeyPoints,
      answerDetailed: question.answerDetailed,
      answerCodeExample: question.answerCodeExample,
      answerDiagram: question.answerDiagram,
      relatedQuestionIds: question.relatedQuestionIds,
      interviewFrequency: question.interviewFrequency,
      sourceUrl: question.sourceUrl,
      status: question.status,
      category: question.category,
      knowledgeBase: question.knowledgeBase,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
      publishedAt: question.publishedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[GET /api/admin/learning/questions/[questionId]] error:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/learning/questions/[questionId]
 * 更新题目
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { questionId } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.difficulty !== undefined) updateData.difficulty = body.difficulty as QuestionDifficulty;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.answerKeyPoints !== undefined) updateData.answerKeyPoints = body.answerKeyPoints;
    if (body.answerDetailed !== undefined) updateData.answerDetailed = body.answerDetailed.trim();
    if (body.answerCodeExample !== undefined) updateData.answerCodeExample = body.answerCodeExample?.trim() || null;
    if (body.answerDiagram !== undefined) updateData.answerDiagram = body.answerDiagram?.trim() || null;
    if (body.relatedQuestionIds !== undefined) updateData.relatedQuestionIds = body.relatedQuestionIds;
    if (body.interviewFrequency !== undefined) updateData.interviewFrequency = body.interviewFrequency as InterviewFrequency;
    if (body.sourceUrl !== undefined) updateData.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.status !== undefined) {
      updateData.status = body.status as QuestionStatus;
      if (body.status === "published") {
        updateData.publishedAt = new Date();
      }
    }
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;

    const question = await prisma.question.update({
      where: { id: questionId },
      data: updateData,
    });

    return NextResponse.json({
      id: question.id,
      title: question.title,
      status: question.status,
      updatedAt: question.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[PUT /api/admin/learning/questions/[questionId]] error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/learning/questions/[questionId]
 * 删除题目
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { questionId } = await params;

    await prisma.question.delete({
      where: { id: questionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/learning/questions/[questionId]] error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
