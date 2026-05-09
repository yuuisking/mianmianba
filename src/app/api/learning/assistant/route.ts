import { NextResponse } from "next/server";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import { searchKnowledgeBase } from "@/lib/knowledge/volc";
import { learningDb, type ContentSection, type TopicContent, type TreeData } from "@/lib/db/learningDb";

type AssistantRequestMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantRequestBody = {
  kbId?: unknown;
  topicId?: unknown;
  messages?: unknown;
  stream?: unknown;
};

type EvidenceDoc = {
  topicId: string;
  title: string;
  source: "current_document" | "neighbor_document" | "knowledge_base" | "external_knowledge";
  excerpt: string;
  headings: string[];
  breadcrumb: string[];
};

type ModelCitation = {
  topicId?: unknown;
  reason?: unknown;
};

type ModelAssistantResponse = {
  sessionTitle?: unknown;
  refusal?: unknown;
  answer?: unknown;
  refusalReason?: unknown;
  citations?: unknown;
  verificationPoints?: unknown;
  followUp?: unknown;
};

type ModelAssistantPlan = {
  sessionTitle?: unknown;
  refusal?: unknown;
  refusalReason?: unknown;
  citations?: unknown;
  verificationPoints?: unknown;
  followUp?: unknown;
};

type AssistantCitation = {
  topicId: string;
  title: string;
  source: EvidenceDoc["source"];
  reason: string;
};

type AssistantRouteResponse = {
  sessionTitle: string;
  refusal: boolean;
  answer: string;
  refusalReason: string;
  citations: AssistantCitation[];
  verificationPoints: string[];
  followUp: string[];
  contextDocs: Array<{
    topicId: string;
    title: string;
    source: EvidenceDoc["source"];
  }>;
};

type AssistantReplyPlan = {
  sessionTitle: string;
  refusal: boolean;
  refusalReason: string;
  citations: AssistantCitation[];
  verificationPoints: string[];
  followUp: string[];
  contextDocs: AssistantRouteResponse["contextDocs"];
};

type AssistantStreamEvent =
  | {
      type: "session";
      sessionTitle: string;
      contextDocs: AssistantRouteResponse["contextDocs"];
    }
  | {
      type: "delta";
      delta: string;
    }
  | ({
      type: "done";
    } & AssistantRouteResponse)
  | {
      type: "error";
      error: string;
    };

const MAX_MESSAGE_COUNT = 10;
const MAX_CONTEXT_DOCS = 5;
const MAX_EXTERNAL_CONTEXT_DOCS = 3;
const MAX_TOTAL_CONTEXT_DOCS = MAX_CONTEXT_DOCS + MAX_EXTERNAL_CONTEXT_DOCS;
const DEFAULT_REFUSAL_MESSAGE = "当前知识库未提供足够信息，我不能基于现有文档可靠回答这个问题。";
const GENERAL_ASSISTANT_KB_ID = "__learning-general__";
const GENERAL_ASSISTANT_TOPIC_ID = "__learning-general__";

/**
 * 将火山方舟检索结果转换成学习助手可复用的证据文档结构。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {Promise<EvidenceDoc[]>} 外部知识证据数组。
 */
async function buildExternalEvidenceDocs(latestQuestion: string): Promise<EvidenceDoc[]> {
  if (!latestQuestion.trim()) {
    return [];
  }

  const results = await searchKnowledgeBase(latestQuestion).catch(() => []);
  return results
    .filter((item) => typeof item.text === "string" && item.text.trim().length > 0)
    .slice(0, 3)
    .map((item, index) => ({
      topicId: `ark-${index + 1}`,
      title: item.source || `外部知识补充 ${index + 1}`,
      source: "external_knowledge" as const,
      excerpt: trimText(item.text, 900),
      headings: [],
      breadcrumb: ["外部知识检索", item.source || "火山方舟知识库"],
    }));
}

/**
 * 将任意文本裁剪成适合模型上下文和标题展示的长度。
 * @param {string} value 原始文本。
 * @param {number} maxLength 最大长度。
 * @returns {string} 裁剪后的文本。
 */
