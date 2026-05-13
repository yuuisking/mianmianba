"use client";

import { useRouter } from "next/navigation";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import type {
  ReviewDashboardFilters,
  ReviewEvidenceDTO,
  ReviewIssueDTO,
  V2ReviewDashboardSnapshot,
} from "@/lib/interview-v2/domain";

type ReviewDashboardResponse = {
  data?: V2ReviewDashboardSnapshot;
  error?: string;
};

type ReviewIssueResponse = {
  data?: ReviewIssueDTO;
  error?: string;
};

type ReviewEvidenceResponse = {
  data?: ReviewEvidenceDTO[];
  error?: string;
};

type ReviewActionExecuteResponse = {
  data?: {
    executionId: string;
    targetPath: string | null;
    startUrl: string | null;
    payload: Record<string, unknown>;
  };
  error?: string;
};

const REVIEW_FILTERS_STORAGE_KEY = "review-dashboard-filters-v2";

/**
 * 生成匿名态复盘快照。
 * @returns {V2ReviewDashboardSnapshot} 匿名快照。
 */
function buildAnonymousReviewSnapshot(): V2ReviewDashboardSnapshot {
  return {
    snapshotId: null,
    filters: {
      timeRange: "14d",
      interviewType: "all",
      role: null,
      company: null,
      dimension: null,
      sampleStatus: "all",
    },
    filterOptions: {
      roles: [],
      companies: [],
      dimensions: [],
    },
    headline: "登录后，系统会基于你的真实样本给出问题、证据、动作和改善验证。",
    trendSummary: "复盘中心不会凭空创造结论，至少需要真实训练样本才能形成稳定分析。",
    headlineCard: {
      title: "当前还没有稳定结论",
      summary: "请先登录并完成真实训练，系统才会把问题、证据和动作链路跑起来。",
      priority: "medium",
      issueId: null,
      trendDirection: "stable",
      sampleCount: 0,
    },
    todayActionCard: {
      title: "先补真实样本",
      description: "至少完成一场模拟、专项训练或学习测验后，复盘中心才会形成可追溯结论。",
      actionType: "collect_sample",
      targetPath: "/setup",
      actionPayload: {},
      expectedOutcome: "获得第一批可用于诊断的问题和证据。",
    },
    confidenceCard: {
      confidenceLevel: "low",
      confidenceScore: 0,
      sampleCoverage: 0,
      timeCoverage: 0,
      dimensionCoverage: 0,
    },
    sampleSummaryCard: {
      validSampleCount: 0,
      invalidSampleCount: 0,
      timeRangeLabel: "最近 14 天",
      mainSourceBreakdown: [],
    },
    metrics: [],
    issues: [],
    evidences: [],
    actions: [],
    progressOverview: {
      improvedIssueCount: 0,
      worsenedIssueCount: 0,
      stableIssueCount: 0,
      verifiedActionCount: 0,
      effectiveActionCount: 0,
    },
    issueProgress: [],
    actionEffectiveness: [],
    historySessions: [],
    invalidSessions: [],
    comparisonGroups: [],
    agentTrace: [],
  };
}

/**
 * 读取本地保存的筛选条件。
 * @returns {ReviewDashboardFilters | null} 最近一次筛选。
 */
function readStoredFilters(): ReviewDashboardFilters | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(REVIEW_FILTERS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ReviewDashboardFilters;
  } catch {
    return null;
  }
}

/**
 * 保存最近一次筛选条件。
 * @param {ReviewDashboardFilters} filters 当前筛选。
 * @returns {void}
 */
function persistFilters(filters: ReviewDashboardFilters): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(REVIEW_FILTERS_STORAGE_KEY, JSON.stringify(filters));
}

/**
 * 从 URL 查询参数中恢复复盘筛选条件。
 * @param searchParams 当前 URL 查询参数。
 * @returns 局部筛选条件。
 */
function readFiltersFromSearchParams(
  searchParams: URLSearchParams
): Partial<ReviewDashboardFilters> {
  return {
    role: searchParams.get("role")?.trim() || null,
    company: searchParams.get("company")?.trim() || null,
    dimension: searchParams.get("dimension")?.trim() || null,
  };
}

/**
 * 从 URL 中恢复 issue / evidence 深链参数。
 * @param searchParams 当前 URL 查询参数。
 * @returns 深链参数。
 */
function readReviewDeepLinkParams(searchParams: URLSearchParams): {
  issueId: string | null;
  evidenceId: string | null;
} {
  return {
    issueId: searchParams.get("issueId")?.trim() || null,
    evidenceId: searchParams.get("evidenceId")?.trim() || null,
  };
}

/**
 * 格式化时间。
 * @param {string | null} value ISO 时间字符串。
 * @returns {string} 格式化结果。
 */
