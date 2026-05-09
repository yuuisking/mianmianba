import { NextRequest, NextResponse } from "next/server";
import { evaluateDocumentAssessment } from "@/lib/learning/assessmentService";
import type { AssessmentMode } from "@/lib/learning/assessmentEngine";
import { getOptionalServerSession } from "@/lib/auth/getOptionalServerSession";

/**
 * 统一学习评估接口，供自测、面试主回答和追问评分共用。
 * @param {NextRequest} request 当前请求对象。
 * @returns {Promise<NextResponse>} 结构化评估结果。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let questionId = "";
  let answerLength = 0;
  let mode: AssessmentMode = "interview";
  let userId: string | null = null;

  try {
    const body = (await request.json()) as {
      questionId?: string;
      userAnswer?: string;
      mode?: AssessmentMode;
      kbId?: string;
      categoryId?: string;
      selfTestIndex?: number;
      followUpIndex?: number;
      followUpQuestion?: string;
      sessionId?: string;
    };
    questionId = body.questionId?.trim() ?? "";
    answerLength = body.userAnswer?.trim().length ?? 0;
    mode = body.mode ?? "interview";

    if (!body.questionId?.trim() || !body.userAnswer?.trim()) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "INVALID_INPUT",
          message: "缺少题目 ID 或回答内容",
          retryable: false,
          requestId,
        },
        { status: 400 }
      );
    }

    const session = await getOptionalServerSession();
    userId = session?.user?.id ?? null;
    const result = await evaluateDocumentAssessment({
      questionId: body.questionId.trim(),
      userAnswer: body.userAnswer.trim(),
      mode: body.mode ?? "interview",
      kbId: body.kbId ?? null,
      categoryId: body.categoryId ?? null,
      selfTestIndex: typeof body.selfTestIndex === "number" ? body.selfTestIndex : undefined,
      followUpIndex: typeof body.followUpIndex === "number" ? body.followUpIndex : undefined,
      followUpQuestion: body.followUpQuestion ?? null,
      sessionId: body.sessionId ?? null,
      userId,
    });

    return NextResponse.json({
      success: true,
      assessment: result.assessment,
      sessionId: result.sessionId,
      requestId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "统一学习评估失败";
    const errorCode =
      errorMessage === "题目不存在"
        ? "DOCUMENT_NOT_FOUND"
        : errorMessage === "自测题不存在" || errorMessage === "当前没有可用的追问题目"
          ? "INVALID_ASSESSMENT_TARGET"
          : "ASSESSMENT_FAILED";
    const retryable = errorCode === "ASSESSMENT_FAILED";

    console.error("[POST /api/learning/assessment] error", {
      requestId,
      questionId,
      answerLength,
      mode,
      userId,
      errorCode,
      message: errorMessage,
      duration: Date.now() - startedAt,
      name: error instanceof Error ? error.name : "UnknownError",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        errorCode,
        message: errorMessage,
        retryable,
        requestId,
      },
      { status: retryable ? 500 : 400 }
    );
  }
}
