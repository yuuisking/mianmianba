import { NextResponse } from "next/server";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";
import { getReviewProgressSnapshot } from "@/lib/interview-v2/reviewDashboard";

/**
 * 返回最近一次复盘快照中的改善概览。
 * @returns {Promise<Response>} 改善数据响应。
 */
export async function GET(): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const data = await getReviewProgressSnapshot({
      userId: authResult.user.id,
    });

    if (!data) {
      return NextResponse.json({ error: "Progress snapshot not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch review progress snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
