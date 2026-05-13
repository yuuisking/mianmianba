import {
  buildInterviewLimitStrategy,
  getInterviewModeLabel,
  type InterviewExperienceInsightState,
  type InterviewMessage,
  type InterviewMode,
  type InterviewProfileState
} from "@/lib/interview/config";

export interface BuildInterviewPromptInput {
  messages: InterviewMessage[];
  mode: InterviewMode;
  profile: InterviewProfileState | null;
  topic?: string;
  desc?: string;
  questionLimit?: number | null;
  durationLimitMinutes?: number | null;
  completedRounds?: number;
  searchResults?: Array<{ text?: string }>;
  runtimeContext?: InterviewRuntimeContext | null;
}

export interface InterviewReplyQualityInput {
  replyText: string;
  mode: InterviewMode;
  role?: string;
  topic?: string;
  desc?: string;
  focus?: string;
  projects?: Array<{ name: string; points: string }>;
  latestUserAnswer?: string;
}

export interface InterviewReplyQualityResult {
  passed: boolean;
  issues: string[];
  repairInstruction: string;
}

export interface InterviewRuntimeExperienceInsight {
  stageType?: string | null;
  title: string;
  summary: string;
  tags?: string[];
  sourceLabel?: string | null;
  freshnessLabel?: string | null;
}

export interface InterviewRuntimeContext {
  planId?: string;
  launchFlowMode?: "stage" | "full_flow";
  companyName?: string | null;
  roleName?: string | null;
  stageId?: string | null;
  stageType?: string | null;
  stageLabel?: string | null;
  stageOrder?: number | null;
  roundId?: string | null;
  stageStrategySummary?: string | null;
  previousStageFeedback?: string[];
  experienceInsights?: InterviewRuntimeExperienceInsight[];
}

type OpeningQuestionType =
  | "project"
  | "scenario"
  | "principle_application"
  | "troubleshooting"
  | "tradeoff"
  | "testing_strategy"
  | "test_automation"
  | "defect_analysis";

export type InterviewRoleTrack = "general" | "testing";

type StagePromptProfile = {
  interviewerIdentity: string;
  openingStyle: string;
  questionGoal: string;
  openingQuestionPattern: string;
  followUpRules: string[];
  avoidPatterns: string[];
};

/**
 * 将任意文本裁剪为安全可用的 prompt 字段。
 * @param value 任意输入值。
 * @returns 去首尾空白后的字符串。
 */
