/**
 * v2.0 面试计划模式：单阶段练习或全流程招聘模拟。
 */
export type InterviewPlanModeV2 = "STAGE" | "FULL_FLOW";

/**
 * v2.0 面试计划生命周期状态。
 */
export type InterviewPlanStatusV2 =
  | "DRAFT"
  | "PROFILE_READY"
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ARCHIVED";

/**
 * v2.0 面试轮次类型，覆盖默认的大厂流程和自定义轮次。
 */
export type InterviewStageTypeV2 =
  | "STAGE_INTERVIEW"
  | "FIRST_ROUND"
  | "SECOND_ROUND"
  | "THIRD_ROUND"
  | "HR_ROUND"
  | "OFFER_REVIEW"
  | "CUSTOM";

/**
 * v2.0 轮次执行状态。
 */
export type InterviewStageStatusV2 =
  | "PENDING"
  | "READY"
  | "ACTIVE"
  | "COMPLETED"
  | "SKIPPED"
  | "BLOCKED";

/**
 * v2.0 单轮面试执行状态。
 */
export type InterviewRoundStatusV2 =
  | "PENDING"
  | "ASKING"
  | "USER_ANSWERING"
  | "FOLLOW_UP"
  | "CODING"
  | "SCORING"
  | "DONE"
  | "ABORTED";

/**
 * v2.0 问题类型。
 */
export type InterviewQuestionKindV2 =
  | "OPEN_ENDED"
  | "PROJECT_DEEP_DIVE"
  | "SYSTEM_DESIGN"
  | "BEHAVIORAL"
  | "CODING"
  | "HR"
  | "ENGLISH"
  | "CUSTOM";

/**
 * v2.0 代码面试状态。
 */
export type CodingSessionStatusV2 =
  | "READY"
  | "EDITING"
  | "RUNNING"
  | "SUBMITTED"
  | "REVIEWED"
  | "CLOSED";

/**
 * v2.0 Agent 角色定义。后续服务端执行链路会以此作为统一角色字典。
 */
export type InterviewAgentRoleV2 =
  | "PLANNER"
  | "RESUME_ANALYST"
  | "JD_ANALYST"
  | "INTERVIEWER"
  | "EVIDENCE"
  | "SCORER"
  | "SUMMARY"
  | "REPORT"
  | "COACH"
  | "CODE_INTERVIEWER";

/**
 * 首页进度卡片的指标数据。
 */
export type V2ProgressMetric = {
  key:
    | "learningProgress"
    | "practiceActions"
    | "interviewActions"
    | "reviewClosure";
  label: string;
  value: string;
  helper: string;
  trend: "positive" | "neutral" | "negative";
};

/**
 * 首页“继续训练”卡片数据。
 */
export type ContinueTrainingCard = {
  title: string;
  subtitle: string;
  progressPercent: number | null;
  progressLabel: string;
  nextStepLabel: string;
  actionLabel: string;
  actionPath: string | null;
};

/**
 * 首页薄弱点预览卡片数据。
 */
export type WeaknessPreviewCard = {
  name: string;
  hint: string;
  progressPercent: number | null;
  progressLabel: string;
  impactLabel: string;
  severity: "high" | "medium" | "low";
  actionLabel: string;
  actionPath: string | null;
};

/**
 * 首页操作台聚合结果。
 */
export type V2HomeDashboardSnapshot = {
  metrics: V2ProgressMetric[];
  continueTraining: ContinueTrainingCard | null;
  weaknesses: WeaknessPreviewCard[];
  progressSummary: string;
  weaknessSummary: string;
};

/**
 * 复盘中心筛选条件。
 */
export type ReviewDashboardFilters = {
  timeRange: "7d" | "14d" | "30d" | "all";
  interviewType: "mock" | "targeted" | "learning" | "all";
  role: string | null;
  company: string | null;
  dimension: string | null;
  sampleStatus: "valid" | "invalid" | "all";
};

/**
 * 复盘中心顶部 KPI 指标卡。
 */
export type ReviewMetricCard = {
  key: string;
  label: string;
  value: string;
  helper: string;
  trend: "positive" | "neutral" | "negative";
  baseline: string;
};

/**
 * 复盘中心核心结论卡。
 */
export type ReviewHeadlineCard = {
  title: string;
  summary: string;
  priority: "high" | "medium" | "low";
  issueId: string | null;
  trendDirection: "up" | "down" | "stable";
  sampleCount: number;
};

/**
 * 复盘中心今日行动卡。
 */
export type ReviewTodayActionCard = {
  title: string;
  description: string;
  actionType: string;
  targetPath: string | null;
  actionPayload: Record<string, unknown>;
  expectedOutcome: string;
};

