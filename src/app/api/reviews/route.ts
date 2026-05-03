import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET(req: NextRequest) {
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
      .map(session => session.report)
      .filter(report => report !== null);

    // Get weaknesses for this user
    const weaknesses = await prisma.weakness.findMany({
      where: { userId },
    });

    return NextResponse.json({
      data: {
        reports,
        weaknesses,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
