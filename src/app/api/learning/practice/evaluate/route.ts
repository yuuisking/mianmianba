import { NextRequest, NextResponse } from "next/server";
import { evaluateDocumentAssessment } from "@/lib/learning/assessmentService";
import { getOptionalServerSession } from "@/lib/auth/getOptionalServerSession";

/**
 * 将统一评估结果格式化为旧刷题页还能直接渲染的纯文本摘要。
 * @param {import("@/lib/learning/assessmentEngine").AssessmentResult} assessment 结构化评估结果。
 * @returns {string} 兼容旧页面的纯文本摘要。
 */
function formatLegacyEvaluation(assessment: import("@/lib/learning/assessmentEngine").AssessmentResult): string {
  return [
    `得分：${assessment.score} / 100`,
    `掌握度：${assessment.level}`,
    assessment.hitPoints.length > 0 ? `命中点：\n- ${assessment.hitPoints.join("\n- ")}` : "",
    assessment.missingPoints.length > 0 ? `遗漏点：\n- ${assessment.missingPoints.join("\n- ")}` : "",
    assessment.wrongPoints.length > 0 ? `事实错误：\n- ${assessment.wrongPoints.join("\n- ")}` : "",
    assessment.expressionFeedback ? `表达建议：${assessment.expressionFeedback}` : "",
    assessment.whyThisAnswer ? `为什么这样答：${assessment.whyThisAnswer}` : "",
    assessment.recommendedAnswer ? `推荐答案：${assessment.recommendedAnswer}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * POST /api/learning/practice/evaluate
 * AI 评估用户答案
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getOptionalServerSession();
    const body = await request.json();
    const {
      questionId,
      userAnswer,
      kbId,
      categoryId,
    }: {
      questionId: string;
      userAnswer: string;
      kbId?: string;
      categoryId?: string;
    } = body;

    if (!questionId || !userAnswer?.trim()) {
      return NextResponse.json({ error: "缺少题目ID或答案" }, { status: 400 });
    }

    const result = await evaluateDocumentAssessment({
      questionId,
      userAnswer: userAnswer.trim(),
      mode: "interview",
      kbId: kbId ?? null,
      categoryId: categoryId ?? null,
      userId: session?.user?.id ?? null,
    });

    return NextResponse.json({
      evaluation: formatLegacyEvaluation(result.assessment),
      score: result.assessment.score,
      isCorrect: result.assessment.score >= 60,
      assessment: result.assessment,
      sessionId: result.sessionId,
    });
  } catch (error) {
    console.error("[POST /api/learning/practice/evaluate] error:", error);
    return NextResponse.json({ error: "评估失败" }, { status: 500 });
  }
}
