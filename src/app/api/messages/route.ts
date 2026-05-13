import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * 统一提取接口异常信息。
 * @param {unknown} error 捕获到的异常对象。
 * @returns {string} 可安全输出的错误文本。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const planId = searchParams.get("planId")?.trim() || "";
    const stageId = searchParams.get("stageId")?.trim() || "";
    const roundId = searchParams.get("roundId")?.trim() || "";
    const mode = searchParams.get("mode")?.trim() || "";

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Verify session belongs to user
    const interviewSession = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
    });

    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
    }
    if (
      (planId && (interviewSession.planId || "") !== planId) ||
      (stageId && (interviewSession.stageId || "") !== stageId) ||
      (roundId && (interviewSession.roundId || "") !== roundId) ||
      (mode && (interviewSession.mode || "") !== mode)
    ) {
      return NextResponse.json({ error: "Session room identity mismatch" }, { status: 409 });
    }

    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ data: messages });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, role, content, planId, stageId, roundId, mode, roomKey } = body;

    if (!sessionId || !role || !content) {
      return NextResponse.json({ error: "sessionId, role, and content are required" }, { status: 400 });
    }

    // Verify session belongs to user
    const interviewSession = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
    });

    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
    }
    if (
      (typeof planId === "string" && planId.trim() && (interviewSession.planId || "") !== planId.trim()) ||
      (typeof stageId === "string" && stageId.trim() && (interviewSession.stageId || "") !== stageId.trim()) ||
      (typeof roundId === "string" && roundId.trim() && (interviewSession.roundId || "") !== roundId.trim()) ||
      (typeof mode === "string" && mode.trim() && (interviewSession.mode || "") !== mode.trim()) ||
      (typeof roomKey === "string" && roomKey.trim() && (interviewSession.roomKey || "") !== roomKey.trim())
    ) {
      return NextResponse.json({ error: "Session room identity mismatch" }, { status: 409 });
    }

    const message = await prisma.message.create({
      data: {
        sessionId,
        role,
        content,
      },
    });

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
