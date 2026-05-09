import { NextResponse } from "next/server";
import { routeContent } from "@/lib/ai/router";
import { summarizeDocument } from "@/lib/ai/summarizer";
import { learningFactory, type SourceType } from "@/lib/db/learningFactory";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * Detects the source type for one manual ingest input.
 * @param {string} text Raw source input from the admin workbench.
 * @returns {SourceType} Source type used by the knowledge factory.
 */
function detectSourceType(text: string): SourceType {
  if (/^https:\/\/github\.com\//i.test(text)) {
    return "github_markdown";
  }
  if (/^https?:\/\//i.test(text)) {
    return "web_page";
  }
  return "manual_text";
}

/**
 * Produces a short title for one source record.
 * @param {string} text Raw source input.
 * @returns {string} Human-readable source title.
 */
function buildSourceTitle(text: string): string {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.split("\n")[0]?.slice(0, 72) || "手动资料";
}

/**
 * Ingests one manual source into the knowledge factory, creates a traced source record,
 * routes it into the taxonomy, and stores a reviewable draft.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Draft creation result for the admin workbench.
 */
export async function POST(req: Request) {
  let sourceId = "";

  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      kbId?: unknown;
      subject?: unknown;
      text?: unknown;
      whitelist?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text = typeof body.text === "string" ? body.text : "";
    const whitelist = body.whitelist !== false;

    if (!kbId || !text.trim()) {
      return NextResponse.json({ error: "Missing required fields: kbId, text" }, { status: 400 });
    }

    const trimmedText = text.trim();
    const sourceType = detectSourceType(trimmedText);
    const sourceRegistration = learningFactory.registerSource({
      kbId,
      type: sourceType,
      mode: "manual",
      title: buildSourceTitle(trimmedText),
      url: /^https?:\/\//i.test(trimmedText) ? trimmedText : "",
      subject,
      whitelist,
      excerpt: trimmedText,
    });
    sourceId = sourceRegistration.source.id;
    learningFactory.updateSource(sourceRegistration.source.id, {
      status: "ingesting",
      error: null,
    });

    const snapshot = learningFactory.getSnapshot(kbId);
    const tree = snapshot.tree ?? { id: kbId, title: kbId, groups: [] };
    const routed =
      subject && subject !== "auto"
        ? { subject, topic: buildSourceTitle(trimmedText) }
        : await routeContent(buildSourceTitle(trimmedText), trimmedText.slice(0, 800), tree);
    const summary = await summarizeDocument(text);
    const finalSubject = routed.subject || subject || "默认分类";
    const diffSummary = [
      "来源已进入知识工厂待审核队列。",
      "已完成目录路由与摘要整理，待管理员补充措辞与结构。",
    ];
    const draft = learningFactory.createDraft({
      kbId,
      subject: finalSubject,
      summary,
      sourceIds: [sourceRegistration.source.id],
      diffSummary,
    });

    return NextResponse.json({
      success: true,
      draftId: draft.id,
      summary,
      source: learningFactory.updateSource(sourceRegistration.source.id, {
        status: "drafted",
        subject: finalSubject,
      }),
      routed,
      draft,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (sourceId) {
      learningFactory.updateSource(sourceId, {
        status: "failed",
        error: msg,
      });
    }
    return NextResponse.json({ error: msg }, { status: /信息不足/.test(msg) ? 422 : 500 });
  }
}
