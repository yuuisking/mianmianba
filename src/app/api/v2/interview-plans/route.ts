import { NextResponse } from "next/server";
import type { CreateInterviewPlanInput } from "@/lib/interview-v2/planService";
import {
  createInterviewPlanWithRuntime,
  getInterviewRuntimeProfile,
  listInterviewPlans,
} from "@/lib/interview-v2/planService";
import { InterviewPlanMode } from "@prisma/client";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";

/**
 * 创建 v2 面试计划，并同步落库轮次、首轮执行记录和多 Agent 运行种子。
 * @param {Request} request 当前请求对象。
 * @returns {Promise<Response>} 创建结果响应。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await request.json()) as Omit<CreateInterviewPlanInput, "userId">;
    const data = await createInterviewPlanWithRuntime({
      ...body,
      userId: authResult.user.id,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create v2 interview plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 获取当前用户的真实面试计划列表，供全流程首页展示预约历史。
 * @param {Request} request 当前请求对象。
 * @returns {Promise<Response>} 面试计划列表响应。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId")?.trim() || "";
    const stageId = searchParams.get("stageId")?.trim() || "";
    const roundId = searchParams.get("roundId")?.trim() || "";
    if (planId) {
      const data = await getInterviewRuntimeProfile({
        userId: authResult.user.id,
        planId,
        stageId: stageId || null,
        roundId: roundId || null,
      });

      if (!data) {
        return NextResponse.json({ error: "Interview plan not found" }, { status: 404 });
      }

      return NextResponse.json({ data });
    }

    const mode = searchParams.get("mode");
    const data = await listInterviewPlans({
      userId: authResult.user.id,
      mode:
        mode === "FULL_FLOW"
          ? InterviewPlanMode.FULL_FLOW
          : mode === "STAGE"
            ? InterviewPlanMode.STAGE
            : undefined,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch v2 interview plans";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
