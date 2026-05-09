import prisma from "@/lib/prisma";

export type TopicBankCard = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  tags: string[];
  updatedAt: string;
  cover: string;
  categoryCount: number;
  questionCount: number;
  featuredCategories: string[];
  defaultQuestionPath: string | null;
};

export type TopicBankTreeQuestion = {
  id: string;
  categoryId: string;
  title: string;
};

export type TopicBankTreeGroup = {
  id: string;
  title: string;
  description: string;
  questions: TopicBankTreeQuestion[];
};

export type TopicBankDetail = {
  bank: TopicBankCard | null;
  tree: TopicBankTreeGroup[];
};

/**
 * 统一生成学习中心文档路径，兼容现有 `/learning/[kbId]/category/[categoryId]/question/[questionId]` 路由。
 * @param {string} kbId 题库标识。
 * @param {string} chapterId 章节标识。
 * @param {string} documentId 文档标识。
 * @returns {string} 题目详情路径。
 */
export function buildDocumentQuestionPath(kbId: string, chapterId: string, documentId: string): string {
  return `/learning/${kbId}/category/${chapterId}/question/${documentId}`;
}

/**
 * 将 Prisma 题库详情映射为前台和后台共享的卡片结构。
 * @param {{
 *   id: string;
 *   name: string;
 *   description: string | null;
 *   difficulty: string | null;
 *   targetRole: string | null;
 *   coverUrl: string | null;
 *   updatedAt: Date;
 *   chapters: Array<{ id: string; name: string; documents: Array<{ id: string; title: string; status: string }> }>;
 * }} bank Prisma 查询结果。
 * @returns {TopicBankCard} 标准化后的题库卡片。
 */
function mapTopicBankCard(bank: {
  id: string;
  name: string;
  description: string | null;
  difficulty: string | null;
  targetRole: string | null;
  coverUrl: string | null;
  updatedAt: Date;
  chapters: Array<{
    id: string;
    name: string;
    documents: Array<{ id: string; title: string; status: string }>;
  }>;
}): TopicBankCard {
  const publishedChapters = bank.chapters
    .map((chapter) => ({
      ...chapter,
      documents: chapter.documents.filter((item) => item.status === "PUBLISHED"),
    }))
    .filter((chapter) => chapter.documents.length > 0);
  const defaultChapter = publishedChapters[0];
  const defaultDocument = defaultChapter?.documents[0];

  return {
    id: bank.id,
    name: bank.name,
    subtitle: bank.targetRole || bank.difficulty || "学习专题",
    description: bank.description || "",
    tags: [bank.targetRole, bank.difficulty].filter((item): item is string => Boolean(item && item.trim())),
    updatedAt: bank.updatedAt.toISOString(),
    cover: bank.coverUrl || "",
    categoryCount: publishedChapters.length,
    questionCount: publishedChapters.reduce((sum, chapter) => sum + chapter.documents.length, 0),
    featuredCategories: publishedChapters.slice(0, 6).map((item) => item.name),
    defaultQuestionPath:
      defaultChapter && defaultDocument ? buildDocumentQuestionPath(bank.id, defaultChapter.id, defaultDocument.id) : null,
  };
}

/**
 * 获取学习中心公开题库卡片列表。
 * @returns {Promise<TopicBankCard[]>} 按发布时间和排序规则整理后的题库卡片。
 */
export async function listPublicTopicBankCards(): Promise<TopicBankCard[]> {
  const banks = await prisma.topicBank.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    include: {
      chapters: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          documents: {
            where: { status: "PUBLISHED" },
            orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return banks.map((bank) => mapTopicBankCard(bank));
}

/**
 * 获取单个题库详情与兼容旧题目页的目录树。
 * @param {string} bankId 题库标识。
 * @returns {Promise<TopicBankDetail>} 题库详情与目录树。
 */
export async function getTopicBankDetail(bankId: string): Promise<TopicBankDetail> {
  const bank = await prisma.topicBank.findUnique({
    where: { id: bankId },
    include: {
      chapters: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          documents: {
            where: { status: "PUBLISHED" },
            orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!bank) {
    return {
      bank: null,
      tree: [],
    };
  }

  const tree: TopicBankTreeGroup[] = bank.chapters
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.name,
      description: chapter.name,
      questions: chapter.documents.map((document) => ({
        id: document.id,
        categoryId: chapter.id,
        title: document.title,
      })),
    }))
    .filter((chapter) => chapter.questions.length > 0);

  return {
    bank: mapTopicBankCard(bank),
    tree,
  };
}

/**
 * 获取后台题库详情中用于“题目列表”面板的轻量文档列表。
 * @param {string} bankId 题库标识。
 * @returns {Promise<Array<{ id: string; title: string; difficulty: string; interviewFrequency: string; tags: string[]; categoryId: string; categoryName: string; createdAt: string }>>} 后台展示的题目摘要数组。
 */
export async function getAdminTopicBankQuestions(bankId: string): Promise<
  Array<{
    id: string;
    title: string;
    difficulty: string;
    interviewFrequency: string;
    tags: string[];
    categoryId: string;
    categoryName: string;
    createdAt: string;
  }>
> {
  const documents = await prisma.document.findMany({
    where: { topicBankId: bankId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      difficulty: true,
      frequency: true,
      createdAt: true,
      chapter: {
        select: {
          id: true,
          name: true,
        },
      },
      tags: {
        select: {
          tag: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return documents.map((item) => ({
    id: item.id,
    title: item.title,
    difficulty: item.difficulty,
    interviewFrequency: item.frequency,
    tags: item.tags.map((tag) => tag.tag.name),
    categoryId: item.chapter?.id ?? "uncategorized",
    categoryName: item.chapter?.name ?? "未分组",
    createdAt: item.createdAt.toISOString(),
  }));
}
