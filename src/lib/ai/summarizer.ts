import { getDeepseekClient } from "./deepseek";
import type { DraftSummary } from "@/lib/db/learningDb";
import { evaluateRawSummaryText } from "@/lib/learning/documentSummary";

/**
 * 基于知识工厂需要的严格结构校验总结结果，缺字段时直接失败而不是补默认内容。
 * @param {unknown} value 模型返回的原始 JSON 数据。
 * @returns {DraftSummary} 通过结构校验的总结对象。
 */
function validateFactorySummaryResult(value: unknown): DraftSummary {
  if (!value || typeof value !== "object") {
    throw new Error("AI 总结结果格式无效。");
  }

  const summary = value as {
    topic?: unknown;
    content?: {
      quickFacts?: unknown;
      sections?: unknown;
    };
  };

  const topic = typeof summary.topic === "string" ? summary.topic.trim() : "";
  const quickFacts = Array.isArray(summary.content?.quickFacts)
    ? summary.content?.quickFacts.filter((item) => item && typeof item === "object")
    : [];
  const sections = Array.isArray(summary.content?.sections)
    ? summary.content?.sections.filter((item) => item && typeof item === "object")
    : [];

  if (!topic || quickFacts.length === 0 || sections.length < 2) {
    throw new Error("AI 总结结果缺少必要内容，请稍后重试。");
  }

  return summary as DraftSummary;
}

/**
 * 在真正请求模型前校验正文是否足够，避免仅靠标题或极少文本编造知识内容。
 * @param {string} text 待总结的原始文本。
 * @returns {void} 正文不足时直接抛出错误。
 */
function assertSummarySourceIsSufficient(text: string): void {
  const sufficiency = evaluateRawSummaryText(text);
  if (!sufficiency.isSufficient) {
    throw new Error(sufficiency.message);
  }
}

/**
 * 生成学习中心知识工厂使用的结构化总结结果。
 * @param {string} text 原始文本或 URL。
 * @param {string} [existingContent] 已有内容，存在时用于知识融合。
 * @returns {Promise<DraftSummary>} 知识工厂所需的结构化总结结果。
 */
export async function summarizeDocument(text: string, existingContent?: string): Promise<DraftSummary> {
  const openai = getDeepseekClient();
  let rawText = text;

  // Check if text is a URL
  if (text.trim().startsWith('http://') || text.trim().startsWith('https://')) {
    try {
      const response = await fetch(text.trim());
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }
      const html = await response.text();
      // Simple HTML to text extraction using regex
      rawText = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (e) {
      console.error('Error fetching URL:', e);
      throw new Error('Failed to fetch and extract text from URL');
    }
  }

  assertSummarySourceIsSufficient(rawText);

const mergeInstructions = existingContent 
    ? `
ADDITIONAL CRITICAL REQUIREMENT (MERGE MODE):
You have been provided with the "Existing Content" of this topic. 
Your task is to MERGE the knowledge from the "Raw Text" into the "Existing Content".
- DO NOT lose the original depth, key points, or structure of the Existing Content.
- Integrate the new information from the Raw Text smoothly into the appropriate sections.
- If the Raw Text contains new concepts, add them; if it expands on existing concepts, enrich them.
- Keep the exact same JSON structure requested above.

Existing Content:
${existingContent}
` 
    : "";

  const prompt = `
Please summarize the following raw text into a structured JSON format.
The JSON should have the following structure to match our Learning Center UI:
{
  "topic": "string (the main topic name)",
  "content": {
    "quickFacts": [
      { "k": "string (short key, e.g., '一句话')", "v": "string (value)" },
      { "k": "string", "v": "string" }
    ],
    "sections": [
      {
        "id": "string (unique section id)",
        "h2": "string (section heading)",
        "paragraphs": ["string", "string"],
        "bullets": ["string", "string"],
        "callout": "string (optional, a tip or important note)"
      }
    ]
  }
}

CRITICAL REQUIREMENT:
You MUST include exactly the following sections in the "sections" array (the "h2" field MUST match these exactly):
1. "核心摘要" (Core Summary)
2. "深度图解 (Mermaid)" (In-depth Diagram using Mermaid)
3. "底层原理剖析" (Underlying Principle Analysis)
4. "高频面试题" (High-frequency Interview Questions)

For the "深度图解 (Mermaid)" section, you MUST provide a valid Mermaid chart (e.g., flowchart, sequence diagram, etc.) to visualize the core concepts. The Mermaid code MUST be wrapped in a markdown code block with the language "mermaid" (e.g. \`\`\`mermaid\n...\n\`\`\`), and placed inside one of the "paragraphs" or "bullets" of that section.
${mergeInstructions}

Raw Text:
${rawText.slice(0, 15000)} // Limit to avoid context length issues

Respond ONLY with the JSON. Do not wrap the JSON in markdown blocks (e.g. do not use \`\`\`json). The text inside the JSON values CAN and SHOULD use markdown formatting (like **bold**, \`inline code\`, and \`\`\`language code blocks\`\`\`) to preserve code snippets and readability. Please use Chinese for the content.
  `;

  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that outputs JSON only.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Failed to generate summary');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error: unknown) {
    console.error('Failed to parse JSON:', content, error);
    throw new Error('Failed to parse summary JSON');
  }

  return validateFactorySummaryResult(parsed);
}
