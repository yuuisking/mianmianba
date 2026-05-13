import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  ReviewActionDTO,
  ReviewActionEffectivenessDTO,
  ReviewActionPayload,
  ReviewAgentTraceDTO,
  ReviewComparisonGroupDTO,
  ReviewDashboardFilters,
  ReviewEvidenceDTO,
  ReviewHeadlineCard,
  ReviewHistorySessionDTO,
  ReviewIssueDTO,
  ReviewIssueProgressDTO,
  ReviewMetricCard,
  ReviewProgressOverviewDTO,
  ReviewSampleSummaryCard,
  ReviewTodayActionCard,
  V2ReviewDashboardSnapshot,
} from "@/lib/interview-v2/domain";
import { listReviewInsightAgents } from "@/lib/interview-v2/reviewAgents";

type ParsedDimension = {
  name?: string;
  score?: number | string;
};

type ParsedReviewPanelMetadata = {
  focusAreas?: string[];
  actionItems?: Array<{
    title?: string;
    desc?: string;
  }>;
};

type ParsedReportMetadata = {
  role?: string;
  companyName?: string;
  targetLevel?: string;
  reviewPanel?: ParsedReviewPanelMetadata;
};

type UnifiedSample = {
  id: string;
  sourceType: "mock" | "targeted" | "learning";
  sampleValidity: "valid" | "invalid";
  invalidReason: string | null;
  createdAt: Date;
  role: string | null;
  company: string | null;
  level: string | null;
  mode: string;
  status: string;
  score: number | null;
  roundCount: number;
  reportStatus: string;
  hasEvidence: boolean;
  dimensions: string[];
  excerpts: string[];
  sourceLabel: string;
  questionTitle: string;
  rewriteSuggestion: string | null;
  improvementHints: string[];
};

type EvidenceDraft = Omit<ReviewEvidenceDTO, "id" | "issueId"> & {
  issueKey: string;
};

type IssueDraft = Omit<ReviewIssueDTO, "id" | "recommendedActionIds"> & {
  issueKey: string;
};

type ActionDraft = Omit<ReviewActionDTO, "id" | "issueId"> & {
  issueKey: string;
};

/**
 * 将普通对象稳定转换为 Prisma 可接受的 JSON 值。
 * @param {T} value 任意可序列化对象。
 * @returns {Prisma.InputJsonValue} 可写入 Prisma JSON 字段的值。
 */
function toPrismaJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 解析 JSON 数组字段，失败时返回空数组。
 * @param {string | null | undefined} raw 原始 JSON 字符串。
 * @returns {T[]} 解析结果。
 */
function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * 解析任意 JSON 值，失败时返回兜底值。
 * @param {unknown} raw 原始值。
 * @param {T} fallback 兜底值。
 * @returns {T} 解析结果。
 */
