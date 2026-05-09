"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type QuestionDifficulty = "easy" | "medium" | "hard";
type InterviewFrequency = "high" | "medium" | "low";

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

type CategorySummary = {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  featuredQuestionTitles: string[];
};

type DocumentSummary = {
  id: string;
  title: string;
  summary: string | null;
  difficulty: QuestionDifficulty;
  interviewFrequency: InterviewFrequency;
  status: string;
  qualityScore: number | null;
  tags: string[];
  categoryId: string;
  categoryName: string;
  versionCount: number;
  latestVersion: number;
  latestVersionAt: string | null;
  latestVersionSource: string | null;
  latestReview: {
    id: string;
    reviewType: string;
    status: string;
    comment: string | null;
    updatedAt: string;
  } | null;
  sourceCount: number;
  updatedAt: string;
};

type ReviewTaskSummary = {
  id: string;
  documentId: string;
  documentTitle: string;
  reviewType: string;
  status: string;
  reviewerId: string | null;
  comment: string | null;
  updatedAt: string;
};

type AiTaskSummary = {
  id: string;
  taskType: string;
  status: string;
  targetId: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type StudioDetailResponse = {
  success: boolean;
  bank: BankCard;
  categories: CategorySummary[];
  documents: DocumentSummary[];
  reviewTasks: ReviewTaskSummary[];
  aiTasks: AiTaskSummary[];
};

type BankAuditSummary = {
  total: number;
  blocked: number;
  review: number;
  published: number;
};

const QUESTION_DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

const INTERVIEW_FREQUENCY_LABEL: Record<InterviewFrequency, string> = {
  high: "高频",
  medium: "常规",
  low: "低频",
};

/**
 * 将时间格式化为适合后台列表展示的文案。
 * @param {string | null | undefined} value 原始时间字符串。
 * @returns {string} 中文展示文本。
 */
function formatTime(value?: string | null): string {
  if (!value) {
    return "暂无";
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
 * 学习中心题库详情页，展示章节、文档、审核与 AI 任务。
 * @returns {ReactNode} 管理端题库详情页。
 */
export default function AdminKbDetailPage(): ReactNode {
  const router = useRouter();
  const params = useParams();
  const kbId = typeof params.kbId === "string" ? params.kbId : "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<StudioDetailResponse | null>(null);
  const [auditSummary, setAuditSummary] = useState<BankAuditSummary | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<"" | QuestionDifficulty>("");
  const [frequencyFilter, setFrequencyFilter] = useState<"" | InterviewFrequency>("");
  const [categoryFilter, setCategoryFilter] = useState("");

  /**
   * 拉取题库详情快照。
   * @returns {Promise<void>} 请求完成后更新详情页状态。
   */
  const loadDetail = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/admin/learning/studio/${encodeURIComponent(kbId)}`, {
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as StudioDetailResponse | { error?: string };
    if (!response.ok || !("success" in data) || !data.success) {
      throw new Error("error" in data && data.error ? data.error : "加载题库详情失败");
    }
    setDetail(data);
  }, [kbId]);

  /**
   * 刷新当前详情页数据。
   * @param {boolean} initial 是否为首屏加载。
   * @returns {Promise<void>} 刷新结束。
   */
  const refreshDetail = useCallback(async (initial = false): Promise<void> => {
    try {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError("");
      await loadDetail();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "加载题库详情失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadDetail]);

  useEffect(() => {
    void refreshDetail(true);
  }, [refreshDetail]);

  /**
   * 删除当前题库。
   * @returns {Promise<void>} 删除完成后返回后台首页。
   */
  async function handleDeleteBank(): Promise<void> {
    if (!detail?.bank) {
      return;
    }

    const accepted = window.confirm(`确定删除题库“${detail.bank.name}”吗？该题库下的文档、版本、审核和任务都会一起删除。`);
    if (!accepted) {
      return;
    }

    try {
      setDeleting(true);
      setError("");
      const response = await fetch(`/api/admin/learning/studio/${encodeURIComponent(kbId)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "删除题库失败");
      }
      router.push("/admin/learning");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除题库失败");
    } finally {
      setDeleting(false);
    }
  }

  /**
   * 运行当前题库的 AI 抽检，将结果写回质量报告、审核任务和 AI 任务。
   * @returns {Promise<void>} 抽检结束后刷新详情页。
   */
  async function handleRunQualityAudit(): Promise<void> {
    if (!kbId) {
      return;
    }

    try {
      setAuditing(true);
      setError("");
      setAuditSummary(null);
      const response = await fetch("/api/admin/learning/quality-audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bankId: kbId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        result?: BankAuditSummary;
      };
      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error || "运行 AI 抽检失败");
      }
      setAuditSummary(data.result);
      await refreshDetail();
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "运行 AI 抽检失败");
    } finally {
      setAuditing(false);
    }
  }

  const categories = useMemo(() => detail?.categories ?? [], [detail]);
  const documents = useMemo(() => detail?.documents ?? [], [detail]);
  const reviewTasks = useMemo(() => detail?.reviewTasks ?? [], [detail]);
  const aiTasks = useMemo(() => detail?.aiTasks ?? [], [detail]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      if (difficultyFilter && document.difficulty !== difficultyFilter) {
        return false;
      }
      if (frequencyFilter && document.interviewFrequency !== frequencyFilter) {
        return false;
      }
      if (categoryFilter && document.categoryId !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [categoryFilter, difficultyFilter, documents, frequencyFilter]);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!detail?.bank) {
    return (
      <section className="minimal-admin-learning">
        <div className="minimal-admin-learning__shell">
          <div className="minimal-admin-learning__alert">题库不存在或已被删除。</div>
          <Link className="btn btn-outline" href="/admin/learning">
            返回后台首页
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="minimal-admin-learning minimal-admin-learning-detail">
      <div className="minimal-admin-learning__shell">
        <div className="minimal-admin-learning-detail__title">
          <div>
            <Link className="minimal-admin-learning-detail__back" href="/admin/learning">
              返回学习中心后台
            </Link>
            <h1>{detail.bank.name}</h1>
            <p className="minimal-admin-learning-detail__description">{detail.bank.description || "暂无题库说明"}</p>
          </div>
          <div className="minimal-admin-learning__bank-actions">
            {detail.bank.defaultQuestionPath ? (
              <Link className="btn btn-outline" href={detail.bank.defaultQuestionPath}>
                打开首篇文档
              </Link>
            ) : null}
            <button className="btn btn-outline" type="button" disabled={refreshing} onClick={() => void refreshDetail()}>
              {refreshing ? "刷新中..." : "刷新"}
            </button>
            <button className="btn btn-outline" type="button" disabled={auditing} onClick={() => void handleRunQualityAudit()}>
              {auditing ? "抽检中..." : "运行 AI 抽检"}
            </button>
            <button className="minimal-admin-learning__delete" type="button" disabled={deleting} onClick={() => void handleDeleteBank()}>
              {deleting ? "删除中..." : "删除题库"}
            </button>
          </div>
        </div>

        {error ? <div className="minimal-admin-learning__alert">{error}</div> : null}
        {auditSummary ? (
          <div className="minimal-admin-learning__alert">
            AI 抽检完成：共 {auditSummary.total} 篇，建议直接通过 {auditSummary.published} 篇，建议人工复核 {auditSummary.review} 篇，建议阻断 {auditSummary.blocked} 篇。
          </div>
        ) : null}

        <section className="minimal-admin-learning__top">
          <article className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>章节目录</h2>
              <span>{categories.length} 个章节</span>
            </div>
            <div className="minimal-admin-learning-detail__category-list">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`minimal-admin-learning-detail__category ${categoryFilter === category.id ? "is-active" : ""}`}
                  onClick={() => setCategoryFilter((current) => (current === category.id ? "" : category.id))}
                >
                  <strong>{category.name}</strong>
                  <span>{category.questionCount} 篇文档</span>
                </button>
              ))}
            </div>
          </article>

          <article className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>筛选条件</h2>
              <span>从文档维度筛选当前题库内容</span>
            </div>
            <div className="minimal-admin-learning-detail__filters">
              <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as "" | QuestionDifficulty)}>
                <option value="">全部难度</option>
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
              <select value={frequencyFilter} onChange={(event) => setFrequencyFilter(event.target.value as "" | InterviewFrequency)}>
                <option value="">全部频率</option>
                <option value="high">高频</option>
                <option value="medium">常规</option>
                <option value="low">低频</option>
              </select>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setDifficultyFilter("");
                  setFrequencyFilter("");
                  setCategoryFilter("");
                }}
              >
                清空筛选
              </button>
            </div>
            <div className="minimal-admin-learning__summary">
              <span>{detail.bank.categoryCount} 个章节</span>
              <span>{detail.bank.questionCount} 篇文档</span>
              <span>{reviewTasks.length} 个审核任务</span>
              <span>{aiTasks.length} 个 AI 任务</span>
            </div>
          </article>
        </section>

        <section className="minimal-admin-learning__panel">
          <div className="minimal-admin-learning__panel-head">
            <h2>文档列表</h2>
            <span>{filteredDocuments.length} 篇</span>
          </div>
          {filteredDocuments.length === 0 ? (
            <div className="minimal-admin-learning__empty">当前筛选条件下没有文档。</div>
          ) : (
            <div className="minimal-admin-learning-detail__question-list">
              {filteredDocuments.map((document) => (
                <article key={document.id} className="minimal-admin-learning-detail__question">
                  <div className="minimal-admin-learning-detail__question-head">
                    <strong>{document.title}</strong>
                    <div className="minimal-admin-learning-detail__actions">
                      <span>{QUESTION_DIFFICULTY_LABEL[document.difficulty]}</span>
                      <span>{INTERVIEW_FREQUENCY_LABEL[document.interviewFrequency]}</span>
                      <span>{document.status}</span>
                    </div>
                  </div>
                  <p>{document.summary || "暂无摘要"}</p>
                  <div className="minimal-admin-learning-detail__question-meta">
                    <span>{document.categoryName}</span>
                    <span>V{document.latestVersion}</span>
                    <span>{document.sourceCount} 个来源</span>
                    <span>{document.qualityScore ? `质检 ${document.qualityScore}` : "待质检"}</span>
                    <span>{formatTime(document.updatedAt)}</span>
                  </div>
                  {document.tags.length > 0 ? (
                    <div className="minimal-admin-learning-detail__question-tags">
                      {document.tags.map((tag) => (
                        <span key={`${document.id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                  {document.latestReview ? (
                    <div className="minimal-admin-learning__run-meta">
                      <span>{document.latestReview.reviewType}</span>
                      <span>{document.latestReview.status}</span>
                      <span>{formatTime(document.latestReview.updatedAt)}</span>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="minimal-admin-learning__section-grid">
          <article className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>审核任务</h2>
              <span>{reviewTasks.length} 条</span>
            </div>
            {reviewTasks.length === 0 ? (
              <div className="minimal-admin-learning__empty">当前没有审核任务。</div>
            ) : (
              <div className="minimal-admin-learning__doc-list">
                {reviewTasks.map((task) => (
                  <article key={task.id} className="minimal-admin-learning__doc">
                    <div className="minimal-admin-learning__doc-head">
                      <strong>{task.documentTitle}</strong>
                      <span>{task.status}</span>
                    </div>
                    <div className="minimal-admin-learning__run-meta">
                      <span>{task.reviewType}</span>
                      <span>{formatTime(task.updatedAt)}</span>
                    </div>
                    {task.comment ? <p>{task.comment}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="minimal-admin-learning__panel">
            <div className="minimal-admin-learning__panel-head">
              <h2>AI 任务</h2>
              <span>{aiTasks.length} 条</span>
            </div>
            {aiTasks.length === 0 ? (
              <div className="minimal-admin-learning__empty">当前没有 AI 任务。</div>
            ) : (
              <div className="minimal-admin-learning__doc-list">
                {aiTasks.map((task) => (
                  <article key={task.id} className="minimal-admin-learning__doc">
                    <div className="minimal-admin-learning__doc-head">
                      <strong>{task.taskType}</strong>
                      <span>{task.status}</span>
                    </div>
                    <div className="minimal-admin-learning__run-meta">
                      <span>{task.targetId || "未绑定目标"}</span>
                      <span>{formatTime(task.finishedAt || task.createdAt)}</span>
                    </div>
                    {task.errorMessage ? <p>{task.errorMessage}</p> : null}
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
