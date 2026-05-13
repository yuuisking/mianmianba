import prisma from "@/lib/prisma";
import {
  normalizeInterviewContent,
  normalizeLearningContent,
  normalizeQualityReport,
  type InterviewContent,
  type LearningContent,
  type QualityReportPayload,
} from "@/lib/learning/content-contract";
import { getKnowledgeRelationBundle, type KnowledgeRelationBundle } from "@/lib/learning/knowledgeCardStudio";
import { buildDocumentQuestionPath, getTopicBankDetail, type TopicBankTreeGroup } from "@/lib/learning/topicBankService";

export type LearningQuestionDetail = {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  contentMeta?: {
    contentType: "interview_question" | "knowledge_card";
    layout: "question" | "knowledge";
    needsWideBody: boolean;
    diagramRequired: boolean;
  };
  answer: {
    keyPoints: string[];
    detailedExplanation: string;
    codeExample: string | null;
    diagram: string | null;
    quickFacts: Array<{ k: string; v: string }>;
    sections: Array<{
      id: string;
      h2: string;
      paragraphs?: string[];
      bullets?: string[];
      callout?: string;
      type?: string;
      diagramType?: string;
      diagramCode?: string;
      fallbackDescription?: string;
      codeExample?: {
        title?: string;
        language: string;
        code: string;
        explanation?: string;
        output?: string;
        outputExplanation?: string;
      };
      comparison?: {
        title: string;
        headers: string[];
        rows: string[][];
      };
    }>;
    article?: {
      conclusion: string;
      keyTakeaways: string[];
      learningGoals: string[];
      plainSummary?: string;
      plainRetell?: string;
      strongSummary?: string;
      sections: Array<{
        id: string;
        h2?: string;
        type: "text" | "diagram" | "code" | "mistake" | "comparison" | "quiz";
        paragraphs?: string[];
        bullets?: string[];
      callout?: string;
        highlight?: string;
        diagramType?: "mermaid" | "text";
        diagramCode?: string;
        fallbackDescription?: string;
      diagramSpec?: NonNullable<LearningContent["article"]>["sections"][number]["diagramSpec"];
        codeExample?: {
          title?: string;
          language: string;
          code: string;
          explanation?: string;
          output?: string;
          outputExplanation?: string;
        };
        comparison?: {
          title: string;
          headers: string[];
          rows: string[][];
        };
      mistake?: {
        mistake: string;
        whyWrong?: string;
        correct?: string;
      };
      }>;
    };
    selfTests?: LearningContent["selfTests"];
    sources?: LearningContent["sources"];
    interviewContent?: InterviewContent;
    qualityReport?: QualityReportPayload | null;
  };
  relatedQuestions: Array<{
    id: string;
    title: string;
    difficulty: "easy" | "medium" | "hard";
    path: string;
  }>;
  knowledgeRelations: KnowledgeRelationBundle;
  interviewFrequency: "high" | "medium" | "low";
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
  tree?: TopicBankTreeGroup[];
};

export type DocumentListItem = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  difficulty: string;
  frequency: string;
  status: string;
  currentVersionId: string | null;
  qualityScore: number | null;
  viewCount: number;
  favoriteCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * 将字符串转换为现有题目页可用的难度枚举。
 * @param {string | null | undefined} value Prisma 难度值。
 * @returns {"easy" | "medium" | "hard"} 兼容现有前台的难度值。
 */
function toDifficulty(value?: string | null): "easy" | "medium" | "hard" {
  return value === "easy" || value === "hard" ? value : "medium";
}

/**
 * 将字符串转换为现有题目页可用的频率枚举。
 * @param {string | null | undefined} value Prisma 频率值。
 * @returns {"high" | "medium" | "low"} 兼容现有前台的频率值。
 */
function toFrequency(value?: string | null): "high" | "medium" | "low" {
  return value === "high" || value === "low" ? value : "medium";
}

/**
 * 从学习文章和训练内容中提炼当前文档的快速摘要。
 * @param {LearningContent} learningContent 学习内容。
 * @param {InterviewContent} interviewContent 训练内容。
 * @returns {Array<{ k: string; v: string }>} 题目页摘要信息。
 */
function buildQuickFacts(
  learningContent: LearningContent,
  interviewContent: InterviewContent
): Array<{ k: string; v: string }> {
  const quickFacts: Array<{ k: string; v: string }> = [];

  if (learningContent.examPoint) {
    quickFacts.push({ k: "考察重点", v: learningContent.examPoint });
  }
  if (learningContent.summary) {
    quickFacts.push({ k: "一句话结论", v: learningContent.summary });
  }
  if (learningContent.quickCard?.keyPoints?.length) {
    for (const item of learningContent.quickCard.keyPoints.slice(0, 3)) {
      quickFacts.push({ k: `核心要点 ${item.number}`, v: item.summary });
    }
  }
  if (interviewContent.essentialPoints.length > 0) {
    quickFacts.push({
      k: "面试主线",
      v: interviewContent.essentialPoints
        .slice(0, 3)
        .map((item) => item.point)
        .join("；"),
    });
  }

  return quickFacts.slice(0, 8);
}

