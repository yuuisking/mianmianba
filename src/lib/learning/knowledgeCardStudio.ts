import "server-only";

import { cache } from "react";
import prisma from "@/lib/prisma";
import { normalizeLearningContent, normalizeInterviewContent } from "@/lib/learning/content-contract";
import { buildDocumentQuestionPath } from "@/lib/learning/topicBankService";

export type KnowledgeCardPreview = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  bankName: string;
  chapterName: string;
  updatedAt: string;
  estimatedMinutes: number;
  path: string;
  tone: "java" | "database" | "cache" | "jvm";
  reason: string;
  diagramRequired: boolean;
};

export type LearningPathPreview = {
  id: string;
  title: string;
  summary: string;
  audience: string;
  firstPath: string | null;
  tags: string[];
  steps: Array<{
    title: string;
    summary: string;
    path: string;
  }>;
};

export type RelatedLearningLink = {
  id: string;
  title: string;
  summary: string;
  path: string;
  relation: string;
  bankName: string;
  chapterName: string;
};

export type KnowledgeRelationBundle = {
  prerequisites: RelatedLearningLink[];
  relatedKnowledgeCards: RelatedLearningLink[];
  interviewAngles: Array<{
    title: string;
    bullets: string[];
  }>;
  pathTips: Array<{
    title: string;
    summary: string;
    path: string | null;
  }>;
};

type PublishedDocRecord = {
  id: string;
  title: string;
  summary: string | null;
  difficulty: string | null;
  frequency: string | null;
  qualityScore: number | null;
  publishedAt: Date | null;
  updatedAt: Date;
  topicBank: {
    id: string;
    name: string;
  };
  chapter: {
    id: string;
    name: string;
    sortOrder: number;
  } | null;
  tags: Array<{
    tag: {
      name: string;
    };
  }>;
  versions: Array<{
    learningContent: unknown;
    interviewContent: unknown;
  }>;
};

/**
 * 为不同技术方向生成稳定的视觉语气。
 * @param {string} bankName 题库名。
 * @returns {"java" | "database" | "cache" | "jvm"} 视觉 tone。
 */
function resolveCardTone(bankName: string): "java" | "database" | "cache" | "jvm" {
  if (/MySQL/i.test(bankName)) {
    return "database";
  }
  if (/Redis/i.test(bankName)) {
    return "cache";
  }
  if (/JVM/i.test(bankName)) {
    return "jvm";
  }
  return "java";
}

/**
 * 估算一篇知识卡片的阅读时长，用于首页卡片展示。
 * @param {PublishedDocRecord} doc 文档记录。
 * @returns {number} 估算分钟数。
 */
function estimateReadingMinutes(doc: PublishedDocRecord): number {
  const version = doc.versions[0];
  const learningContent = normalizeLearningContent(version?.learningContent);
  const article = learningContent.article;
  const paragraphCount =
    article?.sections.reduce((sum, section) => sum + (section.body ? 1 : 0) + (section.quiz ? 1 : 0) + (section.codeExample ? 1 : 0), 0) ??
    0;
  return Math.max(6, Math.min(18, 6 + paragraphCount));
}

/**
 * 构建知识卡片首页摘要文案。
 * @param {PublishedDocRecord} doc 文档记录。
 * @returns {string} 首页摘要。
 */
function buildKnowledgeSummary(doc: PublishedDocRecord): string {
  const version = doc.versions[0];
  const learningContent = normalizeLearningContent(version?.learningContent);
  return (
    learningContent.plainSummary ??
    learningContent.summary ??
    learningContent.article?.plainSummary ??
    doc.summary ??
    `${doc.topicBank.name} · ${doc.chapter?.name ?? "核心专题"}`
  ).trim();
}

/**
 * 生成知识卡片为什么值得先学的引导语。
 * @param {PublishedDocRecord} doc 文档记录。
 * @returns {string} 首页引导语。
 */
