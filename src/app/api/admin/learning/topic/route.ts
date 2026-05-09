import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

export async function DELETE(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(req.url);
    const kbId = searchParams.get("kbId");
    const subjectId = searchParams.get("subjectId");
    const topicId = searchParams.get("topicId");

    if (!kbId || !subjectId || !topicId) {
      return NextResponse.json({ error: "Missing required params" }, { status: 400 });
    }

    const ok = learningDb.deleteTopic(kbId, subjectId, topicId);
    if (!ok) {
      return NextResponse.json({ error: "Topic not found or delete failed" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
