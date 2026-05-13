import { NextResponse } from "next/server";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";
import { buildV2HomeDashboardSnapshot } from "@/lib/interview-v2/homeDashboard";

/**
 * 返回 v2.0 首页操作台所需的真实聚合数据。
 * @returns {Promise<Response>} 包含进度、继续训练和薄弱点的接口响应。
 */
export async function GET(): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const data = await buildV2HomeDashboardSnapshot({
      userId: authResult.user.id,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build v2 dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
