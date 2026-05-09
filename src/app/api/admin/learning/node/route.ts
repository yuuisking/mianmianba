import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      type?: "subject" | "topic";
      kbId?: string;
      subjectId?: string;
      subjectTitle?: string;
      topicId?: string;
      topicTitle?: string;
    };

    if (!body.kbId || !body.type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (body.type === "subject") {
      if (!body.subjectId || !body.subjectTitle) {
        return NextResponse.json({ error: "Missing subject fields" }, { status: 400 });
      }
      learningDb.addSubject(body.kbId, body.subjectId, body.subjectTitle);
    } else if (body.type === "topic") {
      if (!body.subjectId || !body.topicId || !body.topicTitle) {
        return NextResponse.json({ error: "Missing topic fields" }, { status: 400 });
      }
      learningDb.addEmptyTopic(body.kbId, body.subjectId, body.topicId, body.topicTitle);
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