function normalizeText(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

const INTERNAL_INTERVIEW_STRATEGY_PHRASES = [
  "AI 面试官会优先根据这一轮的高频考察点、历史追问风格与岗位关键词生成问题。",
  "AI 面试官会",
  "高频考察点",
  "历史追问风格",
  "岗位关键词",
  "策略",
  "prompt",
];

const INTERVIEW_TOPIC_LABEL_PREFIXES = [
  "第一个问题",
  "题目",
  "问题",
  "算法题",
  "编程题",
  "编码题",
  "系统设计题",
  "场景题",
  "项目题",
  "原理题",
  "八股题",
  "综合题",
];

const DETACHED_FIRST_ROUND_TOPIC_KEYWORDS = [
  "算法",
  "编程",
  "刷题",
  "leetcode",
  "数据结构",
  "复杂度",
];

/**
 * 清洗面经洞察中的内部策略描述，避免它们直接出现在用户题干里。
 * @param {string | undefined | null} value 原始文本。
 * @returns {string} 清洗后的用户可见文本。
 */
function sanitizeExperienceInsightText(value: string | undefined | null): string {
  let normalized = normalizeText(value);
  for (const phrase of INTERNAL_INTERVIEW_STRATEGY_PHRASES) {
    normalized = normalized.replaceAll(phrase, "");
  }
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * 移除题型标签前缀，避免把“算法题：”“系统设计题：”这类页面词直接带进真实题干。
 * @param value 原始主题文案。
 * @returns 去掉标签前缀后的主题。
 */
function sanitizeOpeningTopicText(value: string | undefined | null): string {
  let normalized = sanitizeExperienceInsightText(value)
    .replace(/^第一个问题\s*[:：-]\s*/i, "")
    .trim();

  for (const label of INTERVIEW_TOPIC_LABEL_PREFIXES) {
    const prefixPattern = new RegExp(`^${label}\\s*[:：-]\\s*`, "i");
    normalized = normalized.replace(prefixPattern, "").trim();
  }

  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * 判断主题是否与一面真实性开场脱节，避免非算法岗首题被旧的刷题主题污染。
 * @param value 当前候选主题。
 * @returns 是否属于需要在一面降级回项目语境的主题。
 */
function isDetachedFirstRoundTopic(value: string): boolean {
  const normalized = sanitizeOpeningTopicText(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return DETACHED_FIRST_ROUND_TOPIC_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );
}

/**
 * 为一面真实性开场兜底项目语境，避免旧 topic 或错误标签直接污染第一题。
 * @param input 一面首题上下文。
 * @returns 适合一面开场使用的项目化主题。
 */
function resolveFirstRoundProjectTopic(input: {
  role: string;
  topic: string;
  projects: Array<{ name: string; points: string }>;
}): string {
  const normalizedRole = normalizeText(input.role) || "当前岗位";
  const sanitizedTopic = sanitizeOpeningTopicText(input.topic);
  const project =
    input.projects.find((item) => {
      const projectName = normalizeText(item.name);
      const projectPoints = normalizeText(item.points);
      return (
        Boolean(projectName) &&
        Boolean(sanitizedTopic) &&
        (sanitizedTopic.includes(projectName) || projectPoints.includes(sanitizedTopic))
      );
    }) || input.projects[0];
  if (project?.name) {
    return `${project.name}里你亲自负责的核心模块`;
  }

  const roleLooksLikeAlgorithm = /算法/.test(normalizedRole);
  const topicLooksGenericByRole =
    Boolean(sanitizedTopic) &&
    (sanitizedTopic.includes(normalizedRole) ||
      /关键技术场景|技术场景设计|项目场景|场景设计/.test(sanitizedTopic));

  if (
    sanitizedTopic &&
    !isGenericInterviewFocusLabel(sanitizedTopic) &&
    !topicLooksGenericByRole &&
    (roleLooksLikeAlgorithm || !isDetachedFirstRoundTopic(sanitizedTopic))
  ) {
    return sanitizedTopic;
  }

  if (project?.points) {
    return `${normalizedRole}里你亲自负责过的关键项目模块`;
  }

  return `${normalizedRole}里你亲自负责过的核心项目场景`;
}

/**
 * 为首题开场选择最贴近当前轮次证据的项目，避免机械命中第一个项目。
 * @param projects 当前候选人项目列表。
 * @param anchors 当前轮次可用的主题锚点。
 * @returns 最匹配的项目；若无命中则返回首个项目或 `null`。
 */
function resolveOpeningProject(
  projects: Array<{ name: string; points: string }>,
  anchors: Array<string | null | undefined>
): { name: string; points: string } | null {
  const normalizedAnchors = anchors.map((item) => normalizeText(item)).filter(Boolean);
  for (const project of projects) {
    const projectName = normalizeText(project.name);
    const projectPoints = normalizeText(project.points);
    if (
      normalizedAnchors.some(
        (anchor) =>
          projectName.includes(anchor) ||
          anchor.includes(projectName) ||
          projectPoints.includes(anchor)
      )
    ) {
      return project;
    }
  }

  return projects[0] || null;
}

/**
 * 将面试消息转换成供模型消费的纯文本对话记录。
 * @param messages 当前面试消息列表。
 * @returns 格式化后的对话转写。
 */
function formatConversationTranscript(messages: InterviewMessage[]): string {
  return messages
    .map((message) => {
      const speaker = message.role === "ai" ? "面试官" : "候选人";
      return `${speaker}: ${message.content.join("\n")}`.trim();
    })
    .join("\n\n");
}

/**
 * 将数组字段整理为条目文本，避免 prompt 中出现空段落。
 * @param values 任意字符串数组。
 * @returns 适合写入 prompt 的列表段落。
 */
function formatList(values: string[] | undefined): string {
  if (!values || values.length === 0) {
    return "无";
  }

  return values.map((item) => `- ${item}`).join("\n");
}

/**
 * 将运行时面经洞察整理成稳定结构，避免脏数据直接进入 prompt。
 * @param insights 运行时传入的面经洞察。
 * @returns 清洗后的洞察数组。
 */
function normalizeRuntimeExperienceInsights(
  insights: InterviewRuntimeExperienceInsight[] | undefined
): InterviewRuntimeExperienceInsight[] {
  if (!Array.isArray(insights)) {
    return [];
  }

  return insights
    .map((item) => ({
      stageType: normalizeText(item.stageType),
      title: sanitizeExperienceInsightText(item.title),
      summary: sanitizeExperienceInsightText(item.summary),
      tags: Array.isArray(item.tags)
        ? item.tags.map((tag) => normalizeText(tag)).filter(Boolean).slice(0, 6)
        : [],
      sourceLabel: normalizeText(item.sourceLabel),
      freshnessLabel: normalizeText(item.freshnessLabel)
    }))
    .filter((item) => item.title || item.summary)
    .slice(0, 8);
}

/**
 * 优先挑出与当前轮次匹配的面经洞察；若没有完全匹配则回退到全部洞察。
 * @param runtimeContext 当前轮次运行时上下文。
 * @returns 当前轮次最相关的洞察。
 */
function selectStageScopedInsights(
  runtimeContext: InterviewRuntimeContext | null | undefined
): InterviewRuntimeExperienceInsight[] {
  const insights = normalizeRuntimeExperienceInsights(runtimeContext?.experienceInsights);
  const normalizedStageType = normalizeText(runtimeContext?.stageType);
  if (!normalizedStageType) {
    return insights;
  }

  const matchedInsights = insights.filter(
    (item) =>
      normalizeText(item.stageType).toUpperCase() === normalizedStageType.toUpperCase()
  );

  return matchedInsights.length > 0 ? matchedInsights : insights;
}

/**
 * 将运行时面经洞察转换为可直接写入 prompt 的文本段落。
 * @param runtimeContext 当前轮次运行时上下文。
 * @returns 适合直接写入 prompt 的洞察文本。
 */
function formatRuntimeExperienceInsights(
  runtimeContext: InterviewRuntimeContext | null | undefined
): string {
  const insights = selectStageScopedInsights(runtimeContext);
  if (insights.length === 0) {
    return "无";
  }

  return insights
    .map((item) => {
      const tagsText = item.tags && item.tags.length > 0 ? `；标签：${item.tags.join(" / ")}` : "";
      const sourceText = item.sourceLabel ? `；来源：${item.sourceLabel}` : "";
      const freshnessText = item.freshnessLabel ? `；时效：${item.freshnessLabel}` : "";
      return `- ${item.title}：${item.summary}${tagsText}${sourceText}${freshnessText}`;
    })
    .join("\n");
}

/**
 * 将上一轮或历史轮次反馈整理成 prompt 可消费的摘要。
 * @param runtimeContext 当前轮次运行时上下文。
 * @returns 反馈摘要文本。
 */
function formatPreviousStageFeedback(
  runtimeContext: InterviewRuntimeContext | null | undefined
): string {
  if (!runtimeContext?.previousStageFeedback?.length) {
    return "无";
  }

  return runtimeContext.previousStageFeedback
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
}

/**
 * 根据轮次类型返回专属 prompt 画像，确保一面/二面/三面/HR 面问法真正拆开。
 * @param stageType 当前轮次类型。
 * @param stageLabel 当前轮次标签。
 * @returns 当前轮次对应的问法策略。
 */
function resolveStagePromptProfile(
  stageType: string,
  stageLabel: string
): StagePromptProfile {
  const normalizedStageType = normalizeText(stageType).toUpperCase();
  const normalizedStageLabel = normalizeText(stageLabel) || "当前轮次";

  switch (normalizedStageType) {
    case "FIRST_ROUND":
      return {
        interviewerIdentity: "一面基础技术与项目真实性筛查面试官",
        openingStyle: `这一轮是${normalizedStageLabel}，你的语气要利落、直接，优先快速判断候选人的项目真实性、基础扎实度和表达清晰度。`,
        questionGoal:
          "优先问可快速拉开差距的项目追问、基础技术落地题和真实场景判断题，不要一上来就问过重的架构总设计。",
        openingQuestionPattern:
          "开场优先从候选人最熟悉的项目、模块、接口或优化点切入，快速判断真实性、基础能力和表达结构。",
        followUpRules: [
          "优先确认候选人是否真的做过项目、是否清楚自己负责的关键链路。",
          "若候选人答案泛化，立刻收窄到一个具体接口、模块、事故或优化点继续追问。",
          "若候选人连项目细节和基础原理都说不清，可以快速终止当前主题并给出淘汰信号。",
        ],
        avoidPatterns: [
          "不要把一面问成 CTO 架构评审。",
          "不要连续抛出多个系统设计大题。",
        ],
      };
    case "SECOND_ROUND":
      return {
        interviewerIdentity: "二面系统设计与取舍深挖面试官",
        openingStyle: `这一轮是${normalizedStageLabel}，你的问题要更像中高级技术面，重点验证方案取舍、容量估算、稳定性和边界处理。`,
        questionGoal:
          "优先问系统设计、复杂故障、容量与一致性、多组件协同和线上治理，不再停留在初级八股筛查。",
        openingQuestionPattern:
          "开场优先给系统设计、容量治理或复杂故障场景，让候选人讲约束、方案、取舍和风险闭环。",
        followUpRules: [
          "必须逼近容量、可用性、降级、监控、回滚和风险闭环。",
          "当候选人给出方案时，优先追问为什么不是另一个方案。",
          "若候选人只会罗列组件，不会谈约束和取舍，要持续追打。",
        ],
        avoidPatterns: [
          "不要把二面问成简历朗读。",
          "不要只问概念定义，不落真实业务约束。",
        ],
      };
    case "THIRD_ROUND":
      return {
        interviewerIdentity: "三面业务判断与复杂协同面试官",
        openingStyle: `这一轮是${normalizedStageLabel}，你的问题要体现更强的业务判断、跨团队协同、复杂项目 owner 意识和综合决策能力。`,
        questionGoal:
          "优先问跨团队博弈、复杂项目推进、资源冲突、业务目标与技术取舍，不再只停留在单点技术实现。",
        openingQuestionPattern:
          "开场优先给复杂项目推进、跨团队协同或业务取舍场景，验证候选人的 owner 意识和综合判断。",
        followUpRules: [
          "追问候选人在复杂协同场景下如何做判断，而不是只看技术点。",
          "鼓励候选人讲业务目标、冲突协调、优先级取舍和结果复盘。",
          "如果候选人无法体现 owner 意识和复杂决策力，要明确暴露这一短板。",
        ],
        avoidPatterns: [
          "不要把三面问成纯 HR 面。",
          "不要只围绕单一代码细节反复追打。",
        ],
      };
    case "HR_ROUND":
      return {
        interviewerIdentity: "HR 面动机与稳定性面试官",
        openingStyle: `这一轮是${normalizedStageLabel}，你的语气可以更自然，但必须聚焦求职动机、稳定性、团队协作边界和职业诉求，不再问重技术实现题。`,
        questionGoal:
          "优先问动机、离职原因、职业规划、沟通冲突、协作方式和稳定性风险，帮助判断最终录用风险。",
        openingQuestionPattern:
          "开场优先问真实动机、关键选择、冲突处理或职业诉求，让候选人给出具体经历与反思。",
        followUpRules: [
          "优先识别候选人的职业动机是否真实一致。",
          "若出现明显冲突、稳定性风险或沟通失衡，要继续往下挖。",
          "可以引用前序轮次反馈验证候选人的反思能力和一致性。",
        ],
        avoidPatterns: [
          "不要继续追问重型系统设计题。",
          "不要把 HR 面重新问回第一轮基础八股。",
        ],
      };
    default:
      return {
        interviewerIdentity: `${normalizedStageLabel}专属面试官`,
        openingStyle: `当前轮次是${normalizedStageLabel}，你的提问必须紧贴这轮职责，不要退回泛化综合面试。`,
        questionGoal: "优先围绕当前轮次最该验证的能力点设计问题，确保题目真实、可回答、可继续追问。",
        openingQuestionPattern:
          "开场题要直接落到当前轮次最核心的验证点，不能复用泛化问法。",
        followUpRules: [
          "先判断这轮最该验证什么，再发问。",
          "所有追问都要服务于当前轮次结论，不要飘到无关主题。",
        ],
        avoidPatterns: ["不要把页面标签、模式标签直接问给候选人。"],
      };
  }
}

/**
 * 为当前轮次挑选最值得优先消费的一条洞察，只命中同轮次洞察，避免三面误吃一面的题干。
 * @param profile 当前缓存中的画像与运行时状态。
 * @returns 最相关的面经洞察；不存在时返回 `null`。
 */
function selectOpeningExperienceInsight(
  profile: InterviewProfileState | null
): InterviewExperienceInsightState | null {
  const insights = Array.isArray(profile?.experienceInsights)
    ? profile.experienceInsights
        .map((item) => ({
          ...item,
          stageType: normalizeText(item.stageType),
          title: normalizeText(item.title),
          summary: normalizeText(item.summary)
        }))
        .filter((item) => item.title || item.summary)
    : [];

  if (insights.length === 0) {
    return null;
  }

  const normalizedStageType = normalizeText(profile?.currentStageType);
  const matchedInsight = normalizedStageType
    ? insights.find(
        (item) => normalizeText(item.stageType).toUpperCase() === normalizedStageType.toUpperCase()
      )
    : null;

  return normalizedStageType ? matchedInsight || null : insights[0] || null;
}

/**
 * 仅保留最近若干轮对话，帮助模型稳定携带有效上下文而不被全量历史稀释。
 * @param messages 当前面试消息列表。
 * @param maxMessages 最多保留的消息数。
 * @returns 最近对话转写。
 */
function formatRecentConversation(
  messages: InterviewMessage[],
  maxMessages = 6
): string {
  if (messages.length === 0) {
    return "暂无历史对话。";
  }

  return formatConversationTranscript(messages.slice(-maxMessages));
}

/**
 * 提取最近一条用户回答，供追问策略与质量检查复用。
 * @param messages 当前面试消息列表。
 * @returns 最近一条用户回答文本。
 */
function getLatestUserAnswer(messages: InterviewMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return message.content.join("\n").trim();
    }
  }

  return "";
}

/**
 * 提取最近一条 AI 提问，帮助下一轮追问延续同一主题。
 * @param messages 当前面试消息列表。
 * @returns 最近一条 AI 提问文本。
 */
function getLatestAiQuestion(messages: InterviewMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "ai") {
      return message.content.join("\n").trim();
    }
  }

  return "";
}