function trimText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 1, 0)).trim()}…`;
}

/**
 * 从用户问题中提取中英文关键词，供知识库内文档打分使用。
 * @param {string} value 用户问题。
 * @returns {string[]} 去重后的关键词数组。
 */
function tokenizeText(value: string): string[] {
  const matched = value
    .toLowerCase()
    .match(/[a-z0-9+#./_-]+|[\u4e00-\u9fa5]{2,}/g)
    ?.map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(matched ?? []));
}

/**
 * 将文档段落结构压平成可检索的简短正文。
 * @param {TopicContent} content 当前文档内容。
 * @param {number} maxLength 最长保留字符数。
 * @returns {string} 摘要化后的正文文本。
 */
function buildTopicExcerpt(content: TopicContent, maxLength: number): string {
  const quickFacts = content.quickFacts
    .map((item) => [item.k, item.v].filter(Boolean).join("："))
    .filter(Boolean);

  const sectionTexts = content.sections.flatMap((section) => {
    const parts = [section.h2, ...(section.paragraphs ?? []), ...(section.bullets ?? [])].filter(Boolean);
    return parts;
  });

  return trimText([...quickFacts, ...sectionTexts].join("\n"), maxLength);
}

/**
 * 将文档内容整理成可用于相关度匹配的检索语料。
 * @param {TopicContent} content 当前文档内容。
 * @returns {string} 可匹配的检索文本。
 */
function buildTopicSearchText(content: TopicContent): string {
  const sections = content.sections
    .flatMap((section) => [section.h2, ...(section.paragraphs ?? []), ...(section.bullets ?? [])])
    .join(" ");

  return [content.title, content.breadcrumb.join(" "), sections].filter(Boolean).join(" ").toLowerCase();
}

/**
 * 计算候选文档与用户问题之间的简单相关度分数。
 * @param {string} searchableText 文档检索文本。
 * @param {string[]} tokens 用户问题关键词。
 * @returns {number} 匹配分数。
 */
function scoreTopic(searchableText: string, tokens: string[]): number {
  return tokens.reduce((score, token) => {
    if (!token || !searchableText.includes(token)) {
      return score;
    }

    return score + Math.max(token.length, 2);
  }, 0);
}

/**
 * 解析请求中的历史消息，只保留合法的用户/助手消息。
 * @param {unknown} value 原始请求消息字段。
 * @returns {AssistantRequestMessage[]} 规范化后的消息数组。
 */
function normalizeMessages(value: unknown): AssistantRequestMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) {
        return null;
      }

      return {
        role,
        content: trimText(content, 4000),
      } satisfies AssistantRequestMessage;
    })
    .filter((item): item is AssistantRequestMessage => Boolean(item))
    .slice(-MAX_MESSAGE_COUNT);
}

/**
 * 从目录树中查找某篇文档所属的一级分组。
 * @param {TreeData | undefined} tree 当前知识库目录树。
 * @param {string} topicId 目标文档标识。
 * @returns {string} 分组标识；找不到时返回空字符串。
 */
function findSubjectIdForTopic(tree: TreeData | undefined, topicId: string): string {
  for (const group of tree?.groups ?? []) {
    if (group.children.some((item) => item.id === topicId)) {
      return group.id;
    }
  }

  return "";
}

/**
 * 收集某个一级分组下所有可阅读文档节点。
 * @param {TreeData | undefined} tree 当前知识库目录树。
 * @param {string} subjectId 目标分组标识。
 * @returns {Array<{ id: string; title: string }>} 该分组下的文档数组。
 */
function collectSubjectTopics(
  tree: TreeData | undefined,
  subjectId: string
): Array<{ id: string; title: string }> {
  const targetGroup = tree?.groups.find((group) => group.id === subjectId);
  return (targetGroup?.children ?? []).map((item) => ({ id: item.id, title: item.title }));
}

/**
 * 从文档正文中提取标题数组，便于模型理解段落结构。
 * @param {ContentSection[]} sections 当前文档章节数组。
 * @returns {string[]} 当前文档的章节标题列表。
 */
function collectHeadings(sections: ContentSection[]): string[] {
  return sections.map((section) => section.h2.trim()).filter(Boolean);
}

/**
 * 依据当前文档、相邻文档和知识库内相关文档构造模型证据包。
 * @param {string} kbId 当前知识库标识。
 * @param {string} topicId 当前文档标识。
 * @param {string} question 用户最新问题。
 * @returns {{ evidenceDocs: EvidenceDoc[]; topicTitle: string }} 证据文档与当前文档标题。
 */
function buildEvidenceDocs(
  kbId: string,
  topicId: string,
  question: string
): { evidenceDocs: EvidenceDoc[]; topicTitle: string } {
  const data = learningDb.getLearningData();
  const kb = data.kbs.find((item) => item.id === kbId);
  const tree = data.trees[kbId];
  const contents = data.contents[kbId] ?? {};
  const currentContent = contents[topicId];

  if (!kb || !tree || !currentContent) {
    throw new Error("当前文档不存在，无法创建对话上下文。");
  }

  const questionTokens = tokenizeText(question);
  const subjectId = findSubjectIdForTopic(tree, topicId);
  const siblingTopicIds = new Set(collectSubjectTopics(tree, subjectId).map((item) => item.id));
  const selected = new Set<string>([topicId]);
  const evidenceDocs: EvidenceDoc[] = [
    {
      topicId,
      title: currentContent.title,
      source: "current_document",
      excerpt: buildTopicExcerpt(currentContent, 1800),
      headings: collectHeadings(currentContent.sections),
      breadcrumb: currentContent.breadcrumb,
    },
  ];

  const rankedCandidates = Object.entries(contents)
    .filter(([candidateTopicId]) => candidateTopicId !== topicId)
    .map(([candidateTopicId, content]) => {
      const searchableText = buildTopicSearchText(content);
      const relevanceScore = scoreTopic(searchableText, questionTokens);
      const siblingBoost = siblingTopicIds.has(candidateTopicId) ? 6 : 0;

      return {
        topicId: candidateTopicId,
        content,
        score: relevanceScore + siblingBoost,
        siblingBoost,
      };
    })
    .sort((left, right) => right.score - left.score || right.siblingBoost - left.siblingBoost);

  for (const candidate of rankedCandidates) {
    if (evidenceDocs.length >= MAX_CONTEXT_DOCS) {
      break;
    }

    if (candidate.score <= 0 && candidate.siblingBoost <= 0 && evidenceDocs.length > 1) {
      continue;
    }

    if (selected.has(candidate.topicId)) {
      continue;
    }

    selected.add(candidate.topicId);
    evidenceDocs.push({
      topicId: candidate.topicId,
      title: candidate.content.title,
      source: siblingTopicIds.has(candidate.topicId) ? "neighbor_document" : "knowledge_base",
      excerpt: buildTopicExcerpt(candidate.content, siblingTopicIds.has(candidate.topicId) ? 1000 : 720),
      headings: collectHeadings(candidate.content.sections),
      breadcrumb: candidate.content.breadcrumb,
    });
  }

  return { evidenceDocs, topicTitle: currentContent.title };
}

/**
 * 根据首条用户消息生成稳定的会话标题。
 * @param {AssistantRequestMessage[]} messages 当前会话消息。
 * @param {string} topicTitle 当前文档标题。
 * @returns {string} 适合历史列表展示的会话标题。
 */
function buildSessionTitle(messages: AssistantRequestMessage[], topicTitle: string): string {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "";
  if (!firstUserMessage.trim()) {
    return `${topicTitle} 对话`;
  }

  return trimText(firstUserMessage, 18);
}

/**
 * 对模型生成的标题做最后一层收敛，确保适合历史列表稳定展示。
 * @param {string} value 模型返回的标题文本。
 * @param {string} fallbackTitle 回退标题。
 * @returns {string} 清洗后的标题。
 */
function normalizeGeneratedSessionTitle(value: string, fallbackTitle: string): string {
  const normalized = value.replace(/\s+/g, " ").replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!normalized) {
    return fallbackTitle;
  }

  return trimText(normalized, 24);
}

/**
 * 基于首条用户提问生成更像 DeepSeek 的短标题，用于首次历史命名。
 * @param {AssistantRequestMessage[]} messages 当前会话消息。
 * @param {string} topicTitle 当前文档标题或通用场景标题。
 * @returns {Promise<string>} 标题生成结果；失败时回退到截断标题。
 */
async function generateSessionTitle(messages: AssistantRequestMessage[], topicTitle: string): Promise<string> {
  const fallbackTitle = buildSessionTitle(messages, topicTitle);
  const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "";
  if (!firstUserMessage.trim()) {
    return fallbackTitle;
  }

  try {
    const client = getDeepseekClient();
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `
你是对话标题生成器。
请只根据用户第一次提问生成一个适合历史会话列表展示的短标题。

