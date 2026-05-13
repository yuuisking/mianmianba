import { NextResponse } from "next/server";
import { processInterviewPlanLifecycle } from "@/lib/interview-v2/lifecycle";

/**
 * 读取 unknown 异常对象中的错误信息。
 * @param error 任意异常对象。
 * @returns 可展示的错误描述。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * 周期性处理面试计划生命周期，包括到期未参面的自动淘汰。
 * @param req 当前请求对象。
 * @returns 任务执行结果。
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await processInterviewPlanLifecycle();
    return NextResponse.json({
      message: "Interview lifecycle cron finished",
      ...result,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