function parseJsonValue<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) {
    return fallback;
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

/**
 * 从历史报告 metadata 中提取复盘中心需要的最小字段集。
 * @param {string | null | undefined} raw 报告 metadata JSON。
 * @returns {ParsedReportMetadata} 解析后的 metadata。
 */
function parseReportMetadata(raw: string | null | undefined): ParsedReportMetadata {
  return parseJsonValue<ParsedReportMetadata>(raw, {});
}

/**
 * 对数值做边界约束。
 * @param {number} value 原始值。
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 约束结果。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 生成自然日零点。
 * @param {Date} date 参考时间。
 * @returns {Date} 零点时间。
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 获取向前偏移若干天后的时间。
 * @param {Date} date 参考时间。
 * @param {number} days 天数。
 * @returns {Date} 偏移结果。
 */
function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * 计算平均值。
 * @param {number[]} values 数值列表。
 * @returns {number | null} 平均值。
 */
function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

/**
 * 生成 ISO 时间字符串。
 * @param {Date | null | undefined} value 时间值。
 * @returns {string | null} ISO 字符串。
 */
function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * 规范化问题键，保证跨样本归并时稳定。
 * @param {string} input 原始问题名。
 * @returns {string} 规范化后的 key。
 */
function normalizeIssueKey(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * 判断问题类别。
 * @param {string} issueName 问题名称。
 * @returns {string} 归类结果。
 */
function resolveIssueCategory(issueName: string): string {
  if (/system|架构|设计|高可用|容量|吞吐/i.test(issueName)) {
    return "system_design";
  }
  if (/沟通|表达|STAR|行为|动机|协作/i.test(issueName)) {
    return "behavioral";
  }
  if (/知识|基础|原理|技术深度|缓存|mysql|redis|并发|算法|数据结构/i.test(issueName)) {
    return "knowledge";
  }
  return "execution";
}

/**
 * 根据影响分映射严重度。
 * @param {number} impactScore 影响分。
 * @returns {"high" | "medium" | "low"} 严重度。
 */
function resolveSeverity(impactScore: number): "high" | "medium" | "low" {
  if (impactScore >= 75) {
    return "high";
  }
  if (impactScore >= 45) {
    return "medium";
  }
  return "low";
}

/**
 * 将时间范围转成查询起点。
 * @param {"7d" | "14d" | "30d" | "all"} timeRange 时间范围。
 * @returns {Date | null} 起始时间。
 */
function buildTimeRangeStart(
  timeRange: "7d" | "14d" | "30d" | "all"
): Date | null {
  const today = startOfDay(new Date());
  if (timeRange === "all") {
    return null;
  }
  if (timeRange === "7d") {
    return subtractDays(today, 6);
  }
  if (timeRange === "14d") {
    return subtractDays(today, 13);
  }
  return subtractDays(today, 29);
}

/**
 * 生成默认筛选条件。
 * @param {Partial<ReviewDashboardFilters> | undefined} filters 外部筛选条件。
 * @returns {ReviewDashboardFilters} 归一化后的筛选条件。
 */
function normalizeFilters(
  filters?: Partial<ReviewDashboardFilters>
): ReviewDashboardFilters {
  return {
    timeRange: filters?.timeRange ?? "14d",
    interviewType: filters?.interviewType ?? "all",
    role: filters?.role?.trim() || null,
    company: filters?.company?.trim() || null,
    dimension: filters?.dimension?.trim() || null,
    sampleStatus: filters?.sampleStatus ?? "all",
  };
}

/**
 * 构造当前查询的快照指纹。
 * @param {string} userId 用户 ID。
 * @param {ReviewDashboardFilters} filters 当前筛选条件。
 * @returns {string} 指纹字符串。
 */
function buildSnapshotFingerprint(
  userId: string,
  filters: ReviewDashboardFilters
): string {
  return createHash("sha1")
    .update(JSON.stringify({ userId, filters }))
    .digest("hex");
}

/**
 * 读取时间范围的友好标签。
 * @param {"7d" | "14d" | "30d" | "all"} timeRange 时间范围。
 * @returns {string} 标签。
 */
function formatTimeRangeLabel(timeRange: "7d" | "14d" | "30d" | "all"): string {
  switch (timeRange) {
    case "7d":
      return "最近 7 天";
    case "14d":
      return "最近 14 天";
    case "30d":
      return "最近 30 天";
    default:
      return "全部历史样本";
  }
}

/**
 * 为动作构造跳转路径与 payload。
 * @param {{ issue: IssueDraft; role: string | null; company: string | null; level: string | null }} input 问题与用户上下文。
 * @returns {{ targetPath: string; actionType: string; recommendedMode: string; recommendedQuestionTypes: string[]; recommendedDifficulty: string; payload: ReviewActionPayload }} 动作配置。
 */
function buildActionRouting(input: {
  issue: IssueDraft;
  role: string | null;
  company: string | null;
  level: string | null;
}): {
  targetPath: string;
  actionType: string;
  recommendedMode: string;
  recommendedQuestionTypes: string[];
  recommendedDifficulty: string;
  payload: ReviewActionPayload;
} {
  const category = input.issue.category;
  const commonPayload: ReviewActionPayload = {
    role: input.role,
    company: input.company,
    level: input.level,
    issueId: "",
    issueName: input.issue.name,
    trainingGoal: `压低「${input.issue.name}」对当前岗位面试表现的影响`,
    recentFailureSummary: input.issue.summary,
    recommendedPromptStyle:
      category === "behavioral"
        ? "追问表达结构和证据"
        : category === "system_design"
          ? "追问方案取舍和边界条件"
          : "追问原理和可落地性",
    recommendedMode:
      category === "behavioral" ? "text" : category === "system_design" ? "realtime" : "text",
    recommendedQuestionTypes:
      category === "behavioral"
        ? ["behavioral", "project_deep_dive"]
        : category === "system_design"
          ? ["system_design", "project_deep_dive"]
          : ["knowledge_drill", "project_deep_dive"],
    evaluationCriteria: [
      "是否明确回答核心问题",
      "是否给出具体证据和量化结果",
      "是否能稳定解释关键取舍",
    ],
    successMetric: `同问题相关样本的影响分下降，且最近 3 个有效样本不再反复命中「${input.issue.name}」`,
  };

  if (category === "knowledge") {
    return {
      targetPath: "/learning",
      actionType: "learning_reinforcement",
      recommendedMode: "learning",
      recommendedQuestionTypes: ["knowledge_drill"],
      recommendedDifficulty: "基础补强",
      payload: commonPayload,
    };
  }

  if (category === "system_design") {
    return {
      targetPath: "/setup",
      actionType: "stage_interview",
      recommendedMode: "realtime",
      recommendedQuestionTypes: ["system_design", "project_deep_dive"],
      recommendedDifficulty: "中高强度",
      payload: commonPayload,
    };
  }

  return {
    targetPath: "/practice",
    actionType: "targeted_practice",
    recommendedMode: "text",
    recommendedQuestionTypes: ["behavioral", "project_deep_dive"],
    recommendedDifficulty: "定向压强",
    payload: commonPayload,
  };
}

/**
 * 判断面试样本是否有效。
 * @param {{ userMessageCount: number; hasReport: boolean }} input 样本关键信息。
 * @returns {{ valid: boolean; reason: string | null }} 判定结果。
 */
function resolveInterviewSampleValidity(input: {
  userMessageCount: number;
  hasReport: boolean;
}): { valid: boolean; reason: string | null } {
  if (input.userMessageCount === 0) {
    return { valid: false, reason: "0 轮用户回答，无法形成有效分析样本" };
  }
  if (!input.hasReport) {
    return { valid: false, reason: "缺少复盘报告，无法稳定进入证据池" };
  }
  return { valid: true, reason: null };
}

/**
 * 判断学习样本是否有效。
 * @param {{ answerCount: number; totalScore: number | null }} input 样本关键信息。
 * @returns {{ valid: boolean; reason: string | null }} 判定结果。
 */
function resolveLearningSampleValidity(input: {
  answerCount: number;
  totalScore: number | null;
}): { valid: boolean; reason: string | null } {
  if (input.answerCount === 0) {
    return { valid: false, reason: "没有有效作答记录，无法进入学习分析池" };
  }
  if (input.totalScore === null) {
    return { valid: false, reason: "缺少总分结果，暂时只能归档为无效样本" };
  }
  return { valid: true, reason: null };
}

/**
 * 将模拟面试记录转换为统一样本。
 * @param {Awaited<ReturnType<typeof prisma.interviewSession.findMany>>} sessions 原始会话。
 * @returns {UnifiedSample[]} 统一样本。
 */
function buildInterviewSamples(
  sessions: Array<{
    id: string;
    mode: string;
    status: string;
    score: number | null;
    createdAt: Date;
    messages: Array<{ id: string; role: string; content: string }>;
    report: {
      highlights: string;
      risks: string;
      nextSteps: string;
      dimensions: string | null;
      evidence: string | null;
      metadata: string | null;
    } | null;
  }>
): UnifiedSample[] {
  return sessions.map((session) => {
    const metadata = parseReportMetadata(session.report?.metadata);
    const reviewPanel = metadata.reviewPanel;
    const userMessages = session.messages.filter((item) => item.role === "user");
    const validity = resolveInterviewSampleValidity({
      userMessageCount: userMessages.length,
      hasReport: Boolean(session.report),
    });
    const lowDimensions = parseJsonArray<ParsedDimension>(session.report?.dimensions).flatMap(
      (item) => {
        const score = Number(item.score);
        const name = item.name?.trim() || "";
        if (!name || Number.isNaN(score) || score >= 7) {
          return [];
        }
        return [name];
      }
    );
    const riskDimensions = parseJsonArray<string>(session.report?.risks).map((item) => item.trim());
    const focusAreas = (reviewPanel?.focusAreas || []).map((item) => item.trim()).filter(Boolean);
    const actionHints = (reviewPanel?.actionItems || [])
      .flatMap((item) => [item.title?.trim() || "", item.desc?.trim() || ""])
      .filter(Boolean);
    const excerpts = userMessages.slice(-2).map((item) => item.content.trim()).filter(Boolean);
    return {
      id: session.id,
      sourceType: session.mode === "targeted" ? "targeted" : "mock",
      sampleValidity: validity.valid ? "valid" : "invalid",
      invalidReason: validity.reason,
      createdAt: session.createdAt,
      role: metadata.role?.trim() || null,
      company: metadata.companyName?.trim() || null,
      level: metadata.targetLevel?.trim() || null,
      mode: session.mode,
      status: session.status,
      score: session.score,
      roundCount: Math.max(userMessages.length, 1),
      reportStatus: session.report ? "ready" : "missing",
      hasEvidence: excerpts.length > 0,
      dimensions: [...new Set([...lowDimensions, ...riskDimensions.filter(Boolean), ...focusAreas])],
      excerpts,
      sourceLabel: "模拟面试",
      questionTitle: "模拟面试回答片段",
      rewriteSuggestion: session.report?.nextSteps || null,
      improvementHints:
        session.report?.highlights || actionHints.length > 0
          ? [session.report?.highlights || "", ...actionHints].filter(Boolean)
          : ["补充更具体的结果、取舍与量化指标。"],
    };
  });
}

/**
 * 将学习训练记录转换为统一样本。
 * @param {Array<{ id: string; status: string; totalScore: number | null; createdAt: Date; document: { title: string }; userAnswerScores: Array<{ id: string; question: string; userAnswer: string; score: number | null; missingPoints: unknown; factErrors: unknown; expressionFeedback: string | null; improvedAnswer: string | null; }> }>} sessions 原始学习记录。
 * @returns {UnifiedSample[]} 统一样本。
 */
function buildLearningSamples(
  sessions: Array<{
    id: string;
    status: string;
    totalScore: number | null;
    createdAt: Date;
    document: { title: string };
    userAnswerScores: Array<{
      id: string;
      question: string;
      userAnswer: string;
      score: number | null;
      missingPoints: unknown;
      factErrors: unknown;
      expressionFeedback: string | null;
      improvedAnswer: string | null;
    }>;
  }>
): UnifiedSample[] {
  return sessions.map((session) => {
    const validity = resolveLearningSampleValidity({
      answerCount: session.userAnswerScores.length,
      totalScore: session.totalScore,
    });
    const issueNames = new Set<string>();
    for (const answer of session.userAnswerScores) {
      const missingPoints = parseJsonValue<string[]>(answer.missingPoints, []);
      const factErrors = parseJsonValue<string[]>(answer.factErrors, []);
      if ((answer.score ?? 100) < 80) {
        issueNames.add("知识掌握与迁移");
      }
      if (missingPoints.length > 0) {
        issueNames.add("回答不完整");
      }
      if (factErrors.length > 0) {
        issueNames.add("事实错误与细节不准");
      }
      if (answer.expressionFeedback?.trim()) {
        issueNames.add("表达清晰度");
      }
    }

    return {
      id: session.id,
      sourceType: "learning",
      sampleValidity: validity.valid ? "valid" : "invalid",
      invalidReason: validity.reason,
      createdAt: session.createdAt,
      role: null,
      company: null,
      level: null,
      mode: "learning",
      status: session.status,
      score: session.totalScore,
      roundCount: session.userAnswerScores.length,
      reportStatus: session.totalScore === null ? "partial" : "ready",
      hasEvidence: session.userAnswerScores.length > 0,
      dimensions: Array.from(issueNames),
      excerpts: session.userAnswerScores.slice(0, 2).map((item) => item.userAnswer.trim()),
      sourceLabel: `学习测验 · ${session.document.title}`,
      questionTitle: session.userAnswerScores[0]?.question || session.document.title,
      rewriteSuggestion: session.userAnswerScores[0]?.improvedAnswer || null,
      improvementHints: session.userAnswerScores
        .map((item) => item.expressionFeedback?.trim() || "")
        .filter(Boolean)
        .slice(0, 2),
    };
  });
}

/**
 * 将学习进度转换为补充样本，用于识别基础知识薄弱信号。
 * @param {Array<{ id: string; status: string; score: number | null; updatedAt: Date; document: { title: string } }>} progressList 学习进度。
 * @returns {UnifiedSample[]} 统一样本。
 */
function buildLearningProgressSamples(
  progressList: Array<{
    id: string;
    status: string;
    score: number | null;
    updatedAt: Date;
    document: { title: string };
  }>
): UnifiedSample[] {
  return progressList
    .filter((item) => item.score !== null)
    .map((item) => ({
      id: item.id,
      sourceType: "learning",
      sampleValidity: (item.score ?? 100) >= 0 ? "valid" : "invalid",
      invalidReason: null,
      createdAt: item.updatedAt,
      role: null,
      company: null,
      level: null,
      mode: "learning_progress",
      status: item.status,
      score: item.score,
      roundCount: 1,
      reportStatus: "ready",
      hasEvidence: true,
      dimensions: (item.score ?? 100) < 70 ? ["基础知识掌握不足"] : [],
      excerpts: [`《${item.document.title}》当前学习得分 ${Math.round(item.score ?? 0)} 分。`],
      sourceLabel: "学习进度",
      questionTitle: item.document.title,
      rewriteSuggestion: null,
      improvementHints: ["建议先补基础知识，再回到专项训练验证掌握情况。"],
    }));
}

/**
 * 按筛选条件过滤统一样本。
 * @param {UnifiedSample[]} samples 原始样本。
 * @param {ReviewDashboardFilters} filters 当前筛选条件。
 * @returns {UnifiedSample[]} 过滤后的样本。
 */
function applySampleFilters(
  samples: UnifiedSample[],
  filters: ReviewDashboardFilters
): UnifiedSample[] {
  return samples.filter((sample) => {
    if (filters.interviewType !== "all" && sample.sourceType !== filters.interviewType) {
      return false;
    }
    if (filters.sampleStatus !== "all" && sample.sampleValidity !== filters.sampleStatus) {
      return false;
    }
    if (filters.role && (!sample.role || !sample.role.includes(filters.role))) {
      return false;
    }
    if (filters.company && (!sample.company || !sample.company.includes(filters.company))) {
      return false;
    }
    if (
      filters.dimension &&
      !sample.dimensions.some((item) => item.toLowerCase().includes(filters.dimension!.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });
}

/**
 * 生成证据草稿。
 * @param {UnifiedSample[]} validSamples 有效样本池。
 * @returns {EvidenceDraft[]} 证据草稿。
 */
function buildEvidenceDrafts(validSamples: UnifiedSample[]): EvidenceDraft[] {
  const evidences: EvidenceDraft[] = [];
  for (const sample of validSamples) {
    const dimensions = sample.dimensions.length > 0 ? sample.dimensions : ["表现待观察"];
    for (const dimension of dimensions) {
      const issueKey = normalizeIssueKey(dimension);
      evidences.push({
        issueKey,
        sessionId: sample.id,
        sessionType: sample.sourceType,
        sessionCreatedAt: toIso(sample.createdAt),
        role: sample.role,
        company: sample.company,
        questionId: null,
        questionTitle: sample.questionTitle,
        messageId: null,
        excerpt:
          sample.excerpts[0] ||
          `${sample.sourceLabel}中命中了「${dimension}」相关问题，需要继续补样本。`,
        reason: `${sample.sourceLabel}中多次暴露出「${dimension}」问题。`,
        dimension,
        confidence: clamp(
          (sample.score === null ? 55 : sample.score < 70 ? 82 : sample.score < 80 ? 68 : 52) +
            (sample.hasEvidence ? 8 : -10),
          35,
          95
        ),
        severity:
          sample.score !== null && sample.score < 70
            ? "high"
            : sample.score !== null && sample.score < 80
              ? "medium"
              : "low",
        evidenceContext: {
          beforeMessages: [],
          targetMessage: sample.excerpts[0] || sample.sourceLabel,
          afterMessages: sample.excerpts.slice(1),
          scoreContext:
            sample.score === null
              ? "当前缺少稳定分数，只能结合行为信号给出弱结论。"
              : `当前样本得分 ${Math.round(sample.score)} 分。`,
          followUpContext: sample.improvementHints,
        },
        rewriteSuggestion: {
          originalAnswer: sample.excerpts[0] || "当前样本未保留完整回答。",
          problemReason: `${dimension} 是当前命中的核心问题。`,
          improvedAnswer:
            sample.rewriteSuggestion ||
            "建议补充结果指标、关键取舍和复盘总结，避免只描述过程不交代结论。",
          improvementHighlights:
            sample.improvementHints.length > 0
              ? sample.improvementHints
              : ["补充量化结果", "说明为什么这么做", "强调最终收益"],
        },
      });
    }
  }
  return evidences;
}

/**
 * 从证据池中生成问题草稿。
 * @param {EvidenceDraft[]} evidences 证据草稿。
 * @returns {IssueDraft[]} 问题草稿。
 */
function buildIssueDrafts(evidences: EvidenceDraft[]): IssueDraft[] {
  const grouped = new Map<string, EvidenceDraft[]>();
  for (const evidence of evidences) {
    const current = grouped.get(evidence.issueKey) ?? [];
    current.push(evidence);
    grouped.set(evidence.issueKey, current);
  }

  return Array.from(grouped.entries())
    .map(([issueKey, items]) => {
      const name = items[0]?.dimension || "待观察问题";
      const confidenceAverage = average(items.map((item) => item.confidence)) ?? 50;
      const impactScore = clamp(items.length * 12 + confidenceAverage * 0.72, 25, 100);
      const severity = resolveSeverity(impactScore);
      const category = resolveIssueCategory(name);
      const latestSeenAt = items
        .map((item) => item.sessionCreatedAt)
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null;

      return {
        issueKey,
        name,
        category,
        severity,
        frequency: items.length,
        stability: clamp(items.length * 18, 20, 100),
        impactScore,
        summary: `最近 ${items.length} 个有效样本都命中了「${name}」，已经影响当前复盘结论的稳定性。`,
        rootCause:
          category === "behavioral"
            ? "回答结构不稳，证据和结果表达不够完整。"
            : category === "system_design"
              ? "方案取舍和边界条件解释不够深入。"
              : category === "knowledge"
                ? "基础知识掌握不稳，迁移到实际问题时容易掉点。"
                : "真实案例和细节支撑不足，导致追问时表现不稳定。",
        latestSeenAt,
        relatedDimensionKeys: [issueKey],
        impact: {
          impactAreas:
            category === "behavioral"
              ? ["行为面", "项目深挖", "表达稳定性"]
              : category === "system_design"
                ? ["系统设计", "高阶技术轮", "复杂追问"]
                : ["基础知识", "专项训练", "综合技术面"],
          riskLevel: severity,
          willAffect:
            category === "behavioral"
              ? ["面试官判断你的表达组织能力", "项目亮点传达效率"]
              : category === "system_design"
                ? ["复杂问题拆解能力", "架构深度判断"]
                : ["技术原理追问", "知识迁移能力"],
          notAffect: ["登录状态", "页面浏览行为"],
        },
        rootCauseTree: [
          {
            id: `${issueKey}-root`,
            label: name,
            description: `当前问题集中体现在「${name}」相关样本。`,
            confidence: clamp(confidenceAverage, 35, 95),
            children: [
              {
                id: `${issueKey}-cause-1`,
                label: "直接原因",
                description:
                  category === "behavioral"
                    ? "回答里缺少明确结构、结果指标和角色贡献。"
                    : category === "system_design"
                      ? "缺少对边界条件、容量估算和故障兜底的连续解释。"
                      : "原理、取舍或细节解释不够完整。",
                confidence: clamp(confidenceAverage - 6, 35, 90),
                children: [],
              },
              {
                id: `${issueKey}-cause-2`,
                label: "更深层原因",
                description:
                  category === "knowledge"
                    ? "基础知识复训和学习验证之间没有形成稳定闭环。"
                    : "当前训练仍以做题或回答为主，缺少围绕同一问题的反复压强。",
                confidence: clamp(confidenceAverage - 10, 30, 88),
                children: [],
              },
            ],
          },
        ],
      };
    })
    .sort((left, right) => right.impactScore - left.impactScore);
}

/**
 * 生成动作草稿。
 * @param {IssueDraft[]} issues 问题草稿。
 * @param {{ role: string | null; company: string | null; level: string | null }} context 用户上下文。
 * @returns {ActionDraft[]} 动作草稿。
 */
function buildActionDrafts(
  issues: IssueDraft[],
  context: { role: string | null; company: string | null; level: string | null }
): ActionDraft[] {
  return issues.slice(0, 6).map((issue, index) => {
    const routing = buildActionRouting({
      issue,
      role: context.role,
      company: context.company,
      level: context.level,
    });
    return {
      issueKey: issue.issueKey,
      title:
        index === 0
          ? `今天先压掉「${issue.name}」`
          : index === 1
            ? `本周跟进「${issue.name}」`
            : `持续保持「${issue.name}」`,
      description: issue.summary,
      whyThisAction: `${issue.name} 当前影响分 ${Math.round(issue.impactScore)}，继续放着不管会反复拖分。`,
      actionType: routing.actionType,
      recommendedMode: routing.recommendedMode,
      recommendedQuestionTypes: routing.recommendedQuestionTypes,
      recommendedDifficulty: routing.recommendedDifficulty,
      targetPath: routing.targetPath,
      targetPayload: routing.payload,
      successMetric: routing.payload.successMetric,
      expectedOutcome: `下一轮复盘时，「${issue.name}」相关证据减少，且回答稳定度明显提升。`,
      estimatedEffort:
        routing.targetPath === "/learning" ? "20-30 分钟" : routing.targetPath === "/practice" ? "15-20 分钟" : "1 场阶段面试",
      priority: index === 0 ? "today" : index === 1 ? "thisWeek" : "keep",
    };
  });
}

/**
 * 构建顶部指标卡。
 * @param {{ validSamples: UnifiedSample[]; invalidSamples: UnifiedSample[]; previousValidCount: number; issues: IssueDraft[]; actionExecutionCount: number }} input 指标输入。
 * @returns {ReviewMetricCard[]} 指标卡。
 */
function buildMetrics(input: {
  validSamples: UnifiedSample[];
  invalidSamples: UnifiedSample[];
  previousValidCount: number;
  issues: IssueDraft[];
  actionExecutionCount: number;
}): ReviewMetricCard[] {
  const sampleCount = input.validSamples.length;
  const previous = input.previousValidCount;
  const delta =
    previous > 0
      ? Math.round(((sampleCount - previous) / previous) * 100)
      : sampleCount > 0
        ? 100
        : 0;
  const averageScoreValue = average(
    input.validSamples.map((item) => item.score).filter((item): item is number => item !== null)
  );
  const invalidRate =
    sampleCount + input.invalidSamples.length === 0
      ? 0
      : (input.invalidSamples.length / (sampleCount + input.invalidSamples.length)) * 100;

  return [
    {
      key: "validSamples",
      label: "有效样本数",
      value: `${sampleCount}`,
      helper: sampleCount > 0 ? "进入主分析池的有效样本" : "当前还没有有效样本",
      trend: delta >= 0 ? "positive" : "negative",
      baseline:
        delta > 0 ? `较上一周期 +${delta}%` : delta < 0 ? `较上一周期 ${delta}%` : "与上一周期持平",
    },
    {
      key: "averageScore",
      label: "有效样本均分",
      value: averageScoreValue === null ? "--" : `${Math.round(averageScoreValue)}`,
      helper:
        averageScoreValue === null ? "当前缺少足够分数样本" : "仅基于有效样本计算，不混入无效样本",
      trend:
        averageScoreValue === null ? "neutral" : averageScoreValue >= 80 ? "positive" : "negative",
      baseline: averageScoreValue === null ? "等待更多有效样本" : "稳态目标：80+",
    },
    {
      key: "activeIssues",
      label: "稳定问题数",
      value: `${input.issues.length}`,
      helper: input.issues.length > 0 ? "已形成稳定问题池" : "当前没有稳定问题进入主视图",
      trend: input.issues.length > 0 ? "negative" : "positive",
      baseline: "仅统计稳定证据支持的问题",
    },
    {
      key: "invalidRate",
      label: "无效样本占比",
      value: `${Math.round(invalidRate)}%`,
      helper: "无效样本已单独归档，不参与主结论",
      trend: invalidRate <= 20 ? "positive" : "negative",
      baseline: "建议长期压到 20% 以下",
    },
    {
      key: "actionExecutions",
      label: "动作执行次数",
      value: `${input.actionExecutionCount}`,
      helper: "累计从复盘动作卡触发的执行次数",
      trend: input.actionExecutionCount > 0 ? "positive" : "neutral",
      baseline: "建议形成复盘后立刻执行的闭环",
    },
  ];
}

/**
 * 生成样本摘要卡。
 * @param {{ validSamples: UnifiedSample[]; invalidSamples: UnifiedSample[]; filters: ReviewDashboardFilters }} input 样本输入。
 * @returns {ReviewSampleSummaryCard} 摘要卡。
 */
function buildSampleSummaryCard(input: {
  validSamples: UnifiedSample[];
  invalidSamples: UnifiedSample[];
  filters: ReviewDashboardFilters;
}): ReviewSampleSummaryCard {
  const breakdownMap = new Map<string, number>();
  for (const sample of input.validSamples) {
    breakdownMap.set(sample.sourceLabel, (breakdownMap.get(sample.sourceLabel) ?? 0) + 1);
  }
  return {
    validSampleCount: input.validSamples.length,
    invalidSampleCount: input.invalidSamples.length,
    timeRangeLabel: formatTimeRangeLabel(input.filters.timeRange),
    mainSourceBreakdown: Array.from(breakdownMap.entries()).map(([source, count]) => ({
      source,
      count,
    })),
  };
}

/**
 * 生成可信度卡。
 * @param {{ validSamples: UnifiedSample[]; invalidSamples: UnifiedSample[]; issues: IssueDraft[] }} input 可信度输入。
 * @returns {{ confidenceLevel: "low" | "medium" | "high"; confidenceScore: number; sampleCoverage: number; timeCoverage: number; dimensionCoverage: number }} 可信度卡。
 */
function buildConfidenceCard(input: {
  validSamples: UnifiedSample[];
  invalidSamples: UnifiedSample[];
  issues: IssueDraft[];
}): {
  confidenceLevel: "low" | "medium" | "high";
  confidenceScore: number;
  sampleCoverage: number;
  timeCoverage: number;
  dimensionCoverage: number;
} {
  const total = input.validSamples.length + input.invalidSamples.length;
  const sampleCoverage = total === 0 ? 0 : Math.round((input.validSamples.length / total) * 100);
  const timeCoverage =
    input.validSamples.length === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            ((new Date().getTime() -
              Math.min(...input.validSamples.map((item) => item.createdAt.getTime()))) /
              (14 * 24 * 60 * 60 * 1000)) *
              100
          )
        );
  const dimensionCoverage =
    input.issues.length === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            (new Set(input.validSamples.flatMap((item) => item.dimensions)).size / Math.max(input.issues.length, 1)) *
              100
          )
        );
  const confidenceScore = Math.round(sampleCoverage * 0.45 + timeCoverage * 0.25 + dimensionCoverage * 0.3);
  return {
    confidenceLevel:
      confidenceScore >= 75 ? "high" : confidenceScore >= 45 ? "medium" : "low",
    confidenceScore,
    sampleCoverage,
    timeCoverage,
    dimensionCoverage,
  };
}

/**
 * 生成今日行动卡。
 * @param {ActionDraft[]} actions 动作草稿。
 * @returns {ReviewTodayActionCard} 今日行动卡。
 */
function buildTodayActionCard(actions: ActionDraft[]): ReviewTodayActionCard {
  const action = actions[0];
  if (!action) {
    return {
      title: "今天先补样本",
      description: "当前还没有稳定问题进入主视图，建议先完成一场真实训练，补足可分析样本。",
      actionType: "collect_sample",
      targetPath: "/setup",
      actionPayload: {
        trainingGoal: "补足复盘样本",
      },
      expectedOutcome: "系统能给出更稳定的问题判断，而不是继续停留在弱结论。",
    };
  }
  return {
    title: action.title,
    description: action.description,
    actionType: action.actionType,
    targetPath: action.targetPath,
    actionPayload: action.targetPayload,
    expectedOutcome: action.expectedOutcome,
  };
}

/**
 * 生成核心结论卡。
 * @param {IssueDraft[]} issues 问题草稿。
 * @param {number} validSampleCount 有效样本数。
 * @returns {ReviewHeadlineCard} 结论卡。
 */
function buildHeadlineCard(
  issues: IssueDraft[],
  validSampleCount: number
): ReviewHeadlineCard {
  const topIssue = issues[0];
  if (!topIssue) {
    return {
      title: "当前还没有稳定问题进入主视图",
      summary: "样本量或证据量还不够，系统暂时只能给弱结论，建议先补充真实训练样本。",
      priority: "medium",
      issueId: null,
      trendDirection: "stable",
      sampleCount: validSampleCount,
    };
  }
  return {
    title: `当前最大问题是「${topIssue.name}」`,
    summary: topIssue.summary,
    priority: topIssue.severity,
    issueId: null,
    trendDirection: topIssue.impactScore >= 70 ? "up" : "stable",
    sampleCount: validSampleCount,
  };
}

/**
 * 生成改善概览。
 * @param {{ currentIssues: IssueDraft[]; previousIssues: Array<{ name: string; impactScore: number }>; actionExecutions: Array<{ resultStatus: string; improvementScore: number | null }> }} input 改善输入。
 * @returns {ReviewProgressOverviewDTO} 改善概览。
 */
function buildProgressOverview(input: {
  currentIssues: IssueDraft[];
  previousIssues: Array<{ name: string; impactScore: number }>;
  actionExecutions: Array<{ resultStatus: string; improvementScore: number | null }>;
}): ReviewProgressOverviewDTO {
  let improved = 0;
  let worsened = 0;
  let stable = 0;

  for (const issue of input.currentIssues) {
    const previous = input.previousIssues.find((item) => item.name === issue.name);
    if (!previous) {
      stable += 1;
      continue;
    }
    if (issue.impactScore <= previous.impactScore - 8) {
      improved += 1;
    } else if (issue.impactScore >= previous.impactScore + 8) {
      worsened += 1;
    } else {
      stable += 1;
    }
  }

  const verifiedActionCount = input.actionExecutions.length;
  const effectiveActionCount = input.actionExecutions.filter(
    (item) => (item.improvementScore ?? 0) >= 10 && item.resultStatus === "COMPLETED"
  ).length;

  return {
    improvedIssueCount: improved,
    worsenedIssueCount: worsened,
    stableIssueCount: stable,
    verifiedActionCount,
    effectiveActionCount,
  };
}

/**
 * 生成问题改善详情。
 * @param {{ currentIssues: IssueDraft[]; previousIssues: Array<{ name: string; impactScore: number; frequency: number }> }} input 输入。
 * @returns {ReviewIssueProgressDTO[]} 问题改善详情。
 */
function buildIssueProgress(input: {
  currentIssues: IssueDraft[];
  previousIssues: Array<{ name: string; impactScore: number; frequency: number }>;
}): ReviewIssueProgressDTO[] {
  return input.currentIssues.slice(0, 6).map((issue) => {
    const previous = input.previousIssues.find((item) => item.name === issue.name);
    const previousScore = previous?.impactScore ?? issue.impactScore;
    const changeValue = Math.round((issue.impactScore - previousScore) * 10) / 10;
    return {
      issueId: "",
      issueName: issue.name,
      previousScore,
      currentScore: issue.impactScore,
      changeValue,
      changeDirection: changeValue > 5 ? "up" : changeValue < -5 ? "down" : "stable",
      sampleDelta: issue.frequency - (previous?.frequency ?? issue.frequency),
      judgement:
        previous === undefined
          ? "当前是首次进入稳定问题池，先继续观察后续样本。"
          : changeValue < -5
            ? "影响分正在下降，说明最近补强开始起效。"
            : changeValue > 5
              ? "影响分有反弹，需要提高训练压强。"
              : "当前仍处于平台期，建议继续维持同问题压强。 ",
    };
  });
}

/**
 * 生成动作有效性。
 * @param {{ executions: Array<{ actionId: string; resultStatus: string; improvementScore: number | null; action: { title: string } }>; actions: ActionDraft[] }} input 输入。
 * @returns {ReviewActionEffectivenessDTO[]} 动作有效性列表。
 */
function buildActionEffectiveness(input: {
  executions: Array<{
    actionId: string;
    resultStatus: string;
    improvementScore: number | null;
    action: { title: string };
  }>;
  actions: ActionDraft[];
}): ReviewActionEffectivenessDTO[] {
  const grouped = new Map<string, Array<{ resultStatus: string; improvementScore: number | null }>>();
  for (const execution of input.executions) {
    const current = grouped.get(execution.actionId) ?? [];
    current.push({
      resultStatus: execution.resultStatus,
      improvementScore: execution.improvementScore,
    });
    grouped.set(execution.actionId, current);
  }

  if (grouped.size === 0) {
    return input.actions.slice(0, 3).map((action) => ({
      actionId: "",
      actionTitle: action.title,
      executionCount: 0,
      postActionSampleCount: 0,
      effectiveness: "unknown",
      summary: "当前还没有执行记录，系统暂时无法判断这条建议是否有效。",
    }));
  }

  return Array.from(grouped.entries()).map(([actionId, items]) => {
    const avgImprovement = average(
      items.map((item) => item.improvementScore).filter((item): item is number => item !== null)
    );
    return {
      actionId,
      actionTitle:
        input.executions.find((item) => item.actionId === actionId)?.action.title || "动作执行",
      executionCount: items.length,
      postActionSampleCount: items.length,
      effectiveness:
        avgImprovement === null
          ? "unknown"
          : avgImprovement >= 12
            ? "effective"
            : avgImprovement >= 5
              ? "partial"
              : "ineffective",
      summary:
        avgImprovement === null
          ? "执行后还没有形成足够样本，当前无法稳定判断效果。"
          : avgImprovement >= 12
            ? "执行后问题影响分明显下降，这条建议当前有效。"
            : avgImprovement >= 5
              ? "执行后有一定改善，但还没有形成稳定压制。"
              : "执行后改善有限，需要调整训练方式或提高压强。",
    };
  });
}

/**
 * 生成历史样本列表。
 * @param {UnifiedSample[]} samples 统一样本。
 * @returns {ReviewHistorySessionDTO[]} 历史列表。
 */
function buildHistorySessions(samples: UnifiedSample[]): ReviewHistorySessionDTO[] {
  return samples
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 12)
    .map((sample) => ({
      id: sample.id,
      createdAt: sample.createdAt.toISOString(),
      status: sample.status,
      sampleValidity: sample.sampleValidity,
      invalidReason: sample.invalidReason,
      mode: sample.mode,
      role: sample.role,
      company: sample.company,
      roundCount: sample.roundCount,
      score: sample.score,
      reportStatus: sample.reportStatus,
      hasEvidence: sample.hasEvidence,
    }));
}