规则：
1. 只能输出标题本身，不要解释，不要引号，不要句号。
2. 标题尽量像 DeepSeek 会话标题，准确、稳定、可读。
3. 标题尽量控制在 4 到 16 个汉字或等价的简短英文短语。
4. 不要用“请问”“帮我”“怎么”“为什么”这类整句口语直接照搬。
5. 如果问题核心很明确，就概括成主题名；如果是学习路径类问题，就概括成“X 学习路径”之类。
`,
        },
        {
          role: "user",
          content: firstUserMessage,
        },
      ],
    });

    return normalizeGeneratedSessionTitle(response.choices[0]?.message?.content?.trim() ?? "", fallbackTitle);
  } catch {
    return fallbackTitle;
  }
}

/**
 * 将证据文档映射成前端可消费的上下文摘要。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @returns {AssistantRouteResponse["contextDocs"]} 轻量上下文列表。
 */
function buildContextDocs(evidenceDocs: EvidenceDoc[]): AssistantRouteResponse["contextDocs"] {
  return evidenceDocs.map((doc) => ({
    topicId: doc.topicId,
    title: doc.title,
    source: doc.source,
  }));
}

/**
 * 合并知识库内部证据与外部检索证据，并限制总数量。
 * @param {EvidenceDoc[]} primaryDocs 当前文档体系证据。
 * @param {EvidenceDoc[]} externalDocs 外部知识补充证据。
 * @returns {EvidenceDoc[]} 去重并裁剪后的证据数组。
 */
function mergeEvidenceDocs(primaryDocs: EvidenceDoc[], externalDocs: EvidenceDoc[]): EvidenceDoc[] {
  const merged = [...primaryDocs];
  const knownTopicIds = new Set(primaryDocs.map((doc) => doc.topicId));

  for (const doc of externalDocs) {
    if (knownTopicIds.has(doc.topicId)) {
      continue;
    }

    merged.push(doc);
    knownTopicIds.add(doc.topicId);
    if (merged.length >= MAX_TOTAL_CONTEXT_DOCS) {
      break;
    }
  }

  return merged;
}

/**
 * 构造发送给模型的规划提示词，先决定能否回答、引用哪些文档以及会话标题。
 * @param {string} topicTitle 当前文档标题。
 * @param {EvidenceDoc[]} evidenceDocs 参与本轮问答的证据文档。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {string} 规划阶段系统提示词。
 */
function buildAssistantPlanningPrompt(
  topicTitle: string,
  evidenceDocs: EvidenceDoc[],
  latestQuestion: string
): string {
  const diagramRequested =
    /(流程图|时序图|状态图|结构图|架构图|泳道图|画图|画一个图|mermaid|flowchart|sequence diagram|diagram)/i.test(
      latestQuestion
    );

  return `
