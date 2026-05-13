import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";
import { buildV2ReviewDashboardSnapshot } from "@/lib/interview-v2/reviewDashboard";

/**
 * 返回 v2.0 复盘中心首页所需的真实聚合数据。
 * @param {NextRequest} request 当前请求。
 * @returns {Promise<Response>} 包含结构化复盘 snapshot 的响应。
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const searchParams = request.nextUrl.searchParams;
    const data = await buildV2ReviewDashboardSnapshot({
      userId: authResult.user.id,
      filters: {
        timeRange:
          (searchParams.get("timeRange") as "7d" | "14d" | "30d" | "all" | null) ?? undefined,
        interviewType:
          (searchParams.get("interviewType") as
            | "mock"
            | "targeted"
            | "learning"
            | "all"
            | null) ?? undefined,
        role: searchParams.get("role"),
        company: searchParams.get("company"),
        dimension: searchParams.get("dimension"),
        sampleStatus:
          (searchParams.get("sampleStatus") as "valid" | "invalid" | "all" | null) ??
          undefined,
      },
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build v2 review dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