/**
 * 生成对比组。
 * @param {{ issues: IssueDraft[]; validSamples: UnifiedSample[] }} input 输入。
 * @returns {ReviewComparisonGroupDTO[]} 对比组。
 */
function buildComparisonGroups(input: {
  issues: IssueDraft[];
  validSamples: UnifiedSample[];
}): ReviewComparisonGroupDTO[] {
  const bySource = new Map<string, number>();
  for (const sample of input.validSamples) {
    bySource.set(sample.sourceType, (bySource.get(sample.sourceType) ?? 0) + 1);
  }
  return [
    {
      groupKey: "source-breakdown",
      groupType: "source",
      items: Array.from(bySource.entries()).map(([label, count]) => ({
        label,
        value: `${count}`,
        helper: "当前进入分析池的有效样本数",
      })),
    },
    {
      groupKey: "issue-impact",
      groupType: "issue",
      items: input.issues.slice(0, 4).map((issue) => ({
        label: issue.name,
        value: `${Math.round(issue.impactScore)}`,
        helper: `最近出现 ${issue.frequency} 次`,
      })),
    },
  ];
}

/**
 * 生成 Agent trace。
 * @param {{ confidenceScore: number; validCount: number; invalidCount: number; issueCount: number; actionCount: number }} input trace 输入。
 * @returns {ReviewAgentTraceDTO[]} Agent trace。
 */
