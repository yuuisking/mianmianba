import { NextRequest, NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { learningFactory } from "@/lib/db/learningFactory";
import { alignDraftToFormalTemplate, inspectDraftQuality } from "@/lib/learning/documentTemplate";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * Returns one draft together with its related sources and publish traces.
 * @param {NextRequest} req Incoming route request.
 * @returns {Promise<Response>} Draft detail response for the review page.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(req.url);
    const kbId = (searchParams.get("kbId") || "").trim();
    const draftId = (searchParams.get("draftId") || "").trim();

    if (!kbId || !draftId) {
      return NextResponse.json({ error: "Missing required query: kbId, draftId" }, { status: 400 });
    }

    const draft = learningDb.getDraft(kbId, draftId);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const draftWithWorkflow = learningFactory.withDraftWorkflow([draft])[0];
    const alignedDraft = {
      ...draftWithWorkflow,
      summary: alignDraftToFormalTemplate(draftWithWorkflow.summary),
    };
    const snapshot = learningFactory.getSnapshot(kbId);

    return NextResponse.json({
      success: true,
      draft: alignedDraft,
      qualityCheck: inspectDraftQuality(alignedDraft.summary),
      sources: learningFactory.getDraftSources(draftWithWorkflow),
      publishRecords: snapshot.publishRecords.filter((item) => item.draftId === draftId),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
