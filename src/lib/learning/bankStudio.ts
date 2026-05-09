import {
  getAdminTopicBankQuestions,
  getTopicBankDetail,
  listPublicTopicBankCards,
  type TopicBankCard,
  type TopicBankDetail,
  type TopicBankTreeGroup,
} from "@/lib/learning/topicBankService";

export type BankCard = TopicBankCard;
export type BankTreeGroup = TopicBankTreeGroup;

/**
 * 对外暴露公开题库卡片列表，兼容现有学习首页调用。
 * @returns {Promise<BankCard[]>} 学习中心题库卡片。
 */
export async function getPublicBankCards(): Promise<BankCard[]> {
  return listPublicTopicBankCards();
}

/**
 * 获取单个题库详情与目录树，兼容现有题库详情页调用。
 * @param {string} kbId 题库标识。
 * @returns {Promise<TopicBankDetail>} 题库详情。
 */
export async function getBankDetail(kbId: string): Promise<TopicBankDetail> {
  return getTopicBankDetail(kbId);
}

/**
 * 获取后台学习中心详情页使用的文档列表。
 * @param {string} kbId 题库标识。
 * @returns {Promise<Awaited<ReturnType<typeof getAdminTopicBankQuestions>>>} 后台题目摘要。
 */
export async function getAdminBankQuestions(
  kbId: string
): Promise<Awaited<ReturnType<typeof getAdminTopicBankQuestions>>> {
  return getAdminTopicBankQuestions(kbId);
}

/**
 * 获取后台首页学习中心概览。
 * @returns {Promise<{ banks: BankCard[] }>} 后台首页题库卡片列表。
 */
export async function getAdminBankStudioSummary(): Promise<{
  banks: BankCard[];
}> {
  const banks = await listPublicTopicBankCards();
  return {
    banks,
  };
}
