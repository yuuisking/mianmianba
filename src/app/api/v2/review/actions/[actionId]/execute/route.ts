import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";
import { executeReviewAction } from "@/lib/interview-v2/reviewDashboard";

/**
 * 执行复盘动作，并返回带完整上下文的训练入口。
 * @param {NextRequest} _request 当前请求。
 * @param {{ params: Promise<{ actionId: string }> }} context 动态路由参数。
 * @returns {Promise<Response>} 动作执行结果。
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { actionId } = await params;
    const data = await executeReviewAction({
      userId: authResult.user.id,
      actionId,
    });

    if (!data) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to execute review action";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
