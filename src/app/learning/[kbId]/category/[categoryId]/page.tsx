"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";

type QuestionListItem = {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  interviewFrequency: "high" | "medium" | "low";
  createdAt: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type LearningProgress = {
  overview: {
    totalViewed: number;
    totalAttempted: number;
    totalMastered: number;
    totalBookmarked: number;
    totalPublishedQuestions: number;
    masteryRate: number;
  };
  categoryProgress: Array<{
    categoryId: string;
    categoryName: string;
    totalQuestions: number;
    masteredCount: number;
    viewedCount: number;
    masteryRate: number;
  }>;
};

const difficultyLabel: Record<string, { text: string; color: string }> = {
  easy: { text: "简单", color: "#788c5d" },
  medium: { text: "中等", color: "#d97757" },
  hard: { text: "困难", color: "#c44" },
};

const frequencyLabel: Record<string, string> = {
  high: "高频",
  medium: "中频",
  low: "低频",
};

/**
 * 返回题目难度对应的中文标签与颜色。
 * @param {QuestionListItem["difficulty"]} difficulty 当前难度值。
 * @returns {{ text: string; color: string }} 渲染所需的标签信息。
 */
function getDifficultyMeta(difficulty: QuestionListItem["difficulty"]): { text: string; color: string } {
  return difficultyLabel[difficulty];
}

/**
 * 分类题目列表页，负责展示题目清单、筛选与进入学习/刷题模式的入口。
 * @returns {ReactNode} 分类题目列表页。
 */
export default function CategoryQuestionsPage(): ReactNode {
  const router = useRouter();
  const params = useParams();
  const kbId = params.kbId as string;
  const categoryId = params.categoryId as string;

  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [kbName, setKbName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("");
  const [progress, setProgress] = useState<LearningProgress["categoryProgress"][number] | null>(null);

  /**
   * 拉取知识库名、分类名与当前分类下的题目列表。
   * @param {number} [page=1] 当前分页页码。
   * @returns {Promise<void>} 请求结束。
   */
  const loadData = useCallback(async (page = 1): Promise<void> => {
    try {
      setLoading(true);
      setError("");

      // 获取分类信息
      const catRes = await fetch(`/api/learning/kbs/${kbId}/categories`);
      const cats = (await catRes.json().catch(() => [])) as unknown;
      if (Array.isArray(cats)) {
        const currentCat = cats.find((c: { id: string; name: string }) => c.id === categoryId);
        if (currentCat) setCategoryName(currentCat.name);
      }

      // 获取知识库名称
      const kbRes = await fetch(`/api/learning/kbs`);
      const kbs = (await kbRes.json().catch(() => [])) as unknown;
      if (Array.isArray(kbs)) {
        const currentKb = kbs.find((k: { id: string; name: string }) => k.id === kbId);
        if (currentKb) setKbName(currentKb.name);
      }

      // 获取题目列表
      const query = new URLSearchParams();
      query.set("page", String(page));
      query.set("pageSize", "20");
      query.set("kbId", kbId);
      if (difficultyFilter) query.set("difficulty", difficultyFilter);

      const qRes = await fetch(`/api/learning/categories/${categoryId}/questions?${query.toString()}`);
      const qData = (await qRes.json().catch(() => ({}))) as unknown;
      if (!qRes.ok) {
        const message =
          typeof qData === "object" && qData && "error" in qData && typeof qData.error === "string"
            ? qData.error
            : "加载题目失败";
        throw new Error(message);
      }

      if (
        typeof qData === "object" &&
        qData &&
        "questions" in qData &&
        Array.isArray(qData.questions) &&
        "pagination" in qData &&
        typeof qData.pagination === "object" &&
        qData.pagination
      ) {
        setQuestions(qData.questions as QuestionListItem[]);
        setPagination(qData.pagination as Pagination);
      } else {
        setQuestions([]);
        setPagination(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [categoryId, difficultyFilter, kbId]);

  /**
   * 拉取用户在当前分类下的学习进度；未登录时静默忽略即可。
   * @returns {Promise<void>} 进度请求结束。
   */
  const loadProgress = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/learning/progress", { cache: "no-store" });
      if (response.status === 401) {
        return;
      }
      const data = (await response.json().catch(() => null)) as LearningProgress | null;
      if (!response.ok || !data) {
        return;
      }
      setProgress(data.categoryProgress.find((item) => item.categoryId === categoryId) ?? null);
    } catch {
      // 进度概览是增强信息，失败时不阻断题目列表。
    }
  }, [categoryId]);

  const progressSummary = useMemo(() => {
    if (!progress) {
      return null;
    }
    return {
      viewed: progress.viewedCount,
      mastered: progress.masteredCount,
      masteryRate: progress.masteryRate,
      totalQuestions: progress.totalQuestions,
    };
  }, [progress]);

  useEffect(() => {
    if (categoryId) {
      void loadData();
      void loadProgress();
    }
  }, [categoryId, difficultyFilter, loadData, loadProgress]);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <div className="panel">
          <div className="notice">{error}</div>
          <button className="btn btn-primary" onClick={() => router.push("/learning")}>
            返回学习中心
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="learning-entry">
        <section className="learning-entry__header">
          <div>
            <div className="breadcrumbs">
              <span className="chip" style={{ cursor: "pointer" }} onClick={() => router.push("/learning")}>
                学习中心
              </span>
              <span>·</span>
              <span className="chip" style={{ cursor: "pointer" }} onClick={() => router.push(`/learning/${kbId}`)}>
                {kbName}
              </span>
              <span>·</span>
              <span className="text-muted">{categoryName}</span>
            </div>
            <h1>{categoryName}</h1>
            <p>这里是按题目组织的学习目录。建议先顺着列表阅读，再在关键题上进入刷题模式。</p>
          </div>
          <button
            className="learning-entry__planner-toggle"
            onClick={() => router.push(`/learning/${kbId}/category/${categoryId}/practice`)}
          >
            进入刷题模式
          </button>
        </section>

        <section className="learning-entry__hero">
          <article className="learning-kb-card learning-entry__hero-copy">
            <div className="learning-entry__catalog-title">Category Snapshot</div>
            <h2 style={{ margin: "0.4rem 0 0.9rem", fontSize: "1.72rem" }}>从列表读题，再切到单题阅读工作区。</h2>
            <p>
              当前分类下的题目会按难度和高频标签组织。点进单题后会进入语雀式阅读界面，题干、答案、来源与关联题会集中呈现。
            </p>
            <div className="learning-entry__hero-metrics">
              <div className="learning-entry__metric">
                <strong>{pagination?.total ?? 0}</strong>
                <span>当前题量</span>
              </div>
              <div className="learning-entry__metric">
                <strong>{progressSummary?.viewed ?? 0}</strong>
                <span>已查看</span>
              </div>
              <div className="learning-entry__metric">
                <strong>{progressSummary?.masteryRate ?? 0}%</strong>
                <span>掌握率</span>
              </div>
            </div>
          </article>

          <aside className="learning-kb-card learning-planner-card">
            <span className="learning-planner-card__eyebrow">Filter</span>
            <h2>当前阅读策略</h2>
            <div className="learning-summary-card">
              <p>高频题优先读，低频题补边界。</p>
              <p>简单题扫概念，中高难题看原理与表达方式。</p>
              <p>掌握率仅统计已登录用户的个人进度数据。</p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className={`btn ${!difficultyFilter ? "btn-primary" : "btn-outline"}`}
                onClick={() => setDifficultyFilter("")}
              >
                全部
              </button>
              {["easy", "medium", "hard"].map((difficulty) => (
                <button
                  key={difficulty}
                  className={`btn ${difficultyFilter === difficulty ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setDifficultyFilter(difficulty)}
                >
                  {difficultyLabel[difficulty].text}
                </button>
              ))}
            </div>
          </aside>
        </section>

        {questions.length === 0 ? (
          <div className="learning-empty-state">
            <div className="learning-empty-state__icon">Q</div>
            <p>该分类暂时没有符合筛选条件的题目。</p>
          </div>
        ) : (
          <section className="learning-kb-list">
            {questions.map((question, index) => {
              const difficulty = getDifficultyMeta(question.difficulty);
              return (
                <article key={question.id} className="learning-kb-list__item">
                  <div className="learning-kb-list__main">
                    <h2>{question.title}</h2>
                    <p>
                      第 {((pagination?.page ?? 1) - 1) * (pagination?.pageSize ?? 20) + index + 1} 题 ·
                      {question.tags.length > 0 ? ` ${question.tags.join(" / ")}` : " 结构化答案与关联题已整理"}
                    </p>
                  </div>
                  <div className="learning-kb-list__side">
                    <span style={{ color: difficulty.color, fontWeight: 700 }}>{difficulty.text}</span>
                    <span>{frequencyLabel[question.interviewFrequency]}</span>
                    <button
                      className="btn btn-outline"
                      onClick={() => router.push(`/learning/${kbId}/category/${categoryId}/question/${question.id}`)}
                    >
                      阅读题目
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                className={`btn ${pageNumber === pagination.page ? "btn-primary" : "btn-outline"}`}
                style={{ minWidth: "2.75rem", padding: "0.52rem 0.8rem" }}
                onClick={() => void loadData(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
