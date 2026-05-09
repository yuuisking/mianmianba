import { NextRequest, NextResponse } from "next/server";
import { seedLearningCenterV2 } from "@/lib/learning/v2Seeder";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * POST /api/admin/learning/generate-kb
 * 兼容旧入口，统一触发学习中心 V2 标杆文档导入。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = await request.json().catch(() => ({}));
    const result = await seedLearningCenterV2({
      resetExisting: body?.resetExisting !== false,
    });

    return NextResponse.json({
      success: true,
      mode: "learning-center-v2",
      message: "旧 generate-kb 入口已切换为学习中心 V2 标杆文档导入。",
      result,
    });
  } catch (error) {
    console.error("[POST /api/admin/learning/generate-kb] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 500 }
    );
  }
}
