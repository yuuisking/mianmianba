import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";

type CreateInterviewTemplateBody = {
  name?: string;
  flowMode?: string | null;
  resumeText?: string | null;
  companyName?: string | null;
  roleName?: string | null;
  targetLevel?: string | null;
  focusKeyword?: string | null;
  interviewIntensity?: string | null;
  mode?: string | null;
  limitType?: string | null;
  questionLimit?: number | null;
  durationLimitMinutes?: number | null;
  interviewerName?: string | null;
  interviewerStyle?: string | null;
  portraitUrl?: string | null;
};

/**
 * 读取当前登录用户的私有面试模板列表，并按发起模式隔离阶段/全流程模板。
 * @param {Request} request 当前请求对象。
 * @returns {Promise<Response>} 模板列表响应。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const flowMode = searchParams.get("flowMode")?.trim() || "stage";
    const data = await prisma.userInterviewTemplate.findMany({
      where: {
        userId: authResult.user.id,
        flowMode,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch interview templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 保存当前配置为用户私有模板，供后续在发起面试页直接复用。
 * @param {Request} request 当前请求对象。
 * @returns {Promise<Response>} 保存结果响应。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await request.json()) as CreateInterviewTemplateBody;
    const rawName = body.name?.trim() || "";
    const rawFlowMode = body.flowMode?.trim() || "stage";
    if (!rawName) {
      return NextResponse.json({ error: "模板名称不能为空。" }, { status: 400 });
    }

    const duplicate = await prisma.userInterviewTemplate.findFirst({
      where: {
        userId: authResult.user.id,
        name: rawName,
        flowMode: rawFlowMode,
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return NextResponse.json({ error: "模板名称已存在，请更换一个名称后再保存。" }, { status: 409 });
    }

    const data = await prisma.userInterviewTemplate.create({
      data: {
        userId: authResult.user.id,
        name: rawName,
        flowMode: rawFlowMode,
        resumeText: body.resumeText?.trim() || null,
        companyName: body.companyName?.trim() || null,
        roleName: body.roleName?.trim() || null,
        targetLevel: body.targetLevel?.trim() || null,
        focusKeyword: body.focusKeyword?.trim() || null,
        interviewIntensity: body.interviewIntensity?.trim() || null,
        mode: body.mode?.trim() || null,
        limitType: body.limitType?.trim() || null,
        questionLimit:
          typeof body.questionLimit === "number" && Number.isFinite(body.questionLimit)
            ? body.questionLimit
            : null,
        durationLimitMinutes:
          typeof body.durationLimitMinutes === "number" &&
          Number.isFinite(body.durationLimitMinutes)
            ? body.durationLimitMinutes
            : null,
        interviewerName: body.interviewerName?.trim() || null,
        interviewerStyle: body.interviewerStyle?.trim() || null,
        portraitUrl: body.portraitUrl?.trim() || null,
      },
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save interview template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
