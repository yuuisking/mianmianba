"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

type StudioBank = {
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

type DashboardSummary = {
  bankCount: number;
  documentCount: number;
  publishedDocumentCount: number;
  reviewTaskCount: number;
  pendingReviewTaskCount: number;
  aiTaskCount: number;
};

type RecentDocument = {
  id: string;
  title: string;
  status: string;
  difficulty: string;
  qualityScore: number | null;
  bankId: string;
  bankName: string;
  chapterId: string | null;
  chapterName: string;
  latestVersion: number;
  updatedAt: string;
};

type RecentReviewTask = {
  id: string;
  documentId: string;
  documentTitle: string;
  reviewType: string;
  status: string;
  reviewerId: string | null;
  comment: string | null;
  updatedAt: string;
};

type RecentAiTask = {
  id: string;
  taskType: string;
  status: string;
  targetType: string | null;
  targetId: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type StudioDashboardResponse = {
  success: boolean;
  summary: DashboardSummary;
  banks: StudioBank[];
  recentDocuments: RecentDocument[];
  recentReviewTasks: RecentReviewTask[];
  recentAiTasks: RecentAiTask[];
};

/**
 * 将 ISO 日期格式化为后台列表可读文案。
 * @param {string | null | undefined} value 原始日期字符串。
 * @returns {string} 适合页面展示的日期文本。
 */
function formatDateLabel(value?: string | null): string {
  if (!value) {
    return "暂无时间";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 学习中心后台首页，展示题库、文档、审核与 AI 任务总览。
 * @returns {ReactNode} 后台总览页面。
 */
export default function AdminLearningPage(): ReactNode {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resetExisting, setResetExisting] = useState(true);
  const [dashboard, setDashboard] = useState<StudioDashboardResponse | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  const banks = useMemo(() => dashboard?.banks ?? [], [dashboard]);
  const summary = useMemo<DashboardSummary>(
    () =>
      dashboard?.summary ?? {
        bankCount: 0,
        documentCount: 0,
        publishedDocumentCount: 0,
        reviewTaskCount: 0,
        pendingReviewTaskCount: 0,
        aiTaskCount: 0,
      },
    [dashboard]
  );
  const recentDocuments = useMemo(() => dashboard?.recentDocuments ?? [], [dashboard]);
  const recentReviewTasks = useMemo(() => dashboard?.recentReviewTasks ?? [], [dashboard]);
  const recentAiTasks = useMemo(() => dashboard?.recentAiTasks ?? [], [dashboard]);

  /**
   * 拉取学习中心后台快照。
   * @returns {Promise<void>} 刷新完成后更新页面状态。
   */
  async function loadDashboard(): Promise<void> {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/admin/learning/studio", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as StudioDashboardResponse | { error?: string };
      if (!response.ok || !("success" in data) || !data.success) {
        throw new Error("error" in data && data.error ? data.error : "加载学习中心后台失败");
      }
      setDashboard(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载学习中心后台失败");
    } finally {
      setLoading(false);
    }
  }

  /**
   * 导入首批标杆文档，用于初始化学习中心 V2 主数据库。
   * @returns {Promise<void>} 导入完成后刷新后台数据。
   */
  async function handleImport(): Promise<void> {
    try {
      setSubmitting(true);
      setError("");
      const response = await fetch("/api/admin/learning/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resetExisting,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || "导入标杆文档失败");
      }
      await loadDashboard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "导入标杆文档失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <section className="minimal-admin-learning">
      <div className="minimal-admin-learning__shell">
        <header className="minimal-admin-learning__header">
          <div>
            <p className="minimal-admin-learning__eyebrow">Admin Learning</p>
            <h1>学习中心文档后台</h1>
            <div className="minimal-admin-learning__summary">
              <span>{summary.bankCount} 个题库</span>
              <span>{summary.documentCount} 篇文档</span>
              <span>{summary.publishedDocumentCount} 篇已发布</span>
              <span>{summary.pendingReviewTaskCount} 个待审核</span>
            </div>
          </div>
          <Link className="btn btn-outline" href="/learning">
            查看前台
          </Link>
        </header>

        {error ? <div className="minimal-admin-learning__alert">{error}</div> : null}

        <div className="minimal-admin-learning__top">
          <section className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>导入首批标杆文档</h2>
              <span>把参考项目的文档版本体系直接落进当前学习中心</span>
            </div>

            <div className="minimal-admin-learning__form minimal-admin-learning__form--stack">
              <div className="minimal-admin-learning__warning-list">
                {[
                  "MySQL：B+Tree、事务、MVCC",
                  "Redis：缓存穿透、持久化、滑动窗口",
                  "Java 并发：AQS、线程池、volatile",
                  "JVM：类加载、GC、内存模型",
                ].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <label className="minimal-admin-learning__toggle">
                <input
                  type="checkbox"
                  checked={resetExisting}
                  onChange={(event) => setResetExisting(event.target.checked)}
                  disabled={submitting}
                />
                <span>导入前清空已有学习中心历史数据</span>
              </label>

              <button className="btn btn-primary" type="button" onClick={() => void handleImport()} disabled={submitting}>
                {submitting ? "正在导入..." : "导入标杆文档"}
              </button>
            </div>
          </section>

          <section className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>核心指标</h2>
              <span>围绕题库、文档、审核和任务的真实状态</span>
            </div>

            <div className="minimal-admin-learning__metric-grid">
              {[
                ["题库数", `${summary.bankCount}`],
                ["文档数", `${summary.documentCount}`],
                ["已发布", `${summary.publishedDocumentCount}`],
                ["审核任务", `${summary.reviewTaskCount}`],
                ["待审核", `${summary.pendingReviewTaskCount}`],
                ["AI 任务", `${summary.aiTaskCount}`],
              ].map(([label, value]) => (
                <article key={label} className="minimal-admin-learning__metric">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="minimal-admin-learning__panel">
          <div className="minimal-admin-learning__panel-head">
            <h2>题库列表</h2>
            <span>按题库查看章节、文档、版本、审核和 AI 任务</span>
          </div>

          {banks.length === 0 ? (
            <div className="minimal-admin-learning__empty">当前还没有学习题库，先导入首批标杆文档。</div>
          ) : (
            <div className="minimal-admin-learning__bank-list">
              {banks.map((bank) => (
                <article key={bank.id} className="minimal-admin-learning__bank">
                  <div className="minimal-admin-learning__bank-main">
                    <div className="minimal-admin-learning__bank-title">
                      <strong>{bank.name}</strong>
                      <span>{bank.subtitle || "学习专题"}</span>
                    </div>
                    <p>{bank.description || "暂无简介"}</p>
                    <div className="minimal-admin-learning__bank-meta">
                      <span>{bank.categoryCount} 个章节</span>
                      <span>{bank.questionCount} 篇文档</span>
                      <span>{formatDateLabel(bank.updatedAt)}</span>
                    </div>
                    <div className="minimal-admin-learning__warning-list">
                      {bank.featuredCategories.map((item) => (
                        <span key={`${bank.id}-${item}`}>{item}</span>
                      ))}
                    </div>
                  </div>
                  <div className="minimal-admin-learning__bank-side">
                    <span>{bank.cover || "题库"}</span>
                    <div className="minimal-admin-learning__bank-actions">
                      <Link className="btn btn-outline" href={`/admin/learning/${bank.id}`}>
                        查看详情
                      </Link>
                      {bank.defaultQuestionPath ? (
                        <Link className="btn btn-primary" href={bank.defaultQuestionPath}>
                          打开文档
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="minimal-admin-learning__section-grid">
          <article className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>最近文档</h2>
              <span>最近更新的文档版本</span>
            </div>
            {recentDocuments.length === 0 ? (
              <div className="minimal-admin-learning__empty">还没有文档数据。</div>
            ) : (
              <div className="minimal-admin-learning__doc-list">
                {recentDocuments.map((item) => (
                  <article key={item.id} className="minimal-admin-learning__doc">
                    <div className="minimal-admin-learning__doc-head">
                      <strong>{item.title}</strong>
                      <span>{item.status}</span>
                    </div>
                    <div className="minimal-admin-learning__run-meta">
                      <span>{item.bankName}</span>
                      <span>{item.chapterName}</span>
                      <span>V{item.latestVersion}</span>
                      <span>{formatDateLabel(item.updatedAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>最近审核</h2>
              <span>最近处理或待处理的审核任务</span>
            </div>
            {recentReviewTasks.length === 0 ? (
              <div className="minimal-admin-learning__empty">当前没有审核任务。</div>
            ) : (
              <div className="minimal-admin-learning__doc-list">
                {recentReviewTasks.map((item) => (
                  <article key={item.id} className="minimal-admin-learning__doc">
                    <div className="minimal-admin-learning__doc-head">
                      <strong>{item.documentTitle}</strong>
                      <span>{item.status}</span>
                    </div>
                    <div className="minimal-admin-learning__run-meta">
                      <span>{item.reviewType}</span>
                      <span>{formatDateLabel(item.updatedAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>最近任务</h2>
              <span>学习中心 AI 任务执行情况</span>
            </div>
            {recentAiTasks.length === 0 ? (
              <div className="minimal-admin-learning__empty">当前没有 AI 任务。</div>
            ) : (
              <div className="minimal-admin-learning__doc-list">
                {recentAiTasks.map((item) => (
                  <article key={item.id} className="minimal-admin-learning__doc">
                    <div className="minimal-admin-learning__doc-head">
                      <strong>{item.taskType}</strong>
                      <span>{item.status}</span>
                    </div>
                    <div className="minimal-admin-learning__run-meta">
                      <span>{item.targetType || "document"}</span>
                      <span>{formatDateLabel(item.finishedAt || item.createdAt)}</span>
                    </div>
                    {item.errorMessage ? <p>{item.errorMessage}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>
    </section>
  );
}