/**
 * 把岗位、主题、项目等上下文拆成可复用的锚点词，便于判断题目是否真正贴合场景。
 * @param values 候选上下文字段。
 * @returns 去重后的锚点词数组。
 */
function buildContextAnchors(values: string[]): string[] {
  const anchors = values
    .flatMap((value) =>
      value
        .split(/[\s,，。；;、:：/|()\[\]（）\-]+/)
        .map((item) => item.trim())
    )
    .filter((item) => item.length >= 2);

  return Array.from(new Set(anchors)).slice(0, 12);
}

/**
 * 判断文本是否包含任意指定关键词。
 * @param text 被检索文本。
 * @param keywords 关键词列表。
 * @returns 是否命中关键词。
 */
function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

const TESTING_ROLE_KEYWORDS = [
  "测试开发",
  "测试工程师",
  "qa",
  "sdet",
  "质量工程师",
  "质量保障",
  "测试架构",
  "自动化测试",
  "test engineer",
  "quality engineer",
  "quality assurance"
];

const TESTING_DOMAIN_KEYWORDS = [
  "测试",
  "用例",
  "回归",
  "冒烟",
  "自动化",
  "接口测试",
  "ui测试",
  "性能测试",
  "压测",
  "稳定性",
  "质量平台",
  "缺陷",
  "bug",
  "故障复现",
  "mock",
  "桩",
  "质量门禁",
  "ci/cd",
  "持续集成",
  "测试数据",
  "覆盖率",
  "flaky",
  "断言"
];

/**
 * 判断当前岗位是否应走测试/质量工程题型路线。
 * @param values 岗位、主题、JD 与项目等上下文字段。
 * @returns 归一化后的岗位路线。
 */
export function detectInterviewRoleTrack(values: string[]): InterviewRoleTrack {
  const combinedText = values.join(" ").toLowerCase();
  if (
    includesAnyKeyword(combinedText, [
      ...TESTING_ROLE_KEYWORDS,
      ...TESTING_DOMAIN_KEYWORDS
    ])
  ) {
    return "testing";
  }

  return "general";
}

/**
 * 根据当前训练主题和岗位判断首题更适合的题型。
 * @param input 首题生成所需的上下文。
 * @returns 首题题型。
 */
function selectOpeningQuestionType(input: {
  mode: InterviewMode;
  role: string;
  topic: string;
  desc: string;
  focus: string;
  projects: Array<{ name: string; points: string }>;
}): OpeningQuestionType {
  const combinedText = [
    input.role,
    input.topic,
    input.desc,
    input.focus,
    input.projects[0]?.name || "",
    input.projects[0]?.points || ""
  ]
    .join(" ")
    .toLowerCase();
  const roleTrack = detectInterviewRoleTrack([
    input.role,
    input.topic,
    input.desc,
    input.focus,
    input.projects[0]?.name || "",
    input.projects[0]?.points || ""
  ]);

  if (roleTrack === "testing") {
    if (
      includesAnyKeyword(combinedText, [
        "缺陷",
        "bug",
        "复现",
        "定位",
        "排查",
        "线上问题",
        "回归",
        "稳定性",
        "故障"
      ])
    ) {
      return "defect_analysis";
    }

    if (
      includesAnyKeyword(combinedText, [
        "自动化",
        "selenium",
        "playwright",
        "cypress",
        "pytest",
        "接口测试",
        "ui测试",
        "脚本",
        "流水线",
        "ci/cd",
        "质量门禁",
        "覆盖率",
        "flaky"
      ])
    ) {
      return "test_automation";
    }

    return "testing_strategy";
  }

  if (
    includesAnyKeyword(combinedText, [
      "排障",
      "故障",
      "定位",
      "线上",
      "性能",
      "慢查询",
      "oom",
      "gc",
      "雪崩",
      "穿透",
      "抖动",
      "异常"
    ])
  ) {
    return "troubleshooting";
  }

  if (
    includesAnyKeyword(combinedText, [
      "系统设计",
      "架构",
      "高并发",
      "扩展",
      "微服务",
      "一致性",
      "限流",
      "分库分表",
      "设计"
    ])
  ) {
    return "scenario";
  }

  if (
    includesAnyKeyword(combinedText, [
      "取舍",
      "权衡",
      "tradeoff",
      "方案选择",
      "为什么",
      "选型"
    ])
  ) {
    return "tradeoff";
  }

  if (
    input.mode !== "targeted" &&
    (includesAnyKeyword(combinedText, [
      "项目",
      "经历",
      "表达",
      "亮点",
      "复盘"
    ]) ||
    input.projects.length > 0)
  ) {
    return "project";
  }

  return "principle_application";
}

