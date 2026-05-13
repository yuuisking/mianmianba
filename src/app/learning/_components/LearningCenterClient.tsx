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

type KnowledgeCardPreview = {
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

type LearningPathPreview = {
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

type LearningCenterClientProps = {
  initialBanks: BankCard[];
  initialKnowledgeCards: KnowledgeCardPreview[];
  initialLearningPaths: LearningPathPreview[];
};

type LearningSheetKey = "knowledge_cards" | "learning_paths" | "bank_list";

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
 * 为知识卡片生成稳定的轻量视觉语气。
 * @param {"java" | "database" | "cache" | "jvm"} tone 卡片 tone。
 * @returns {{ background: string; border: string; accent: string }} 对应配色。
 */
function buildKnowledgeTone(
  tone: "java" | "database" | "cache" | "jvm"
): { background: string; border: string; accent: string } {
  const toneMap = {
    java: { background: "rgba(245, 240, 255, 0.92)", border: "rgba(143, 120, 201, 0.18)", accent: "#8d74c6" },
    database: { background: "rgba(235, 242, 255, 0.9)", border: "rgba(120, 154, 212, 0.2)", accent: "#6d8fcf" },
    cache: { background: "rgba(239, 246, 239, 0.92)", border: "rgba(112, 156, 123, 0.2)", accent: "#6d9a77" },
    jvm: { background: "rgba(255, 244, 232, 0.92)", border: "rgba(214, 147, 87, 0.2)", accent: "#d4854e" },
  } satisfies Record<KnowledgeCardPreview["tone"], { background: string; border: string; accent: string }>;
  return toneMap[tone];
}

/**
 * 将分钟数格式化为首页卡片可读文案。
 * @param {number} minutes 预计阅读时长。
 * @returns {string} 时长文案。
 */
function formatMinutes(minutes: number): string {
  return `${minutes} 分钟`;
}

/**
 * 判断一张知识卡片是否命中当前搜索与分类条件。
 * @param {KnowledgeCardPreview} card 知识卡片。
 * @param {string} normalizedKeyword 已归一化的关键字。
 * @param {string} activeCategory 当前分类。
 * @returns {boolean} 是否保留。
 */
function matchesKnowledgeCard(card: KnowledgeCardPreview, normalizedKeyword: string, activeCategory: string): boolean {
  const haystack = [card.title, card.summary, card.bankName, card.chapterName, card.reason, ...card.tags].join(" ").toLowerCase();
  const matchesKeyword = !normalizedKeyword || haystack.includes(normalizedKeyword);
  const matchesCategory =
    activeCategory === "all" ||
    card.tags.some((item) => item === activeCategory) ||
    card.chapterName.includes(activeCategory) ||
    card.bankName.includes(activeCategory);
  return matchesKeyword && matchesCategory;
}

/**
 * 判断一条学习路径是否命中当前搜索与分类条件。
 * @param {LearningPathPreview} path 学习路径预览。
 * @param {string} normalizedKeyword 已归一化的关键字。
 * @param {string} activeCategory 当前分类。
 * @returns {boolean} 是否保留。
 */
function matchesLearningPath(path: LearningPathPreview, normalizedKeyword: string, activeCategory: string): boolean {
  const haystack = [path.title, path.summary, path.audience, ...path.tags, ...path.steps.map((item) => item.title)].join(" ").toLowerCase();
  const matchesKeyword = !normalizedKeyword || haystack.includes(normalizedKeyword);
  const matchesCategory =
    activeCategory === "all" ||
    path.tags.some((item) => item === activeCategory) ||
    path.title.includes(activeCategory);
  return matchesKeyword && matchesCategory;
}

/**
 * 生成学习入口的 sheet 定义，确保三类内容只展示一个当前面板。
 * @returns {Array<{ key: LearningSheetKey; label: string; emptyLabel: string; title: string; description: string }>} sheet 配置。
 */
function buildLearningSheets(): Array<{
  key: LearningSheetKey;
  label: string;
  emptyLabel: string;
  title: string;
  description: string;
}> {
  return [
    {
      key: "knowledge_cards",
      label: "知识卡片",
      emptyLabel: "当前没有匹配的知识卡片。",
      title: "知识卡片",
      description: "先补概念和原理，再进入更长的专题学习。",
    },
    {
      key: "learning_paths",
      label: "学习路径",
      emptyLabel: "当前没有匹配的学习路径。",
      title: "学习路径",
      description: "把零散知识串成完整专题，按顺序往下走。",
    },
    {
      key: "bank_list",
      label: "题库列表",
      emptyLabel: "当前没有匹配的题库。",
      title: "题库列表",
      description: "最后回到题库和面试训练，把学到的内容说出来。",
    },
  ];
}

/**
 * 公开学习中心首页。
 * @param {LearningCenterClientProps} props 服务端预注入的首页题库、知识卡片与学习路径数据。
 * @returns {ReactNode} 具备三类入口的学习中心首页。
 */
export default function LearningCenterClient(props: LearningCenterClientProps): ReactNode {
  const { initialBanks, initialKnowledgeCards, initialLearningPaths } = props;
  const [banks] = useState<BankCard[]>(initialBanks);
  const [knowledgeCards] = useState<KnowledgeCardPreview[]>(initialKnowledgeCards);
  const [learningPaths] = useState<LearningPathPreview[]>(initialLearningPaths);
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSheet, setActiveSheet] = useState<LearningSheetKey>("knowledge_cards");

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

  const filteredKnowledgeCards = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return knowledgeCards.filter((card) => matchesKnowledgeCard(card, normalizedKeyword, activeCategory));
  }, [activeCategory, keyword, knowledgeCards]);

  const filteredLearningPaths = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return learningPaths.filter((path) => matchesLearningPath(path, normalizedKeyword, activeCategory));
  }, [activeCategory, keyword, learningPaths]);

  const learningSheets = useMemo(() => buildLearningSheets(), []);

  const activeSheetConfig = learningSheets.find((item) => item.key === activeSheet) ?? learningSheets[0];

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
              placeholder="搜索题库、知识卡片、路径、标签"
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

        <section className="minimal-learning__sheet-switcher" aria-label="学习入口切换">
          {learningSheets.map((sheet) => (
            <button
              key={sheet.key}
              type="button"
              className={activeSheet === sheet.key ? "is-active" : ""}
              onClick={() => setActiveSheet(sheet.key)}
            >
              {sheet.label}
            </button>
          ))}
        </section>

        <section className="minimal-learning__lane-section">
          <div className="minimal-learning__list-head">
            <h2>{activeSheetConfig.title}</h2>
            <p className="minimal-learning__sheet-description">{activeSheetConfig.description}</p>
          </div>

          {activeSheet === "knowledge_cards" ? (
            <div className="minimal-learning__knowledge-grid">
              {filteredKnowledgeCards.length > 0 ? (
                filteredKnowledgeCards.map((card) => {
                  const tone = buildKnowledgeTone(card.tone);
                  return (
                    <Link
                      key={card.id}
                      href={card.path}
                      className="minimal-learning__knowledge-card"
                      prefetch
                      style={
                        {
                          "--knowledge-card-bg": tone.background,
                          "--knowledge-card-border": tone.border,
                          "--knowledge-card-accent": tone.accent,
                        } as CSSProperties
                      }
                    >
                      <div className="minimal-learning__knowledge-top">
                        <div>
                          <strong>{card.title}</strong>
                          <span>
                            {card.bankName} · {card.chapterName}
                          </span>
                        </div>
                        {card.diagramRequired ? <em>含流程图</em> : <em>纯知识阅读</em>}
                      </div>
                      <p>{card.summary}</p>
                      <div className="minimal-learning__knowledge-reason">{card.reason}</div>
                      <div className="minimal-learning__knowledge-tags">
                        {card.tags.slice(0, 4).map((item) => (
                          <span key={`${card.id}-${item}`}>{item}</span>
                        ))}
                      </div>
                      <div className="minimal-learning__knowledge-footer">
                        <div className="minimal-learning__bank-footer-meta">
                          <span>{formatMinutes(card.estimatedMinutes)}</span>
                          <span>{formatUpdatedAt(card.updatedAt)}</span>
                        </div>
                        <span className="minimal-learning__bank-enter">开始学习</span>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="minimal-learning__empty">{activeSheetConfig.emptyLabel}</div>
              )}
            </div>
          ) : null}

          {activeSheet === "learning_paths" ? (
            <div className="minimal-learning__path-grid">
              {filteredLearningPaths.length > 0 ? (
                filteredLearningPaths.map((path) => (
                  <article key={path.id} className="minimal-learning__path-card">
                    <div className="minimal-learning__path-head">
                      <div>
                        <strong>{path.title}</strong>
                        <span>{path.audience}</span>
                      </div>
                      {path.firstPath ? (
                        <Link href={path.firstPath} className="minimal-learning__bank-enter" prefetch>
                          从第一步开始
                        </Link>
                      ) : null}
                    </div>
                    <p>{path.summary}</p>
                    <div className="minimal-learning__knowledge-tags">
                      {path.tags.map((item) => (
                        <span key={`${path.id}-${item}`}>{item}</span>
                      ))}
                    </div>
                    <ol className="minimal-learning__path-steps">
                      {path.steps.map((step, index) => (
                        <li key={`${path.id}-${step.path}`}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <Link href={step.path} prefetch>
                              {step.title}
                            </Link>
                            <p>{step.summary}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))
              ) : (
                <div className="minimal-learning__empty">{activeSheetConfig.emptyLabel}</div>
              )}
            </div>
          ) : null}

          {activeSheet === "bank_list" ? (
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
                <div className="minimal-learning__empty">{activeSheetConfig.emptyLabel}</div>
              )}
            </div>
          ) : null}
        </section>
      </div>
      <LearningHomeAssistant totalBanks={banks.length} totalCategories={Math.max(categories.length - 1, 0)} />
    </section>
  );
}
