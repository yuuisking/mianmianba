import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";
import { getReviewIssueDetail } from "@/lib/interview-v2/reviewDashboard";

/**
 * 返回复盘中心单个问题的详情、根因树与影响说明。
 * @param {NextRequest} _request 当前请求。
 * @param {{ params: Promise<{ issueId: string }> }} context 动态路由参数。
 * @returns {Promise<Response>} 问题详情响应。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { issueId } = await params;
    const data = await getReviewIssueDetail({
      userId: authResult.user.id,
      issueId,
    });

    if (!data) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch review issue detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
