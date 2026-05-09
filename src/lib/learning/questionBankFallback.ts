import { learningDb, type KbInfo, type TopicContent, type TreeGroup, type TreeNode } from "@/lib/db/learningDb";

export type QuestionDifficultyValue = "easy" | "medium" | "hard";
export type InterviewFrequencyValue = "high" | "medium" | "low";

export type FallbackQuestionListItem = {
  id: string;
  title: string;
  difficulty: QuestionDifficultyValue;
  tags: string[];
  interviewFrequency: InterviewFrequencyValue;
  createdAt: string;
};

export type FallbackQuestionDetail = {
  id: string;
  title: string;
  difficulty: QuestionDifficultyValue;
  tags: string[];
  answer: {
    keyPoints: string[];
    detailedExplanation: string;
    codeExample: string | null;
    diagram: string | null;
    quickFacts: TopicContent["quickFacts"];
    sections: TopicContent["sections"];
    article?: TopicContent["article"];
    selfTests?: TopicContent["selfTests"];
    sources?: TopicContent["sources"];
    interviewContent?: TopicContent["interviewContent"];
  };
  relatedQuestions: Array<{
    id: string;
    title: string;
    difficulty: QuestionDifficultyValue;
  }>;
  interviewFrequency: InterviewFrequencyValue;
  sourceUrl: string | null;
  category: {
    id: string;
    name: string;
  };
  knowledgeBase: {
    id: string;
    name: string;
  };
  createdAt: string;
};

type FallbackQuestionRecord = {
  kb: KbInfo;
  category: TreeGroup;
  node: TreeNode;
  content: TopicContent;
};

/**
 * 将输入值规范化为有限的正整数，避免分页参数异常。
 * @param {string | null | undefined} value 原始查询参数。
 * @param {number} fallback 参数缺失或非法时使用的默认值。
 * @param {number} maxValue 允许的最大值，用于限制单次读取量。
 * @returns {number} 经过裁剪后的安全正整数。
 */
function toPositiveInteger(value: string | null | undefined, fallback: number, maxValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, maxValue);
}

/**
 * 规范化题目难度筛选值，仅接受既定枚举。
 * @param {string | null | undefined} value 原始难度字符串。
 * @returns {QuestionDifficultyValue | null} 合法难度或 `null`。
 */
export function normalizeQuestionDifficulty(
  value: string | null | undefined
): QuestionDifficultyValue | null {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  return null;
}

/**
 * 从段落文本中提取首个代码块，供题目详情页展示。
 * @param {string} value 已拼接的正文内容。
 * @returns {string | null} 提取到的代码示例正文，没有则返回 `null`。
 */
function extractFirstCodeBlock(value: string): string | null {
  const match = value.match(/```(?:[\w-]+)?\n([\s\S]*?)```/);
  const code = match?.[1]?.trim();
  return code ? code : null;
}

/**
 * 从段落文本中提取首个外链，作为来源地址兜底。
 * @param {string} value 已拼接的正文内容。
 * @returns {string | null} 找到的来源地址，没有则返回 `null`。
 */
function extractFirstUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s)]+/);
  return match?.[0] ?? null;
}

/**
 * 基于标题与正文特征为文件仓题目估算难度。
 * @param {string} title 题目标题。
 * @param {string} body 题目正文。
 * @returns {QuestionDifficultyValue} 供前台展示的难度标签。
 */
function inferDifficulty(title: string, body: string): QuestionDifficultyValue {
  const sample = `${title} ${body}`.toLowerCase();
  if (/(源码|原理|调优|jvm|并发|锁|aqs|gc|架构|性能)/.test(sample)) {
    return "hard";
  }
  if (/(基础|入门|概览|简介|指南|快速开始|新特性)/.test(sample)) {
    return "easy";
  }

  return "medium";
}

/**
 * 基于标题与正文特征为文件仓题目估算面试频率。
 * @param {string} title 题目标题。
 * @param {string} body 题目正文。
 * @returns {InterviewFrequencyValue} 供前台展示的频率标签。
 */
function inferInterviewFrequency(title: string, body: string): InterviewFrequencyValue {
  const sample = `${title} ${body}`;
  if (/(面试题|高频|重点|必会|常见)/.test(sample)) {
    return "high";
  }
  if (/(概览|入门|新特性|指南)/.test(sample)) {
    return "low";
  }

  return "medium";
}

/**
 * 将文件仓主题正文整理为适合题目详情页展示的纯文本说明。
 * @param {TopicContent} content 文件仓中的主题内容。
 * @returns {string} 由摘要、章节、要点拼接出的详情正文。
 */