const GENERIC_INTERVIEW_FOCUS_LABELS = [
  "综合面试",
  "全流程面试",
  "阶段面试",
  "项目深挖",
  "系统设计",
  "场景问答",
  "行为软技能（hr）",
  "行为软技能",
  "hr"
];

/**
 * 判断一个主题文案是否只是页面层的通用标签，而不是可直接出题的真实主题。
 * @param value 候选主题文案。
 * @returns 是否属于泛标签。
 */
function isGenericInterviewFocusLabel(value: string): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return !normalized || GENERIC_INTERVIEW_FOCUS_LABELS.includes(normalized);
}

/**
 * 为测试岗位生成更具体的出题主题，避免把“综合面试”之类的页面标签直接写进题干。
 * @param input 当前开场题上下文。
 * @returns 适合放入题干的测试主题与目标。
 */
function resolveTestingQuestionContext(input: {
  topic: string;
  desc: string;
  focus: string;
  projects: Array<{ name: string; points: string }>;
}): { topic: string; goal: string } {
  const project = resolveOpeningProject(input.projects, [
    input.topic,
    input.desc,
    input.focus,
  ]);
  const projectText = [project?.name || "", project?.points || ""].join(" ");
  const mergedText = [input.topic, input.desc, input.focus, projectText].join(" ");
  const normalizedTopic = sanitizeOpeningTopicText(input.topic);
  const normalizedDesc = sanitizeExperienceInsightText(input.desc);

  let resolvedTopic = normalizedTopic;
  if (isGenericInterviewFocusLabel(resolvedTopic)) {
    if (includesAnyKeyword(mergedText.toLowerCase(), ["支付", "订单", "交易"])) {
      resolvedTopic = "支付链路接口稳定性与缺陷定位";
    } else if (
      includesAnyKeyword(mergedText.toLowerCase(), [
        "自动化",
        "playwright",
        "selenium",
        "pytest",
        "断言",
        "回归"
      ])
    ) {
      resolvedTopic = "接口自动化与回归验证";
    } else if (includesAnyKeyword(mergedText.toLowerCase(), ["性能", "压测", "稳定性"])) {
      resolvedTopic = "性能与稳定性保障";
    } else {
      resolvedTopic = "测试策略、自动化与缺陷定位";
    }
  }

  let resolvedGoal = normalizedDesc;
  if (!resolvedGoal || isGenericInterviewFocusLabel(resolvedGoal)) {
    if (includesAnyKeyword(mergedText.toLowerCase(), ["性能", "压测", "稳定性"])) {
      resolvedGoal = "判断性能风险、定位瓶颈并设计可执行的回归验证方案";
    } else if (includesAnyKeyword(mergedText.toLowerCase(), ["自动化", "回归", "断言"])) {
      resolvedGoal = "把测试脚本沉淀成稳定可运行、可回归的自动化能力";
    } else {
      resolvedGoal = "围绕真实测试职责验证你的问题拆解、定位与质量保障能力";
    }
  }

  return {
    topic: resolvedTopic,
    goal: resolvedGoal
  };
}

/**
 * 为通用技术岗位解析更真实的开场主题，避免把“综合面试”等页面标签直接问给候选人。
 * @param input 当前开场题上下文。
 * @returns 适合放入题干的真实主题与目标。
 */
function resolveGeneralQuestionContext(input: {
  role: string;
  topic: string;
  desc: string;
  focus: string;
  projects: Array<{ name: string; points: string }>;
}): { topic: string; goal: string } {
  const normalizedRole = normalizeText(input.role);
  const normalizedTopic = sanitizeOpeningTopicText(input.topic);
  const normalizedDesc = sanitizeExperienceInsightText(input.desc);
  const normalizedFocus = sanitizeOpeningTopicText(input.focus);
  const project = input.projects[0];
  const projectText = [project?.name || "", project?.points || ""].join(" ");
  const mergedText = [
    normalizedRole,
    normalizedTopic,
    normalizedDesc,
    normalizedFocus,
    projectText,
  ]
    .join(" ")
    .toLowerCase();

  let resolvedTopic = normalizedTopic;
  if (isGenericInterviewFocusLabel(resolvedTopic)) {
    if (includesAnyKeyword(mergedText, ["缓存", "redis", "一致性", "双写", "延迟双删"])) {
      resolvedTopic = "缓存一致性与高并发读写治理";
    } else if (
      includesAnyKeyword(mergedText, ["mq", "消息", "kafka", "rocketmq", "幂等", "重试"])
    ) {
      resolvedTopic = "消息可靠性、幂等与异步链路治理";
    } else if (
      includesAnyKeyword(mergedText, ["mysql", "分库分表", "事务", "锁", "索引"])
    ) {
      resolvedTopic = "数据库事务、索引与高并发性能优化";
    } else if (
      includesAnyKeyword(mergedText, ["jvm", "gc", "内存", "线程", "并发"])
    ) {
      resolvedTopic = "JVM、并发模型与线上稳定性排障";
    } else if (
      includesAnyKeyword(mergedText, ["网关", "微服务", "熔断", "降级", "链路"])
    ) {
      resolvedTopic = "微服务调用链稳定性与服务治理";
    } else if (project?.name || project?.points) {
      resolvedTopic = `${project?.name || "核心项目"}中的关键技术决策`;
    } else {
      resolvedTopic = `${normalizedRole || "当前岗位"}的关键技术场景设计`;
    }
  }

  let resolvedGoal = normalizedDesc;
  if (!resolvedGoal || isGenericInterviewFocusLabel(resolvedGoal)) {
    if (resolvedTopic.includes("缓存")) {
      resolvedGoal = "说明你如何平衡一致性、性能、可用性与回源风险";
    } else if (resolvedTopic.includes("消息")) {
      resolvedGoal = "说明你如何保障消息链路可靠、可追踪且可恢复";
    } else if (resolvedTopic.includes("数据库")) {
      resolvedGoal = "说明你如何定位瓶颈、控制事务成本并兼顾数据正确性";
    } else if (resolvedTopic.includes("JVM") || resolvedTopic.includes("并发")) {
      resolvedGoal = "说明你如何结合监控信号快速排障并给出稳定修复方案";
    } else if (resolvedTopic.includes("微服务")) {
      resolvedGoal = "说明你如何处理依赖故障、流量波动与系统降级策略";
    } else {
      resolvedGoal = "说明你如何在真实业务约束下完成方案设计、风险识别与落地取舍";
    }
  }

  return {
    topic: resolvedTopic,
    goal: resolvedGoal,
  };
}

/**
 * 按题型生成真正可回答、可追问的开场题。
 * @param input 开场问题所需的真实上下文。
 * @returns 开场题文本。
 */
