import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/learning/kbs/[kbId]/categories
 * 获取学习题库下的所有章节。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
): Promise<NextResponse> {
  try {
    const { kbId } = await params;

    const categories = await prisma.chapter.findMany({
      where: { topicBankId: kbId },
      orderBy: { sortOrder: "asc" },
      include: {
        documents: {
          where: { status: "PUBLISHED" },
        },
      },
    });

    const result = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      questionCount: cat.documents.length,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/learning/kbs/[kbId]/categories] error:", error);
    return NextResponse.json({ error: "获取分类列表失败" }, { status: 500 });
  }
}
