import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const isAdmin =
      session?.user?.email?.toLowerCase().includes("admin") ||
      session?.user?.name?.toLowerCase().includes("admin");

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      kbId?: unknown;
      domain?: unknown;
      subjectId?: unknown;
      subject?: unknown;
      subjectTitle?: unknown;
      title?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : typeof body.domain === "string" ? body.domain.trim() : "";
    const subjectId =
      typeof body.subjectId === "string" ? body.subjectId.trim() : typeof body.subject === "string" ? body.subject.trim() : "";
    const subjectTitle =
      typeof body.subjectTitle === "string"
        ? body.subjectTitle.trim()
        : typeof body.title === "string"
          ? body.title.trim()
          : undefined;

    if (!kbId || !subjectId) {
      return NextResponse.json({ error: "Missing required fields: kbId, subjectId" }, { status: 400 });
    }

    learningDb.ensureSubject(kbId, subjectId, subjectTitle);

    return NextResponse.json({
      success: true,
      data: learningDb.getLearningData(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

