import { NextRequest, NextResponse } from "next/server";
import { getLearningQuestionDetail } from "@/lib/learning/questionDetail";

const WORKSPACE_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
} as const;

/**
 * 为题目详情接口统一附加短时缓存头，降低重复进入同一题目的等待成本。
 * @param {unknown} payload 当前接口返回体。
 * @returns {NextResponse} 带缓存头的 JSON 响应。
 */
function buildCachedJsonResponse(payload: unknown): NextResponse {
  return NextResponse.json(payload, {
    headers: WORKSPACE_CACHE_HEADERS,
  });
}

/**
 * GET /api/learning/questions/[questionId]
 * 获取题目详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
): Promise<NextResponse> {
  const { questionId } = await params;
  const kbId = request.nextUrl.searchParams.get("kbId");
  const categoryId = request.nextUrl.searchParams.get("categoryId");
  const includeTree = request.nextUrl.searchParams.get("includeTree") === "true";

  try {
    const question = await getLearningQuestionDetail({
      questionId,
      kbId,
      categoryId,
      includeTree,
    });
    if (!question) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 });
    }
    return buildCachedJsonResponse(question);
  } catch (error) {
    console.error("[GET /api/learning/questions/[questionId]] error:", error);
    return NextResponse.json({ error: "获取题目详情失败" }, { status: 500 });
  }
}