/**
 * 复盘中心可信度卡。
 */
export type ReviewConfidenceCard = {
  confidenceLevel: "low" | "medium" | "high";
  confidenceScore: number;
  sampleCoverage: number;
  timeCoverage: number;
  dimensionCoverage: number;
};

/**
 * 复盘中心样本摘要卡。
 */
export type ReviewSampleSummaryCard = {
  validSampleCount: number;
  invalidSampleCount: number;
  timeRangeLabel: string;
  mainSourceBreakdown: Array<{
    source: string;
    count: number;
  }>;
};

/**
 * 复盘中心根因树节点。
 */
export type ReviewRootCauseNode = {
  id: string;
  label: string;
  description: string;
  confidence: number;
  children: ReviewRootCauseNode[];
};

/**
 * 复盘中心问题 DTO。
 */
export type ReviewIssueDTO = {
  id: string;
  name: string;
  category: string;
  severity: "high" | "medium" | "low";
  frequency: number;
  stability: number;
  impactScore: number;
  summary: string;
  rootCause: string;
  latestSeenAt: string | null;
  relatedDimensionKeys: string[];
  recommendedActionIds: string[];
  impact: {
    impactAreas: string[];
    riskLevel: "high" | "medium" | "low";
    willAffect: string[];
    notAffect: string[];
  };
  rootCauseTree: ReviewRootCauseNode[];
};

/**
 * 复盘中心证据 DTO。
 */
export type ReviewEvidenceDTO = {
  id: string;
  issueId: string | null;
  sessionId: string | null;
  sessionType: string;
  sessionCreatedAt: string | null;
  role: string | null;
  company: string | null;
  questionId: string | null;
  questionTitle: string;
  messageId: string | null;
  excerpt: string;
  reason: string;
  dimension: string;
  confidence: number;
  severity: "high" | "medium" | "low";
  evidenceContext: {
    beforeMessages: string[];
    targetMessage: string;
    afterMessages: string[];
    scoreContext: string;
    followUpContext: string[];
  };
  rewriteSuggestion: {
    originalAnswer: string;
    problemReason: string;
    improvedAnswer: string;
    improvementHighlights: string[];
  };
};

/**
 * 复盘动作目标 payload。
 */
export type ReviewActionPayload = {
  role: string | null;
  company: string | null;
  level: string | null;
  issueId: string;
  issueName: string;
  trainingGoal: string;
  recentFailureSummary: string;
  recommendedPromptStyle: string;
  recommendedMode: string;
  recommendedQuestionTypes: string[];
  evaluationCriteria: string[];
  successMetric: string;
};

/**
 * 复盘动作 DTO。
 */
export type ReviewActionDTO = {
  id: string;
  issueId: string | null;
  title: string;
  description: string;
  whyThisAction: string;
  actionType: string;
  recommendedMode: string;
  recommendedQuestionTypes: string[];
  recommendedDifficulty: string;
  targetPath: string | null;
  targetPayload: ReviewActionPayload;
  successMetric: string;
  expectedOutcome: string;
  estimatedEffort: string;
  priority: "today" | "thisWeek" | "keep";
};

/**
 * 复盘改善概览。
 */
export type ReviewProgressOverviewDTO = {
  improvedIssueCount: number;
  worsenedIssueCount: number;
  stableIssueCount: number;
  verifiedActionCount: number;
  effectiveActionCount: number;
};

/**
 * 单个问题的改善情况。
 */
export type ReviewIssueProgressDTO = {
  issueId: string;
  issueName: string;
  previousScore: number;
  currentScore: number;
  changeValue: number;
  changeDirection: "up" | "down" | "stable";
  sampleDelta: number;
  judgement: string;
};

/**
 * 单个动作的有效性。
 */
export type ReviewActionEffectivenessDTO = {
  actionId: string;
  actionTitle: string;
  executionCount: number;
  postActionSampleCount: number;
  effectiveness: "effective" | "partial" | "ineffective" | "unknown";
  summary: string;
};

/**
 * 历史样本 DTO。
 */
export type ReviewHistorySessionDTO = {
  id: string;
  createdAt: string;
  status: string;
  sampleValidity: "valid" | "invalid";
  invalidReason: string | null;
  mode: string;
  role: string | null;
  company: string | null;
  roundCount: number;
  score: number | null;
  reportStatus: string;
  hasEvidence: boolean;
};

/**
 * 复盘对比组。
 */
export type ReviewComparisonGroupDTO = {
  groupKey: string;
  groupType: string;
  items: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
};

/**
 * 复盘 Agent trace。
 */