/**
 * 将学习内容 article 转换为现有阅读页支持的 rich article sections。
 * @param {LearningContent} learningContent 学习内容。
 * @returns {LearningQuestionDetail["answer"]["article"] | undefined} 富文档结构。
 */
function buildRichArticle(
  learningContent: LearningContent
): LearningQuestionDetail["answer"]["article"] | undefined {
  if (!learningContent.article) {
    return undefined;
  }

  return {
    conclusion: learningContent.article.conclusion,
    keyTakeaways: learningContent.article.keyTakeaways,
    learningGoals: learningContent.article.learningGoals,
    plainSummary: learningContent.article.plainSummary,
    plainRetell: learningContent.article.plainRetell,
    strongSummary: learningContent.article.strongSummary,
    sections: learningContent.article.sections.map((section) => ({
      id: section.id,
      h2: section.heading,
      type: section.type,
      paragraphs: section.body ? [section.body] : undefined,
      bullets: section.type === "quiz" && section.quiz ? [section.quiz.question, section.quiz.hint ?? ""].filter(Boolean) : undefined,
      callout: section.type === "mistake" ? undefined : section.highlight,
      highlight: section.highlight,
      diagramType: section.type === "diagram" ? "mermaid" : undefined,
      diagramCode: section.diagramCode,
      fallbackDescription: section.fallbackDescription,
      diagramSpec: section.diagramSpec,
      codeExample: section.codeExample
        ? {
            title: section.codeExample.title,
            language: section.codeExample.language,
            code: section.codeExample.code,
            explanation: section.codeExample.explanation,
          }
        : undefined,
      comparison: section.comparison
        ? {
            title: section.comparison.title,
            headers: section.comparison.headers,
            rows: section.comparison.rows,
          }
        : undefined,
      mistake: section.mistake
        ? {
            mistake: section.mistake.mistake,
            whyWrong: section.mistake.whyWrong,
            correct: section.mistake.correct,
          }
        : undefined,
    })),
  };
}

/**
 * 将学习内容与训练内容收口成现有阅读页可以直接消费的 sections。
 * @param {LearningContent} learningContent 学习内容。
 * @param {InterviewContent} interviewContent 训练内容。
 * @returns {LearningQuestionDetail["answer"]["sections"]} 兼容旧题目页的章节数组。
 */
function buildReaderSections(
  learningContent: LearningContent,
  interviewContent: InterviewContent
): LearningQuestionDetail["answer"]["sections"] {
  const sections: LearningQuestionDetail["answer"]["sections"] = [];

  if (learningContent.article?.plainSummary || learningContent.article?.conclusion) {
    sections.push({
      id: "knowledge-summary",
      h2: "知识点总结",
      paragraphs: [learningContent.article?.plainSummary, learningContent.article?.conclusion].filter(
        (item): item is string => Boolean(item && item.trim())
      ),
      bullets: learningContent.article?.keyTakeaways ?? [],
      callout: learningContent.article?.strongSummary,
    });
  }

  if (interviewContent.question || interviewContent.followUps.length > 0) {
    sections.push({
      id: "interview-highlights",
      h2: "面试常问",
      paragraphs: interviewContent.question ? [interviewContent.question] : undefined,
      bullets: [
        ...interviewContent.questionVariants,
        ...interviewContent.followUps.map((item) => item.question),
      ].slice(0, 8),
    });
  }

  if (interviewContent.answer30s || interviewContent.answer2min || interviewContent.advancedAnswer) {
    sections.push({
      id: "reference-answer",
      h2: "参考答案和解析",
      paragraphs: [interviewContent.answer30s, interviewContent.answer2min, interviewContent.advancedAnswer].filter(
        (item): item is string => Boolean(item && item.trim())
      ),
      bullets: [
        ...interviewContent.essentialPoints.map((item) => item.point),
        ...interviewContent.bonusPoints.map((item) => item.point),
      ].slice(0, 8),
    });
  }

  return sections;
}

/**
 * 获取一篇已发布文档的当前版本详情，并映射到现有题目页契约。
 * @param {{ bankId: string; chapterId?: string | null; documentId: string; includeTree?: boolean }} options 文档查询条件。
 * @returns {Promise<LearningQuestionDetail | null>} 文档详情。
 */