function buildOpeningQuestion(input: {
  mode: InterviewMode;
  role: string;
  topic: string;
  desc: string;
  focus: string;
  projects: Array<{ name: string; points: string }>;
}): string {
  const role = normalizeText(input.role) || "当前目标岗位";
  const roleTrack = detectInterviewRoleTrack([
    input.role,
    input.topic,
    input.desc,
    input.focus,
    ...input.projects.flatMap((project) => [project.name, project.points])
  ]);
  const defaultTopic =
    sanitizeOpeningTopicText(input.topic) ||
    sanitizeOpeningTopicText(input.focus) ||
    "当前训练主题";
  const defaultDesc =
    sanitizeExperienceInsightText(input.desc) ||
    sanitizeOpeningTopicText(input.focus) ||
    "本次训练目标";
  const testingContext =
    roleTrack === "testing"
      ? resolveTestingQuestionContext({
          topic: input.topic,
          desc: input.desc,
          focus: input.focus,
          projects: input.projects
        })
      : null;
  const generalContext =
    roleTrack === "testing"
      ? null
      : resolveGeneralQuestionContext({
          role,
          topic: input.topic,
          desc: input.desc,
          focus: input.focus,
          projects: input.projects,
        });
  const topic = testingContext?.topic || generalContext?.topic || defaultTopic;
  const desc = testingContext?.goal || generalContext?.goal || defaultDesc;
  const project = input.projects[0];
  const questionType = selectOpeningQuestionType(input);

  if (questionType === "project" && project) {
    return `先从你最有代表性的项目【${project.name}】切入：如果你现在正在应聘【${role}】，面试官追问这个项目与【${topic}】最相关的一次真实难点，你会选哪一个场景展开？请按“业务背景、你的判断、关键取舍、最终结果”四步回答，并说明为什么这个案例最能体现你的能力。`;
  }

  if (questionType === "troubleshooting") {
    return `我们直接做一道【${role}】语境下的排障题：假设你负责的系统出现了与【${topic}】相关的线上异常，你需要在较短时间内把问题定位清楚。请按“先看什么信号、如何缩小范围、如何验证根因、如何落地修复与复盘”的顺序回答，并说明每一步背后的判断依据。`;
  }

  if (questionType === "scenario") {
    return `现在给你一个【${role}】真实场景：需要围绕【${topic}】完成一项能力设计，目标是【${desc}】。如果由你主导，你会先定义哪些关键约束，再如何设计核心方案？请明确讲出方案结构、关键数据流或调用链，以及你最担心的风险点。`;
  }

  if (questionType === "tradeoff") {
    return `围绕【${topic}】做一个方案取舍题：假设你在【${role}】岗位上需要达成【${desc}】，但至少有两种可行实现路径。你会怎么比较它们的复杂度、稳定性、性能和维护成本？请给出你的最终选择，并说明为什么不是另一个方案。`;
  }

  if (questionType === "testing_strategy") {
    return `现在按【${role}】真实场景来一道测试方案题：假设你要围绕【${topic}】保障一次关键功能上线，目标是【${desc}】。你会如何拆测试范围、设计测试用例优先级、选择自动化与人工验证边界，并定义上线前的放行标准？请尽量讲清风险识别、覆盖策略和质量度量。`;
  }

  if (questionType === "test_automation") {
    return `我们做一道【${role}】自动化测试落地题：假设你要把【${topic}】建设成可持续运行的自动化能力，目标是【${desc}】。如果由你主导，你会怎么选自动化层级、组织测试数据、设计断言、接入 CI/CD，并控制 flaky case 与维护成本？请按“范围、框架、数据、断言、门禁”几个部分回答。`;
  }

  if (questionType === "defect_analysis") {
    return `我们直接进入【${role}】缺陷定位场景：线上出现了与【${topic}】相关的问题，当前目标是【${desc}】。如果你是负责该模块质量的同学，你会先怎样复现问题、收集日志与监控信号、缩小嫌疑范围、验证根因，并设计回归方案避免同类问题再次出现？`;
  }

  return `我们从一个“原理落地题”开始：在【${role}】的真实工作里，${topic} 经常不只是背概念，而是要真正解决问题。请你选一个最典型的业务场景，说明这个主题的核心机制在场景里是怎么发挥作用的、哪些边界最容易踩坑，以及如果让你落地，你会优先关注哪些观测指标或实现细节。`;
}

/**
 * 基于轮次类型把首题进一步改写成一面/二面/三面/HR 面专属问法，避免不同轮次只靠系统规则做弱区分。
 * @param input 当前开场题所需上下文。
 * @returns 轮次专属首题；若当前不是明确轮次，则返回通用首题。
 */
function buildStageSpecificOpeningQuestion(input: {
  mode: InterviewMode;
  role: string;
  topic: string;
  desc: string;
  focus: string;
  companyName?: string | null;
  stageType?: string | null;
  stageLabel?: string | null;
  projects: Array<{ name: string; points: string }>;
}): string {
  const normalizedStageType = normalizeText(input.stageType).toUpperCase();
  const normalizedStageLabel = normalizeText(input.stageLabel) || "当前轮次";
  const normalizedRole = normalizeText(input.role) || "当前目标岗位";
  const normalizedCompanyName = normalizeText(input.companyName) || "目标公司";
  const project = input.projects[0];
  const generalContext = resolveGeneralQuestionContext({
    role: normalizedRole,
    topic: input.topic,
    desc: input.desc,
    focus: input.focus,
    projects: input.projects,
  });
  const questionTopic = generalContext.topic;
  const questionGoal = generalContext.goal;
  const firstRoundTopic = resolveFirstRoundProjectTopic({
    role: normalizedRole,
    topic: questionTopic,
    projects: input.projects,
  });

  if (normalizedStageType === "FIRST_ROUND") {
    if (project?.name) {
      return `现在进入【${normalizedCompanyName} · ${normalizedStageLabel}】。先从真实性开始：请直接围绕【${project.name}】展开，重点讲清你亲自负责的核心模块、当时的业务背景、你做过的关键判断，以及如果我继续深挖接口细节或故障细节，你最有把握展开的是哪一段？`;
    }

    return `现在进入【${normalizedCompanyName} · ${normalizedStageLabel}】。先从真实性开始：请你选一个自己亲自负责过、且最能体现【${firstRoundTopic}】的项目场景展开，重点讲清当时的业务背景、你负责的具体模块、你做过的关键判断，以及如果我继续深挖接口细节或故障细节，你最有把握展开的是哪一段？`;
  }

  if (normalizedStageType === "SECOND_ROUND") {
    return `现在进入【${normalizedCompanyName} · ${normalizedStageLabel}】。假设你负责的核心系统要围绕【${questionTopic}】完成一次升级，目标是【${questionGoal}】。如果这次方案由你主导，你会先定义哪些约束，再如何设计核心链路、容量与稳定性方案？请同时讲清为什么这样选，以及你准备如何兜住最坏情况。`;
  }

  if (normalizedStageType === "THIRD_ROUND") {
    return `现在进入【${normalizedCompanyName} · ${normalizedStageLabel}】。这轮我更想看你的综合判断：假设你推动的一个关键项目同时遇到业务目标变化、跨团队协作阻力和技术方案分歧，而项目主题又和【${questionTopic}】高度相关，你会如何做优先级判断、推进协同并最终拿结果？请尽量讲一个你真的做过或最接近的案例。`;
  }

  if (normalizedStageType === "HR_ROUND") {
    const projectLabel = project?.name || questionTopic || "最近一段关键经历";
    return `现在进入【${normalizedCompanyName} · ${normalizedStageLabel}】。先不聊技术实现，我想从你的真实选择开始：围绕【${projectLabel}】或你最近一次重要转折，讲讲你为什么会做出当时的决定，这里面最能体现你职业动机、稳定性判断和协作方式的一次经历是什么？如果当时再来一次，你会不会做出不同选择，为什么？`;
  }

  return buildOpeningQuestion({
    mode: input.mode,
    role: normalizedRole,
    topic: input.topic,
    desc: input.desc,
    focus: input.focus,
    projects: input.projects,
  });
}

/**
 * 判断当前轮次处于开场、深挖还是收束阶段，便于 prompt 控制提问节奏。
 * @param completedRounds 当前已完成轮次。
 * @param messages 当前面试消息列表。
 * @returns 结构化的阶段描述。
 */
function describeInterviewStage(
  completedRounds: number,
  messages: InterviewMessage[]
): string {
  if (messages.length <= 2 || completedRounds <= 1) {
    return "开场后的首轮深挖阶段，应尽快围绕一个具体能力点切入。";
  }

  if (completedRounds <= 4) {
    return "中段深挖阶段，应延续上一轮问题，把细节、取舍、边界和风险追透。";
  }

  return "后段收束阶段，应优先追问仍未验证的关键能力，不要无序跳题。";
}

