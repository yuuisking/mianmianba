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
      draftId?: unknown;
      summary?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    const summary = body.summary as any;

    if (!kbId || !draftId || !summary?.topic) {
      return NextResponse.json({ error: "Missing required fields: kbId, draftId, summary" }, { status: 400 });
    }

    const updated = learningDb.updateDraft(kbId, draftId, summary);
    if (!updated) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, draft: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

