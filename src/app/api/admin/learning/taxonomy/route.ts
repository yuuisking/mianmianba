import { NextResponse } from "next/server";
import { generateTaxonomy } from "@/lib/ai/taxonomy";
import { learningDb } from "@/lib/db/learningDb";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      kbId?: unknown;
      description?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!kbId) {
      return NextResponse.json({ error: "Missing required fields: kbId" }, { status: 400 });
    }

    const treeData = await generateTaxonomy(kbId, description);
    
    // Save to database
    learningDb.saveTaxonomy(kbId, treeData);

    return NextResponse.json({ success: true, treeData });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