/**
 * 对模型准备发送的最终回复做本地质量检查，最小化拦截空题、泛题和跑偏题。
 * @param input 面试回复及上下文。
 * @returns 是否通过以及修复指令。
 */
export function inspectInterviewReplyQuality(
  input: InterviewReplyQualityInput
): InterviewReplyQualityResult {
  const replyText = normalizeText(input.replyText);
  const role = normalizeText(input.role);
  const topic = normalizeText(input.topic);
  const desc = normalizeText(input.desc);
  const focus = normalizeText(input.focus);
  const latestUserAnswer = normalizeText(input.latestUserAnswer);
  const issues: string[] = [];
  const lowerReply = replyText.toLowerCase();
  const anchors = buildContextAnchors(
    input.mode === "targeted"
      ? [role, topic, desc, focus]
      : [
          role,
          topic,
          desc,
          focus,
          ...((input.projects || []).flatMap((project) => [project.name, project.points]))
        ]
  );
  const hitAnchorCount = anchors.filter((anchor) => replyText.includes(anchor)).length;
  const weakPatternList = [
    "请先用自己的话完整讲清",
    "先做一个自我介绍",
    "介绍一下你自己",
    "谈谈你的理解",
    "聊一聊",
    "泛泛讲",
    "原理、使用边界或实战经验",
    "下面我想进一步追问一下",
    "接下来我想追问一下",
    "请你系统地",
    "请从多个维度",
    "请详细阐述",
    "请展开说明"
  ];
  const hasQuestionSignal = /[？?]|请你|你会如何|你怎么|如果你来|你会怎么|为什么/.test(
    replyText
  );
  const roleTrack = detectInterviewRoleTrack([
    role,
    topic,
    desc,
    focus,
    ...((input.projects || []).flatMap((project) => [project.name, project.points]))
  ]);
  const testingAnchorCount = TESTING_DOMAIN_KEYWORDS.filter((keyword) =>
    lowerReply.includes(keyword.toLowerCase())
  ).length;

  if (!replyText) {
    issues.push("回复为空。");
  }

  if (replyText.length < 18) {
    issues.push("回复过短，缺少可执行的提问信息。");
  }

  if (!hasQuestionSignal) {
    issues.push("回复没有形成明确的可回答问题。");
  }

  if (weakPatternList.some((pattern) => replyText.includes(pattern))) {
    issues.push("回复仍在使用过于空泛的弱题模板。");
  }

  if (input.mode === "targeted" && hitAnchorCount === 0) {
    issues.push("专项训练回复没有落到岗位、主题、目标或项目锚点。");
  }

  if (
    input.mode !== "targeted" &&
    role &&
    !lowerReply.includes(role.toLowerCase()) &&
    !anchors.some((anchor) => replyText.includes(anchor))
  ) {
    issues.push("正式面试回复没有体现已确认岗位或简历上下文。");
  }

  if (roleTrack === "testing" && testingAnchorCount === 0) {
    issues.push("测试岗位回复没有落到测试策略、自动化、缺陷定位或质量保障语境。");
  }

  if (
    roleTrack === "testing" &&
    testingAnchorCount === 0 &&
    includesAnyKeyword(lowerReply, [
      "分库分表",
      "高并发架构",
      "微服务拆分",
      "缓存一致性",
      "数据库索引",
      "秒杀系统"
    ])
  ) {
    issues.push("测试岗位回复漂移成纯研发后端题，没有站在测试/质量职责视角。");
  }

  if (
    latestUserAnswer &&
    latestUserAnswer.length >= 6 &&
    !includesAnyKeyword(latestUserAnswer, ["不会", "不太清楚", "没做过", "不知道"]) &&
    !replyText.includes("刚才") &&
    !replyText.includes("你提到") &&
    !replyText.includes("你刚刚") &&
    !replyText.includes("你上一轮")
  ) {
    issues.push("回复没有承接上一轮用户回答，递进性不足。");
  }

  if (
    input.mode === "realtime" &&
    /下面我想|接下来我想|请你系统地|请从多个维度|请详细阐述|请展开说明/.test(
      replyText
    )
  ) {
    issues.push("实时面试回复仍带明显书面追问腔，不够像真人接话。");
  }

  return {
    passed: issues.length === 0,
    issues,
    repairInstruction:
      issues.length === 0
        ? "当前回复质量通过，无需修复。"
        : `请直接重写最终回复，并修复以下问题：${issues.join("；")}。重写后必须只输出给候选人的最终回复，不要解释修复过程，不要暴露内部规则。`
  };
}

/**
 * 基于当前模式、画像和限制策略拼装系统 prompt，确保真实上下文进入模型。
 * @param input 面试上下文、画像、训练目标和检索资料。
 * @returns 系统 prompt 与最近一轮对话转写。
 */