function buildAgentTrace(input: {
  confidenceScore: number;
  validCount: number;
  invalidCount: number;
  issueCount: number;
  actionCount: number;
}): ReviewAgentTraceDTO[] {
  return listReviewInsightAgents().map((agent) => ({
    role: agent.key,
    name: agent.name,
    objective: agent.objective,
    summary:
      agent.key === "signal"
        ? `已把 ${input.validCount} 个有效样本放入主分析池，另有 ${input.invalidCount} 个样本被归档。`
        : agent.key === "evidence"
          ? `已为当前问题池抽取可回溯证据，当前置信分 ${input.confidenceScore}。`
          : agent.key === "diagnosis"
            ? `当前共识别 ${input.issueCount} 个稳定问题进入主视图。`
            : agent.key === "strategy"
              ? `已生成 ${input.actionCount} 条可执行动作卡，并附带完成标准。`
              : agent.key === "progress"
                ? "已对既有动作执行记录做效果判断，样本不足时会明确降级。"
                : "当前链路已返回结构化结果，不再只是展示型 Agent 介绍卡。",
    inputs: agent.inputs,
    outputs: agent.outputs,
    degraded: input.confidenceScore < 45 && ["signal", "evidence", "diagnosis", "narrative"].includes(agent.key),
  }));
}

