import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureCodingSession, getCodingSessionDetail } from "@/lib/interview-v2/codingSessionService";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";

/**
 * 获取当前轮次下的算法题会话，或按 roundId 检索已有会话。
 * @param request 当前请求对象。
 * @returns 算法题会话详情或错误响应。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const codingSessionId = searchParams.get("codingSessionId")?.trim() || "";
    const roundId = searchParams.get("roundId")?.trim() || "";
    if (roundId) {
      const data = await prisma.codingSession.findFirst({
        where: {
          roundId,
          userId: authResult.user.id,
        },
        include: {
          question: true,
          submissions: {
            orderBy: {
              createdAt: "desc",
            },
            take: 10,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      if (!data) {
        return NextResponse.json({ error: "Coding session not found" }, { status: 404 });
      }
      return NextResponse.json({ data });
    }
    if (!codingSessionId) {
      return NextResponse.json(
        { error: "codingSessionId or roundId is required" },
        { status: 400 }
      );
    }

    const data = await getCodingSessionDetail(authResult.user.id, codingSessionId);
    if (!data) {
      return NextResponse.json({ error: "Coding session not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch coding session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 为当前轮次创建或复用算法题会话。
 * @param request 当前请求对象。
 * @returns 新建或已存在的算法题会话。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await request.json()) as {
      roundId?: string;
      stageId?: string | null;
      role?: string | null;
      companyName?: string | null;
      projectName?: string | null;
    };

    if (!body.roundId?.trim()) {
      return NextResponse.json({ error: "roundId is required" }, { status: 400 });
    }

    const data = await ensureCodingSession({
      userId: authResult.user.id,
      roundId: body.roundId.trim(),
      stageId: body.stageId?.trim() || null,
      role: body.role?.trim() || null,
      companyName: body.companyName?.trim() || null,
      projectName: body.projectName?.trim() || null,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create coding session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
