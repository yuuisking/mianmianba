import {
  getPublishedDocumentDetail,
  type LearningQuestionDetail,
} from "@/lib/learning/documentService";

/**
 * 优先从文件仓题库获取题目详情；若未命中再回退到 Prisma。
 * @param {{ questionId: string; kbId?: string | null; categoryId?: string | null; includeTree?: boolean }} options 题目与题库上下文。
 * @returns {Promise<LearningQuestionDetail | null>} 可直接给题目页使用的详情数据。
 */
export async function getLearningQuestionDetail(options: {
  questionId: string;
  kbId?: string | null;
  categoryId?: string | null;
  includeTree?: boolean;
}): Promise<LearningQuestionDetail | null> {
  if (!options.kbId) {
    return null;
  }
  return getPublishedDocumentDetail({
    bankId: options.kbId,
    chapterId: options.categoryId,
    documentId: options.questionId,
    includeTree: options.includeTree,
  });
}
