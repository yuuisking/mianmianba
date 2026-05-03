import { NextResponse } from 'next/server';
import { summarizeDocument } from '@/lib/ai/summarizer';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const isAdmin = 
      session?.user?.email?.toLowerCase().includes("admin") || 
      session?.user?.name?.toLowerCase().includes("admin");

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Admins only' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: unknown;
      domain?: unknown;
      kbId?: unknown;
      subject?: unknown;
    };

    const text = typeof body.text === "string" ? body.text : "";
    const kbId =
      typeof body.kbId === "string"
        ? body.kbId.trim()
        : typeof body.domain === "string"
          ? body.domain.trim()
          : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";

    if (!text || !kbId || !subject) {
      return NextResponse.json(
        { error: 'Missing required fields: text, kbId, subject' },
        { status: 400 }
      );
    }

    // Call the summarizer logic
    const summary = await summarizeDocument(text);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: unknown) {
    console.error('Error in summarize route:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
