import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { learningFactory } from "@/lib/db/learningFactory";
import { alignDraftToFormalTemplate, inspectDraftQuality } from "@/lib/learning/documentTemplate";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * Publishes one reviewed draft into the public learning center and records release history.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Publish result payload.
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

    const qualityCheck = inspectDraftQuality(alignDraftToFormalTemplate(draft.summary));
    if (!qualityCheck.publishReady) {
      return NextResponse.json(
        {
          error: `发布前校验未通过：${qualityCheck.blockingIssues.join("；")}`,
          qualityCheck,
        },
        { status: 400 }
      );
    }

    const publishResult = learningFactory.publishDraft(kbId, draftId);
    if (!publishResult) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      topicId: publishResult.topicId,
      publishRecord: publishResult.publishRecord,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