你是学习中心里的文档助手规划器，先决定这轮对话是否可以安全回答，再选出真正应该引用的知识库证据。

当前文档标题：${topicTitle}
当前用户问题：${latestQuestion}

仅允许使用以下证据包：
${JSON.stringify(evidenceDocs, null, 2)}

规则：
1. 只做规划，不写 answer。
2. 如果证据不足以可靠回答，refusal=true，并说明 refusalReason。
3. citations 里的 topicId 必须来自 evidenceDocs。
4. 至少给出 1 条 citations；如果只能拒答，则 citations 允许为空。
5. sessionTitle 必须只根据“第一次用户提问”来概括，不要因为当前这轮追问而改写标题；输出短标题本身即可，适合历史会话长期展示。
6. verificationPoints 仅保留真正需要复核的版本、配置、兼容性、生产建议。
7. followUp 给出 1 到 3 个自然追问方向。
8. 优先使用 source 为 current_document、neighbor_document、knowledge_base 的证据；只有当前文档体系没有覆盖时，才使用 source 为 external_knowledge 的外部知识补充。
9. 如果术语本身有歧义，优先根据用户原话和 evidenceDocs 里的上下文判断真实意图；例如用户说“AI SKILL”或想学习“SKILL 语法”时，不要擅自切到 EDA/Cadence 方向，除非证据明确指向那个领域。
10. ${
    diagramRequested
      ? "如果用户明确要 Mermaid 流程图、时序图、状态图或结构图，只要证据里能整理出步骤、分支、顺序或结构，就不要因为“不能画图”而拒答；你只需要选出可支撑绘图的证据，后续回答阶段会把它转成 Mermaid。只有在证据连基本步骤都缺失时才允许拒答。"
      : "不要因为表达形式而拒答，只有在知识证据本身不足时才拒答。"
  }
11. 如果用户问的是明显超出当前文档范围的新概念、新工具或模型更新，而 external_knowledge 提供了可用材料，不要轻易拒答。
12. 只输出 JSON，不要输出 Markdown 代码块。

JSON 结构固定为：
{
  "sessionTitle": "简短标题",
  "refusal": false,
  "refusalReason": "",
  "citations": [
    {
      "topicId": "证据文档 topicId",
      "reason": "为什么这篇文档与当前问题相关"
    }
  ],
  "verificationPoints": ["需要复核的点"],
  "followUp": ["可以继续追问的方向"]
}
`;
}

/**
 * 构造回答阶段系统提示词，要求模型只基于已选证据自然输出正文。
 * @param {string} topicTitle 当前文档标题。
 * @param {AssistantCitation[]} citations 规划阶段已选中的引用。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {string} 回答阶段系统提示词。
 */
function buildAssistantAnswerPrompt(
  topicTitle: string,
  citations: AssistantCitation[],
  evidenceDocs: EvidenceDoc[],
  latestQuestion: string
): string {
  const citedDocs = citations
    .map((citation) => {
      const evidence = evidenceDocs.find((doc) => doc.topicId === citation.topicId);
      if (!evidence) {
        return null;
      }

      return {
        topicId: evidence.topicId,
        title: evidence.title,
        source: evidence.source,
        reason: citation.reason,
        excerpt: evidence.excerpt,
        headings: evidence.headings,
        breadcrumb: evidence.breadcrumb,
      };
    })
    .filter(Boolean);

  const diagramRequested =
    /(流程图|时序图|状态图|结构图|架构图|泳道图|画图|画一个图|mermaid|flowchart|sequence diagram|diagram)/i.test(
      latestQuestion
    );

  return `
