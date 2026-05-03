import { NextResponse } from "next/server";
import { summarizeDocument } from "@/lib/ai/summarizer";
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
      subject?: unknown;
      text?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "默认分类";
    const text = typeof body.text === "string" ? body.text : "";

    if (!kbId || !text.trim()) {
      return NextResponse.json({ error: "Missing required fields: kbId, text" }, { status: 400 });
    }

    const summary = await summarizeDocument(text);
    const draftId = learningDb.createDraft(kbId, subject || "默认分类", summary);

    return NextResponse.json({ success: true, draftId, summary });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

