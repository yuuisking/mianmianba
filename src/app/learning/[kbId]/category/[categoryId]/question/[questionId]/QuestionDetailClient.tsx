"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import LearningDiagram from "@/components/learning/LearningDiagram";
import {
  InterviewTrainingPanel,
  SelfTestAssessmentCard,
} from "@/app/learning/_components/LearningAssessmentPanels";
import type { BankTreeGroup } from "@/lib/learning/bankStudio";
import type { LearningQuestionDetail } from "@/lib/learning/documentService";

type ReaderMode = "knowledge" | "quick" | "deep" | "interview";

type QuestionDetailClientProps = {
  kbId: string;
  questionId: string;
  initialQuestion: LearningQuestionDetail;
  initialTree: BankTreeGroup[];
};

const QuestionAssistantPanel = dynamic(() => import("@/app/learning/_components/QuestionAssistantPanel"), {
  ssr: false,
});

const difficultyLabel: Record<LearningQuestionDetail["difficulty"], { text: string; tone: string }> = {
  easy: { text: "简单", tone: "easy" },
  medium: { text: "中等", tone: "medium" },
  hard: { text: "困难", tone: "hard" },
};

/**
 * 返回当前题目难度对应的文案与颜色。
 * @param {LearningQuestionDetail["difficulty"]} difficulty 当前题目难度。
 * @returns {{ text: string; tone: string }} 渲染所需的难度信息。
 */
function getDifficultyMeta(difficulty: LearningQuestionDetail["difficulty"]): { text: string; tone: string } {
  return difficultyLabel[difficulty];
}

/**
 * 将大段文本包装为适合 Markdown 渲染的正文。
 * @param {string} value 原始文本。
 * @returns {string} 可以直接交给 Markdown 组件的正文。
 */
function toMarkdown(value: string): string {
  return value.trim();
}

/**
 * 将问题标题整理为更适合知识文档展示的主标题。
 * @param {string} title 原始题目标题。
 * @returns {string} 去掉问号后的文档标题。
 */
function toDocumentTitle(title: string): string {
  return title.replace(/[？?]+$/g, "").trim();
}

/**
 * 将结构化章节整理成连续 Markdown 文档，避免正文继续卡片化。
 * @param {LearningQuestionDetail["answer"]["sections"][number]} section 单个结构化章节。
 * @param {{ includeHeading?: boolean } | undefined} options 控制是否保留标题。
 * @returns {string} 可直接交给 Markdown 渲染的章节文档。
 */
function buildSectionMarkdown(
  section: LearningQuestionDetail["answer"]["sections"][number],
  options?: { includeHeading?: boolean }
): string {
  const blocks: string[] = [];
  if (options?.includeHeading !== false && section.h2) {
    blocks.push(`## ${section.h2}`);
  }
  if (section.paragraphs?.length) {
    blocks.push(section.paragraphs.join("\n\n"));
  }
  if (section.bullets?.length) {
    blocks.push(section.bullets.map((item) => `- ${item}`).join("\n"));
  }
  if (section.callout) {
    blocks.push(`> ${section.callout}`);
  }
  return blocks.join("\n\n").trim();
}

/**
 * 按学习阅读视角拆分当前题目的结构化章节。
 * @param {LearningQuestionDetail["answer"]["sections"]} sections 原始章节数组。
 * @returns {{ knowledge: LearningQuestionDetail["answer"]["sections"]; interview: LearningQuestionDetail["answer"]["sections"]; answer: LearningQuestionDetail["answer"]["sections"] }} 拆分后的章节桶。
 */
function splitStructuredSections(sections: LearningQuestionDetail["answer"]["sections"]): {
  knowledge: LearningQuestionDetail["answer"]["sections"];
  interview: LearningQuestionDetail["answer"]["sections"];
  answer: LearningQuestionDetail["answer"]["sections"];
} {
  const knowledge = sections.filter((item) => /知识点总结|核心知识|知识点拆解/.test(item.h2));
  const interview = sections.filter((item) => /面试常考|面试常问|高频追问|常见追问/.test(item.h2));
  const answer = sections.filter((item) => !knowledge.includes(item) && !interview.includes(item));
  return { knowledge, interview, answer };
}

