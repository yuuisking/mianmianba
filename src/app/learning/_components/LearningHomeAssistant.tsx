"use client";

import { useMemo, useState, type ReactNode } from "react";
import DocumentAssistantPanel from "@/app/learning/_components/DocumentAssistantPanel";

type LearningHomeAssistantProps = {
  totalBanks: number;
  totalCategories: number;
};

/**
 * 学习中心首页右下悬浮智能助手，保持原有助手链路不变，只恢复入口与首页自由提问场景。
 * @param {LearningHomeAssistantProps} props 首页统计信息。
 * @returns {ReactNode} 首页悬浮助手面板。
 */
export default function LearningHomeAssistant(props: LearningHomeAssistantProps): ReactNode {
  const { totalBanks, totalCategories } = props;
  const [isOpen, setIsOpen] = useState(false);

  const kb = useMemo(
    () => ({
      id: "learning-home",
      name: "学习中心",
      subtitle: "学习中心自由提问",
      tags: ["学习中心", "智能助手", "自由提问"],
      updatedAt: new Date().toISOString(),
      stats: {
        topics: totalBanks,
        paths: totalCategories,
      },
    }),
    [totalBanks, totalCategories]
  );

  const content = useMemo(
    () => ({
      title: "学习中心自由提问",
      breadcrumb: ["学习中心", "首页", "自由提问"],
      quickFacts: [
        { k: "题库数量", v: `${totalBanks} 个题库` },
        { k: "分类数量", v: `${totalCategories} 个分类` },
        { k: "适用场景", v: "适合在进入具体题库前先梳理学习路径、刷题顺序和复习重点。" },
      ],
      sections: [
        {
          id: "learning-home-assistant",
          h2: "学习中心自由提问",
          paragraphs: [
            "这里保留面面吧智能助手的首页入口，你可以直接问学习路径、刷题优先级、某个方向应该从哪本题库开始。",
            "进入具体题库后，再结合题目页里的上下文助手深挖单题，这样首页负责方向规划，题目页负责知识深挖。",
          ],
        },
      ],
    }),
    [totalBanks, totalCategories]
  );

  return (
    <DocumentAssistantPanel
      kb={kb}
      topicId="learning-home-overview"
      content={content}
      topicOptions={[{ id: "learning-home-overview", title: "学习中心自由提问" }]}
      mode="general"
      isOpen={isOpen}
      onToggle={() => setIsOpen((current) => !current)}
    />
  );
}
