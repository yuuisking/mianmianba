import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkPermission } from "@/lib/permissions";
import { seedLearningCenterV2 } from "@/lib/learning/v2Seeder";

/**
 * POST /api/admin/learning/generate
 * AI 生成题目
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !checkPermission(session.user.role, "admin")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    return NextResponse.json({
      success: true,
      generated: true,
      result: await seedLearningCenterV2({
        resetExisting: body?.resetExisting !== false,
      }),
    });
  } catch (error) {
    console.error("[POST /api/admin/learning/generate] error:", error);
    return NextResponse.json({ error: "生成失败" }, { status: 500 });
  }
}