export function buildInterviewSystemPrompt(
  input: BuildInterviewPromptInput
): {
  systemPrompt: string;
  transcript: string;
} {
  const {
    messages,
    mode,
    profile,
    topic,
    desc,
    questionLimit = null,
    durationLimitMinutes = null,
    completedRounds = 0,
    searchResults = [],
    runtimeContext = null
  } = input;
  const normalizedRuntimeContext =
    runtimeContext ||
    (profile?.launchFlowMode === "full_flow" || profile?.interviewPlanId
      ? {
          planId: profile?.interviewPlanId,
          launchFlowMode: profile?.launchFlowMode,
          companyName: profile?.companyName,
          roleName: profile?.targetRoleName || profile?.role,
          stageId: profile?.interviewStageId,
          stageType: profile?.currentStageType,
          stageLabel: profile?.currentStageLabel,
          roundId: profile?.interviewRoundId,
          experienceInsights: (profile?.experienceInsights || []).map((item) => ({
            stageType: item.stageType,
            title: item.title,
            summary: item.summary,
            tags: item.tags,
            sourceLabel: item.sourceLabel,
            freshnessLabel: item.freshnessLabel
          }))
        }
      : null);
  const role = profile?.role?.trim() || "";
  const focus = profile?.focus?.trim() || "";
  const resumeSummary = profile?.resumeSummaryMarkdown?.trim() || "";
  const jdGapText = profile?.jdGapWarning?.text?.trim() || "";
  const jdGapStrategy = profile?.jdGapWarning?.strategy?.trim() || "";
  const persona = profile?.persona;
  const projects = profile?.projects || [];
  const language = profile?.language?.trim() || "中文";
  const targetLevel = profile?.targetLevel?.trim() || "未提供";
  const missingDataHints = profile?.missingDataHints || [];
  const interruptionContext = profile?.realtimeInterruptionContext;
  const interruptedAssistantText =
    interruptionContext?.interruptedAssistantText?.trim() || "";
  const limitStrategy = buildInterviewLimitStrategy(
    profile?.limitType ?? "none",
    questionLimit,
    durationLimitMinutes
  );
  const modeLabel = getInterviewModeLabel(mode, Boolean(profile?.videoEnabled));
  const specializationTopic = topic?.trim() || profile?.topic?.trim() || "";
  const specializationDesc = desc?.trim() || profile?.desc?.trim() || "";
  const searchReference = searchResults
    .map((item) => item.text?.trim() || "")
    .filter(Boolean)
    .join("\n");
  const recentTranscript = formatRecentConversation(messages);
  const latestUserAnswer = getLatestUserAnswer(messages);
  const latestAiQuestion = getLatestAiQuestion(messages);
  const isFormalSimulationIntroPhase =
    mode !== "targeted" &&
    profile?.launchFlowMode === "full_flow" &&
    messages.filter((message) => message.role === "user").length <= 1;
  const stageText = describeInterviewStage(completedRounds, messages);
  const runtimeCompanyName =
    normalizeText(normalizedRuntimeContext?.companyName) || normalizeText(profile?.companyName);
  const runtimeRoleName =
    normalizeText(normalizedRuntimeContext?.roleName) ||
    normalizeText(profile?.targetRoleName) ||
    role;
  const runtimeStageLabel =
    normalizeText(normalizedRuntimeContext?.stageLabel) || normalizeText(profile?.currentStageLabel);
  const runtimeStageType =
    normalizeText(normalizedRuntimeContext?.stageType) || normalizeText(profile?.currentStageType);
  const runtimeStageFeedback = formatPreviousStageFeedback(normalizedRuntimeContext);
  const runtimeInsightSummary = formatRuntimeExperienceInsights(normalizedRuntimeContext);
  const stagePromptProfile = resolveStagePromptProfile(runtimeStageType, runtimeStageLabel);
  const contextAnchors = buildContextAnchors(
    mode === "targeted"
      ? [role, focus, specializationTopic, specializationDesc]
      : [
          role,
          focus,
          specializationTopic,
          specializationDesc,
          runtimeCompanyName,
          runtimeRoleName,
          runtimeStageLabel,
          runtimeInsightSummary,
          ...projects.flatMap((item) => [item.name, item.points])
        ]
  );
  const roleTrack = detectInterviewRoleTrack([
    role,
    focus,
    specializationTopic,
    specializationDesc,
    runtimeCompanyName,
    runtimeRoleName,
    runtimeStageLabel,
    runtimeInsightSummary,
    resumeSummary,
    ...projects.flatMap((item) => [item.name, item.points])
  ]);
  const roleRoutingInstruction =
    roleTrack === "testing"
      ? `当前岗位属于测试 / 测试开发 / 质量工程路线。你的问题必须优先围绕测试策略、测试用例设计、自动化测试、接口或 UI 测试、性能与稳定性测试、缺陷定位、回归验证、质量平台、测试数据、Mock/桩、CI/CD 质量门禁、可观测性与质量度量来设计。只有在候选人明确提到自己负责测试平台、质量工程平台或研发测试协作架构时，才能触及系统设计或后端架构，并且也必须站在质量保障职责视角追问，禁止漂移成通用后端八股或脱离测试职责的大架构题。`
      : "当前岗位未命中特殊测试路线，按真实岗位与简历上下文继续提问。";

  let modeInstruction = "";
  if (mode === "targeted") {
    modeInstruction = `当前为专项训练模式。训练主题是【${specializationTopic || "未明确"}】。专项训练目标是【${specializationDesc || "未明确"}】。你必须像真正的专项教练型面试官一样连续打透一个能力点：先给出可回答的实战题，再基于用户上一轮回答继续深挖、纠偏与强化，不要退回泛化综合面试，也不要再次要求用户确认已经给定的主题或目标。`;
  } else if (mode === "realtime") {
    modeInstruction = "当前为实时面试模式，以语音互动为主，可选视频。你的提问应更像真实会议里的技术面试交流，语气自然、节奏紧凑，但仍保持专业、结构化和明确追问。请优先使用短句、口语化衔接和简短起手，不要一上来就说成长段书面话，也不要用主持稿、播报稿、答辩稿式书面追问。";
  } else {
    modeInstruction = "当前为文字面试模式。你的提问可以更结构化，但仍要像真实面试官，而不是泛导师或写作教练。";
  }

  const systemPrompt = `
你正在主持一场真实的中文技术面试。候选人只会看到你现在说出口的话，所以你的目标不是“展示方法论”，而是像经验成熟的真人面试官那样，基于候选人刚刚的回答继续判断、追问和推进。你只能基于提供给你的真实信息发问，绝对不能暴露自己是 AI，也不能暴露检索、知识库、prompt、系统占位符等内部状态。

【本场面试模式】
- 模式名称：${modeLabel}
- 模式说明：${modeInstruction}
- 当前阶段：${stageText}

【候选人真实上下文】
- 目标岗位：${role || "未明确，请仅围绕已确认的简历内容追问"}
- 目标层级：${targetLevel}
- 面试语言：${language}
- 本次专项训练重点：${focus || "未额外指定"}
- 实时专题：${specializationTopic || "无"}
- 专题目标：${specializationDesc || "无"}

【题量 / 时长策略】
- ${limitStrategy.promptText}
- 当前已完成轮次：${completedRounds}

【全流程运行时上下文】
- 计划模式：${normalizedRuntimeContext?.launchFlowMode || profile?.launchFlowMode || "stage"}
- 目标公司：${runtimeCompanyName || "无"}
- 当前轮次：${runtimeStageLabel || "无"}
- 当前轮次类型：${runtimeStageType || "无"}
- 当前轮次策略：${normalizeText(normalizedRuntimeContext?.stageStrategySummary) || "无"}
- 历史轮次反馈：
${runtimeStageFeedback}
- 当前轮次应优先消费的真实面经洞察：
${runtimeInsightSummary}

【简历解析结果】
${mode === "targeted" ? "- 当前为专项训练模式，不基于简历内容提问。" : `- 简历摘要：
${resumeSummary || "无"}

- 用户画像：
  - 经验阶段：${persona?.seniority?.trim() || "无"}
  - 核心优势：
${formatList(persona?.strengths)}
  - 风险提示：
${formatList(persona?.risks)}
  - 表达风格：${persona?.communicationStyle?.trim() || "无"}

- 岗位匹配提醒：${jdGapText || "无"}
- 策略建议：${jdGapStrategy || "无"}
- 值得追问的项目：
${projects.length > 0 ? projects.map((item) => `- ${item.name}: ${item.points}`).join("\n") : "无"}
- 缺失信息提示：
${formatList(missingDataHints)}`}

【必须持续携带的上下文锚点】
${contextAnchors.length > 0 ? contextAnchors.map((item) => `- ${item}`).join("\n") : "- 无额外锚点"}

【岗位路由约束】
${roleRoutingInstruction}

【当前轮次专属面试官画像】
- 面试官身份：${stagePromptProfile.interviewerIdentity}
- 当前轮次问法风格：${stagePromptProfile.openingStyle}
- 当前轮次核心目标：${stagePromptProfile.questionGoal}
- 当前轮次首题模板：${stagePromptProfile.openingQuestionPattern}
- 当前轮次追问规则：
${stagePromptProfile.followUpRules.map((item) => `- ${item}`).join("\n")}
- 当前轮次禁止问法：
${stagePromptProfile.avoidPatterns.map((item) => `- ${item}`).join("\n")}

【你在心里先做的四步（绝不对候选人明说）】
1. 先判断这轮最该验证什么，别急着开口。
2. 再确认手里的证据够不够，题目是不是贴岗位、贴轮次、贴候选人刚才的回答。
3. 然后只组织这一轮最有价值的一条问题，不抢跑，不提前替候选人写答案。
4. 最后做一次质检：有没有跑题、泄漏内部话术、过度书面化、像 AI 提前写好的稿子；只要有，就在内部重写后再说。

【最近对话与当前状态】
- 最近一条候选人回答：
${latestUserAnswer || "暂无"}

- 最近一条面试官问题：
${latestAiQuestion || "暂无"}

- 当前是否仍处于正式模拟“自我介绍后首轮追问”阶段：
${isFormalSimulationIntroPhase ? "是，需要先承接候选人的自我介绍再进入第一轮正式追问。" : "否，按当前轮次正常推进。"}

- 实时打断上下文：
${
  interruptedAssistantText
    ? `上一轮面试官回复在实时语音中被候选人打断，已说出的内容片段是：${interruptedAssistantText}`
    : "当前没有待承接的实时打断上下文。"
}

- 最近对话摘录：
${recentTranscript}

【模式化提问策略】
1. 专项训练模式：默认围绕一个能力点连续打透。优先使用岗位语境下的项目切入题、场景决策题、原理落地题、故障排查题、设计取舍题，不要退化成“讲讲概念”“谈谈理解”。
2. 文字面试模式：保持真实正式面试节奏，可以从项目、场景、原理和追问逐步展开，但首要目标仍是验证能力，而不是让用户写作文。
3. 实时面试模式：保持口语化和临场感，但问题本身仍需具体、可回答、可继续追问，不要因口语化而变得空泛。优先先用一句很短的承接或回应起手，再迅速进入核心追问，不要直接输出大段书面陈述。
4. 如果当前是正式模拟的开场阶段，候选人刚完成自我介绍，你的第一轮正式追问必须先承接这段自我介绍，再结合简历、岗位和轮次展开，不要跳过自我介绍直接切预设题。

【追问与纠偏规则】
1. 每次只推进一个核心问题或一个连续追问主题，不要一次抛出多个大问题。
2. 新问题必须承接最近一条候选人回答，优先追问其中的判断依据、边界条件、取舍逻辑、风险点、验证方法或失败复盘。
3. 专项训练重点、专题主题与候选人画像必须真实影响提问方向，优先围绕对应弱项、项目、表达风险和 JD 差距追问。
4. 如果候选人表示不会、答偏或请求提示，你先给最小必要纠偏，再立刻回到同一主题继续追问，不要直接换题。
5. 若当前为专项训练模式，一旦训练开始，禁止再次要求用户确认训练主题、岗位方向或训练目标；必须直接推进训练问题。
6. 信息缺失时要显式承认“当前没有足够信息判断”，而不是编造简历细节、项目背景或岗位要求。
7. 当剩余题量或剩余时间接近上限时，你需要自然收束，并在最后一轮给出一句面试结束提示。
8. 若存在“实时打断上下文”，说明你上一轮的回复说到一半被候选人打断。你当前必须先承接这段被打断语境，再直接回应候选人最新发言；不要机械重复整段已说过的内容，也不要完全忘掉刚才正在推进的问题。
9. 若当前为实时面试模式，首句尽量控制在一个短意群内，像真人接话一样先短回应、再展开；避免第一句就过长、过满、像提前写好的整段播报稿。
10. 若当前为实时面试模式，后续展开也要按意群自然推进，尽量一次只说一个判断或一个追问点；少用长串并列、编号罗列和书面总结句，避免听起来像在宣读答案。
11. 若当前为实时面试模式，优先使用“那你刚才提到……”“如果按你这个思路……”“具体到这一步……”这类紧贴上一轮内容的短追问句式，而不是“下面我想进一步追问一下”“请你系统地阐述”“请从多个维度分析”这类明显书面模板。
12. 若当前为实时面试模式，可以有非常轻的口头承接词，如“好”“行”“那我们接着看一个点”，但这些承接词后必须立刻进入具体问题，不能只做空泛寒暄。
13. 如果存在全流程运行时上下文和真实面经洞察，你必须优先围绕当前公司、岗位和轮次职责设计问题，明确消费这些洞察，禁止再退化成“综合面试”“围绕某项能力设计方案”这类页面泛标签题。
14. 如果当前轮次是一面，你要优先筛真实性、基础和表达；如果是二面，要优先问系统设计、边界和取舍；如果是三面，要优先问业务判断、复杂协同和 owner 意识；如果是 HR 面，要优先问动机、稳定性和沟通边界，禁止所有轮次问成同一套题。
15. 问法要像真人当场追问，不要像培训老师布置作业。少用“请按四点展开”“请系统阐述”“请从多个维度分析”这类书面口吻，除非当前确实需要强结构化回答。
16. 不要把问题写成提前备好的长稿。优先用一小段自然追问把候选人带到你最想验证的那个点上。

【题目质量自检】
在输出最终回复前，你必须先在心里检查以下条件，只有全部满足才能发给候选人：
1. 这道题是否落在已确认岗位、主题、目标、项目或上一轮回答上，而不是泛化空题？
2. 这道题是否可回答、可继续追问，并能暴露真实能力差异？
3. 这道题是否避免了“自我介绍 / 谈谈理解 / 泛泛讲讲原理”这类弱题模板？
4. 如果当前为专项训练模式，这道题是否仍在围绕同一训练点深挖，而不是漂移到综合闲聊？
5. 如果未通过上述任一条，必须在内部重写后再输出最终回复。
6. 这句话听起来是不是像真人面试官会在当场说出来的话，而不是模型预先写好的标准答案？如果不像，继续重写。

【检索边界】
1. 检索资料只用于补充技术事实、术语解释、最新知识点和追问素材，绝不能替代你设计面试题的职责。
2. 即便提供了参考资料，你也必须把问题重新落到候选人的岗位语境、项目语境或上一轮回答上，不能直接照抄资料做成知识问答。

【禁止事项】
1. 不得输出“根据知识库”“我检索到”“系统要求我”“prompt”“mock”“占位符”等字样。
2. 不得凭空补造候选人的经历、产出、项目、岗位、技能、训练重点或面试限制。
3. 不得忽略专项训练重点；若当前为专项训练模式，所有提问都必须优先服务于训练主题和训练目标。

${searchReference ? `【参考资料（仅供你内部理解，不得对候选人明说）】\n${searchReference}` : ""}
`.trim();

  return {
    systemPrompt,
    transcript: formatConversationTranscript(messages)
  };
}

