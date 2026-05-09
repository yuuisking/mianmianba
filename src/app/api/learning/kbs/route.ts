import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/learning/kbs
 * 获取所有公开学习题库列表。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const kbs = await prisma.topicBank.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
      include: {
        category: true,
        chapters: true,
        documents: {
          where: { status: "PUBLISHED" },
        },
      },
    });

    const result = kbs.map((kb) => ({
      id: kb.id,
      name: kb.name,
      subtitle: kb.targetRole,
      tags: [kb.category.name, kb.difficulty].filter(Boolean),
      updatedAt: kb.updatedAt.toISOString(),
      stats: {
        categories: kb.chapters.length,
        questions: kb.documents.length,
      },
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/learning/kbs] error:", error);
    return NextResponse.json({ error: "获取知识库列表失败" }, { status: 500 });
  }
}
