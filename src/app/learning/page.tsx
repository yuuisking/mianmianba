import LearningCenterClient from "./_components/LearningCenterClient";
import { getPublicBankCards } from "@/lib/learning/bankStudio";

export const dynamic = "force-dynamic";

/**
 * 学习中心入口页 - 展示所有公开知识库
 */
export default async function LearningCenterPage() {
  const banks = await getPublicBankCards();
  return <LearningCenterClient initialBanks={banks} />;
}