function buildDetailedExplanation(content: TopicContent): string {
  const blocks: string[] = [];

  if (content.quickFacts.length > 0) {
    blocks.push(
      content.quickFacts
        .map((fact) => `${fact.k || "要点"}：${fact.v}`)
        .filter((item) => item.trim().length > 0)
        .join("\n")
    );
  }

  for (const section of content.sections) {
    const sectionLines: string[] = [];
    if (section.h2) {
      sectionLines.push(section.h2);
    }
    if (section.paragraphs && section.paragraphs.length > 0) {
      sectionLines.push(...section.paragraphs);
    }
    if (section.bullets && section.bullets.length > 0) {
      sectionLines.push(...section.bullets.map((item) => `- ${item}`));
    }
    if (section.callout) {
      sectionLines.push(`提示：${section.callout}`);
    }
    if (sectionLines.length > 0) {
      blocks.push(sectionLines.join("\n"));
    }
  }

  return blocks.join("\n\n").trim();
}

/**
 * 将文件仓摘要信息转换为题目答案的核心要点数组。
 * @param {TopicContent} content 文件仓中的主题内容。
 * @returns {string[]} 用于题目详情和评估提示词的要点列表。
 */
function buildKeyPoints(content: TopicContent): string[] {
  const quickFacts = content.quickFacts
    .map((fact) => `${fact.k || "要点"}：${fact.v}`.trim())
    .filter((item) => item.length > 0);

  if (quickFacts.length > 0) {
    return quickFacts.slice(0, 8);
  }

  const bulletPoints = content.sections
    .flatMap((section) => section.bullets ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (bulletPoints.length > 0) {
    return bulletPoints.slice(0, 8);
  }

  const paragraphFallback = content.sections
    .flatMap((section) => section.paragraphs ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);

  return paragraphFallback;
}

/**
 * 为文件仓题目补齐一组轻量标签，便于列表页展示。
 * @param {KbInfo} kb 所属知识库。
 * @param {TreeGroup} category 所属分类。
 * @returns {string[]} 去重后的标签列表。
 */
function buildTags(kb: KbInfo, category: TreeGroup): string[] {
  return Array.from(new Set([category.title, ...kb.tags])).filter((item) => item.trim().length > 0);
}

/**
 * 将一条文件仓 topic 记录映射为列表页题目结构。
 * @param {FallbackQuestionRecord} record 文件仓题目上下文。
 * @returns {FallbackQuestionListItem} 与前台列表 API 对齐的题目项。
 */
function mapRecordToListItem(record: FallbackQuestionRecord): FallbackQuestionListItem {
  const title = record.content.title || record.node.title || record.node.id;
  const detailedExplanation = buildDetailedExplanation(record.content);
  return {
    id: record.node.id,
    title,
    difficulty: inferDifficulty(title, detailedExplanation),
    tags: buildTags(record.kb, record.category),
    interviewFrequency: inferInterviewFrequency(title, detailedExplanation),
    createdAt: record.kb.updatedAt,
  };
}

/**
 * 将一条文件仓 topic 记录映射为题目详情结构。
 * @param {FallbackQuestionRecord} record 文件仓题目上下文。
 * @returns {FallbackQuestionDetail} 与题目详情 API 对齐的稳定返回。
 */
function mapRecordToDetail(record: FallbackQuestionRecord): FallbackQuestionDetail {
  const title = record.content.title || record.node.title || record.node.id;
  const detailedExplanation = buildDetailedExplanation(record.content);
  const relatedQuestions = record.category.children
    .filter((item) => item.id !== record.node.id)
    .slice(0, 6)
    .map((item) => {
      const siblingContent =
        learningDb.getLearningData().contents[record.kb.id]?.[item.id] ??
        ({
          title: item.title,
          breadcrumb: [record.kb.name, record.category.title, item.title],
          quickFacts: [],
          sections: [],
        } satisfies TopicContent);
      const siblingBody = buildDetailedExplanation(siblingContent);
      return {
        id: item.id,
        title: siblingContent.title || item.title,
        difficulty: inferDifficulty(siblingContent.title || item.title, siblingBody),
      };
    });

  return {
    id: record.node.id,
    title,
    difficulty: inferDifficulty(title, detailedExplanation),
    tags: buildTags(record.kb, record.category),
    answer: {
      keyPoints: buildKeyPoints(record.content),
      detailedExplanation,
      codeExample: extractFirstCodeBlock(detailedExplanation),
      diagram: null,
      quickFacts: record.content.quickFacts,
      sections: record.content.sections,
      article: record.content.article,
      selfTests: record.content.selfTests,
      sources: record.content.sources,
      interviewContent: record.content.interviewContent,
    },
    relatedQuestions,
    interviewFrequency: inferInterviewFrequency(title, detailedExplanation),
    sourceUrl: extractFirstUrl(detailedExplanation),
    category: {
      id: record.category.id,
      name: record.category.title,
    },
    knowledgeBase: {
      id: record.kb.id,
      name: record.kb.name,
    },
    createdAt: record.kb.updatedAt,
  };
}

/**
 * 在文件仓中定位某个分类的所有题目记录。
 * @param {{ categoryId: string; kbId?: string | null }} options 分类与可选知识库标识。
 * @returns {FallbackQuestionRecord[]} 当前分类下的全部题目记录。
 */
function findCategoryRecords(options: {
  categoryId: string;
  kbId?: string | null;
}): FallbackQuestionRecord[] {
  const data = learningDb.getLearningData();
  const kbCandidates = options.kbId
    ? data.kbs.filter((kb) => kb.id === options.kbId)
    : data.kbs;

  for (const kb of kbCandidates) {
    const group = data.trees[kb.id]?.groups.find((item) => item.id === options.categoryId);
    if (!group) {
      continue;
    }

    return group.children.map((node) => ({
      kb,
      category: group,
      node,
      content:
        data.contents[kb.id]?.[node.id] ??
        ({
          title: node.title,
          breadcrumb: [kb.name, group.title, node.title],
          quickFacts: [],
          sections: [],
        } satisfies TopicContent),
    }));
  }

  return [];
}

/**
 * 在文件仓中定位某一道题目的完整上下文。
 * @param {{ questionId: string; kbId?: string | null; categoryId?: string | null }} options 题目与可选范围标识。
 * @returns {FallbackQuestionRecord | null} 找到的题目记录，未命中时返回 `null`。
 */
function findQuestionRecord(options: {
  questionId: string;
  kbId?: string | null;
  categoryId?: string | null;
}): FallbackQuestionRecord | null {
  const data = learningDb.getLearningData();
  const kbCandidates = options.kbId
    ? data.kbs.filter((kb) => kb.id === options.kbId)
    : data.kbs;

  for (const kb of kbCandidates) {
    const groups = options.categoryId
      ? (data.trees[kb.id]?.groups.filter((group) => group.id === options.categoryId) ?? [])
      : (data.trees[kb.id]?.groups ?? []);

    for (const group of groups) {
      const node = group.children.find((item) => item.id === options.questionId);
      if (!node) {
        continue;
      }

      return {
        kb,
        category: group,
        node,
        content:
          data.contents[kb.id]?.[node.id] ??
          ({
            title: node.title,
            breadcrumb: [kb.name, group.title, node.title],
            quickFacts: [],
            sections: [],
          } satisfies TopicContent),
      };
    }
  }

  return null;
}

/**
 * 获取文件仓分类题目列表，并稳定输出分页结构。
 * @param {{ categoryId: string; kbId?: string | null; page?: number; pageSize?: number; difficulty?: QuestionDifficultyValue | null }} options 分类列表查询条件。
 * @returns {{ questions: FallbackQuestionListItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } } | null} 可直接返回给前台的列表结果。
 */
export function getFallbackCategoryQuestions(options: {
  categoryId: string;
  kbId?: string | null;
  page?: number;
  pageSize?: number;
  difficulty?: QuestionDifficultyValue | null;
}):
  | {
      questions: FallbackQuestionListItem[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }
  | null {
  const page = toPositiveInteger(String(options.page ?? ""), 1, 10_000);
  const pageSize = toPositiveInteger(String(options.pageSize ?? ""), 20, 100);
  const records = findCategoryRecords({
    categoryId: options.categoryId,
    kbId: options.kbId ?? null,
  });

  if (records.length === 0) {
    return null;
  }

  const mapped = records.map((record) => mapRecordToListItem(record));
  const filtered = options.difficulty
    ? mapped.filter((item) => item.difficulty === options.difficulty)
    : mapped;
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;

  return {
    questions: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * 获取文件仓题目的详情兜底数据。
 * @param {{ questionId: string; kbId?: string | null; categoryId?: string | null }} options 题目标识与可选范围。
 * @returns {FallbackQuestionDetail | null} 与详情接口对齐的稳定题目数据。
 */
export function getFallbackQuestionDetail(options: {
  questionId: string;
  kbId?: string | null;
  categoryId?: string | null;
}): FallbackQuestionDetail | null {
  const record = findQuestionRecord(options);
  return record ? mapRecordToDetail(record) : null;
}