function formatDateTime(value: string | null): string {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * 获取动作优先级文案。
 * @param {"today" | "thisWeek" | "keep"} priority 优先级。
 * @returns {string} 文案。
 */
function getActionPriorityLabel(priority: "today" | "thisWeek" | "keep"): string {
  if (priority === "today") {
    return "今日最该做";
  }
  if (priority === "thisWeek") {
    return "本周应完成";
  }
  return "持续保持项";
}

/**
 * 获取问题严重度文案。
 * @param {"high" | "medium" | "low"} severity 严重度。
 * @returns {string} 展示文案。
 */
function getIssueSeverityLabel(severity: "high" | "medium" | "low"): string {
  if (severity === "high") {
    return "高频";
  }
  if (severity === "medium") {
    return "重点";
  }
  return "观察中";
}

/**
 * 获取训练类型展示文案。
 * @param {string} mode 样本模式。
 * @returns {string} 展示文案。
 */
function getReviewModeLabel(mode: string): string {
  const normalized = mode.toLowerCase();
  if (normalized.includes("learning")) {
    return "学习测验";
  }
  if (normalized.includes("targeted")) {
    return "专项训练";
  }
  return "模拟面试";
}

/**
 * 获取训练类型图标色调。
 * @param {string} mode 样本模式。
 * @returns {"orange" | "blue"} 色调。
 */
function getReviewModeTone(mode: string): "orange" | "blue" {
  return mode.toLowerCase().includes("targeted") || mode.toLowerCase().includes("learning")
    ? "blue"
    : "orange";
}

/**
 * 根据下标轮换展示色调。
 * @param {number} index 当前下标。
 * @returns {"orange" | "blue" | "green" | "purple"} 色调。
 */
function getReviewAccentTone(index: number): "orange" | "blue" | "green" | "purple" {
  const tones: Array<"orange" | "blue" | "green" | "purple"> = [
    "orange",
    "blue",
    "green",
    "purple",
  ];
  return tones[index % tones.length];
}

/**
 * 将数值限制在百分比范围内。
 * @param {number} value 原始值。
 * @returns {number} 0 到 100 之间的百分比数值。
 */
function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * 格式化带正负号的分值变化。
 * @param {number} value 原始变化值。
 * @returns {string} 展示文本。
 */
function formatSignedValue(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

/**
 * 获取动作效果展示文案。
 * @param {"effective" | "partial" | "ineffective" | "unknown"} effectiveness 效果结果。
 * @returns {string} 展示文案。
 */
function getActionEffectivenessLabel(
  effectiveness: "effective" | "partial" | "ineffective" | "unknown"
): string {
  if (effectiveness === "effective") {
    return "有效";
  }
  if (effectiveness === "partial") {
    return "部分有效";
  }
  if (effectiveness === "ineffective") {
    return "待调整";
  }
  return "待观察";
}

/**
 * 获取动作效果色调。
 * @param {"effective" | "partial" | "ineffective" | "unknown"} effectiveness 效果结果。
 * @returns {"green" | "blue" | "orange" | "purple"} 色调。
 */
function getActionEffectivenessTone(
  effectiveness: "effective" | "partial" | "ineffective" | "unknown"
): "green" | "blue" | "orange" | "purple" {
  if (effectiveness === "effective") {
    return "green";
  }
  if (effectiveness === "partial") {
    return "blue";
  }
  if (effectiveness === "ineffective") {
    return "orange";
  }
  return "purple";
}

export default function Review(): JSX.Element {
  const router = useRouter();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const [filters, setFilters] = useState<ReviewDashboardFilters>(
    buildAnonymousReviewSnapshot().filters
  );
  const [dashboard, setDashboard] = useState<V2ReviewDashboardSnapshot>(
    buildAnonymousReviewSnapshot()
  );
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssueDetail, setSelectedIssueDetail] = useState<ReviewIssueDTO | null>(null);
  const [selectedIssueEvidences, setSelectedIssueEvidences] = useState<ReviewEvidenceDTO[]>([]);
  const [deepLinkEvidenceId, setDeepLinkEvidenceId] = useState<string | null>(null);
  const [showDiagnosisSection, setShowDiagnosisSection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isIssueLoading, setIsIssueLoading] = useState(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

  /**
   * 拉取完整复盘快照。
   * @param {ReviewDashboardFilters} nextFilters 当前筛选条件。
   * @returns {Promise<void>} 拉取完成。
   */
  async function fetchDashboard(nextFilters: ReviewDashboardFilters): Promise<void> {
    setIsLoading(true);
    try {
      const searchParams = new URLSearchParams({
        timeRange: nextFilters.timeRange,
        interviewType: nextFilters.interviewType,
        sampleStatus: nextFilters.sampleStatus,
      });
      if (nextFilters.role) {
        searchParams.set("role", nextFilters.role);
      }
      if (nextFilters.company) {
        searchParams.set("company", nextFilters.company);
      }
      if (nextFilters.dimension) {
        searchParams.set("dimension", nextFilters.dimension);
      }

      const response = await fetch(`/api/v2/review/dashboard?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error(`review dashboard failed: ${response.status}`);
      }

      const payload = (await response.json()) as ReviewDashboardResponse;
      if (!payload.data) {
        throw new Error(payload.error || "review dashboard missing data");
      }

      const data = payload.data;
      setDashboard(data);
      const nextIssueId = data.issues[0]?.id ?? null;
      setSelectedIssueId((current) =>
        current && data.issues.some((issue) => issue.id === current) ? current : nextIssueId
      );
    } catch (error) {
      console.error("Failed to fetch review dashboard", error);
      setDashboard(buildAnonymousReviewSnapshot());
      setSelectedIssueId(null);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * 拉取当前选中问题的详情与证据。
   * @param {string} issueId 问题 ID。
   * @returns {Promise<void>} 拉取完成。
   */
  async function fetchIssueDetails(issueId: string): Promise<void> {
    setIsIssueLoading(true);
    try {
      const [detailResponse, evidenceResponse] = await Promise.all([
        fetch(`/api/v2/review/issues/${issueId}`),
        fetch(`/api/v2/review/issues/${issueId}/evidences`),
      ]);

      const detailPayload = (await detailResponse.json()) as ReviewIssueResponse;
      const evidencePayload = (await evidenceResponse.json()) as ReviewEvidenceResponse;
      setSelectedIssueDetail(detailPayload.data ?? null);
      setSelectedIssueEvidences(evidencePayload.data ?? []);
    } catch (error) {
      console.error("Failed to fetch review issue detail", error);
      setSelectedIssueDetail(null);
      setSelectedIssueEvidences([]);
    } finally {
      setIsIssueLoading(false);
    }
  }

  /**
   * 执行动作卡并进入对应训练页。
   * @param {string} actionId 动作 ID。
   * @returns {Promise<void>} 执行完成。
   */
  async function handleExecuteAction(actionId: string): Promise<void> {
    if (!session?.user?.id) {
      requestAuth();
      return;
    }

    setExecutingActionId(actionId);
    try {
      const response = await fetch(`/api/v2/review/actions/${actionId}/execute`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`execute action failed: ${response.status}`);
      }

      const payload = (await response.json()) as ReviewActionExecuteResponse;
      if (payload.data?.startUrl) {
        router.push(payload.data.startUrl);
      }
    } catch (error) {
      console.error("Failed to execute review action", error);
    } finally {
      setExecutingActionId(null);
    }
  }

  useEffect(() => {
    const stored = readStoredFilters();
    const searchParams =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const urlFilters =
      searchParams ? readFiltersFromSearchParams(searchParams) : {};
    const deepLinkParams = searchParams
      ? readReviewDeepLinkParams(searchParams)
      : { issueId: null, evidenceId: null };
    const hasUrlFilters = Boolean(urlFilters.role || urlFilters.company || urlFilters.dimension);
    setDeepLinkEvidenceId(deepLinkParams.evidenceId);
    if (deepLinkParams.issueId) {
      setSelectedIssueId(deepLinkParams.issueId);
      setShowDiagnosisSection(true);
    }
    if (stored || hasUrlFilters) {
      setFilters({
        ...(stored || buildAnonymousReviewSnapshot().filters),
        ...urlFilters,
      });
    }
  }, []);

  useEffect(() => {
    persistFilters(filters);
  }, [filters]);

  useEffect(() => {
    if (!session?.user?.id) {
      setDashboard(buildAnonymousReviewSnapshot());
      setSelectedIssueId(null);
      setSelectedIssueDetail(null);
      setSelectedIssueEvidences([]);
      setIsLoading(false);
      return;
    }

    void fetchDashboard(filters);
  }, [filters, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || !selectedIssueId) {
      setSelectedIssueDetail(null);
      setSelectedIssueEvidences([]);
      return;
    }
    void fetchIssueDetails(selectedIssueId);
  }, [selectedIssueId, session?.user?.id]);

  const selectedIssue = useMemo(
    () => dashboard.issues.find((item) => item.id === selectedIssueId) ?? null,
    [dashboard.issues, selectedIssueId]
  );
  const topIssues = useMemo(() => dashboard.issues.slice(0, 3), [dashboard.issues]);
  const topActions = useMemo(() => dashboard.actions.slice(0, 3), [dashboard.actions]);
  const topHistorySessions = useMemo(
    () => dashboard.historySessions.slice(0, 8),
    [dashboard.historySessions]
  );
  const topIssueProgress = useMemo(
    () => dashboard.issueProgress.slice(0, 5),
    [dashboard.issueProgress]
  );
  const topActionEffectiveness = useMemo(
    () => dashboard.actionEffectiveness.slice(0, 5),
    [dashboard.actionEffectiveness]
  );
  const primaryComparisonGroup = dashboard.comparisonGroups[0] ?? null;
  const primaryMetric = dashboard.metrics[0] ?? null;
  const secondaryMetric = dashboard.metrics[1] ?? null;
  const actionVerificationRate =
    dashboard.progressOverview.verifiedActionCount > 0
      ? Math.round(
          (dashboard.progressOverview.effectiveActionCount /
            dashboard.progressOverview.verifiedActionCount) *
            100
        )
      : 0;

  useEffect(() => {
    if (selectedIssueId) {
      return;
    }

    const searchParams =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const issueId = searchParams?.get("issueId")?.trim() || "";
    if (issueId && dashboard.issues.some((item) => item.id === issueId)) {
      setSelectedIssueId(issueId);
    }
  }, [dashboard.issues, selectedIssueId]);

  useEffect(() => {
    if (!deepLinkEvidenceId || selectedIssueEvidences.length === 0) {
      return;
    }

    const hasMatchedEvidence = selectedIssueEvidences.some((item) => item.id === deepLinkEvidenceId);
    if (!hasMatchedEvidence) {
      return;
    }

    const timer = window.setTimeout(() => {
      document
        .getElementById(`review-evidence-${deepLinkEvidenceId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [deepLinkEvidenceId, selectedIssueEvidences]);

  useEffect(() => {
    if (!showDiagnosisSection) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setShowDiagnosisSection(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDiagnosisSection]);

  /**
   * 展开诊断区并滚动到对应位置。
   * @returns {void}
   */
  function revealDiagnosisSection(issueId?: string | null): void {
    if (issueId) {
      setSelectedIssueId(issueId);
    } else if (!selectedIssueId && dashboard.issues[0]?.id) {
      setSelectedIssueId(dashboard.issues[0].id);
    }
    setShowDiagnosisSection(true);
  }

  /**
   * 关闭诊断弹窗。
   * @returns {void}
   */
  function closeDiagnosisSection(): void {
    setShowDiagnosisSection(false);
  }

  const sourceBreakdown = useMemo(
    () => dashboard.sampleSummaryCard.mainSourceBreakdown.slice(0, 4),
    [dashboard.sampleSummaryCard.mainSourceBreakdown]
  );
  const totalSourceCount = useMemo(
    () => sourceBreakdown.reduce((sum, item) => sum + item.count, 0),
    [sourceBreakdown]
  );
  const coverageItems = useMemo(
    () => [
      {
        label: "样本覆盖",
        value: clampPercentage(dashboard.confidenceCard.sampleCoverage),
      },
      {
        label: "时间覆盖",
        value: clampPercentage(dashboard.confidenceCard.timeCoverage),
      },
      {
        label: "维度覆盖",
        value: clampPercentage(dashboard.confidenceCard.dimensionCoverage),
      },
    ],
    [
      dashboard.confidenceCard.dimensionCoverage,
      dashboard.confidenceCard.sampleCoverage,
      dashboard.confidenceCard.timeCoverage,
    ]
  );
  const activeDiagnosisTitle = selectedIssue?.name || dashboard.headlineCard.title;

  return (
    <main className="v2-review-shell">
      <section className="v2-review-kpi-grid">
        <article className="v2-review-kpi-card">
          <div className="v2-review-kpi-main">
            <div className="v2-review-kpi-icon orange">样</div>
            <div>
              <div className="v2-review-kpi-title">有效训练样本</div>
              <div className="v2-review-kpi-value">
                {dashboard.sampleSummaryCard.validSampleCount}
                <small> 个</small>
              </div>
              <div className="v2-review-kpi-sub">
                {dashboard.sampleSummaryCard.timeRangeLabel} · 无效样本{" "}
                {dashboard.sampleSummaryCard.invalidSampleCount} 个
              </div>
            </div>
          </div>
        </article>

        <article className="v2-review-kpi-card">
          <div className="v2-review-kpi-main">
            <div className="v2-review-kpi-icon blue">分</div>
            <div>
              <div className="v2-review-kpi-title">{primaryMetric?.label || "平均表现"}</div>
              <div className="v2-review-kpi-value">
                {primaryMetric?.value || "--"}
                {primaryMetric?.value?.includes("分") ? null : <small />}
              </div>
              <div className="v2-review-kpi-sub">
                {primaryMetric?.helper || dashboard.trendSummary}
              </div>
            </div>
          </div>
        </article>

        <article className="v2-review-kpi-card">
          <div className="v2-review-kpi-main">
            <div className="v2-review-kpi-icon green">弱</div>
            <div>
              <div className="v2-review-kpi-title">当前关键问题</div>
              <div className="v2-review-kpi-value v2-review-kpi-value--text">
                {topIssues[0]?.name || dashboard.headlineCard.title}
              </div>
              <div className="v2-review-kpi-sub">
                {topIssues[0]?.summary || dashboard.headlineCard.summary}
              </div>
            </div>
          </div>
        </article>

        <article className="v2-review-kpi-card">
          <div className="v2-review-kpi-main">
            <div className="v2-review-kpi-icon purple">验</div>
            <div>
              <div className="v2-review-kpi-title">动作验证率</div>
              <div className="v2-review-kpi-value">
                {actionVerificationRate}
                <small>%</small>
              </div>
              <div className="v2-review-kpi-sub">
                已验证 {dashboard.progressOverview.verifiedActionCount} 条 · 有效{" "}
                {dashboard.progressOverview.effectiveActionCount} 条
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="v2-review-top-panels">
        <section className="v2-review-summary-panel">
          <div className="v2-review-summary-panel__head">
            <h2>高频薄弱维度</h2>
            <span>基于最近 {dashboard.sampleSummaryCard.validSampleCount} 次有效训练</span>
          </div>
          <div className="v2-review-summary-list">
            {topIssues.length > 0 ? (
              topIssues.map((issue, index) => {
                const tone = getReviewAccentTone(index);
                return (
                  <article
                    key={issue.id}
                    className={`v2-review-summary-card ${tone} ${
                      selectedIssueId === issue.id ? "is-active" : ""
                    }`}
                  >
                    <div className="v2-review-summary-card__num">{String(index + 1).padStart(2, "0")}</div>
                    <div className="v2-review-summary-card__body">
                      <div className="v2-review-summary-card__title">
                        <strong>{issue.name}</strong>
                        <span className={`v2-review-inline-tag ${tone}`}>
                          {getIssueSeverityLabel(issue.severity)}
                        </span>
                      </div>
                      <p>{issue.summary}</p>
                      <div className="v2-review-summary-card__meta">
                        <span>出现次数 {issue.frequency} 次</span>
                        <span>影响分 {Math.round(issue.impactScore)}</span>
                        <span>最近一次 {formatDateTime(issue.latestSeenAt)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`v2-review-summary-btn ${tone}`}
                      onClick={() => revealDiagnosisSection(issue.id)}
                    >
                      查看诊断
                    </button>
                  </article>
                );
              })
            ) : (
              <article className="card v2-review-empty-card">
                <strong>{isLoading ? "正在分析薄弱维度..." : "当前没有稳定薄弱维度"}</strong>
                <p>系统只展示已经有真实样本支撑的问题，不会凭空生成高频项。</p>
              </article>
            )}
          </div>
        </section>

        <section className="v2-review-summary-panel">
          <div className="v2-review-summary-panel__head">
            <h2>推荐补强计划</h2>
            <span>根据真实问题自动生成</span>
          </div>
          <div className="v2-review-summary-list">
            {topActions.length > 0 ? (
              topActions.map((action, index) => {
                const tone = getReviewAccentTone(index);
                return (
                  <article key={action.id} className={`v2-review-summary-card ${tone}`}>
                    <div className="v2-review-summary-card__num">{String(index + 1).padStart(2, "0")}</div>
                    <div className="v2-review-summary-card__body">
                      <div className="v2-review-summary-card__title">
                        <strong>{action.title}</strong>
                        <span className={`v2-review-inline-tag ${tone}`}>
                          {getActionPriorityLabel(action.priority)}
                        </span>
                      </div>
                      <p>{action.description}</p>
                      <div className="v2-review-summary-card__meta">
                        <span>推荐方式 {action.recommendedMode}</span>
                        <span>预计投入 {action.estimatedEffort}</span>
                        <span>
                          {action.recommendedQuestionTypes.length > 0
                            ? action.recommendedQuestionTypes.join(" / ")
                            : "按当前问题自动生成"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`v2-review-summary-btn ${tone}`}
                      disabled={executingActionId === action.id}
                      onClick={() => void handleExecuteAction(action.id)}
                    >
                      {executingActionId === action.id ? "正在进入..." : "开始计划"}
                    </button>
                  </article>
                );
              })
            ) : (
              <article className="card v2-review-empty-card">
                <strong>当前还没有可执行补强计划</strong>
                <p>请先补足有效样本，系统才会把建议收敛成可执行任务卡。</p>
              </article>
            )}
          </div>
        </section>
      </section>

      <section className="v2-review-analytics-grid">
        <section className="v2-review-analytics-card">
          <div className="v2-review-analytics-card__head">
            <div>
              <h2>问题趋势分析</h2>
              <p>按真实快照对比上一次与当前得分变化。</p>
            </div>
          </div>
          <div className="v2-review-analytics-stats">
            <article className="v2-review-analytics-stat">
              <strong>{dashboard.progressOverview.improvedIssueCount}</strong>
              <span>改善问题</span>
            </article>
            <article className="v2-review-analytics-stat">
              <strong>{dashboard.progressOverview.worsenedIssueCount}</strong>
              <span>恶化问题</span>
            </article>
            <article className="v2-review-analytics-stat">
              <strong>{dashboard.progressOverview.stableIssueCount}</strong>
              <span>稳定问题</span>
            </article>
          </div>
          {topIssueProgress.length > 0 ? (
            <div className="v2-review-table-wrap">
              <table className="v2-review-data-table">
                <thead>
                  <tr>
                    <th>问题</th>
                    <th>上次</th>
                    <th>当前</th>
                    <th>变化</th>
                    <th>判断</th>
                  </tr>
                </thead>
                <tbody>
                  {topIssueProgress.map((item) => (
                    <tr key={item.issueId || item.issueName}>
                      <td>
                        <div className="v2-review-table-label">
                          <strong>{item.issueName}</strong>
                          <span className="v2-review-table-meter">
                            <span style={{ width: `${clampPercentage(item.currentScore)}%` }} />
                          </span>
                        </div>
                      </td>
                      <td>{Math.round(item.previousScore)}</td>
                      <td>{Math.round(item.currentScore)}</td>
                      <td
                        className={
                          item.changeDirection === "down"
                            ? "is-positive"
                            : item.changeDirection === "up"
                              ? "is-negative"
                              : ""
                        }
                      >
                        {formatSignedValue(item.changeValue)}
                      </td>
                      <td>{item.judgement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="v2-review-empty-table">当前还没有足够历史快照，暂时无法生成趋势表。</div>
          )}
        </section>

        <section className="v2-review-analytics-card">
          <div className="v2-review-analytics-card__head">
            <div>
              <h2>动作效果分析</h2>
              <p>看哪些补强动作真的有效，避免只看建议不看结果。</p>
            </div>
          </div>
          <div className="v2-review-analytics-stats">
            <article className="v2-review-analytics-stat">
              <strong>{dashboard.progressOverview.verifiedActionCount}</strong>
              <span>已验证动作</span>
            </article>
            <article className="v2-review-analytics-stat">
              <strong>{dashboard.progressOverview.effectiveActionCount}</strong>
              <span>验证有效</span>
            </article>
            <article className="v2-review-analytics-stat">
              <strong>{actionVerificationRate}%</strong>
              <span>验证率</span>
            </article>
          </div>
          {topActionEffectiveness.length > 0 ? (
            <div className="v2-review-table-wrap">
              <table className="v2-review-data-table">
                <thead>
                  <tr>
                    <th>动作</th>
                    <th>执行次数</th>
                    <th>采样数</th>
                    <th>效果</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {topActionEffectiveness.map((item) => (
                    <tr key={item.actionId || item.actionTitle}>
                      <td>{item.actionTitle}</td>
                      <td>{item.executionCount}</td>
                      <td>{item.postActionSampleCount}</td>
                      <td>
                        <span
                          className={`v2-review-inline-tag ${getActionEffectivenessTone(
                            item.effectiveness
                          )}`}
                        >
                          {getActionEffectivenessLabel(item.effectiveness)}
                        </span>
                      </td>
                      <td>{item.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="v2-review-empty-table">当前还没有动作执行记录，暂时无法生成效果表。</div>
          )}
        </section>

        <section className="v2-review-analytics-card">
            <div className="v2-review-analytics-card__head">
              <div>
                <h2>样本覆盖与来源</h2>
                <p>把可信度、来源分布和当前对比视角放到同一张分析卡里。</p>
              </div>
            </div>
            <div className="v2-review-coverage-grid">
              {coverageItems.map((item) => (
                <article key={item.label} className="v2-review-coverage-card">
                  <div className="v2-review-coverage-card__top">
                    <strong>{item.value}%</strong>
                    <span>{item.label}</span>
                  </div>
                  <span className="v2-review-table-meter">
                    <span style={{ width: `${item.value}%` }} />
                  </span>
                </article>
              ))}
            </div>
            <div className="v2-review-source-list">
              {sourceBreakdown.length > 0 ? (
                sourceBreakdown.map((item) => {
                  const width =
                    totalSourceCount > 0
                      ? Math.max(12, Math.round((item.count / totalSourceCount) * 100))
                      : 0;
                  return (
                    <article key={item.source} className="v2-review-source-item">
                      <div className="v2-review-source-item__head">
                        <strong>{item.source}</strong>
                        <span>{item.count} 个样本</span>
                      </div>
                      <span className="v2-review-table-meter">
                        <span style={{ width: `${width}%` }} />
                      </span>
                    </article>
                  );
                })
              ) : (
                <div className="v2-review-empty-table">
                  当前还没有稳定来源分布，继续累积真实样本后会自动更新。
                </div>
              )}
            </div>
            {primaryComparisonGroup ? (
              <>
                <div className="v2-review-analytics-subtable">
                  <div className="v2-review-analytics-subtable__title">
                    <strong>{primaryComparisonGroup.groupType}</strong>
                    <span>对比视角来自当前复盘快照中的真实分组。</span>
                  </div>
                </div>
                <div className="v2-review-table-wrap">
                  <table className="v2-review-data-table">
                    <thead>
                      <tr>
                        <th>标签</th>
                        <th>值</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {primaryComparisonGroup.items.map((item) => (
                        <tr key={`${primaryComparisonGroup.groupKey}-${item.label}`}>
                          <td>{item.label}</td>
                          <td>{item.value}</td>
                          <td>{item.helper}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
      </section>

      <section className="v2-review-history-panel">
        <div className="v2-review-history-panel__head">
          <div>
            <h2>历史训练记录</h2>
            <p>点击右侧查看诊断，进入问题、证据、动作和验证的完整弹窗。</p>
          </div>
          <span>
            {secondaryMetric?.label || "可信分"} ·{" "}
            {secondaryMetric?.value || dashboard.confidenceCard.confidenceScore}
          </span>
        </div>
        <div className="v2-review-history-scroll">
          <table className="v2-review-history-table">
            <thead>
              <tr>
                <th style={{ width: "18%" }}>训练时间</th>
                <th style={{ width: "14%" }}>训练类型</th>
                <th style={{ width: "26%" }}>方向</th>
                <th style={{ width: "10%" }}>得分</th>
                <th style={{ width: "16%" }}>证据状态</th>
                <th style={{ width: "16%" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {topHistorySessions.length > 0 ? (
                topHistorySessions.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      <span className="v2-review-type-pill">
                        <span className={`v2-review-tiny-icon ${getReviewModeTone(item.mode)}`}>
                          {getReviewModeTone(item.mode) === "blue" ? "◎" : "💬"}
                        </span>
                        {getReviewModeLabel(item.mode)}
                      </span>
                    </td>
                    <td>{[item.role, item.company].filter(Boolean).join(" · ") || "未标明方向"}</td>
                    <td>{item.score === null ? "--" : `${Math.round(item.score)} 分`}</td>
                    <td>{item.hasEvidence ? "可下钻" : "待补证据"}</td>
                    <td>
                      <button
                        type="button"
                        className="v2-review-row-link"
                        onClick={() => revealDiagnosisSection()}
                      >
                        查看诊断
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="v2-review-empty-table">
                      {isLoading ? "正在整理历史记录..." : "当前还没有可展示的真实训练记录。"}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showDiagnosisSection ? (
        <div
          className="v2-review-modal"
          role="dialog"
          aria-modal="true"
          aria-label="问题诊断与改进行动"
          onClick={closeDiagnosisSection}
        >
          <div
            className="v2-review-modal__panel"
            id="review-diagnosis-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="v2-review-modal__header">
              <div className="v2-review-modal__hero">
                <span className="pill blue">查看诊断</span>
                <div>
                  <h2>{activeDiagnosisTitle}</h2>
                  <p>
                    共 {dashboard.issues.length} 个问题，当前问题下有 {selectedIssueEvidences.length} 条证据，可执行动作{" "}
                    {dashboard.actions.length} 条
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="v2-review-modal__close"
                onClick={closeDiagnosisSection}
                aria-label="关闭诊断弹窗"
              >
                关闭诊断
              </button>
            </div>
            <section className="v2-review-grid">
        <section className="v2-review-grid__main">
          <div className="v2-review-section" id="review-diagnosis-section">
            <div className="v2-review-section__header">
              <div>
                <h2>问题</h2>
                <p>先看问题本身，再看根因和影响。</p>
              </div>
            </div>

            <div className="v2-review-diagnosis-layout">
              <div className="v2-review-issue-list">
                {dashboard.issues.length > 0 ? (
                  dashboard.issues.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      className={`card v2-review-issue-card ${selectedIssueId === issue.id ? "is-active" : ""}`}
                      onClick={() => setSelectedIssueId(issue.id)}
                    >
                      <div className="v2-review-issue-card__top">
                        <strong>{issue.name}</strong>
                        <span className={`pill ${issue.severity === "high" ? "orange" : issue.severity === "medium" ? "blue" : "green"}`}>
                          {issue.severity === "high"
                            ? "高优先级"
                            : issue.severity === "medium"
                              ? "中优先级"
                              : "观察中"}
                        </span>
                      </div>
                      <p>{issue.summary}</p>
                      <div className="v2-review-issue-card__meta">
                        <span>最近出现 {issue.frequency} 次</span>
                        <span>最近一次 {formatDateTime(issue.latestSeenAt)}</span>
                        <span>影响分 {Math.round(issue.impactScore)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <article className="card v2-review-empty-card">
                    <strong>{isLoading ? "正在分析问题..." : "当前没有稳定问题进入主视图"}</strong>
                    <p>当前样本不足或问题还不稳定，系统不会伪造强结论。</p>
                  </article>
                )}
              </div>

              <div className="card v2-review-issue-detail">
                {selectedIssue && selectedIssueDetail ? (
                  <>
                    <div className="v2-review-issue-detail__top">
                      <div>
                  <span className="pill blue">{selectedIssue.category}</span>
                        <h3>{selectedIssue.name}</h3>
                      </div>
                      <div className="v2-review-issue-detail__score">
                        <strong>{Math.round(selectedIssue.impactScore)}</strong>
                        <small>影响分</small>
                      </div>
                    </div>
                    <p>{selectedIssue.summary}</p>
                    <div className="v2-review-detail-grid">
                      <article className="v2-review-detail-block">
                        <strong>根因解释</strong>
                        <p>{selectedIssueDetail.rootCause}</p>
                      </article>
                      <article className="v2-review-detail-block">
                        <strong>影响说明</strong>
                        <p>{selectedIssueDetail.impact.willAffect.join("、") || "等待更多样本"}</p>
                      </article>
                    </div>
                    <div className="v2-review-root-tree">
                      <strong>问题树</strong>
                      {selectedIssueDetail.rootCauseTree.map((node) => (
                        <article key={node.id} className="v2-review-root-node">
                          <span>{node.label}</span>
                          <p>{node.description}</p>
                          {node.children.length > 0 ? (
                            <div className="v2-review-root-node__children">
                              {node.children.map((child) => (
                                <div key={child.id} className="v2-review-root-child">
                                  <strong>{child.label}</strong>
                                  <p>{child.description}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <article className="v2-review-empty-card">
                    <strong>{isIssueLoading ? "正在加载问题详情..." : "选择左侧问题查看详情"}</strong>
                    <p>你可以继续下钻到证据、动作和改善验证，而不是只停留在问题列表。</p>
                  </article>
                )}
              </div>
            </div>
          </div>

          <div className="v2-review-section">
            <div className="v2-review-section__header">
              <div>
                <h2>证据</h2>
                <p>只保留能支撑当前问题判断的真实片段。</p>
              </div>
            </div>
            <div className="v2-review-evidence-list">
              {selectedIssueEvidences.length > 0 ? (
                selectedIssueEvidences.map((evidence) => (
                  <article
                    key={evidence.id}
                    id={`review-evidence-${evidence.id}`}
                    className={`card v2-review-evidence-card ${deepLinkEvidenceId === evidence.id ? "is-active" : ""}`}
                  >
                    <div className="v2-review-evidence-card__top">
                      <strong>{evidence.questionTitle}</strong>
                      <span className={`pill ${evidence.severity === "high" ? "orange" : evidence.severity === "medium" ? "blue" : "green"}`}>
                        置信度 {Math.round(evidence.confidence)}
                      </span>
                    </div>
                    <p>{evidence.excerpt}</p>
                    <div className="v2-review-evidence-card__meta">
                      <span>{evidence.sessionType}</span>
                      <span>{formatDateTime(evidence.sessionCreatedAt)}</span>
                      <span>{evidence.dimension}</span>
                    </div>
                    <div className="v2-review-evidence-card__context">
                      <strong>为什么命中</strong>
                      <p>{evidence.reason}</p>
                      <strong>推荐改写</strong>
                      <p>{evidence.rewriteSuggestion.improvedAnswer}</p>
                    </div>
                  </article>
                ))
              ) : (
                <article className="card v2-review-empty-card">
                  <strong>{selectedIssueId ? "当前问题还没有更多可展示证据" : "先选择一个问题"}</strong>
                  <p>没有证据支撑的问题，不会进入最终用户视图。</p>
                </article>
              )}
            </div>
          </div>
        </section>

        <aside className="v2-review-grid__side">
          <section className="v2-review-section">
            <div className="v2-review-section__header">
              <div>
                <h2>动作</h2>
                <p>把当前问题直接转成可执行动作。</p>
              </div>
            </div>
            <div className="v2-review-action-list">
              {dashboard.actions.map((action) => (
                <article key={action.id} className="card v2-review-action-card">
                  <div className="v2-review-action-card__top">
                    <strong>{action.title}</strong>
                    <span className="pill blue">{getActionPriorityLabel(action.priority)}</span>
                  </div>
                  <p>{action.description}</p>
                  <div className="v2-review-action-card__meta">
                    <span>推荐方式：{action.recommendedMode}</span>
                    <span>推荐题型：{action.recommendedQuestionTypes.join(" / ")}</span>
                    <span>投入：{action.estimatedEffort}</span>
                  </div>
                  <div className="v2-review-action-card__why">
                    <strong>为什么练这个</strong>
                    <p>{action.whyThisAction}</p>
                    <strong>完成标准</strong>
                    <p>{action.successMetric}</p>
                    <strong>验证标准</strong>
                    <p>{action.expectedOutcome}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={executingActionId === action.id}
                    onClick={() => void handleExecuteAction(action.id)}
                  >
                    {executingActionId === action.id ? "正在进入..." : "去行动"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </aside>
            </section>
          </div>
        </div>
      ) : null}
    </main>
  );
}
