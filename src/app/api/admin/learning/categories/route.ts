import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkPermission } from "@/lib/permissions";

const prisma = new PrismaClient();

/**
 * POST /api/admin/learning/categories
 * 创建分类
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    const { kbId, name, description, sortOrder = 0 } = body;

    if (!kbId || !name?.trim()) {
      return NextResponse.json({ error: "知识库ID和名称不能为空" }, { status: 400 });
    }

    const category = await prisma.category.create({
      data: {
        kbId,
        name: name.trim(),
        description: description?.trim() || null,
        sortOrder,
      },
    });

    return NextResponse.json({
      id: category.id,
      kbId: category.kbId,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      createdAt: category.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/admin/learning/categories] error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
