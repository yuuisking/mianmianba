import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * PUT /api/admin/learning/kbs/[kbId]
 * 更新知识库
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { kbId } = await params;
    const body = await request.json();
    const { name, subtitle, description, visibility, difficulty } = body;

    const status =
      visibility === "PUBLISHED" || visibility === "DRAFT" || visibility === "ARCHIVED" ? visibility : undefined;

    const kb = await prisma.topicBank.update({
      where: { id: kbId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(subtitle !== undefined ? { targetRole: subtitle?.trim() || null } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(difficulty !== undefined ? { difficulty } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json({
      id: kb.id,
      name: kb.name,
      subtitle: kb.targetRole,
      description: kb.description,
      visibility: kb.status,
      categoryName: kb.category.name,
      updatedAt: kb.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[PUT /api/admin/learning/kbs/[kbId]] error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/learning/kbs/[kbId]
 * 删除知识库
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { kbId } = await params;

    const result = await prisma.topicBank.deleteMany({ where: { id: kbId } });
    if (result.count === 0) {
      return NextResponse.json({ error: "题库不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/learning/kbs/[kbId]] error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
