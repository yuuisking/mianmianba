import { NextResponse } from "next/server";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";
import { runBankQualityAgent, runDocumentQualityAgent } from "@/lib/learning/qualityAgent";

type AuditPayload = {
  bankId?: string;
  documentId?: string;
};

/**
 * 执行学习中心 AI 抽检，可对单篇文档或整库文档运行。
 * @param {Request} req 当前请求。
 * @returns {Promise<Response>} 抽检结果响应。
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const payload = (await req.json().catch(() => ({}))) as AuditPayload;
    if (payload.documentId?.trim()) {
      const result = await runDocumentQualityAgent({
        documentId: payload.documentId.trim(),
        triggeredBy: authResult.user.id,
      });
      return NextResponse.json({
        success: true,
        mode: "document",
        result,
      });
    }

    if (payload.bankId?.trim()) {
      const result = await runBankQualityAgent({
        bankId: payload.bankId.trim(),
        triggeredBy: authResult.user.id,
      });
      return NextResponse.json({
        success: true,
        mode: "bank",
        result,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "缺少 bankId 或 documentId。",
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "AI 抽检执行失败。",
      },
      { status: 500 }
    );
  }
}