/**
 * 根据 persisted 问题 ID 回写推荐动作 ID。
 * @param {string} issueId 问题 ID。
 * @param {string[]} actionIds 动作 ID。
 * @returns {Promise<void>} 更新完成。
 */
async function updateIssueActionIds(issueId: string, actionIds: string[]): Promise<void> {
  await prisma.reviewIssue.update({
    where: { id: issueId },
    data: {
      recommendedActionIds: actionIds,
    },
  });
}

/**
 * 读取最近一次复盘快照，供改善验证复用。
 * @param {string} userId 用户 ID。
 * @param {string | null} currentFingerprint 当前快照指纹。
 * @returns {Promise<{ issues: Array<{ name: string; impactScore: number; frequency: number }> }>} 最近一次快照摘要。
 */
async function getPreviousSnapshotSummary(
  userId: string,
  currentFingerprint: string | null
): Promise<{ issues: Array<{ name: string; impactScore: number; frequency: number }> }> {
  const snapshot = await prisma.reviewSnapshot.findFirst({
    where: {
      userId,
      ...(currentFingerprint
        ? {
            NOT: {
              snapshotFingerprint: currentFingerprint,
            },
          }
        : {}),
    },
    orderBy: { generatedAt: "desc" },
    include: {
      issues: {
        select: {
          name: true,
          impactScore: true,
          frequency: true,
        },
      },
    },
  });
  return {
    issues:
      snapshot?.issues.map((item) => ({
        name: item.name,
        impactScore: item.impactScore ?? 0,
        frequency: item.frequency,
      })) ?? [],
  };
}