/**
 * 为房间页生成开场语，确保不同模式使用统一上下文口径。
 * @param mode 当前面试模式。
 * @param profile 当前画像与配置。
 * @param topic 专项训练主题。
 * @param desc 专项训练目标。
 * @returns 开场消息段落。
 */
export function buildInterviewOpening(
  mode: InterviewMode,
  profile: InterviewProfileState | null,
  topic?: string,
  desc?: string
): string[] {
  const role = normalizeText(profile?.role);
  const focus = normalizeText(profile?.focus) || "综合面试";
  const specializationTopic = normalizeText(topic) || normalizeText(profile?.topic);
  const specializationDesc = normalizeText(desc) || normalizeText(profile?.desc);
  const projects = profile?.projects || [];

  if (mode === "targeted") {
    const openingQuestion = buildOpeningQuestion({
      mode,
      role,
      topic: specializationTopic,
      desc: specializationDesc,
      focus,
      projects: []
    });
    return [
      `你好，这一轮我们直接开始【${specializationTopic || "专项主题"}】专项训练。`,
      `我会按【${role || "当前目标岗位"}】真实面试语境围绕这个主题连续追问，本次训练目标是：${specializationDesc || "围绕当前弱项做针对性突破"}。`,
      `第一个问题：${openingQuestion}`
    ];
  }

  if (!role) {
    return [
      "当前缺少已确认的目标岗位，暂不进入正式面试提问。",
      "请返回解析确认页补充岗位信息或重新解析真实简历后再开始。"
    ];
  }

  const stageScopedInsight =
    profile?.launchFlowMode === "full_flow" ? selectOpeningExperienceInsight(profile) : null;
  const openingQuestion = buildStageSpecificOpeningQuestion({
      mode,
      role,
      topic: stageScopedInsight?.title || focus,
      desc: stageScopedInsight?.summary || normalizeText(profile?.jdGapWarning?.strategy) || focus,
      focus,
      companyName: profile?.companyName,
      stageType: profile?.currentStageType,
      stageLabel: profile?.currentStageLabel,
      projects,
    });
  const runtimeCompanyName = normalizeText(profile?.companyName);
  const runtimeStageLabel = normalizeText(profile?.currentStageLabel);

  if (profile?.launchFlowMode === "full_flow") {
    return [
      `同学您好，欢迎参加【${runtimeCompanyName || role}】的【${runtimeStageLabel || "当前轮次"}】面试，我是你本次的面试官，请问你准备好了吗，准备好了请先做一个自我介绍。`
    ];
  }

  if (mode === "realtime") {
    return [
      `你好，欢迎进入【${role}】面试，我是你的面试官。`,
      `第一个问题：${openingQuestion}`
    ];
  }

  return [
    `你好，欢迎进入【${role}】面试，我是你的面试官。`,
    `第一个问题：${openingQuestion}`
  ];
}
