import { NextResponse } from 'next/server';
import { summarizeDocument } from '@/lib/ai/summarizer';
import { evaluateRawSummaryText } from "@/lib/learning/documentSummary";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * 处理后台知识工厂的手动总结请求，正文不足时直接返回明确提示。
 * @param {Request} req 管理后台发起的 POST 请求。
 * @returns {Promise<NextResponse>} 总结结果或错误信息。
 */
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
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

    const sufficiency = evaluateRawSummaryText(text);
    if (!sufficiency.isSufficient) {
      return NextResponse.json({ error: sufficiency.message }, { status: 422 });
    }

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
      { status: /信息不足/.test(msg) ? 422 : 500 }
    );
  }
}
