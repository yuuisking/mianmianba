import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { learningFactory } from "@/lib/db/learningFactory";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * Builds a stable KB identifier from the provided display name.
 * @param {string} name Raw knowledge-base display name.
 * @returns {string} Filesystem-safe KB identifier.
 */
function buildKbId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() + Date.now().toString(36);
}

/**
 * Returns the admin-facing knowledge factory snapshot for all KBs or one scoped KB.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Knowledge factory snapshot response.
 */
export async function GET(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(req.url);
    const kbId = (searchParams.get("kbId") || "").trim();
    const snapshot = learningFactory.getSnapshot(kbId || undefined);

    return NextResponse.json({
      success: true,
      ...snapshot,
      drafts: learningFactory.withDraftWorkflow(snapshot.drafts),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Creates a new knowledge base or updates an existing KB configuration.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Mutation result with refreshed KB snapshot.
 */
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      kbId?: unknown;
      name?: unknown;
      subtitle?: unknown;
      tags?: unknown;
      description?: unknown;
      visibility?: unknown;
      sortOrder?: unknown;
      cover?: unknown;
      defaultTopicId?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim() : "";
    const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : [];
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const visibility = body.visibility === "private" ? "private" : "public";
    const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : 0;
    const cover = typeof body.cover === "string" ? body.cover.trim() : "";
    const defaultTopicId =
      typeof body.defaultTopicId === "string"
        ? body.defaultTopicId.trim()
        : body.defaultTopicId === null
          ? null
          : null;

    if (!name) {
      return NextResponse.json({ error: "知识库名称不能为空" }, { status: 400 });
    }

    learningDb.createKb({
      id: kbId || buildKbId(name),
      name,
      subtitle,
      tags,
      description,
      visibility,
      sortOrder,
      cover,
      defaultTopicId,
      updatedAt: new Date().toISOString().split("T")[0],
      stats: { topics: 0, paths: 0 },
    });

    const snapshot = learningFactory.getSnapshot(kbId || undefined);
    return NextResponse.json({
      success: true,
      kbId: kbId || snapshot.kbs.find((item) => item.name === name)?.id,
      ...snapshot,
      drafts: learningFactory.withDraftWorkflow(snapshot.drafts),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Deletes one knowledge base together with its factory sidecar artifacts.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Deletion result.
 */
export async function DELETE(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(req.url);
    const kbId = searchParams.get("kbId");

    if (!kbId) {
      return NextResponse.json({ error: "Missing kbId" }, { status: 400 });
    }

    const ok = learningDb.deleteKb(kbId);
    if (!ok) {
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    }
    learningFactory.deleteKbArtifacts(kbId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