/**
 * 聚合并持久化复盘中心快照。
 * @param {{ userId: string; filters?: Partial<ReviewDashboardFilters> }} input 用户与筛选条件。
 * @returns {Promise<V2ReviewDashboardSnapshot>} 完整快照。
 */
export async function buildV2ReviewDashboardSnapshot(input: {
  userId: string;
  filters?: Partial<ReviewDashboardFilters>;
}): Promise<V2ReviewDashboardSnapshot> {
  const filters = normalizeFilters(input.filters);
  const timeRangeStart = buildTimeRangeStart(filters.timeRange);
  const fingerprint = buildSnapshotFingerprint(input.userId, filters);

  const [
    interviewSessions,
    documentSessions,
    learningProgressList,
    weaknessRecords,
    growthProfile,
    interviewPlans,
    actionExecutions,
    previousPeriodInterviewCount,
  ] = await Promise.all([
    prisma.interviewSession.findMany({
      where: {
        userId: input.userId,
        ...(timeRangeStart ? { createdAt: { gte: timeRangeStart } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 120,
      include: {
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
          },
          orderBy: { createdAt: "asc" },
        },
        report: {
          select: {
            highlights: true,
            risks: true,
            nextSteps: true,
            dimensions: true,
            evidence: true,
            metadata: true,
          },
        },
      },
    }),
    prisma.documentInterviewSession.findMany({
      where: {
        userId: input.userId,
        ...(timeRangeStart ? { createdAt: { gte: timeRangeStart } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 120,
      include: {
        document: {
          select: {
            title: true,
          },
        },
        userAnswerScores: {
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            question: true,
            userAnswer: true,
            score: true,
            missingPoints: true,
            factErrors: true,
            expressionFeedback: true,
            improvedAnswer: true,
          },
        },
      },
    }),
    prisma.learningProgress.findMany({
      where: {
        userId: input.userId,
        ...(timeRangeStart ? { updatedAt: { gte: timeRangeStart } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      include: {
        document: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.userWeaknessRecord.findMany({
      where: {
        userId: input.userId,
      },
      orderBy: { lastDetectedAt: "desc" },
      take: 30,
      include: {
        dimension: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.userGrowthProfile.findUnique({
      where: {
        userId: input.userId,
      },
    }),
    prisma.interviewPlan.findMany({
      where: {
        userId: input.userId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        companyName: true,
        roleName: true,
        targetLevel: true,
      },
    }),
    prisma.reviewActionExecution.findMany({
      where: {
        userId: input.userId,
      },
      orderBy: { startedAt: "desc" },
      take: 60,
      include: {
        action: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.interviewSession.count({
      where: {
        userId: input.userId,
        ...(timeRangeStart
          ? {
              createdAt: {
                gte: subtractDays(timeRangeStart, filters.timeRange === "7d" ? 7 : filters.timeRange === "14d" ? 14 : 30),
                lt: timeRangeStart,
              },
            }
          : {}),
      },
    }),
  ]);

  const unifiedSamples = [
    ...buildInterviewSamples(interviewSessions),
    ...buildLearningSamples(documentSessions),
    ...buildLearningProgressSamples(learningProgressList),
  ];
  const filteredSamples = applySampleFilters(unifiedSamples, filters);
  const validSamples = filteredSamples.filter((item) => item.sampleValidity === "valid");
  const invalidSamples = filteredSamples.filter((item) => item.sampleValidity === "invalid");
  const evidenceDrafts = buildEvidenceDrafts(validSamples);
  let issueDrafts = buildIssueDrafts(evidenceDrafts);

  for (const weakness of weaknessRecords) {
    const existing = issueDrafts.find((item) => item.name === weakness.dimension.name);
    if (!existing) {
      const impactScore = clamp(
        (weakness.severityScore ?? 55) + weakness.frequency * 8,
        30,
        100
      );
      issueDrafts.push({
        issueKey: normalizeIssueKey(weakness.dimension.name),
        name: weakness.dimension.name,
        category: resolveIssueCategory(weakness.dimension.name),
        severity: resolveSeverity(impactScore),
        frequency: weakness.frequency,
        stability: clamp(weakness.frequency * 20, 20, 100),
        impactScore,
        summary:
          weakness.evidenceSummary?.trim() ||
          `弱点记录显示「${weakness.dimension.name}」仍在持续出现，需要继续压强。`,
        rootCause:
          weakness.recommendation?.trim() || "当前弱点记录缺少更详细归因，建议结合更多有效样本继续判断。",
        latestSeenAt: toIso(weakness.lastDetectedAt),
        relatedDimensionKeys: [normalizeIssueKey(weakness.dimension.name)],
        impact: {
          impactAreas: ["专项训练", "模拟面试", "复盘趋势"],
          riskLevel: resolveSeverity(impactScore),
          willAffect: ["当前问题稳定性判断", "下一轮训练优先级"],
          notAffect: ["无关页面行为"],
        },
        rootCauseTree: [
          {
            id: `${normalizeIssueKey(weakness.dimension.name)}-weakness-root`,
            label: weakness.dimension.name,
            description:
              weakness.evidenceSummary?.trim() || "来自历史弱点记录的稳定问题。",
            confidence: clamp((weakness.severityScore ?? 55) + 10, 35, 95),
            children: [],
          },
        ],
      });
    }
  }

  issueDrafts = issueDrafts
    .filter((item) => item.frequency >= 2 || item.impactScore >= 65)
    .sort((left, right) => right.impactScore - left.impactScore);

  const roleOptions = Array.from(
    new Set(
      [growthProfile?.targetRole, ...interviewPlans.map((item) => item.roleName)]
        .filter((item): item is string => Boolean(item && item.trim()))
        .map((item) => item.trim())
    )
  );
  const companyOptions = Array.from(
    new Set(
      [growthProfile?.targetCompany, ...interviewPlans.map((item) => item.companyName)]
        .filter((item): item is string => Boolean(item && item.trim()))
        .map((item) => item.trim())
    )
  );
  const dimensionOptions = Array.from(
    new Set(issueDrafts.map((item) => item.name).filter(Boolean))
  );

  const context = {
    role: filters.role || growthProfile?.targetRole || interviewPlans[0]?.roleName || null,
    company:
      filters.company || growthProfile?.targetCompany || interviewPlans[0]?.companyName || null,
    level: growthProfile?.targetLevel || interviewPlans[0]?.targetLevel || null,
  };
  const actionDrafts = buildActionDrafts(issueDrafts, context);
  const confidenceCard = buildConfidenceCard({
    validSamples,
    invalidSamples,
    issues: issueDrafts,
  });
  const headlineCard = buildHeadlineCard(issueDrafts, validSamples.length);
  const todayActionCard = buildTodayActionCard(actionDrafts);
  const metrics = buildMetrics({
    validSamples,
    invalidSamples,
    previousValidCount: previousPeriodInterviewCount,
    issues: issueDrafts,
    actionExecutionCount: actionExecutions.length,
  });
  const sampleSummaryCard = buildSampleSummaryCard({
    validSamples,
    invalidSamples,
    filters,
  });
  const previousSnapshot = await getPreviousSnapshotSummary(input.userId, fingerprint);
  const progressOverview = buildProgressOverview({
    currentIssues: issueDrafts,
    previousIssues: previousSnapshot.issues,
    actionExecutions,
  });
  const issueProgress = buildIssueProgress({
    currentIssues: issueDrafts,
    previousIssues: previousSnapshot.issues,
  });
  const actionEffectiveness = buildActionEffectiveness({
    executions: actionExecutions,
    actions: actionDrafts,
  });
  const comparisonGroups = buildComparisonGroups({
    issues: issueDrafts,
    validSamples,
  });
  const agentTrace = buildAgentTrace({
    confidenceScore: confidenceCard.confidenceScore,
    validCount: validSamples.length,
    invalidCount: invalidSamples.length,
    issueCount: issueDrafts.length,
    actionCount: actionDrafts.length,
  });

  const snapshotRecord = await prisma.reviewSnapshot.create({
    data: {
      userId: input.userId,
      timeRange: filters.timeRange,
      interviewType: filters.interviewType,
      role: filters.role,
      company: filters.company,
      dimension: filters.dimension,
      sampleStatus: filters.sampleStatus,
      snapshotFingerprint: fingerprint,
      headline: headlineCard.title,
      trendSummary:
        issueDrafts.length > 0
          ? `当前最值得优先处理的是「${issueDrafts[0].name}」，先压掉高影响问题，再继续扩大训练面。`
          : "当前样本不足，只能给弱结论，建议先补足真实训练样本。",
      confidenceLevel: confidenceCard.confidenceLevel.toUpperCase() as "LOW" | "MEDIUM" | "HIGH",
      confidenceScore: confidenceCard.confidenceScore,
      validSampleCount: validSamples.length,
      invalidSampleCount: invalidSamples.length,
      sampleCoverage: confidenceCard.sampleCoverage,
      timeCoverage: confidenceCard.timeCoverage,
      dimensionCoverage: confidenceCard.dimensionCoverage,
      filters: toPrismaJson(filters),
      headlineCard: toPrismaJson(headlineCard),
      todayActionCard: toPrismaJson(todayActionCard),
      confidenceCard: toPrismaJson(confidenceCard),
      sampleSummaryCard: toPrismaJson(sampleSummaryCard),
      metrics: toPrismaJson(metrics),
      progressOverview: toPrismaJson(progressOverview),
      comparisonGroups: toPrismaJson(comparisonGroups),
      agentTrace: toPrismaJson(agentTrace),
    },
  });

  const persistedIssues = [];
  for (const issue of issueDrafts) {
    const created = await prisma.reviewIssue.create({
      data: {
        snapshotId: snapshotRecord.id,
        issueKey: issue.issueKey,
        name: issue.name,
        category: issue.category,
        severity: issue.severity.toUpperCase(),
        frequency: issue.frequency,
        stability: issue.stability,
        impactScore: issue.impactScore,
        summary: issue.summary,
        rootCause: issue.rootCause,
        latestSeenAt: issue.latestSeenAt ? new Date(issue.latestSeenAt) : null,
        status: issue.frequency === 1 ? "OBSERVING" : "ACTIVE",
        relatedDimensionKeys: issue.relatedDimensionKeys,
        rootCauseTree: toPrismaJson(issue.rootCauseTree),
        impactAnalysis: toPrismaJson(issue.impact),
      },
    });
    persistedIssues.push(created);
  }

  const issueIdMap = new Map<string, string>();
  for (const issue of persistedIssues) {
    if (issue.issueKey) {
      issueIdMap.set(issue.issueKey, issue.id);
    }
  }

  const persistedEvidences: ReviewEvidenceDTO[] = [];
  for (const evidence of evidenceDrafts) {
    const created = await prisma.reviewEvidence.create({
      data: {
        snapshotId: snapshotRecord.id,
        issueId: issueIdMap.get(evidence.issueKey) ?? null,
        sessionId: evidence.sessionId,
        sessionType: evidence.sessionType,
        sessionCreatedAt: evidence.sessionCreatedAt ? new Date(evidence.sessionCreatedAt) : null,
        sampleValidity: "VALID",
        role: evidence.role,
        company: evidence.company,
        questionId: evidence.questionId,
        questionTitle: evidence.questionTitle,
        messageId: evidence.messageId,
        excerpt: evidence.excerpt,
        reason: evidence.reason,
        dimension: evidence.dimension,
        confidence: evidence.confidence,
        severity: evidence.severity.toUpperCase(),
        evidenceContext: toPrismaJson(evidence.evidenceContext),
        rewriteSuggestion: toPrismaJson(evidence.rewriteSuggestion),
      },
    });
    persistedEvidences.push({
      ...evidence,
      id: created.id,
      issueId: issueIdMap.get(evidence.issueKey) ?? null,
    });
  }

  const actionIdsByIssue = new Map<string, string[]>();
  const persistedActions: ReviewActionDTO[] = [];
  for (const action of actionDrafts) {
    const issueId = issueIdMap.get(action.issueKey) ?? null;
    const payload = {
      ...action.targetPayload,
      issueId: issueId ?? action.targetPayload.issueId,
    };
    const created = await prisma.reviewAction.create({
      data: {
        snapshotId: snapshotRecord.id,
        issueId,
        title: action.title,
        description: action.description,
        whyThisAction: action.whyThisAction,
        actionType: action.actionType,
        recommendedMode: action.recommendedMode,
        recommendedQuestionTypes: action.recommendedQuestionTypes,
        recommendedDifficulty: action.recommendedDifficulty,
        targetPath: action.targetPath,
        targetPayload: toPrismaJson(payload),
        successMetric: action.successMetric,
        expectedOutcome: action.expectedOutcome,
        estimatedEffort: action.estimatedEffort,
        priority:
          action.priority === "today"
            ? "TODAY"
            : action.priority === "thisWeek"
              ? "THIS_WEEK"
              : "KEEP",
      },
    });
    if (issueId) {
      const current = actionIdsByIssue.get(issueId) ?? [];
      current.push(created.id);
      actionIdsByIssue.set(issueId, current);
    }
    persistedActions.push({
      ...action,
      id: created.id,
      issueId,
      targetPayload: payload,
    });
  }

  for (const [issueId, actionIds] of actionIdsByIssue.entries()) {
    await updateIssueActionIds(issueId, actionIds);
  }

  const issues: ReviewIssueDTO[] = issueDrafts.map((issue) => ({
    ...issue,
    id: issueIdMap.get(issue.issueKey) ?? "",
    recommendedActionIds: persistedActions
      .filter((item) => item.issueId === issueIdMap.get(issue.issueKey))
      .map((item) => item.id),
  }));

  const issueProgressWithIds = issueProgress.map((item) => ({
    ...item,
    issueId: issues.find((issue) => issue.name === item.issueName)?.id || "",
  }));
  const headline = headlineCard.title;
  const trendSummary =
    snapshotRecord.trendSummary ||
    "当前还没有稳定结论，请继续补充真实训练样本。";

  return {
    snapshotId: snapshotRecord.id,
    filters,
    filterOptions: {
      roles: roleOptions,
      companies: companyOptions,
      dimensions: dimensionOptions,
    },
    headline,
    trendSummary,
    headlineCard: {
      ...headlineCard,
      issueId: issues[0]?.id ?? null,
    },
    todayActionCard,
    confidenceCard,
    sampleSummaryCard,
    metrics,
    issues,
    evidences: persistedEvidences,
    actions: persistedActions,
    progressOverview,
    issueProgress: issueProgressWithIds,
    actionEffectiveness,
    historySessions: buildHistorySessions(validSamples),
    invalidSessions: buildHistorySessions(invalidSamples),
    comparisonGroups,
    agentTrace,
  };
}

/**
 * 读取单个问题详情。
 * @param {{ userId: string; issueId: string }} input 用户与问题 ID。
 * @returns {Promise<ReviewIssueDTO | null>} 问题详情。
 */
export async function getReviewIssueDetail(input: {
  userId: string;
  issueId: string;
}): Promise<ReviewIssueDTO | null> {
  const issue = await prisma.reviewIssue.findFirst({
    where: {
      id: input.issueId,
      snapshot: {
        userId: input.userId,
      },
    },
  });

  if (!issue) {
    return null;
  }

  return {
    id: issue.id,
    name: issue.name,
    category: issue.category,
    severity: issue.severity.toLowerCase() as "high" | "medium" | "low",
    frequency: issue.frequency,
    stability: issue.stability ?? 0,
    impactScore: issue.impactScore ?? 0,
    summary: issue.summary,
    rootCause: issue.rootCause ?? "",
    latestSeenAt: toIso(issue.latestSeenAt),
    relatedDimensionKeys: issue.relatedDimensionKeys,
    recommendedActionIds: issue.recommendedActionIds,
    impact: parseJsonValue(issue.impactAnalysis, {
      impactAreas: [],
      riskLevel: "low",
      willAffect: [],
      notAffect: [],
    }),
    rootCauseTree: parseJsonValue(issue.rootCauseTree, []),
  };
}

/**
 * 读取某个问题的证据列表。
 * @param {{ userId: string; issueId: string }} input 用户与问题 ID。
 * @returns {Promise<ReviewEvidenceDTO[]>} 证据列表。
 */
export async function getReviewIssueEvidences(input: {
  userId: string;
  issueId: string;
}): Promise<ReviewEvidenceDTO[]> {
  const evidences = await prisma.reviewEvidence.findMany({
    where: {
      issueId: input.issueId,
      snapshot: {
        userId: input.userId,
      },
    },
    orderBy: [{ confidence: "desc" }, { sessionCreatedAt: "desc" }],
  });

  return evidences.map((item) => ({
    id: item.id,
    issueId: item.issueId,
    sessionId: item.sessionId,
    sessionType: item.sessionType || "unknown",
    sessionCreatedAt: toIso(item.sessionCreatedAt),
    role: item.role,
    company: item.company,
    questionId: item.questionId,
    questionTitle: item.questionTitle || "问题片段",
    messageId: item.messageId,
    excerpt: item.excerpt,
    reason: item.reason || "",
    dimension: item.dimension || "",
    confidence: item.confidence ?? 0,
    severity: (item.severity?.toLowerCase() || "low") as "high" | "medium" | "low",
    evidenceContext: parseJsonValue(item.evidenceContext, {
      beforeMessages: [],
      targetMessage: item.excerpt,
      afterMessages: [],
      scoreContext: "",
      followUpContext: [],
    }),
    rewriteSuggestion: parseJsonValue(item.rewriteSuggestion, {
      originalAnswer: item.excerpt,
      problemReason: item.reason || "",
      improvedAnswer: "当前未生成改写建议。",
      improvementHighlights: [],
    }),
  }));
}

/**
 * 执行复盘动作，并返回带完整上下文的训练入口。
 * @param {{ userId: string; actionId: string }} input 用户与动作 ID。
 * @returns {Promise<{ executionId: string; targetPath: string | null; startUrl: string | null; payload: Record<string, unknown> } | null>} 执行结果。
 */
export async function executeReviewAction(input: {
  userId: string;
  actionId: string;
}): Promise<{
  executionId: string;
  targetPath: string | null;
  startUrl: string | null;
  payload: Record<string, unknown>;
} | null> {
  const action = await prisma.reviewAction.findFirst({
    where: {
      id: input.actionId,
      snapshot: {
        userId: input.userId,
      },
    },
  });

  if (!action) {
    return null;
  }

  const payload = parseJsonValue<Record<string, unknown>>(action.targetPayload, {});
  const execution = await prisma.reviewActionExecution.create({
    data: {
      actionId: action.id,
      userId: input.userId,
      resultStatus: "STARTED",
      notes: `从复盘中心触发动作：${action.title}`,
    },
  });

  let startUrl: string | null = action.targetPath;
  if (action.targetPath === "/practice") {
    startUrl = `/practice?reviewActionId=${encodeURIComponent(action.id)}&issueId=${encodeURIComponent(String(payload.issueId || ""))}&issueName=${encodeURIComponent(String(payload.issueName || ""))}&role=${encodeURIComponent(String(payload.role || ""))}&company=${encodeURIComponent(String(payload.company || ""))}&level=${encodeURIComponent(String(payload.level || ""))}&goal=${encodeURIComponent(String(payload.trainingGoal || ""))}`;
  } else if (action.targetPath === "/setup") {
    startUrl = `/setup?reviewActionId=${encodeURIComponent(action.id)}&mode=stage&companyName=${encodeURIComponent(String(payload.company || ""))}&targetRoleName=${encodeURIComponent(String(payload.role || ""))}&targetLevel=${encodeURIComponent(String(payload.level || ""))}&focus=${encodeURIComponent(String(payload.issueName || ""))}`;
  } else if (action.targetPath === "/learning") {
    startUrl = `/learning?reviewActionId=${encodeURIComponent(action.id)}&query=${encodeURIComponent(String(payload.issueName || ""))}`;
  }

  return {
    executionId: execution.id,
    targetPath: action.targetPath,
    startUrl,
    payload,
  };
}

/**
 * 读取当前用户最近一次复盘改善概览。
 * @param {{ userId: string }} input 用户信息。
 * @returns {Promise<{ progressOverview: ReviewProgressOverviewDTO; issueProgress: ReviewIssueProgressDTO[]; actionEffectiveness: ReviewActionEffectivenessDTO[] } | null>} 改善概览。
 */
export async function getReviewProgressSnapshot(input: {
  userId: string;
}): Promise<{
  progressOverview: ReviewProgressOverviewDTO;
  issueProgress: ReviewIssueProgressDTO[];
  actionEffectiveness: ReviewActionEffectivenessDTO[];
} | null> {
  const snapshot = await prisma.reviewSnapshot.findFirst({
    where: {
      userId: input.userId,
    },
    orderBy: {
      generatedAt: "desc",
    },
  });

  if (!snapshot) {
    return null;
  }

  return {
    progressOverview: parseJsonValue(snapshot.progressOverview, {
      improvedIssueCount: 0,
      worsenedIssueCount: 0,
      stableIssueCount: 0,
      verifiedActionCount: 0,
      effectiveActionCount: 0,
    }),
    issueProgress: [],
    actionEffectiveness: [],
  };
}
