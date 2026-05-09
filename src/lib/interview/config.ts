export type InterviewMode = "text" | "realtime" | "targeted";

export type InterviewRole = "ai" | "user";

export type InterviewLimitValue = number | null;

export type InterviewLimitType = "none" | "question" | "duration";

export type InterviewMessage = {
  role: InterviewRole;
  content: string[];
  time: string;
  tag: string;
};

export type InterviewDurationOption = {
  label: string;
  value: InterviewLimitValue;
};

export type InterviewQuestionOption = {
  label: string;
  value: InterviewLimitValue;
};

export interface ParsedPersona {
  seniority?: string;
  strengths?: string[];
  risks?: string[];
  communicationStyle?: string;
}

export interface ParsedProject {
  name: string;
  points: string;
}

export interface RealtimeInterruptionContext {
  interruptedAssistantText?: string;
  interruptedAt?: string;
}

export interface InterviewProfileState {
  launchId?: string;
  role?: string;
  resumeSummaryMarkdown?: string;
  resumeImprovements?: string[];
  persona?: ParsedPersona;
  jdGapWarning?: {
    text?: string;
    strategy?: string;
  };
  projects?: ParsedProject[];
  missingDataHints?: string[];
  targetLevel?: string;
  language?: string;
  focus?: string;
  mode?: InterviewMode;
  topic?: string;
  desc?: string;
  videoEnabled?: boolean;
  limitType?: InterviewLimitType;
  questionLimit?: InterviewLimitValue;
  durationLimitMinutes?: InterviewLimitValue;
  realtimeInterruptionContext?: RealtimeInterruptionContext;
}

export interface InterviewHistorySnapshot {
  sessionId?: string;
  mode: InterviewMode;
  messages: InterviewMessage[];
  elapsedTime: number;
  questionCount: number;
  completedRounds: number;
  limitType?: InterviewLimitType;
  questionLimit: InterviewLimitValue;
  durationLimitMinutes: InterviewLimitValue;
  launchId?: string;
}

export const QUESTION_LIMIT_OPTIONS: InterviewQuestionOption[] = [
  { label: "5 题", value: 5 },
  { label: "10 题", value: 10 },
  { label: "20 题", value: 20 }
];

export const DURATION_LIMIT_OPTIONS: InterviewDurationOption[] = [
  { label: "10 分钟", value: 10 },
  { label: "20 分钟", value: 20 },
  { label: "30 分钟", value: 30 }
];

/**
 * 将未知输入归一化为面试模式，避免查询参数或旧缓存导致分支失效。
 * @param value 外部传入的模式值。
 * @returns 可用的面试模式枚举。
 */
export function normalizeInterviewMode(value: unknown): InterviewMode {
  if (value === "realtime" || value === "targeted" || value === "text") {
    return value;
  }

  if (value === "voice" || value === "video") {
    return "realtime";
  }

  return "text";
}

/**
 * 判断当前模式是否属于统一后的实时面试模式。
 * @param mode 当前面试模式。
 * @returns 实时模式返回 `true`。
 */
export function isRealtimeInterviewMode(mode: InterviewMode): boolean {
  return mode === "realtime";
}

/**
 * 生成新的面试发起标识，用于串联一次完整的面试会话。
 * @returns 浏览器环境可复现的一次性 launchId。
 */