你是学习中心里的文档助手，回答风格接近 DeepSeek：自然、直接、层次清晰，能承接多轮追问，但必须严格遵守“证据优先”。

你当前服务的是文档《${topicTitle}》。

你只能基于下面这些已经确认可引用的证据回答：
${JSON.stringify(citedDocs, null, 2)}

回答规则：
1. 直接回答用户问题，不要输出“根据上下文”或“从资料来看”这类机械前缀。
2. 可以自然使用分段、短列表和加粗，但不要写 Markdown 一级标题。
3. 不得补写证据里没有的源码细节、版本结论、默认配置、官方立场或线上建议。
4. 如果某个细节证据不够，就明确说“当前知识库没有给出这部分细节”，不要硬编。
5. 如果引用了 source 为 external_knowledge 的证据，要把它当作“外部知识补充”自然吸收进回答，不要机械暴露内部字段名。
6. 如果术语存在歧义，优先按用户语境和已给出的证据消歧，不要擅自切到不相关领域；例如用户说“AI SKILL”或“学习 SKILL 语法”时，不要默认答成 EDA/Cadence，除非证据明确如此。
7. ${
    diagramRequested
      ? "如果用户明确要流程图、时序图、状态图或结构图，优先输出一个 ```mermaid 代码块，再补 1 到 3 句简短说明；禁止说自己不能画图。Mermaid 语法必须尽量保守：优先使用 flowchart TD；节点 id 只用 ASCII 字母数字；节点文案避免使用 >、<、>=、<=、≥、≤、& 这类符号，改写成“高于 / 低于 / 大于等于 / 小于等于 / 和”等自然语言；不要输出 HTML 标签、Markdown 加粗、注释或复杂样式。"
      : "只输出回答正文，不要输出 JSON；除非用户明确要求图示，否则不要输出代码块围栏。"
  }
8. 不支持任意图片生成，不要承诺返回 PNG、JPG 或其他二进制图片；若需要图示，只能使用 Mermaid 代码块。
`;
}

/**
 * 构造学习中心首页通用助手的系统提示词，支持自由提问但不绑定具体文档。
 * @param {string} latestQuestion 用户最新问题。
 * @param {EvidenceDoc[]} externalEvidenceDocs 外部知识检索结果。
 * @returns {string} 通用助手系统提示词。
 */
function buildGeneralAssistantPrompt(latestQuestion: string, externalEvidenceDocs: EvidenceDoc[]): string {
  const diagramRequested =
    /(流程图|时序图|状态图|结构图|架构图|泳道图|画图|画一个图|mermaid|flowchart|sequence diagram|diagram)/i.test(
      latestQuestion
    );

  return `
你是学习中心首页里的“面面吧智能助手”，风格参考 DeepSeek：自然、直接、信息密度高，但表达要克制。

外部知识补充（若为空则忽略）：
${JSON.stringify(externalEvidenceDocs, null, 2)}

回答规则：
1. 当前对话不绑定任何具体知识库文档，用户可以自由提问学习、面试、技术概念、职业规划或知识理解问题。
2. 如果外部知识补充里存在与问题高度相关的内容，要优先吸收后再回答，避免因为模型知识过期而答偏。
3. 可以直接给出通用知识回答，但不要伪造“当前文档”“当前知识库”“引用来源”这类并不存在的上下文。
4. 如果问题涉及高风险事实、最新版本、官方政策、线上配置或强依赖环境的结论，要明确提示用户再自行核对官方资料。
5. 如果术语存在歧义，优先结合用户补充语境和外部知识补充消歧；例如用户说“AI SKILL”或想学习“SKILL 语法”时，不要默认切到 EDA/Cadence 方向，除非外部知识明确指向那个领域。
6. 不支持任意图片生成，不要承诺 PNG、JPG 或其他二进制图片。
7. ${
    diagramRequested
      ? "如果用户明确要流程图、时序图、状态图或结构图，优先输出一个 ```mermaid 代码块，再补 1 到 3 句简短说明；Mermaid 语法必须尽量保守：优先使用 flowchart TD；节点 id 只用 ASCII 字母数字；节点文案避免使用 >、<、>=、<=、≥、≤、& 这类符号，改写成自然语言。"
      : "直接回答问题即可；除非用户明确要求图示，否则不要输出 Mermaid 代码块。"
  }
