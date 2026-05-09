import { NextResponse } from "next/server";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import {
  normalizeDocumentSummaryInput,
  type DocumentSummary,
  type SummaryRequestBody,
  validateDocumentSummary,
} from "@/lib/learning/documentSummary";

/**
 * 调用 DeepSeek 生成面向学习中心阅读场景的文档总结。
 * @param {string} context 当前文档全文上下文。
 * @param {string} title 当前文档标题。
 * @returns {Promise<DocumentSummary>} 结构化总结结果。
 */
async function summarizeWithAi(context: string, title: string): Promise<DocumentSummary> {
  const client = getDeepseekClient();
  const prompt = `
请基于下面这份学习文档，输出一个严格 JSON：
{
  "headline": "不超过 18 个字的总结标题",
  "summary": "2 到 3 句话，必须只基于当前文档",
  "keyPoints": ["3 到 5 条关键要点"],
  "recommendedFocus": ["2 到 4 个继续追问或练习方向"]
}

要求：
1. 只能使用当前文档里的内容，不得补充文档之外的事实。
2. 语气简洁，适合放在学习中心右侧边栏。
3. 如果文档偏教程，总结里优先保留概念、原理、场景、风险点。
4. 输出必须是 JSON，不要包裹 markdown 代码块。

文档标题：${title}

文档内容：
${context.slice(0, 18000)}
`;

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "你是学习中心的文档总结助手，只输出 JSON。" },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI 总结结果为空。");
  }

  return validateDocumentSummary(JSON.parse(content) as Partial<DocumentSummary>);
}

/**
 * 处理公开学习中心的文档 AI 总结请求。
 * @param {Request} request POST 请求。
 * @returns {Promise<NextResponse>} 文档总结结果。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SummaryRequestBody;
  const normalized = normalizeDocumentSummaryInput(body);

  if (!normalized.context.trim() || !normalized.sufficiency.isSufficient) {
    return NextResponse.json({ error: normalized.sufficiency.message }, { status: 422 });
  }

  try {
    const summary = await summarizeWithAi(normalized.context, normalized.title);
    return NextResponse.json({ summary });
  } catch (error) {
    console.warn("Learning summarize failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 总结生成失败，请稍后再试。" },
      { status: 502 }
    );
  }
}
