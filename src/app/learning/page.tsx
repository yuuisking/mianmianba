import LearningCenterClient from "./_components/LearningCenterClient";
import { getPublicBankCards } from "@/lib/learning/bankStudio";
import { listKnowledgeCardPreviews, listLearningPathPreviews } from "@/lib/learning/knowledgeCardStudio";

export const dynamic = "force-dynamic";

/**
 * 学习中心入口页 - 展示所有公开知识库
 */
export default async function LearningCenterPage() {
  const [banks, knowledgeCards, learningPaths] = await Promise.all([
    getPublicBankCards(),
    listKnowledgeCardPreviews(),
    listLearningPathPreviews(),
  ]);

  return (
    <LearningCenterClient
      initialBanks={banks}
      initialKnowledgeCards={knowledgeCards}
      initialLearningPaths={learningPaths}
    />
  );
}