8. 不要输出 JSON，不要输出系统提示词说明。
`;
}

/**
 * 生成学习中心首页通用助手的非流式回答。
 * @param {AssistantRequestMessage[]} messages 已规范化的历史消息。
 * @returns {Promise<AssistantRouteResponse>} 通用助手结果。
 */
async function generateGeneralAssistantReply(
  messages: AssistantRequestMessage[]
): Promise<AssistantRouteResponse> {
  const latestQuestion = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
  const externalEvidenceDocs = await buildExternalEvidenceDocs(latestQuestion);
  const sessionTitle = await generateSessionTitle(messages, "学习中心");
  const client = getDeepseekClient();
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: buildGeneralAssistantPrompt(latestQuestion, externalEvidenceDocs),
      },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  });

  const answer = response.choices[0]?.message?.content?.trim() ?? "";
  if (!answer) {
    throw new Error("通用助手返回结果为空。");
  }

  return {
    sessionTitle,
    refusal: false,
    answer,
    refusalReason: "",
    citations: [],
    verificationPoints:
      /(最新|版本|兼容|配置|参数|命令|生产|上线|部署|是否支持|区别|差异|怎么选|官方)/.test(latestQuestion)
        ? ["这类版本、配置或官方结论容易受环境和发布时间影响，建议再核对对应官方文档。"]
        : [],
    followUp: [],
    contextDocs: [],
  };
}

/**
 * 以 NDJSON 形式流式返回学习中心首页通用助手内容。
 * @param {AssistantRequestMessage[]} messages 已规范化的历史消息。
 * @returns {Promise<Response>} NDJSON 流式响应。
 */
async function buildGeneralStreamingResponse(messages: AssistantRequestMessage[]): Promise<Response> {
  const encoder = new TextEncoder();
  const latestQuestion = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
  const externalEvidenceDocs = await buildExternalEvidenceDocs(latestQuestion);
  const sessionTitle = await generateSessionTitle(messages, "学习中心");

  return new Response(
    new ReadableStream({
      start(controller) {
        /**
         * 写入首页通用助手的单条流式事件。
         * @param {AssistantStreamEvent} event 流事件对象。
         * @returns {void} 推送事件。
         */
        const pushEvent = (event: AssistantStreamEvent): void => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        const run = async (): Promise<void> => {
          pushEvent({
            type: "session",
            sessionTitle,
            contextDocs: [],
          });

          const client = getDeepseekClient();
          const stream = await client.chat.completions.create({
            model: "deepseek-chat",
            stream: true,
            messages: [
              {
                role: "system",
                content: buildGeneralAssistantPrompt(latestQuestion, externalEvidenceDocs),
              },
              ...messages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
            ],
          });

          let answer = "";
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (!delta) {
              continue;
            }

            answer += delta;
            pushEvent({ type: "delta", delta });
          }

          pushEvent({
            type: "done",
            sessionTitle,
            refusal: false,
            answer: answer.trim(),
            refusalReason: "",
            citations: [],
            verificationPoints:
              /(最新|版本|兼容|配置|参数|命令|生产|上线|部署|是否支持|区别|差异|怎么选|官方)/.test(latestQuestion)
                ? ["这类版本、配置或官方结论容易受环境和发布时间影响，建议再核对对应官方文档。"]
                : [],
            followUp: [],
            contextDocs: [],
          });
          controller.close();
        };

        void run().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "通用助手暂时不可用，请稍后再试。";
          pushEvent({ type: "error", error: message });
          controller.close();
        });
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

/**
 * 将模型规划结果标准化成可用于后续回答或拒答的安全结构。
 * @param {ModelAssistantPlan} modelPlan 模型返回的规划结果。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @param {string} fallbackTitle 回退会话标题。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {Omit<AssistantRouteResponse, "answer">} 已校验的规划结果。
 */
function normalizeAssistantPlan(
  modelPlan: ModelAssistantPlan,
  evidenceDocs: EvidenceDoc[],
  fallbackTitle: string,
  latestQuestion: string
): AssistantReplyPlan {
  const normalized = normalizeAssistantResult(
    {
      sessionTitle: modelPlan.sessionTitle,
      refusal: modelPlan.refusal,
      answer: "__PLANNED__",
      refusalReason: modelPlan.refusalReason,
      citations: modelPlan.citations,
      verificationPoints: modelPlan.verificationPoints,
      followUp: modelPlan.followUp,
    },
    evidenceDocs,
    fallbackTitle,
    latestQuestion
  );

  return {
    sessionTitle: normalized.sessionTitle,
    refusal: normalized.refusal,
    refusalReason: normalized.refusalReason,
    citations: normalized.citations,
    verificationPoints: normalized.verificationPoints,
    followUp: normalized.followUp,
    contextDocs: normalized.contextDocs,
  };
}

/**
 * 统一归一化模型返回的字符串数组字段。
 * @param {unknown} value 模型返回的原始字段。
 * @param {number} limit 最多保留的条数。
 * @returns {string[]} 过滤后的字符串数组。
 */
function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => trimText(item, 120))
    .slice(0, limit);
}

/**
 * 对模型输出进行结构化校验，并把 citations 绑定到真实证据文档。
 * @param {ModelAssistantResponse} modelResult 模型输出。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @param {string} fallbackTitle 回退会话标题。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {AssistantRouteResponse} 可直接返回给前端的安全结果。
 */
function normalizeAssistantResult(
  modelResult: ModelAssistantResponse,
  evidenceDocs: EvidenceDoc[],
  fallbackTitle: string,
  latestQuestion: string
): AssistantRouteResponse {
  const evidenceMap = new Map(evidenceDocs.map((doc) => [doc.topicId, doc]));
  const rawCitations = Array.isArray(modelResult.citations) ? (modelResult.citations as ModelCitation[]) : [];
  const citations = rawCitations
    .map((item) => {
      const topicId = typeof item.topicId === "string" ? item.topicId : "";
      const evidence = evidenceMap.get(topicId);
      if (!evidence) {
        return null;
      }

      return {
        topicId,
        title: evidence.title,
        source: evidence.source,
        reason:
          typeof item.reason === "string" && item.reason.trim()
            ? trimText(item.reason, 70)
            : "回答依赖了这篇文档中的相关内容。",
      } satisfies AssistantCitation;
    })
    .filter((item): item is AssistantCitation => Boolean(item));

  const refusal = modelResult.refusal === true;
  const answer = typeof modelResult.answer === "string" ? modelResult.answer.trim() : "";
  const refusalReason =
    typeof modelResult.refusalReason === "string" && modelResult.refusalReason.trim()
      ? trimText(modelResult.refusalReason, 120)
      : DEFAULT_REFUSAL_MESSAGE;

  const verificationPoints = normalizeStringList(modelResult.verificationPoints, 3);
  const followUp = normalizeStringList(modelResult.followUp, 3);
  const sessionTitle =
    typeof modelResult.sessionTitle === "string" && modelResult.sessionTitle.trim()
      ? trimText(modelResult.sessionTitle, 24)
      : fallbackTitle;

  const needsGenericVerification =
    /(最新|版本|兼容|配置|参数|命令|生产|上线|部署|是否支持|区别|差异|怎么选|官方)/.test(latestQuestion) &&
    !refusal &&
    verificationPoints.length === 0;

  if (refusal || !answer || citations.length === 0) {
    return {
      sessionTitle,
      refusal: true,
      answer: "",
      refusalReason,
      citations: [],
      verificationPoints: [],
      followUp,
      contextDocs: buildContextDocs(evidenceDocs),
    };
  }

  return {
    sessionTitle,
    refusal: false,
    answer,
    refusalReason: "",
    citations,
    verificationPoints: needsGenericVerification
      ? ["这类版本、配置或生产判断容易受环境影响，建议再对照当前官方文档和你的实际运行环境复核。"]
      : verificationPoints,
    followUp,
    contextDocs: buildContextDocs(evidenceDocs),
  };
}

/**
 * 调用 DeepSeek 生成结构化的回答规划结果。
 * @param {AssistantRequestMessage[]} messages 已规范化的历史消息。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @param {string} topicTitle 当前文档标题。
 * @returns {Promise<AssistantReplyPlan>} 可直接用于后续生成的安全规划结果。
 */
async function planAssistantReply(
  messages: AssistantRequestMessage[],
  evidenceDocs: EvidenceDoc[],
  topicTitle: string
): Promise<AssistantReplyPlan> {
  const latestQuestion = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
  const fallbackTitle = buildSessionTitle(messages, topicTitle);
  const client = getDeepseekClient();
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildAssistantPlanningPrompt(topicTitle, evidenceDocs, latestQuestion),
      },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("文档助手返回结果为空。");
  }

  return normalizeAssistantPlan(
    JSON.parse(rawContent) as ModelAssistantPlan,
    evidenceDocs,
    fallbackTitle,
    latestQuestion
  );
}

/**
 * 使用已选中的证据生成完整答案。
 * @param {AssistantRequestMessage[]} messages 已规范化的历史消息。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @param {AssistantReplyPlan} plan 已完成校验的回答规划。
 * @param {string} topicTitle 当前文档标题。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {Promise<string>} 非流式完整回答文本。
 */
async function generateAssistantAnswer(
  messages: AssistantRequestMessage[],
  evidenceDocs: EvidenceDoc[],
  plan: AssistantReplyPlan,
  topicTitle: string,
  latestQuestion: string
): Promise<string> {
  const client = getDeepseekClient();
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: buildAssistantAnswerPrompt(topicTitle, plan.citations, evidenceDocs, latestQuestion),
      },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  });

  const answer = response.choices[0]?.message?.content?.trim() ?? "";
  if (!answer) {
    throw new Error("文档助手返回结果为空。");
  }

  return answer;
}

/**
 * 调用 DeepSeek 生成基于知识库证据的多轮回答。
 * @param {AssistantRequestMessage[]} messages 已规范化的历史消息。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @param {string} topicTitle 当前文档标题。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {Promise<AssistantRouteResponse>} 可直接返回前端的安全问答结果。
 */
async function generateAssistantReply(
  messages: AssistantRequestMessage[],
  evidenceDocs: EvidenceDoc[],
  topicTitle: string,
  latestQuestion: string
): Promise<AssistantRouteResponse> {
  const plan = await planAssistantReply(messages, evidenceDocs, topicTitle);
  if (plan.refusal) {
    return {
      ...plan,
      answer: "",
    };
  }

  const answer = await generateAssistantAnswer(messages, evidenceDocs, plan, topicTitle, latestQuestion);
  return {
    ...plan,
    answer,
  };
}

/**
 * 以 NDJSON 形式向前端持续推送真实流式回答。
 * @param {AssistantRequestMessage[]} messages 已规范化的历史消息。
 * @param {EvidenceDoc[]} evidenceDocs 当前证据文档数组。
 * @param {string} topicTitle 当前文档标题。
 * @param {string} latestQuestion 用户最新问题。
 * @returns {Promise<Response>} NDJSON 流式响应。
 */
async function buildStreamingResponse(
  messages: AssistantRequestMessage[],
  evidenceDocs: EvidenceDoc[],
  topicTitle: string,
  latestQuestion: string
): Promise<Response> {
  const encoder = new TextEncoder();
  const plan = await planAssistantReply(messages, evidenceDocs, topicTitle);

  return new Response(
    new ReadableStream({
      start(controller) {
        /**
         * 写入单条流式事件。
         * @param {AssistantStreamEvent} event 事件内容。
         * @returns {void} 编码并推送到响应流。
         */
        const pushEvent = (event: AssistantStreamEvent): void => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        const run = async (): Promise<void> => {
          pushEvent({
            type: "session",
            sessionTitle: plan.sessionTitle,
            contextDocs: plan.contextDocs,
          });

          if (plan.refusal) {
            pushEvent({
              type: "done",
              ...plan,
              answer: "",
            });
            controller.close();
            return;
          }

          const client = getDeepseekClient();
          const stream = await client.chat.completions.create({
            model: "deepseek-chat",
            stream: true,
            messages: [
              {
                role: "system",
                content: buildAssistantAnswerPrompt(topicTitle, plan.citations, evidenceDocs, latestQuestion),
              },
              ...messages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
            ],
          });

          let answer = "";
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (!delta) {
              continue;
            }

            answer += delta;
            pushEvent({ type: "delta", delta });
          }

          pushEvent({
            type: "done",
            ...plan,
            answer: answer.trim(),
          });
          controller.close();
        };

        void run().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "文档助手暂时不可用，请稍后再试。";
          pushEvent({ type: "error", error: message });
          controller.close();
        });
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

/**
 * 处理学习中心文档助手的问答请求。
 * @param {Request} request POST 请求对象。
 * @returns {Promise<NextResponse>} 基于当前知识库证据的问答结果。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AssistantRequestBody;
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
    const shouldStream = body.stream === true;
    const messages = normalizeMessages(body.messages);
    const isGeneralAssistant = kbId === GENERAL_ASSISTANT_KB_ID || topicId === GENERAL_ASSISTANT_TOPIC_ID;

    if (!isGeneralAssistant && (!kbId || !topicId)) {
      return NextResponse.json({ error: "缺少知识库或文档上下文。" }, { status: 400 });
    }

    if (messages.length === 0 || messages.filter((message) => message.role === "user").length === 0) {
      return NextResponse.json({ error: "请先输入你的问题。" }, { status: 400 });
    }

    if (isGeneralAssistant) {
      if (shouldStream) {
        return await buildGeneralStreamingResponse(messages);
      }

      const result = await generateGeneralAssistantReply(messages);
      return NextResponse.json(result);
    }

    const latestQuestion = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
    const { evidenceDocs: primaryEvidenceDocs, topicTitle } = buildEvidenceDocs(kbId, topicId, latestQuestion);
    const externalEvidenceDocs = await buildExternalEvidenceDocs(latestQuestion);
    const evidenceDocs = mergeEvidenceDocs(primaryEvidenceDocs, externalEvidenceDocs);

    if (shouldStream) {
      return await buildStreamingResponse(messages, evidenceDocs, topicTitle, latestQuestion);
    }

    const result = await generateAssistantReply(messages, evidenceDocs, topicTitle, latestQuestion);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Learning assistant route failed:", error);
    return NextResponse.json(
      { error: "文档助手暂时不可用，请稍后再试。" },
      { status: 500 }
    );
  }
}
