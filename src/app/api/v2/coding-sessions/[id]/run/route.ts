import { NextResponse } from "next/server";
import { executeCodingSessionAction } from "@/lib/interview-v2/codingSessionService";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";

/**
 * 执行一次算法题“运行”动作，并返回最新静态评估结果。
 * @param request 当前请求对象。
 * @param context 路由参数。
 * @returns 运行后的会话详情与结果。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      code?: string;
      language?: string;
    };

    const data = await executeCodingSessionAction({
      userId: authResult.user.id,
      codingSessionId: id,
      actionType: "RUN",
      code: body.code || "",
      language: body.language || "javascript",
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to run coding session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