function buildKnowledgeReason(doc: PublishedDocRecord): string {
  const version = doc.versions[0];
  const interviewContent = normalizeInterviewContent(version?.interviewContent);
  if (interviewContent.essentialPoints.length > 0) {
    return `先抓住 ${interviewContent.essentialPoints
      .slice(0, 2)
      .map((item) => item.point)
      .join(" / ")}。`;
  }
  return `先补齐 ${doc.chapter?.name ?? "这个专题"} 的核心判断标准。`;
}

/**
 * 统一读取公开文档，为首页和详情页关系模块复用。
 * @returns {Promise<PublishedDocRecord[]>} 已发布文档记录。
 */
const listPublishedDocuments = cache(async function listPublishedDocuments(): Promise<PublishedDocRecord[]> {
  return prisma.document.findMany({
    where: {
      status: "PUBLISHED",
      currentVersionId: { not: null },
    },
    orderBy: [{ topicBank: { sortOrder: "asc" } }, { chapter: { sortOrder: "asc" } }, { publishedAt: "asc" }, { createdAt: "asc" }],
    include: {
      topicBank: {
        select: {
          id: true,
          name: true,
        },
      },
      chapter: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              name: true,
            },
          },
        },
      },
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          learningContent: true,
          interviewContent: true,
        },
      },
    },
  });
});

/**
 * 首页知识卡片区：从公开文档中挑选最适合“先学”的内容。
 * @returns {Promise<KnowledgeCardPreview[]>} 知识卡片预览。
 */
export async function listKnowledgeCardPreviews(): Promise<KnowledgeCardPreview[]> {
  const documents = await listPublishedDocuments();
  return documents
    .map((doc) => {
      const version = doc.versions[0];
      const learningContent = normalizeLearningContent(version?.learningContent);
      const chapterId = doc.chapter?.id;
      if (!chapterId) {
        return null;
      }
      return {
        id: doc.id,
        title: doc.title,
        summary: buildKnowledgeSummary(doc),
        tags: doc.tags.map((item) => item.tag.name).slice(0, 4),
        bankName: doc.topicBank.name,
        chapterName: doc.chapter?.name ?? "核心专题",
        updatedAt: doc.updatedAt.toISOString(),
        estimatedMinutes: estimateReadingMinutes(doc),
        path: buildDocumentQuestionPath(doc.topicBank.id, chapterId, doc.id),
        tone: resolveCardTone(doc.topicBank.name),
        reason: buildKnowledgeReason(doc),
        diagramRequired: learningContent.diagramGuidance?.required ?? Boolean(learningContent.article?.sections.some((item) => item.type === "diagram")),
      } satisfies KnowledgeCardPreview;
    })
    .filter((item): item is KnowledgeCardPreview => Boolean(item))
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)
    .slice(0, 12);
}

/**
 * 首页学习路径区：直接基于现有题库生成可开始的三步学习路径。
 * @returns {Promise<LearningPathPreview[]>} 预设学习路径。
 */
export async function listLearningPathPreviews(): Promise<LearningPathPreview[]> {
  const documents = await listPublishedDocuments();
  const grouped = new Map<string, PublishedDocRecord[]>();
  for (const doc of documents) {
    const list = grouped.get(doc.topicBank.id) ?? [];
    list.push(doc);
    grouped.set(doc.topicBank.id, list);
  }

  return Array.from(grouped.entries())
    .map(([bankId, docs]) => {
      const bankName = docs[0]?.topicBank.name ?? "学习路径";
      const orderedDocs = docs
        .filter((item) => item.chapter?.id)
        .sort((a, b) => {
          const chapterDelta = (a.chapter?.sortOrder ?? 999) - (b.chapter?.sortOrder ?? 999);
          if (chapterDelta !== 0) {
            return chapterDelta;
          }
          return (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0);
        })
        .slice(0, 3);
      if (orderedDocs.length === 0) {
        return null;
      }
      return {
        id: bankId,
        title: `${bankName} · 三步速通路径`,
        summary: `先从 ${orderedDocs[0]?.chapter?.name ?? "基础"} 起步，再过渡到 ${orderedDocs[1]?.chapter?.name ?? "进阶"}，最后进入 ${orderedDocs[2]?.chapter?.name ?? "实战"}。`,
        audience: /Java|JVM/.test(bankName) ? "适合后端 / Java 面试冲刺" : "适合系统补基础与专题串联",
        firstPath: buildDocumentQuestionPath(bankId, orderedDocs[0].chapter!.id, orderedDocs[0].id),
        tags: Array.from(new Set(orderedDocs.flatMap((item) => item.tags.map((tag) => tag.tag.name)))).slice(0, 4),
        steps: orderedDocs.map((item) => ({
          title: item.title,
          summary: buildKnowledgeSummary(item),
          path: buildDocumentQuestionPath(bankId, item.chapter!.id, item.id),
        })),
      } satisfies LearningPathPreview;
    })
    .filter((item): item is LearningPathPreview => Boolean(item))
    .slice(0, 4);
}