export async function getPublishedDocumentDetail(options: {
  bankId: string;
  chapterId?: string | null;
  documentId: string;
  includeTree?: boolean;
}): Promise<LearningQuestionDetail | null> {
  const document = await prisma.document.findFirst({
    where: {
      id: options.documentId,
      topicBankId: options.bankId,
      ...(options.chapterId ? { chapterId: options.chapterId } : {}),
      status: "PUBLISHED",
    },
    include: {
      topicBank: true,
      chapter: true,
      tags: {
        include: {
          tag: true,
        },
      },
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          qualityReport: true,
        },
      },
    },
  });

  if (!document) {
    return null;
  }

  const version = document.versions[0];
  const learningContent = normalizeLearningContent(version?.learningContent);
  const interviewContent = normalizeInterviewContent(version?.interviewContent);
  const qualityReport = normalizeQualityReport(version?.qualityReport ?? null);
  const [detail, relatedDocuments, knowledgeRelations] = await Promise.all([
    getTopicBankDetail(options.bankId),
    document.chapterId
      ? prisma.document.findMany({
          where: {
            topicBankId: options.bankId,
            chapterId: document.chapterId,
            status: "PUBLISHED",
            id: { not: document.id },
          },
          orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
          take: 6,
          select: {
            id: true,
            title: true,
            difficulty: true,
          },
        })
      : Promise.resolve([]),
    getKnowledgeRelationBundle({
      documentId: document.id,
    }),
  ]);

  return {
    id: document.id,
    title: document.title,
    difficulty: toDifficulty(document.difficulty),
    tags: document.tags.map((item) => item.tag.name),
    contentMeta: {
      contentType: learningContent.contentType ?? "interview_question",
      layout: learningContent.readingExperience?.layout ?? "knowledge",
      needsWideBody: learningContent.readingExperience?.needsWideBody ?? true,
      diagramRequired: learningContent.diagramGuidance?.required ?? false,
    },
    answer: {
      keyPoints: learningContent.article?.keyTakeaways ?? [],
      detailedExplanation:
        learningContent.article?.sections
          .map((item) => [item.heading, item.body].filter(Boolean).join("\n"))
          .filter(Boolean)
          .join("\n\n") || document.summary || "",
      codeExample: learningContent.codeExamples?.[0]?.code ?? null,
      diagram: learningContent.diagrams?.[0] ?? null,
      quickFacts: buildQuickFacts(learningContent, interviewContent),
      sections: buildReaderSections(learningContent, interviewContent),
      article: buildRichArticle(learningContent),
      selfTests: learningContent.selfTests,
      sources: learningContent.sources,
      interviewContent,
      qualityReport,
    },
    relatedQuestions: relatedDocuments.map((item) => ({
      id: item.id,
      title: item.title,
      difficulty: toDifficulty(item.difficulty),
      path: buildDocumentQuestionPath(options.bankId, document.chapterId ?? "uncategorized", item.id),
    })),
    knowledgeRelations,
    interviewFrequency: toFrequency(document.frequency),
    sourceUrl: learningContent.sources?.[0]?.url ?? null,
    category: {
      id: document.chapter?.id ?? "uncategorized",
      name: document.chapter?.name ?? "未分组",
    },
    knowledgeBase: {
      id: document.topicBank.id,
      name: document.topicBank.name,
    },
    createdAt: document.createdAt.toISOString(),
    tree: options.includeTree ? detail.tree : undefined,
  };
}

/**
 * 获取一个题库下当前已发布的章节与文档概览。
 * @param {string} bankId 题库标识。
 * @returns {Promise<{ bank: Awaited<ReturnType<typeof getTopicBankDetail>>["bank"]; chapters: Array<{ id: string; name: string; description: string; documents: DocumentListItem[] }> } | null>} 题库文档概览。
 */
export async function getPublishedDocumentOutline(bankId: string): Promise<{
  bank: Awaited<ReturnType<typeof getTopicBankDetail>>["bank"];
  chapters: Array<{
    id: string;
    name: string;
    description: string;
    documents: DocumentListItem[];
  }>;
} | null> {
  const bank = await prisma.topicBank.findUnique({
    where: { id: bankId },
    include: {
      chapters: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          documents: {
            where: { status: "PUBLISHED" },
            orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (!bank) {
    return null;
  }

  const detail = await getTopicBankDetail(bankId);

  return {
    bank: detail.bank,
    chapters: bank.chapters
      .map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        description: chapter.name,
        documents: chapter.documents.map((item) => ({
          id: item.id,
          title: item.title,
          slug: item.slug,
          summary: item.summary || "",
          difficulty: item.difficulty,
          frequency: item.frequency,
          status: item.status,
          currentVersionId: item.currentVersionId,
          qualityScore: item.qualityScore,
          viewCount: item.viewCount,
          favoriteCount: item.favoriteCount,
          publishedAt: item.publishedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
      }))
      .filter((chapter) => chapter.documents.length > 0),
  };
}

/**
 * 为前台题库详情页定位默认首篇文档跳转路径。
 * @param {string} bankId 题库标识。
 * @returns {Promise<string | null>} 默认首文档路径。
 */
export async function getDefaultDocumentPath(bankId: string): Promise<string | null> {
  const outline = await getPublishedDocumentOutline(bankId);
  const chapter = outline?.chapters[0];
  const document = chapter?.documents[0];
  return chapter && document ? buildDocumentQuestionPath(bankId, chapter.id, document.id) : null;
}
