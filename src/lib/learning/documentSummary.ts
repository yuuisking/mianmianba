export type QuickFactInput = {
  k?: unknown;
  v?: unknown;
};

export type SectionInput = {
  h2?: unknown;
  paragraphs?: unknown;
  bullets?: unknown;
  callout?: unknown;
};

export type SummaryRequestBody = {
  title?: unknown;
  breadcrumb?: unknown;
  quickFacts?: unknown;
  sections?: unknown;
};

export type DocumentSummary = {
  headline: string;
  summary: string;
  keyPoints: string[];
  recommendedFocus: string[];
};

export type SummarySourceSufficiency = {
  isSufficient: boolean;
  message: string;
  bodyCharacterCount: number;
  bodyBlockCount: number;
};

export type NormalizedDocumentSummaryInput = {
  title: string;
  context: string;
  sufficiency: SummarySourceSufficiency;
};

const MIN_SUMMARY_BODY_CHARACTERS = 100;
const LONG_FORM_SUMMARY_BODY_CHARACTERS = 180;
const MIN_SUMMARY_BODY_BLOCKS = 2;
const DEFAULT_INSUFFICIENT_SUMMARY_MESSAGE = "当前文档正文信息不足，暂时无法生成 AI 总结，请补充正文后再试。";

/**
 * 将任意字符串清洗为适合统计与校验的正文文本，尽量去掉代码块和 Markdown 噪音。
 * @param {string} value 原始文本。
 * @returns {string} 清洗后的纯文本。
 */
function sanitizeSummaryText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 将任意数组输入规整成去空字符串数组。
 * @param {unknown} value 输入值。
 * @returns {string[]} 已清洗的字符串数组。
 */
function toCleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeSummaryText(item))
    .filter((item) => item.length > 0);
}

/**
 * 基于正文块数量和字符数判断当前内容是否足够支撑真实总结。
 * @param {string[]} bodyBlocks 正文块数组。
 * @param {string} [message] 信息不足时的提示语。
 * @returns {SummarySourceSufficiency} 总结前的正文充足性判断结果。
 */
export function evaluateSummarySufficiency(
  bodyBlocks: string[],
  message = DEFAULT_INSUFFICIENT_SUMMARY_MESSAGE
): SummarySourceSufficiency {
  const meaningfulBlocks = bodyBlocks.map((item) => sanitizeSummaryText(item)).filter((item) => item.length >= 12);
  const bodyCharacterCount = meaningfulBlocks.join("").length;
  const bodyBlockCount = meaningfulBlocks.length;
  const isSufficient =
    bodyCharacterCount >= LONG_FORM_SUMMARY_BODY_CHARACTERS ||
    (bodyCharacterCount >= MIN_SUMMARY_BODY_CHARACTERS && bodyBlockCount >= MIN_SUMMARY_BODY_BLOCKS);

  return {
    isSufficient,
    message,
    bodyCharacterCount,
    bodyBlockCount,
  };
}

/**
 * 规范化公开学习中心总结请求，并只把真实正文纳入“可总结”判断。
 * @param {SummaryRequestBody} body 前端提交的文档结构化内容。
 * @returns {NormalizedDocumentSummaryInput} 标题、上下文和正文充足性结果。
 */
export function normalizeDocumentSummaryInput(body: SummaryRequestBody): NormalizedDocumentSummaryInput {
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "当前文档";
  const breadcrumb = Array.isArray(body.breadcrumb)
    ? body.breadcrumb
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const quickFacts = Array.isArray(body.quickFacts) ? body.quickFacts.map((item) => item as QuickFactInput) : [];
  const sections = Array.isArray(body.sections) ? body.sections.map((item) => item as SectionInput) : [];

  const normalizedQuickFacts = quickFacts
    .map((item) => ({
      k: typeof item.k === "string" ? sanitizeSummaryText(item.k) : "",
      v: typeof item.v === "string" ? sanitizeSummaryText(item.v) : "",
    }))
    .filter((item) => item.k || item.v);

  const normalizedSections = sections
    .map((item) => ({
      h2: typeof item.h2 === "string" ? sanitizeSummaryText(item.h2) : "",
      paragraphs: toCleanStringArray(item.paragraphs),
      bullets: toCleanStringArray(item.bullets),
      callout: typeof item.callout === "string" ? sanitizeSummaryText(item.callout) : "",
    }))
    .filter((item) => item.h2 || item.paragraphs.length > 0 || item.bullets.length > 0 || item.callout);

  const bodyBlocks = normalizedSections.flatMap((item) => [...item.paragraphs, ...item.bullets, item.callout].filter(Boolean));
  const context = [
    `标题：${title}`,
    breadcrumb.length > 0 ? `路径：${breadcrumb.join(" > ")}` : "",
    normalizedQuickFacts.length > 0
      ? `速览：\n${normalizedQuickFacts.map((item) => `- ${item.k}：${item.v}`.replace(/：$/, "")).join("\n")}`
      : "",
    normalizedSections.length > 0
      ? `正文：\n${normalizedSections
          .map((item) =>
            [
              item.h2 ? `## ${item.h2}` : "",
              ...item.paragraphs,
              ...item.bullets.map((value) => `- ${value}`),
              item.callout ? `提示：${item.callout}` : "",
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title,
    context,
    sufficiency: evaluateSummarySufficiency(bodyBlocks),
  };
}

/**
 * 针对后台原始文本或抓取结果做总结前校验，正文不足时直接拒绝进入模型。
 * @param {string} text 后台待总结的原始文本。
 * @returns {SummarySourceSufficiency} 原始文本的正文充足性结果。
 */
export function evaluateRawSummaryText(text: string): SummarySourceSufficiency {
  const normalizedText = sanitizeSummaryText(text);
  const bodyBlocks = normalizedText
    .split(/\n{2,}|(?<=[。！？；])/)
    .map((item) => item.trim())
    .filter(Boolean);
  return evaluateSummarySufficiency(bodyBlocks, "当前资料正文信息不足，暂时无法生成 AI 总结，请补充更多正文后再试。");
}

/**
 * 严格校验公开学习中心返回的总结结构，缺字段时不再使用任何编造型兜底。
 * @param {Partial<DocumentSummary>} summary 模型返回的结构化总结。
 * @returns {DocumentSummary} 通过校验的总结对象。
 */
export function validateDocumentSummary(summary: Partial<DocumentSummary>): DocumentSummary {
  const headline = typeof summary.headline === "string" ? summary.headline.trim() : "";
  const description = typeof summary.summary === "string" ? summary.summary.trim() : "";
  const keyPoints = Array.isArray(summary.keyPoints)
    ? summary.keyPoints
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const recommendedFocus = Array.isArray(summary.recommendedFocus)
    ? summary.recommendedFocus
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  if (!headline || !description || keyPoints.length < 2 || recommendedFocus.length < 1) {
    throw new Error("AI 总结结果缺少依据字段，请稍后重试。");
  }

  return {
    headline,
    summary: description,
    keyPoints,
    recommendedFocus,
  };
}