export function createInterviewLaunchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `launch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * 读取数值上限配置，允许旧数据与空值安全降级为“不限”。
 * @param value 原始配置值。
 * @returns 数字上限，或 `null` 表示不限。
 */
export function normalizeInterviewLimit(value: unknown): InterviewLimitValue {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

/**
 * 将外部输入归一化为单一限制类别，避免题量与时长同时生效。
 * @param value 原始限制类别。
 * @param questionLimit 当前题量上限。
 * @param durationLimitMinutes 当前时长上限。
 * @returns 已归一化的限制类别。
 */
export function normalizeInterviewLimitType(
  value: unknown,
  questionLimit?: InterviewLimitValue,
  durationLimitMinutes?: InterviewLimitValue
): InterviewLimitType {
  if (value === "none" || value === "question" || value === "duration") {
    return value;
  }

  if (durationLimitMinutes) {
    return "duration";
  }

  if (questionLimit) {
    return "question";
  }

  return "none";
}

/**
 * 归一化自定义时长输入，仅接受正整数分钟。
 * @param value 任意时长输入。
 * @returns 合法分钟数；不合法时返回 `null`。
 */
export function normalizeCustomDurationLimit(
  value: unknown
): InterviewLimitValue {
  return normalizeInterviewLimit(value);
}

/**
 * 根据限制类别收口题量与时长，确保最终只有一个生效限制。
 * @param limitType 当前限制类别。
 * @param questionLimit 题量上限。
 * @param durationLimitMinutes 时长上限。
 * @returns 互斥后的限制配置。
 */
export function resolveInterviewLimits(
  limitType: InterviewLimitType,
  questionLimit: InterviewLimitValue,
  durationLimitMinutes: InterviewLimitValue
): {
  limitType: InterviewLimitType;
  questionLimit: InterviewLimitValue;
  durationLimitMinutes: InterviewLimitValue;
} {
  if (limitType === "question" && questionLimit) {
    return {
      limitType,
      questionLimit,
      durationLimitMinutes: null
    };
  }

  if (limitType === "duration" && durationLimitMinutes) {
    return {
      limitType,
      questionLimit: null,
      durationLimitMinutes
    };
  }

  return {
    limitType: "none",
    questionLimit: null,
    durationLimitMinutes: null
  };
}

/**
 * 输出统一的人类可读模式名称，供配置页、房间页与复盘页复用。
 * @param mode 当前面试模式。
 * @param videoEnabled 实时模式下是否开启视频。
 * @returns 中文模式名称。
 */
export function getInterviewModeLabel(
  mode: InterviewMode,
  videoEnabled = false
): string {
  if (mode === "realtime") {
    return videoEnabled ? "实时面试（音频 + 视频）" : "实时面试（音频优先）";
  }

  if (mode === "targeted") {
    return "专项训练";
  }

  return "文字面试";
}

/**
 * 将题量上限格式化为统一展示文案。
 * @param limit 题量上限。
 * @returns 对应的题量标签。
 */
export function formatQuestionLimit(limit: InterviewLimitValue): string {
  return limit ? `${limit} 题` : "不限制";
}

/**
 * 将时长上限格式化为统一展示文案。
 * @param limit 时长上限（分钟）。
 * @returns 对应的时长标签。
 */
export function formatDurationLimit(limit: InterviewLimitValue): string {
  return limit ? `${limit} 分钟` : "不限制";
}

/**
 * 汇总当前题量/时长策略，供 UI 展示与 prompt 组装复用。
 * @param questionLimit 题量上限。
 * @param durationLimitMinutes 时长上限（分钟）。
 * @returns 结构化策略描述。
 */
export function buildInterviewLimitStrategy(
  limitType: InterviewLimitType,
  questionLimit: InterviewLimitValue,
  durationLimitMinutes: InterviewLimitValue
): {
  summary: string;
  promptText: string;
} {
  const resolved = resolveInterviewLimits(
    limitType,
    questionLimit,
    durationLimitMinutes
  );

  if (resolved.limitType === "question") {
    return {
      summary: `数量限制：${formatQuestionLimit(resolved.questionLimit)}`,
      promptText: `本场只使用数量限制，题量上限 ${resolved.questionLimit} 题；达到上限后应自然结束面试，不要再继续追加新题。`
    };
  }

  if (resolved.limitType === "duration") {
    return {
      summary: `时长限制：${formatDurationLimit(resolved.durationLimitMinutes)}`,
      promptText: `本场只使用时长限制，时长上限 ${resolved.durationLimitMinutes} 分钟；接近上限时应自然收束，不要继续无限延展。`
    };
  }

  return {
    summary: "本场不设自动结束上限",
    promptText: "本场不设题量或时长自动结束上限，由用户主动结束。不要因为题量或时间自行收尾。"
  };
}

/**
 * 计算已完成轮次对应的剩余题量，便于前端决定是否自动结束。
 * @param questionLimit 题量上限。
 * @param completedRounds 已完成轮次。
 * @returns 剩余轮次，或 `null` 表示不限。
 */
export function getRemainingQuestionCount(
  questionLimit: InterviewLimitValue,
  completedRounds: number
): number | null {
  if (!questionLimit) {
    return null;
  }

  return Math.max(questionLimit - completedRounds, 0);
}

/**
 * 从浏览器会话缓存中读取当前面试画像和配置，避免各页面重复解析。
 * @returns 已归一化的画像状态；若不存在则返回 `null`。
 */
export function readStoredInterviewProfile(): InterviewProfileState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem("parsedProfileData");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as InterviewProfileState;
    const normalizedQuestionLimit = normalizeInterviewLimit(parsed.questionLimit);
    const normalizedDurationLimit = normalizeInterviewLimit(
      parsed.durationLimitMinutes
    );
    const resolvedLimits = resolveInterviewLimits(
      normalizeInterviewLimitType(
        parsed.limitType,
        normalizedQuestionLimit,
        normalizedDurationLimit
      ),
      normalizedQuestionLimit,
      normalizedDurationLimit
    );
    return {
      ...parsed,
      mode: normalizeInterviewMode(parsed.mode),
      limitType: resolvedLimits.limitType,
      questionLimit: resolvedLimits.questionLimit,
      durationLimitMinutes: resolvedLimits.durationLimitMinutes,
      videoEnabled: Boolean(parsed.videoEnabled)
    };
  } catch (error) {
    console.error("Failed to read parsedProfileData", error);
    return null;
  }
}

/**
 * 将最新画像和配置写回浏览器会话缓存，供后续房间页和报告页复用。
 * @param profile 需要持久化的画像状态。
 */
export function writeStoredInterviewProfile(profile: InterviewProfileState): void {
  if (typeof window === "undefined") {
    return;
  }

  const resolvedLimits = resolveInterviewLimits(
    normalizeInterviewLimitType(
      profile.limitType,
      normalizeInterviewLimit(profile.questionLimit),
      normalizeInterviewLimit(profile.durationLimitMinutes)
    ),
    normalizeInterviewLimit(profile.questionLimit),
    normalizeInterviewLimit(profile.durationLimitMinutes)
  );

  sessionStorage.setItem(
    "parsedProfileData",
    JSON.stringify({
      ...profile,
      mode: normalizeInterviewMode(profile.mode),
      limitType: resolvedLimits.limitType,
      questionLimit: resolvedLimits.questionLimit,
      durationLimitMinutes: resolvedLimits.durationLimitMinutes,
      videoEnabled: Boolean(profile.videoEnabled)
    })
  );
}

/**
 * 根据 launchId 获取当前活跃面试会话的缓存键。
 * @param launchId 当前发起标识。
 * @returns 会话缓存键。
 */
export function getActiveInterviewSessionStorageKey(launchId: string): string {
  return `activeInterviewSession:${launchId}`;
}

/**
 * 根据 launchId 获取当前活跃面试历史快照的缓存键。
 * @param launchId 当前发起标识。
 * @returns 历史缓存键。
 */
export function getInterviewHistoryStorageKey(launchId: string): string {
  return `interviewHistory:${launchId}`;
}

/**
 * 生成报告页使用的最新历史缓存键，兼容现有报告页读取逻辑。
 * @returns 固定的最新历史缓存键。
 */
export function getLatestInterviewHistoryStorageKey(): string {
  return "interviewHistory";
}