/**
 * 详情页关系模块：基于标签、章节顺序和训练内容生成前置知识、相关卡片和面试迁移建议。
 * @param {{ documentId: string }} input 当前文档。
 * @returns {Promise<KnowledgeRelationBundle>} 关系数据。
 */
export async function getKnowledgeRelationBundle(input: { documentId: string }): Promise<KnowledgeRelationBundle> {
  const documents = await listPublishedDocuments();
  const current = documents.find((item) => item.id === input.documentId);
  if (!current || !current.chapter?.id) {
    return {
      prerequisites: [],
      relatedKnowledgeCards: [],
      interviewAngles: [],
      pathTips: [],
    };
  }

  const currentTags = new Set(current.tags.map((item) => item.tag.name));
  const sameBankDocs = documents.filter((item) => item.topicBank.id === current.topicBank.id && item.id !== current.id && item.chapter?.id);
  const prerequisites = sameBankDocs
    .filter((item) => (item.chapter?.sortOrder ?? 999) <= (current.chapter?.sortOrder ?? 999))
    .slice(0, 2)
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: buildKnowledgeSummary(item),
      path: buildDocumentQuestionPath(item.topicBank.id, item.chapter!.id, item.id),
      relation: "前置知识",
      bankName: item.topicBank.name,
      chapterName: item.chapter?.name ?? "核心专题",
    }));

  const relatedKnowledgeCards = sameBankDocs
    .map((item) => {
      const overlap = item.tags.filter((tag) => currentTags.has(tag.tag.name)).length;
      return {
        item,
        overlap,
      };
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ item }) => ({
      id: item.id,
      title: item.title,
      summary: buildKnowledgeSummary(item),
      path: buildDocumentQuestionPath(item.topicBank.id, item.chapter!.id, item.id),
      relation: "相关知识点",
      bankName: item.topicBank.name,
      chapterName: item.chapter?.name ?? "核心专题",
    }));

  const version = current.versions[0];
  const interviewContent = normalizeInterviewContent(version?.interviewContent);
  const interviewAngles = [
    {
      title: "面试会怎么考",
      bullets: [
        ...interviewContent.questionVariants.slice(0, 2),
        ...interviewContent.followUps.slice(0, 2).map((item) => item.question),
      ].filter(Boolean),
    },
    {
      title: "高分回答主线",
      bullets: interviewContent.essentialPoints.slice(0, 4).map((item) => item.point),
    },
  ].filter((section) => section.bullets.length > 0);

  const pathTips = [
    {
      title: `${current.topicBank.name} 继续学`,
      summary: `先把 ${current.chapter?.name ?? "当前专题"} 学透，再顺着同题库继续刷相关文档，形成“知识点 -> 面试表达 -> 追问扩展”的闭环。`,
      path:
        prerequisites[0]?.path ??
        relatedKnowledgeCards[0]?.path ??
        buildDocumentQuestionPath(current.topicBank.id, current.chapter.id, current.id),
    },
  ];

  return {
    prerequisites,
    relatedKnowledgeCards,
    interviewAngles,
    pathTips,
  };
}