/**
 * 将知识点章节整理成连续讲解文档，避免知识点模式出现碎片化气泡。
 * @param {LearningQuestionDetail["answer"]["quickFacts"]} quickFacts 当前题目的摘要信息。
 * @param {LearningQuestionDetail["answer"]["sections"]} sections 知识点章节数组。
 * @param {{ includeSectionHeadings?: boolean } | undefined} options 控制是否保留章节标题。
 * @returns {string} 适合知识点模式直接渲染的 Markdown 文档。
 */
function buildKnowledgeDocument(
  quickFacts: LearningQuestionDetail["answer"]["quickFacts"],
  sections: LearningQuestionDetail["answer"]["sections"],
  options?: { includeSectionHeadings?: boolean }
): string {
  const sectionBlocks = sections.flatMap((section) => {
    const parts: string[] = options?.includeSectionHeadings === false ? [] : [`## ${section.h2}`];
    if (section.paragraphs?.length) {
      parts.push(section.paragraphs.join("\n\n"));
    }
    if (section.bullets?.length) {
      parts.push(section.bullets.map((item) => `- ${item}`).join("\n"));
    }
    if (section.callout) {
      parts.push(`> ${section.callout}`);
    }
    return [parts.join("\n\n")];
  });

  const fallbackKnowledge = quickFacts
    .filter((item) => /知识点|学习重点|答题提醒/.test(item.k))
    .map((item) => item.v)
    .join("\n\n");

  const document = sectionBlocks.filter(Boolean).join("\n\n");
  return document || fallbackKnowledge;
}

/**
 * 生成单题页面跳转路径。
 * @param {string} kbId 题库标识。
 * @param {string} nextCategoryId 分类标识。
 * @param {string} nextQuestionId 题目标识。
 * @returns {string} 目标页面路径。
 */
function buildQuestionPath(kbId: string, nextCategoryId: string, nextQuestionId: string): string {
  return `/learning/${kbId}/category/${nextCategoryId}/question/${nextQuestionId}`;
}

/**
 * 构造跳转到专项训练页的地址，并预填当前文档主题、摘要和追问重点。
 * @param {LearningQuestionDetail} detail 当前文档详情。
 * @returns {string} 专项训练页链接。
 */
function buildTargetedPracticePath(detail: LearningQuestionDetail): string {
  const query = new URLSearchParams();
  const interviewQuestion = detail.answer.interviewContent?.question?.trim();
  const practiceTopic = interviewQuestion || detail.title;
  const practiceSummary =
    detail.answer.article?.strongSummary ||
    detail.answer.article?.conclusion ||
    detail.answer.detailedExplanation ||
    "";
  const practiceFocus = (
    detail.answer.interviewContent?.followUps?.map((item) => item.question) ||
    detail.answer.interviewContent?.essentialPoints?.map((item) => item.point) ||
    []
  )
    .slice(0, 3)
    .join("；");

  query.set("topic", practiceTopic);
  if (practiceSummary.trim()) {
    query.set("summary", practiceSummary.trim());
  }
  if (practiceFocus.trim()) {
    query.set("focus", practiceFocus.trim());
  }
  return `/practice?${query.toString()}`;
}

/**
 * Renders the demo-style chapter list used by the learning reader sidebar.
 * @param {{ kbId: string; tree: BankTreeGroup[]; activeQuestionId: string; bankName: string }} props Sidebar data.
 * @returns {ReactNode} Chapter navigation tree.
 */
