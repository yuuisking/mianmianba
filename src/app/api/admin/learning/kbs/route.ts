import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkPermission } from "@/lib/permissions";

/**
 * GET /api/admin/learning/kbs
 * 获取所有知识库（管理员）
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const kbs = await prisma.topicBank.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        chapters: true,
        documents: true,
        category: true,
      },
    });

    return NextResponse.json(
      kbs.map((kb) => ({
        id: kb.id,
        name: kb.name,
        subtitle: kb.targetRole,
        description: kb.description,
        tags: [kb.targetRole, kb.difficulty].filter(Boolean),
        visibility: kb.status,
        categoryName: kb.category.name,
        createdAt: kb.createdAt.toISOString(),
        updatedAt: kb.updatedAt.toISOString(),
        stats: {
          categories: kb.chapters.length,
          questions: kb.documents.length,
        },
      }))
    );
  } catch (error) {
    console.error("[GET /api/admin/learning/kbs] error:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

/**
 * POST /api/admin/learning/kbs
 * 创建知识库
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    const { name, subtitle, description, categoryId, difficulty = "intermediate" } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
    }

    if (!categoryId?.trim()) {
      return NextResponse.json({ error: "分类不能为空" }, { status: 400 });
    }

    const kb = await prisma.topicBank.create({
      data: {
        name: name.trim(),
        slug: `${name.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        description: description?.trim() || null,
        categoryId: categoryId.trim(),
        targetRole: subtitle?.trim() || null,
        difficulty,
      },
    });

    return NextResponse.json({
      id: kb.id,
      name: kb.name,
      subtitle: kb.targetRole,
      description: kb.description,
      visibility: kb.status,
      createdAt: kb.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/admin/learning/kbs] error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
