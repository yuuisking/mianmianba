import { NextResponse } from "next/server";
import type { DraftSummary } from "@/lib/db/learningDb";
import { learningFactory } from "@/lib/db/learningFactory";
import { alignDraftToFormalTemplate, inspectDraftQuality } from "@/lib/learning/documentTemplate";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * Saves draft review edits and updates the admin workflow status.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Updated draft review payload.
 */
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      kbId?: unknown;
      draftId?: unknown;
      summary?: unknown;
      status?: unknown;
      reviewNotes?: unknown;
      diffSummary?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    const summary =
      typeof body.summary === "object" && body.summary !== null
        ? (body.summary as DraftSummary)
        : undefined;
    const status =
      body.status === "pending_review" ||
      body.status === "reviewing" ||
      body.status === "ready_to_publish" ||
      body.status === "published"
        ? body.status
        : "reviewing";
    const reviewNotes = Array.isArray(body.reviewNotes)
      ? body.reviewNotes.filter((item): item is string => typeof item === "string")
      : [];
    const diffSummary = Array.isArray(body.diffSummary)
      ? body.diffSummary.filter((item): item is string => typeof item === "string")
      : [];

    if (!kbId || !draftId || !summary?.topic) {
      return NextResponse.json({ error: "Missing required fields: kbId, draftId, summary" }, { status: 400 });
    }

    const alignedSummary = alignDraftToFormalTemplate(summary);
    const qualityCheck = inspectDraftQuality(alignedSummary);
    if (status === "ready_to_publish" && !qualityCheck.publishReady) {
      return NextResponse.json(
        {
          error: `当前草稿还不能标记为“可发布”：${qualityCheck.blockingIssues.join("；")}`,
          qualityCheck,
        },
        { status: 400 }
      );
    }

    const updated = learningFactory.updateDraft(kbId, draftId, {
      summary: alignedSummary,
      status,
      reviewNotes,
      diffSummary,
    });
    if (!updated) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const draftWithWorkflow = learningFactory.withDraftWorkflow([updated])[0];
    const draftWithAlignedSummary = {
      ...draftWithWorkflow,
      summary: alignedSummary,
    };

    return NextResponse.json({
      success: true,
      draft: draftWithAlignedSummary,
      qualityCheck: inspectDraftQuality(alignedSummary),
      sources: learningFactory.getDraftSources(updated),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
