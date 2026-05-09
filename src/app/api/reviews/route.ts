import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get all sessions for this user to find their reports
    const sessions = await prisma.interviewSession.findMany({
      where: { userId },
      include: {
        report: true,
      },
    });

    const reports = sessions
      .map((session) => session.report)
      .filter((report) => report !== null);

    // Get weaknesses for this user
    const weaknesses = await prisma.weakness.findMany({
      where: { userId },
    });

    return NextResponse.json({
      data: {
        reports,
        weaknesses,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
