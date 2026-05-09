"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import LearningHomeAssistant from "@/app/learning/_components/LearningHomeAssistant";

type BankCard = {
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

type LearningCenterClientProps = {
  initialBanks: BankCard[];
};

/**
 * 格式化题库更新时间。
 * @param {string} value 原始时间字符串。
 * @returns {string} 适合列表展示的日期文案。
 */
function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "最近更新";
  }

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Builds a compact two-line summary for one bank card.
 * @param {BankCard} bank Current bank item.
 * @returns {string} Concise summary copy for the card body.
 */
function buildBankSummary(bank: BankCard): string {
  const summary =
    bank.description ||
    bank.subtitle ||
    `${bank.featuredCategories.slice(0, 3).join("、")} 等方向高频题目汇总。`;
  return summary.replace(/，适合系统刷题。?$/g, "").replace(/，是.+?题库。?$/g, "。").trim();
}

/**
 * 为题库卡片生成一组克制的轻量主题色。
 * @param {number} index 当前卡片索引。
 * @returns {{ background: string; border: string; accent: string }} 卡片配色。
 */
function buildBankTone(index: number): { background: string; border: string; accent: string } {
  const tones = [
    { background: "rgba(235, 242, 255, 0.9)", border: "rgba(120, 154, 212, 0.22)", accent: "#6d8fcf" },
    { background: "rgba(239, 246, 239, 0.92)", border: "rgba(112, 156, 123, 0.2)", accent: "#6d9a77" },
    { background: "rgba(255, 244, 232, 0.92)", border: "rgba(214, 147, 87, 0.22)", accent: "#d4854e" },
    { background: "rgba(245, 240, 255, 0.92)", border: "rgba(143, 120, 201, 0.2)", accent: "#8d74c6" },
  ];

  return tones[index % tones.length];
}

/**
 * 公开学习中心首页。
 * @param {LearningCenterClientProps} props 服务端预注入的首页题库数据。
 * @returns {ReactNode} 只保留搜索、分类与题库列表的极简首页。
 */
export default function LearningCenterClient(props: LearningCenterClientProps): ReactNode {
  const { initialBanks } = props;
  const [banks] = useState<BankCard[]>(initialBanks);
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const categories = useMemo(() => {
    const next = new Set<string>();
    for (const bank of banks) {
      for (const item of bank.featuredCategories) {
        if (item.trim()) {
          next.add(item);
        }
      }
    }

    const sorted = Array.from(next);
    const visible = sorted.slice(0, 14);
    if (activeCategory !== "all" && !visible.includes(activeCategory) && sorted.includes(activeCategory)) {
      visible.push(activeCategory);
    }
    return ["all", ...visible];
  }, [activeCategory, banks]);

  const filteredBanks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return banks.filter((bank) => {
      const matchesKeyword =
        !normalizedKeyword ||
        bank.name.toLowerCase().includes(normalizedKeyword) ||
        bank.subtitle.toLowerCase().includes(normalizedKeyword) ||
        bank.description.toLowerCase().includes(normalizedKeyword) ||
        bank.tags.some((item) => item.toLowerCase().includes(normalizedKeyword)) ||
        bank.featuredCategories.some((item) => item.toLowerCase().includes(normalizedKeyword));
      const matchesCategory =
        activeCategory === "all" || bank.featuredCategories.some((item) => item === activeCategory);

      return matchesKeyword && matchesCategory;
    });
  }, [activeCategory, banks, keyword]);

  return (
    <section className="minimal-learning">
      <div className="minimal-learning__shell">
        <section className="minimal-learning__controls">
          <label className="minimal-learning__search" htmlFor="learning-bank-keyword">
            <span>搜索</span>
            <input
              id="learning-bank-keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索题库、标签、分类"
            />
          </label>

          <div className="minimal-learning__categories" aria-label="分类筛选">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={activeCategory === category ? "is-active" : ""}
                onClick={() => setActiveCategory(category)}
              >
                {category === "all" ? "全部" : category}
              </button>
            ))}
          </div>
        </section>

        <section className="minimal-learning__list-section">
          <div className="minimal-learning__list-head">
            <h2>题库列表</h2>
            <div className="minimal-learning__summary">
              <span>{filteredBanks.length} 个结果</span>
              <span>{banks.length} 个题库</span>
              <span>{categories.length > 1 ? categories.length - 1 : 0} 个分类</span>
            </div>
          </div>

          <div className="minimal-learning__list">
            {filteredBanks.length > 0 ? (
              filteredBanks.map((bank, index) => (
                <Link
                  key={bank.id}
                  className="minimal-learning__bank"
                  href={bank.defaultQuestionPath || `/learning/${bank.id}`}
                  prefetch
                  style={
                    {
                      "--bank-card-bg": buildBankTone(index).background,
                      "--bank-card-border": buildBankTone(index).border,
                      "--bank-card-accent": buildBankTone(index).accent,
                    } as CSSProperties
                  }
                >
                  <div className="minimal-learning__bank-top">
                    <div className="minimal-learning__bank-title">
                      <strong>{bank.name}</strong>
                      <span>{bank.categoryCount} 个分类 · {bank.questionCount} 道题</span>
                    </div>
                  </div>

                  <div className="minimal-learning__bank-main">
                    {bank.subtitle ? <span className="minimal-learning__bank-subtitle">{bank.subtitle}</span> : null}
                    <p>{buildBankSummary(bank)}</p>
                  </div>

                  <div className="minimal-learning__bank-tags">
                    {bank.featuredCategories.slice(0, 3).map((item) => (
                      <span key={`${bank.id}-${item}`}>{item}</span>
                    ))}
                  </div>

                  <div className="minimal-learning__bank-footer">
                    <div className="minimal-learning__bank-footer-meta">
                      <span>{bank.questionCount} 题</span>
                      <span>{formatUpdatedAt(bank.updatedAt)}</span>
                    </div>
                    <span className="minimal-learning__bank-enter">进入</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="minimal-learning__empty">当前没有匹配的题库。</div>
            )}
          </div>
        </section>
      </div>
      <LearningHomeAssistant totalBanks={banks.length} totalCategories={Math.max(categories.length - 1, 0)} />
    </section>
  );
}
