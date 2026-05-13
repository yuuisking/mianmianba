import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";
import { getReviewIssueEvidences } from "@/lib/interview-v2/reviewDashboard";

/**
 * 返回复盘中心某个问题对应的证据列表。
 * @param {NextRequest} _request 当前请求。
 * @param {{ params: Promise<{ issueId: string }> }} context 动态路由参数。
 * @returns {Promise<Response>} 证据列表响应。
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
    const data = await getReviewIssueEvidences({
      userId: authResult.user.id,
      issueId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch review issue evidences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