export type ReviewAgentTraceDTO = {
  role:
    | "orchestrator"
    | "signal"
    | "evidence"
    | "diagnosis"
    | "strategy"
    | "drill"
    | "progress"
    | "narrative";
  name: string;
  objective: string;
  summary: string;
  inputs: string[];
  outputs: string[];
  degraded: boolean;
};

/**
 * 复盘中心聚合快照。
 */
export type V2ReviewDashboardSnapshot = {
  snapshotId: string | null;
  filters: ReviewDashboardFilters;
  filterOptions: {
    roles: string[];
    companies: string[];
    dimensions: string[];
  };
  headline: string;
  trendSummary: string;
  headlineCard: ReviewHeadlineCard;
  todayActionCard: ReviewTodayActionCard;
  confidenceCard: ReviewConfidenceCard;
  sampleSummaryCard: ReviewSampleSummaryCard;
  metrics: ReviewMetricCard[];
  issues: ReviewIssueDTO[];
  evidences: ReviewEvidenceDTO[];
  actions: ReviewActionDTO[];
  progressOverview: ReviewProgressOverviewDTO;
  issueProgress: ReviewIssueProgressDTO[];
  actionEffectiveness: ReviewActionEffectivenessDTO[];
  historySessions: ReviewHistorySessionDTO[];
  invalidSessions: ReviewHistorySessionDTO[];
  comparisonGroups: ReviewComparisonGroupDTO[];
  agentTrace: ReviewAgentTraceDTO[];
};

/**
 * v2 面试计划的最小领域对象，用于前后端共享计划摘要。
 */
export type InterviewPlanDraftV2 = {
  mode: InterviewPlanModeV2;
  companyName?: string | null;
  roleName?: string | null;
  departmentName?: string | null;
  targetLevel?: string | null;
  language?: string | null;
  intensity?: string | null;
  focusAreas: string[];
};

/**
 * v2 面试计划中的单个轮次摘要，供创建结果和后续页面展示复用。
 */
export type InterviewStageSnapshotV2 = {
  stageId: string;
  roundId: string;
  stageType: InterviewStageTypeV2;
  stageLabel: string;
  stageOrder: number;
  status: InterviewStageStatusV2;
  scheduledAt: string | null;
  codingRequired: boolean;
  interviewerStyle: string | null;
  expectedDurationMinutes: number | null;
  questionBudget: number | null;
  strategySummary: string | null;
};

/**
 * v2 创建面试计划后的返回结果。
 */
export type InterviewPlanCreationResultV2 = {
  planId: string;
  mode: InterviewPlanModeV2;
  status: InterviewPlanStatusV2;
  companyName: string | null;
  roleName: string | null;
  departmentName: string | null;
  focusAreas: string[];
  initialStageId: string | null;
  initialRoundId: string | null;
  initialActionPath: string | null;
  stages: InterviewStageSnapshotV2[];
};

/**
 * 全流程列表页中的单个环节快照，用于展示流程全貌与当前所在环节。
 */
export type InterviewPlanStageListItemV2 = {
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  status: InterviewStageStatusV2;
  isCurrent: boolean;
};

/**
 * 全流程面试首页中使用的计划列表项。
 */
export type InterviewPlanListItemV2 = {
  planId: string;
  companyName: string | null;
  roleName: string | null;
  departmentName: string | null;
  mode: InterviewPlanModeV2;
  status: InterviewPlanStatusV2;
  finalDecision: "offer" | "eliminated" | "finished" | "in_progress";
  currentStageLabel: string | null;
  currentStageStatus: InterviewStageStatusV2 | null;
  progressLabel: string;
  resultLabel: string;
  statusLabel: string;
  nextInterviewAt: string | null;
  nextInterviewLabel: string;
  summary: string | null;
  createdAt: string;
  actionPath: string | null;
  feedbackPath: string | null;
  stages: InterviewPlanStageListItemV2[];
};

/**
 * 最新面经采集任务中的单条结构化洞察。
 */
export type InterviewExperienceInsightDTO = {
  id: string;
  stageType: InterviewStageTypeV2;
  title: string;
  summary: string;
  tags: string[];
  sourceLabel: string | null;
  freshnessLabel: string | null;
  evidenceUrl: string | null;
  sortOrder: number;
};

/**
 * 全流程最新面经采集任务摘要。
 */
export type InterviewExperienceCollectionTaskDTO = {
  id: string;
  companyName: string;
  roleName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  progress: number;
  currentStep: string | null;
  summary: string | null;
  resultSummary: Record<string, unknown> | null;
  errorMessage: string | null;
  latestSourceCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  insights: InterviewExperienceInsightDTO[];
};
