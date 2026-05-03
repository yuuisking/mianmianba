import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

function makeTopicId(topic: string) {
  const encoded = encodeURIComponent(topic.trim()).toLowerCase();
  const safe = encoded
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return safe || Date.now().toString();
}

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
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";

    if (!kbId || !draftId) {
      return NextResponse.json({ error: "Missing required fields: kbId, draftId" }, { status: 400 });
    }

    const draft = learningDb.getDraft(kbId, draftId);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const title = draft.summary?.topic?.trim() || "未命名主题";
    const topicId = makeTopicId(title);

    learningDb.addContent(kbId, draft.subject || "默认分类", topicId, {
      title,
      breadcrumb: [kbId, draft.subject || "默认分类", title],
      quickFacts: draft.summary?.content?.quickFacts || [],
      sections: draft.summary?.content?.sections || [],
    });

    learningDb.deleteDraft(kbId, draftId);

    return NextResponse.json({ success: true, topicId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

