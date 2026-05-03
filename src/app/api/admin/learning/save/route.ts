import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

type SummaryData = {
  topic: string;
  content: {
    quickFacts?: Array<{ k: string; v: string }>;
    sections?: Array<{
      id: string;
      h2: string;
      paragraphs?: string[];
      bullets?: string[];
      callout?: string;
    }>;
  };
};

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
      domain?: unknown;
      kbId?: unknown;
      subject?: unknown;
      summary?: unknown;
    };

    const kbId = typeof body.domain === "string" ? body.domain.trim() : typeof body.kbId === "string" ? body.kbId.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const summary = body.summary as SummaryData | undefined;

    if (!kbId || !subject || !summary?.topic || !summary?.content) {
      return NextResponse.json(
        { error: "Missing required fields: domain/kbId, subject, summary" },
        { status: 400 }
      );
    }

    const topicId = makeTopicId(summary.topic);

    learningDb.addContent(kbId, subject, topicId, {
      title: summary.topic,
      breadcrumb: [kbId, subject, summary.topic],
      quickFacts: summary.content.quickFacts || [],
      sections: summary.content.sections || [],
    });

    return NextResponse.json({
      success: true,
      topicId,
      data: learningDb.getLearningData(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