function ChapterListNav(props: {
  kbId: string;
  tree: BankTreeGroup[];
  activeQuestionId: string;
  bankName: string;
}): ReactNode {
  const { kbId, tree, activeQuestionId, bankName } = props;
  const totalQuestions = tree.reduce((sum, group) => sum + group.questions.length, 0);

  return (
    <div className="learning-reader__nav-panel learning-reader__chapter-panel">
      <div className="learning-reader__chapter-head">
        <div>
          <span>章节列表</span>
          <strong>{bankName}</strong>
        </div>
        <em>{tree.length} 章 · {totalQuestions} 题</em>
      </div>

      <div className="learning-reader__chapter-list">
        {tree.map((group) => (
          <section key={group.id} className="learning-reader__tree-group">
            <div className="learning-reader__tree-group-title">
              <strong>{group.title}</strong>
              <span>{group.questions.length} 题</span>
            </div>
            <div className="learning-reader__tree-list">
              {group.questions.map((item, index) => (
                <Link
                  key={item.id}
                  href={buildQuestionPath(kbId, item.categoryId, item.id)}
                  className={`learning-reader__tree-link ${item.id === activeQuestionId ? "is-active" : ""}`}
                  aria-current={item.id === activeQuestionId ? "page" : undefined}
                  prefetch
                >
                  <span className="learning-reader__tree-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="learning-reader__tree-title">{item.title}</span>
                  <span className="learning-reader__tree-arrow">›</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * Converts a rich article section into a stable in-page anchor id.
 * @param {number} index Section index.
 * @returns {string} DOM id for the section.
 */
function buildArticleSectionId(index: number): string {
  return `article-section-${index + 1}`;
}

/**
 * Renders one rich article section from the v3 learning content protocol.
 * @param {{ section: NonNullable<LearningQuestionDetail["answer"]["article"]>["sections"][number]; index: number }} props Section render props.
 * @returns {ReactNode} Rich section body.
 */
function RichArticleSection(props: {
  section: NonNullable<LearningQuestionDetail["answer"]["article"]>["sections"][number];
  index: number;
}): ReactNode {
  const { section, index } = props;
  const sectionId = buildArticleSectionId(index);

  return (
    <section id={sectionId} className="learning-rich-section">
      {section.h2 ? <h2 className="learning-rich-section__title">{section.h2}</h2> : null}

      {section.type === "diagram" ? (
        <div className="learning-rich-diagram">
          {section.diagramCode ? (
            <LearningDiagram
              title={section.h2}
              diagramCode={section.diagramCode}
              fallbackDescription={section.fallbackDescription}
              diagramSpec={section.diagramSpec}
            />
          ) : section.fallbackDescription ? (
            <p>{section.fallbackDescription}</p>
          ) : null}
        </div>
      ) : section.type === "code" && section.codeExample ? (
        <div className="learning-rich-code">
          {section.codeExample.title ? <h3>{section.codeExample.title}</h3> : null}
          <pre>
            <code>{section.codeExample.code}</code>
          </pre>
          {section.codeExample.output ? (
            <div className="learning-rich-code__output">
              <strong>输出</strong>
              <pre>{section.codeExample.output}</pre>
            </div>
          ) : null}
          {section.codeExample.explanation || section.codeExample.outputExplanation ? (
            <p>{section.codeExample.explanation ?? section.codeExample.outputExplanation}</p>
          ) : null}
        </div>
      ) : section.type === "comparison" && section.comparison ? (
        <div className="learning-rich-table">
          {section.comparison.title ? <h3>{section.comparison.title}</h3> : null}
          <table>
            <thead>
              <tr>
                {section.comparison.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.comparison.rows.map((row, rowIndex) => (
                <tr key={`${sectionId}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${sectionId}-cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : section.type === "mistake" && section.mistake ? (
        <div className="learning-rich-mistake">
          <strong>{section.mistake.mistake}</strong>
          {section.mistake.whyWrong ? <p>为什么错：{section.mistake.whyWrong}</p> : null}
          {section.mistake.correct ? <p>正确理解：{section.mistake.correct}</p> : null}
        </div>
      ) : (
        <div className="learning-assistant-markdown learning-reader__markdown">
          {section.paragraphs?.map((paragraph, paragraphIndex) => (
            <ReactMarkdown key={`${sectionId}-p-${paragraphIndex}`} remarkPlugins={[remarkGfm]}>
              {toMarkdown(paragraph)}
            </ReactMarkdown>
          ))}
          {section.bullets?.length ? (
            <ul>
              {section.bullets.map((item, bulletIndex) => (
                <li key={`${sectionId}-b-${bulletIndex}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {section.callout ? <div className="learning-rich-callout">{section.callout}</div> : null}
      {section.highlight ? (
        <div className="learning-rich-highlight">
          <span>本节重点</span>
          <p>{section.highlight}</p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * 渲染一组可跳转的知识关联链接。
 * @param {{ title: string; items: Array<{ id: string; title: string; summary: string; path: string; relation?: string; chapterName?: string; bankName?: string }> }} props 分组标题与链接数组。
 * @returns {ReactNode} 关联链接列表。
 */
function RelationLinkList(props: {
  title: string;
  items: Array<{
    id: string;
    title: string;
    summary: string;
    path: string;
    relation?: string;
    chapterName?: string;
    bankName?: string;
  }>;
}): ReactNode {
  const { title, items } = props;
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="learning-relations__card">
      <div className="learning-relations__card-head">
        <strong>{title}</strong>
        <span>{items.length} 条</span>
      </div>
      <div className="learning-relations__list">
        {items.map((item) => (
          <Link key={item.id} href={item.path} className="learning-relations__item" prefetch>
            <div>
              <strong>{item.title}</strong>
              <span>{[item.relation, item.chapterName, item.bankName].filter(Boolean).join(" · ")}</span>
            </div>
            <p>{item.summary}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * 渲染知识卡片详情页的关联模块，补齐前置知识、相关题目和学习路径建议。
 * @param {{ question: LearningQuestionDetail }} props 当前文档详情。
 * @returns {ReactNode} 关联模块区域。
 */
function KnowledgeRelationsPanel(props: { question: LearningQuestionDetail }): ReactNode {
  const { question } = props;
  const relationBundle = question.knowledgeRelations;
  const relatedQuestions = question.relatedQuestions;
  const interviewAngles = relationBundle.interviewAngles;
  const hasContent =
    relationBundle.prerequisites.length > 0 ||
    relationBundle.relatedKnowledgeCards.length > 0 ||
    relationBundle.pathTips.length > 0 ||
    relatedQuestions.length > 0 ||
    interviewAngles.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <section className="learning-relations">
      <div className="learning-relations__header">
        <div>
          <span>关联学习</span>
          <h2>前置知识、相关题目和下一步路径</h2>
        </div>
        <p>把当前这篇文档接回完整学习链路，避免只看单题不串专题。</p>
      </div>

      <div className="learning-relations__grid">
        <RelationLinkList title="前置知识" items={relationBundle.prerequisites} />
        <RelationLinkList title="相关知识点" items={relationBundle.relatedKnowledgeCards} />

        {relatedQuestions.length > 0 || interviewAngles.length > 0 ? (
          <section className="learning-relations__card">
            <div className="learning-relations__card-head">
              <strong>相关面试题</strong>
              <span>{relatedQuestions.length} 道</span>
            </div>
            <div className="learning-relations__question-list">
              {relatedQuestions.map((item) => (
                <Link key={item.id} href={item.path} className="learning-relations__question-item" prefetch>
                  <div>
                    <strong>{item.title}</strong>
                    <span className={`learning-reader__difficulty learning-reader__difficulty--${difficultyLabel[item.difficulty].tone}`}>
                      {difficultyLabel[item.difficulty].text}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            {interviewAngles.length > 0 ? (
              <div className="learning-relations__angle-list">
                {interviewAngles.map((section) => (
                  <div key={section.title} className="learning-relations__angle-card">
                    <strong>{section.title}</strong>
                    <ul>
                      {section.bullets.map((item) => (
                        <li key={`${section.title}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {relationBundle.pathTips.length > 0 ? (
          <section className="learning-relations__card">
            <div className="learning-relations__card-head">
              <strong>学习路径建议</strong>
              <span>{relationBundle.pathTips.length} 条</span>
            </div>
            <div className="learning-relations__path-list">
              {relationBundle.pathTips.map((item) => (
                <article key={`${item.title}-${item.path ?? "inline"}`} className="learning-relations__path-item">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.summary}</p>
                  </div>
                  {item.path ? (
                    <Link href={item.path} className="learning-rich-train-button" prefetch>
                      去下一步
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 题目详情页客户端交互层，只负责模式切换、答案展开和进度记录，不再承担首屏取数。
 * @param {QuestionDetailClientProps} props 当前题目与整库目录的服务端首屏数据。
 * @returns {ReactNode} 可直接交给服务端页面使用的交互式阅读界面。
 */
export default function QuestionDetailClient(props: QuestionDetailClientProps): ReactNode {
  const { kbId, questionId, initialQuestion, initialTree } = props;
  const richArticle = initialQuestion.answer.article;
  const interviewContent = initialQuestion.answer.interviewContent;
  const contentMeta = initialQuestion.contentMeta;
  const readerLayoutClass =
    contentMeta?.layout === "knowledge" || richArticle ? "learning-reader--knowledge-layout" : "learning-reader--question-layout";
  const wideBodyClass = contentMeta?.needsWideBody !== false ? "learning-reader--wide-body" : "";
  const targetedPracticePath = useMemo(() => buildTargetedPracticePath(initialQuestion), [initialQuestion]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => (richArticle ? "deep" : "knowledge"));
  const [activeArticleSection, setActiveArticleSection] = useState<string>(() => buildArticleSectionId(0));

  useEffect(() => {
    setShowAnswer(false);
    setReaderMode(richArticle ? "deep" : "knowledge");
    setActiveArticleSection(buildArticleSectionId(0));
  }, [questionId, richArticle]);

  useEffect(() => {
    void fetch("/api/learning/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, viewed: true }),
    }).catch(() => null);
  }, [questionId]);

  const difficulty = getDifficultyMeta(initialQuestion.difficulty);
  const sectionBuckets = useMemo(
    () => splitStructuredSections(initialQuestion.answer.sections ?? []),
    [initialQuestion.answer.sections]
  );
  const knowledgeDocument = useMemo(
    () => buildKnowledgeDocument(initialQuestion.answer.quickFacts ?? [], sectionBuckets.knowledge),
    [initialQuestion.answer.quickFacts, sectionBuckets.knowledge]
  );
  const compactKnowledgeDocument = useMemo(
    () =>
      buildKnowledgeDocument(initialQuestion.answer.quickFacts ?? [], sectionBuckets.knowledge, {
        includeSectionHeadings: false,
      }),
    [initialQuestion.answer.quickFacts, sectionBuckets.knowledge]
  );
  const documentTitle = useMemo(() => toDocumentTitle(initialQuestion.title), [initialQuestion.title]);

  const articleToc = useMemo(
    () =>
      richArticle?.sections
        .map((section, index) => ({
          id: buildArticleSectionId(index),
          title: section.h2 || `第 ${index + 1} 节`,
        }))
        .filter((item) => item.title.trim().length > 0) ?? [],
    [richArticle]
  );

  useEffect(() => {
    if (!richArticle || readerMode !== "deep") {
      return;
    }

    const updateActiveSection = () => {
      let current = articleToc[0]?.id ?? buildArticleSectionId(0);
      for (const item of articleToc) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= 140) {
          current = item.id;
        }
      }
      setActiveArticleSection(current);
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    return () => window.removeEventListener("scroll", updateActiveSection);
  }, [articleToc, readerMode, richArticle]);

  if (richArticle) {
    const sources = initialQuestion.answer.sources ?? [];
    const selfTests = initialQuestion.answer.selfTests ?? [];
    const showDeepArticle = readerMode === "deep";
    const showQuickArticle = readerMode === "quick";
    const showInterviewArticle = readerMode === "interview";

    return (
      <section className={`learning-reader learning-reader--rich ${readerLayoutClass} ${wideBodyClass}`.trim()}>
        <div className="learning-reader__shell">
          <div className="learning-reader__layout learning-reader__layout--with-toc">
            <aside className="learning-reader__nav">
              <ChapterListNav
                kbId={kbId}
                tree={initialTree}
                activeQuestionId={initialQuestion.id}
                bankName={initialQuestion.knowledgeBase.name}
              />
            </aside>

            <main className="learning-reader__main">
              <div className="learning-reader__sticky-shell">
                <div className="learning-reader__toolbar">
                  <div className="learning-reader__header-top">
                    <div className="learning-reader__meta">
                      <span className={`learning-reader__difficulty learning-reader__difficulty--${difficulty.tone}`}>
                        {difficulty.text}
                      </span>
                      {initialQuestion.interviewFrequency ? (
                        <span className="learning-rich-chip">
                          {initialQuestion.interviewFrequency === "high"
                            ? "高频"
                            : initialQuestion.interviewFrequency === "medium"
                              ? "中频"
                              : "低频"}
                        </span>
                      ) : null}
                    </div>

                    <div className="learning-reader__top-actions">
                      <div className="learning-reader__mode-switch" role="tablist" aria-label="阅读模式切换">
                        <button
                          type="button"
                          className={readerMode === "quick" ? "is-active" : ""}
                          onClick={() => setReaderMode("quick")}
                        >
                          5分钟速读
                        </button>
                        <button
                          type="button"
                          className={readerMode === "deep" ? "is-active" : ""}
                          onClick={() => setReaderMode("deep")}
                        >
                          15分钟深读
                        </button>
                        <button
                          type="button"
                          className={readerMode === "interview" ? "is-active" : ""}
                          onClick={() => setReaderMode("interview")}
                        >
                          面试模式
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <header className="learning-reader__header learning-rich-header">
                  <div className="learning-reader__title-block">
                    <h1 className="learning-doc-title">{showInterviewArticle ? initialQuestion.title : documentTitle}</h1>
                  </div>
                </header>
              </div>

              <div className="learning-rich-content">
                {!showInterviewArticle ? (
                  <>
                    <div className="learning-rich-conclusion">
                      <p>{richArticle.conclusion}</p>
                    </div>

                    {richArticle.keyTakeaways.length > 0 ? (
                      <section className="learning-rich-panel learning-rich-panel--takeaways">
                        <h2>本题核心要点</h2>
                        <ol>
                          {richArticle.keyTakeaways.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                      </section>
                    ) : null}

                    {richArticle.learningGoals.length > 0 && !showQuickArticle ? (
                      <section className="learning-rich-panel">
                        <h2>学完这篇，你应该能回答</h2>
                        <ol>
                          {richArticle.learningGoals.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                      </section>
                    ) : null}

                    {richArticle.plainSummary ? (
                      <section className="learning-rich-panel learning-rich-panel--plain">
                        <h2>用大白话说</h2>
                        <p>{richArticle.plainSummary}</p>
                      </section>
                    ) : null}

                    {showDeepArticle ? (
                      <article className="learning-rich-article">
                        {richArticle.sections.map((section, index) => (
                          <RichArticleSection key={section.id || index} section={section} index={index} />
                        ))}
                      </article>
                    ) : null}

                    {showQuickArticle ? (
                      <section className="learning-rich-panel learning-rich-panel--quick">
                        <p>想看完整推导、图表和代码，可以切到 15 分钟深读。</p>
                      </section>
                    ) : null}

                    {richArticle.strongSummary && showDeepArticle ? (
                      <section className="learning-rich-summary">
                        <h2>最后总结</h2>
                        <p>{richArticle.strongSummary}</p>
                      </section>
                    ) : null}

                    {richArticle.plainRetell ? (
                      <section className="learning-rich-panel learning-rich-panel--retell">
                        <h2>你能这样复述</h2>
                        <p>{richArticle.plainRetell}</p>
                      </section>
                    ) : null}

                    {selfTests.length > 0 ? (
                      <section className="learning-rich-panel learning-rich-panel--tests">
                        <h2>自测</h2>
                        <div className="learning-rich-tests">
                          {selfTests.map((test, index) => (
                            <SelfTestAssessmentCard
                              key={`${test.question}-${index}`}
                              questionId={initialQuestion.id}
                              kbId={kbId}
                              categoryId={initialQuestion.category.id}
                              test={test}
                              index={index}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {sources.length > 0 ? (
                      <section className="learning-rich-sources">
                        <h2>来源与可信度</h2>
                        <div>
                          {sources.map((source) => (
                            <article key={`${source.title}-${source.url}`} className="learning-rich-source-card">
                              <a href={source.url} target="_blank" rel="noreferrer">
                                [{source.type || "来源"}] {source.title}
                              </a>
                              {source.applicableVersion ? <p>适用版本：{source.applicableVersion}</p> : null}
                              {source.facts && source.facts.length > 0 ? <p>本文引用事实：{source.facts.join("、")}</p> : null}
                              {source.reviewedAt ? <p>最近复核：{source.reviewedAt}</p> : null}
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <KnowledgeRelationsPanel question={initialQuestion} />
                  </>
                ) : (
                  <InterviewTrainingPanel
                    questionId={initialQuestion.id}
                    kbId={kbId}
                    categoryId={initialQuestion.category.id}
                    title={initialQuestion.title}
                    interviewContent={interviewContent}
                    targetedPracticePath={targetedPracticePath}
                    onBackToDeep={() => setReaderMode("deep")}
                  />
                )}

                {!showInterviewArticle ? (
                  <section className="learning-rich-train-footer">
                    <div>
                      <span>学完这篇后，建议直接去面试</span>
                      <strong>带着这篇文档的主题、摘要和追问重点进入专项训练。</strong>
                    </div>
                    <Link href={targetedPracticePath} className="learning-rich-train-button" prefetch>
                      去面试
                    </Link>
                  </section>
                ) : null}
              </div>
            </main>

            <aside className="learning-reader__toc" aria-label="当前文档目录">
              <div className="learning-reader__toc-panel">
                <strong>本文目录</strong>
                {articleToc.length > 0 && showDeepArticle ? (
                  <nav>
                    {articleToc.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={activeArticleSection === item.id ? "is-active" : ""}
                      >
                        {item.title}
                      </a>
                    ))}
                  </nav>
                ) : (
                  <nav>
                    <button type="button" className={readerMode === "quick" ? "is-active" : ""} onClick={() => setReaderMode("quick")}>
                      速读
                    </button>
                    <button type="button" className={readerMode === "deep" ? "is-active" : ""} onClick={() => setReaderMode("deep")}>
                      深读
                    </button>
                    <button type="button" className={readerMode === "interview" ? "is-active" : ""} onClick={() => setReaderMode("interview")}>
                      训练
                    </button>
                  </nav>
                )}
              </div>
            </aside>
          </div>
        </div>
        <QuestionAssistantPanel
          questionId={initialQuestion.id}
          kbId={kbId}
          categoryId={initialQuestion.category.id}
          questionTitle={initialQuestion.title}
          categoryName={initialQuestion.category.name}
          knowledgeBaseName={initialQuestion.knowledgeBase.name}
        />
      </section>
    );
  }

  return (
    <section className={`learning-reader ${readerLayoutClass} ${wideBodyClass}`.trim()}>
      <div className="learning-reader__shell">
        <div className="learning-reader__layout">
          <aside className="learning-reader__nav">
            <ChapterListNav
              kbId={kbId}
              tree={initialTree}
              activeQuestionId={initialQuestion.id}
              bankName={initialQuestion.knowledgeBase.name}
            />
          </aside>

          <main className="learning-reader__main">
            <div className="learning-reader__sticky-shell">
              <div className="learning-reader__toolbar">
                <div className="learning-reader__header-top">
                  <div className="learning-reader__meta">
                    <span className={`learning-reader__difficulty learning-reader__difficulty--${difficulty.tone}`}>
                      {difficulty.text}
                    </span>
                  </div>

                  <div className="learning-reader__top-actions">
                    <div className="learning-reader__mode-switch" role="tablist" aria-label="阅读模式切换">
                      <button
                        type="button"
                        className={readerMode === "knowledge" ? "is-active" : ""}
                        onClick={() => setReaderMode("knowledge")}
                      >
                        知识点模式
                      </button>
                      <button
                        type="button"
                        className={readerMode === "interview" ? "is-active" : ""}
                        onClick={() => setReaderMode("interview")}
                      >
                        面试模式
                      </button>
                    </div>
                    <div className="learning-reader__actions">
                      <button type="button" className="learning-text-action" onClick={() => setReaderMode("interview")}>
                        看面试模式
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <header className="learning-reader__header">
                <div className="learning-reader__title-block">
                  <h1 className="learning-doc-title">{readerMode === "knowledge" ? documentTitle : initialQuestion.title}</h1>
                </div>
              </header>
            </div>

            <div className="learning-reader__content">
              {readerMode === "interview" ? (
                <section id="question-stem" className="learning-reader__section learning-reader__article">
                  <InterviewTrainingPanel
                    questionId={initialQuestion.id}
                    kbId={kbId}
                    categoryId={initialQuestion.category.id}
                    title={initialQuestion.title}
                    interviewContent={interviewContent}
                    targetedPracticePath={targetedPracticePath}
                    onBackToDeep={() => setReaderMode("knowledge")}
                  />
                </section>
              ) : null}

              {readerMode === "knowledge" ? (
                knowledgeDocument ? (
                  <section id="question-knowledge" className="learning-reader__section learning-reader__article">
                    <div className="learning-assistant-markdown learning-reader__markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{toMarkdown(knowledgeDocument)}</ReactMarkdown>
                    </div>
                  </section>
                ) : null
              ) : (
                <>
                  {sectionBuckets.interview.length > 0 ? (
                    <section id="question-interview" className="learning-reader__section learning-reader__article">
                      <h2 className="learning-doc-section-title">面试常问</h2>
                      <div className="learning-assistant-markdown learning-reader__markdown">
                        {sectionBuckets.interview.map((section) => (
                          <ReactMarkdown key={section.id} remarkPlugins={[remarkGfm]}>
                            {toMarkdown(buildSectionMarkdown(section, { includeHeading: false }))}
                          </ReactMarkdown>
                        ))}
                      </div>
                      {!showAnswer ? (
                        <button
                          type="button"
                          className="learning-reader__inline-answer"
                          onClick={() => setShowAnswer(true)}
                        >
                          查看答案
                        </button>
                      ) : null}
                    </section>
                  ) : null}

                  {initialQuestion.answer.quickFacts.length > 0 || sectionBuckets.knowledge.length > 0 ? (
                    <section id="question-knowledge" className="learning-reader__section learning-reader__article">
                      <h2 className="learning-doc-section-title">知识点总结</h2>
                      {knowledgeDocument ? (
                        <div className="learning-assistant-markdown learning-reader__markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {toMarkdown(compactKnowledgeDocument)}
                          </ReactMarkdown>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </>
              )}

              {showAnswer ? (
                <section id="question-answer" className="learning-reader__section learning-reader__article">
                  <h2 className="learning-doc-section-title">参考答案和解析</h2>
                  {sectionBuckets.answer.length > 0 ? (
                    <div className="learning-assistant-markdown learning-reader__markdown">
                      {sectionBuckets.answer.map((section) => (
                        <ReactMarkdown key={section.id} remarkPlugins={[remarkGfm]}>
                          {toMarkdown(buildSectionMarkdown(section, { includeHeading: false }))}
                        </ReactMarkdown>
                      ))}
                    </div>
                  ) : initialQuestion.answer.detailedExplanation ? (
                    <div className="learning-assistant-markdown learning-reader__markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {toMarkdown(initialQuestion.answer.detailedExplanation)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="learning-empty-state" style={{ minHeight: "180px" }}>
                      <p>当前题目还没有详细解析。</p>
                    </div>
                  )}

                  {initialQuestion.answer.codeExample ? (
                    <div className="learning-reader__code-block">
                      <h3>代码示例</h3>
                      <pre>
                        <code>{initialQuestion.answer.codeExample}</code>
                      </pre>
                    </div>
                  ) : null}

                  {initialQuestion.answer.diagram ? (
                    <div className="learning-reader__diagram-block">
                      <h3>图示</h3>
                      <LearningDiagram title="图示" diagramCode={initialQuestion.answer.diagram} />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {readerMode === "knowledge" ? <KnowledgeRelationsPanel question={initialQuestion} /> : null}

              {readerMode === "knowledge" ? (
                <section className="learning-reader__section learning-reader__article learning-reader__practice-footer">
                  <h2 className="learning-doc-section-title">学完后去面试</h2>
                  <div className="learning-assistant-markdown learning-reader__markdown">
                    <p>如果你已经看完这篇文档，下一步不要再回到旧刷题设置页，直接进入专项训练，把这篇的主题、摘要和追问重点带进去练表达。</p>
                  </div>
                  <div className="learning-reader__interview-cta">
                    <Link href={targetedPracticePath} className="learning-rich-train-button" prefetch>
                      去面试
                    </Link>
                  </div>
                </section>
              ) : null}
            </div>
          </main>
        </div>
      </div>
      <QuestionAssistantPanel
        questionId={initialQuestion.id}
        kbId={kbId}
        categoryId={initialQuestion.category.id}
        questionTitle={initialQuestion.title}
        categoryName={initialQuestion.category.name}
        knowledgeBaseName={initialQuestion.knowledgeBase.name}
      />
    </section>
  );
}
