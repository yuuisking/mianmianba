import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET(req: NextRequest) {
  try {
    const sessionAuth = await getServerSession(authOptions);
    if (!sessionAuth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = sessionAuth.user.id;
    const { searchParams } = new URL(req.url);
    
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "5", 10);
    const search = searchParams.get("search") || "";

    const skip = (page - 1) * limit;

    const whereClause: { userId: string; mode?: { contains: string } } = { userId };
    
    if (search) {
      if ("实时面试".includes(search) || "语音面试".includes(search) || "视频面试".includes(search)) {
        whereClause.mode = { contains: "realtime" };
      } else if ("文字面试".includes(search)) {
        whereClause.mode = { contains: "text" };
      } else if ("专项训练".includes(search)) {
        whereClause.mode = { contains: "targeted" };
      } else {
        whereClause.mode = { contains: search };
      }
    }

    const [total, sessions] = await Promise.all([
      prisma.interviewSession.count({ where: whereClause }),
      prisma.interviewSession.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          report: true,
          _count: {
            select: { messages: true }
          }
        },
      })
    ]);

    return NextResponse.json({ 
      data: sessions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
