import {
  AgentRunRole,
  AgentRunStatus,
  InterviewPlanMode,
  InterviewPlanStatus,
  InterviewRoundStatus,
  InterviewStageStatus,
  InterviewStageType,
  Prisma,
} from "@prisma/client";
import type {
  InterviewPlanCreationResultV2,
  InterviewPlanListItemV2,
  InterviewStageSnapshotV2,
} from "@/lib/interview-v2/domain";
import {
  getInterviewStageAgentTeamProfile,
  listInterviewAgentBlueprints,
} from "@/lib/interview-v2/agents";
import { normalizeInterviewMode } from "@/lib/interview/config";
import {
  findCompanyPlaybook,
  getCompanyExperienceThemes,
} from "@/lib/interview-v2/companyPlaybooks";
import {
  getInterviewStageDefaultLabel,
  stageTypeRequiresCoding,
} from "@/lib/interview-v2/stateMachine";
import { processInterviewPlanLifecycle } from "@/lib/interview-v2/lifecycle";
import prisma from "@/lib/prisma";

type ParsedPersonaInput = {
  seniority?: string;
  strengths?: string[];
  risks?: string[];
  communicationStyle?: string;
};

type ParsedProjectInput = {
  name: string;
  points: string;
};

type CreateInterviewPlanInput = {
  userId: string;
  launchId?: string;
  launchFlowMode?: "stage" | "full_flow";
  companyName?: string;
  roleName?: string;
  departmentName?: string;
  targetLevel?: string;
  language?: string;
  focus?: string;
  mode?: "text" | "realtime" | "targeted";
  interviewTemplateId?: string;
  interviewTemplateLabel?: string;
  interviewIntensity?: string;
  jdText?: string;
  resumeText?: string;
  persona?: ParsedPersonaInput;
  projects?: ParsedProjectInput[];
  experienceTaskId?: string;
  experienceInsights?: Array<{
    stageType?: string;
    title?: string;
    summary?: string;
    tags?: string[];
  }>;
  limitType?: "none" | "question" | "duration";
  questionLimit?: number | null;
  durationLimitMinutes?: number | null;
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
 * 将可空对象转换为 Prisma JSON 值，空值时显式写入 JsonNull。
 * @param {T | null | undefined} value 任意可序列化对象。
 * @returns {Prisma.InputJsonValue | Prisma.JsonNull | undefined} 可写入 Prisma JSON 字段的值。
 */
function toNullablePrismaJson<T>(
  value: T | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return toPrismaJson(value);
}

/**
 * 将未知值安全收口为普通对象，避免直接读取脏 JSON。
 * @param value 任意输入值。
 * @returns 普通对象或 `null`。
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 从计划摘要中恢复结构化面经洞察，供房间刷新或继续当前轮次时回填画像。
 * @param planningSummary 计划摘要 JSON。
 * @returns 结构化面经洞察数组。
 */
function extractExperienceInsightsFromPlanningSummary(
  planningSummary: Prisma.JsonValue | null
): InterviewRuntimeProfileV2["experienceInsights"] {
  if (!planningSummary || typeof planningSummary !== "object" || Array.isArray(planningSummary)) {
    return [];
  }

  const experienceCollection =
    "experienceCollection" in planningSummary &&
    planningSummary.experienceCollection &&
    typeof planningSummary.experienceCollection === "object" &&
    !Array.isArray(planningSummary.experienceCollection)
      ? planningSummary.experienceCollection
      : null;
  const insights =
    experienceCollection &&
    "insights" in experienceCollection &&
    Array.isArray(experienceCollection.insights)
      ? experienceCollection.insights
      : [];

  return insights.reduce<InterviewRuntimeProfileV2["experienceInsights"]>((acc, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return acc;
    }

    const nextItem = {
      stageType: typeof item.stageType === "string" ? item.stageType : undefined,
      title: typeof item.title === "string" ? item.title.trim() : "",
      summary: typeof item.summary === "string" ? item.summary.trim() : "",
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      sourceLabel:
        typeof item.sourceLabel === "string" ? item.sourceLabel.trim() : null,
      freshnessLabel:
        typeof item.freshnessLabel === "string" ? item.freshnessLabel.trim() : null,
    };

    if (!nextItem.title && !nextItem.summary) {
      return acc;
    }

    acc.push(nextItem);
    return acc;
  }, []);
}

type InterviewStageDraft = {
  stageType: InterviewStageType;
  stageLabel: string;
  stageOrder: number;
  status: InterviewStageStatus;
  scheduledAt: Date | null;
  interviewerStyle: string | null;
  expectedDurationMinutes: number | null;
  questionBudget: number | null;
  codingRequired: boolean;
  strategySummary: string;
  stageConfig: Record<string, unknown>;
};

/**
 * 将轮次专属 Agent 团配置整理成可写入策略摘要的文本。
 * @param stageType 当前轮次类型。
 * @returns 适合 prompt 和页面消费的中文摘要。
 */
function buildStageAgentStrategySummary(stageType: InterviewStageType): string {
  const profile = getInterviewStageAgentTeamProfile(stageType);
  return `${profile.squadLabel}：主面试官为【${profile.leadInterviewerTitle}】；追问风格为【${profile.followUpStyle}】；本轮证据重点包括【${profile.evidenceFocus.join(" / ")}】；淘汰门槛为【${profile.eliminationBar}】。`;
}

type InterviewAgentRunSeed = {
  stageOrder?: number;
  agentRole: AgentRunRole;
  status: AgentRunStatus;
  modelName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type InterviewRuntimeProfileV2 = {
  interviewPlanId: string;
  interviewStageId: string | null;
  interviewRoundId: string | null;
  interviewRoomKey: string;
  launchFlowMode: "stage" | "full_flow";
  companyName: string | null;
  targetRoleName: string | null;
  role: string | null;
  targetLevel: string | null;
  focus: string | null;
  mode: "text" | "realtime" | "targeted";
  language: string | null;
  resumeSummaryMarkdown: string | null;
  jdText: string | null;
  persona: ParsedPersonaInput | null;
  projects: ParsedProjectInput[];
  currentStageType: string | null;
  currentStageLabel: string | null;
  currentStageStatus: string | null;
  currentRoundStatus: string | null;
  codingRequired: boolean;
  experienceInsights: Array<{
    stageType?: string;
    title: string;
    summary: string;
    tags?: string[];
    sourceLabel?: string | null;
    freshnessLabel?: string | null;
  }>;
};

/**
 * 将前端发起模式归一化为 Prisma 面试计划模式。
 * @param {CreateInterviewPlanInput["launchFlowMode"]} launchFlowMode 前端发起模式。
 * @returns {InterviewPlanMode} Prisma 可持久化的计划模式。
 */
function normalizePlanMode(
  launchFlowMode?: CreateInterviewPlanInput["launchFlowMode"]
): InterviewPlanMode {
  return launchFlowMode === "full_flow"
    ? InterviewPlanMode.FULL_FLOW
    : InterviewPlanMode.STAGE;
}

/**
 * 判断当前公司是否属于通常会出现更多技术轮次的大厂流程。
 * @param {string | undefined} companyName 目标公司名称。
 * @returns {boolean} 若倾向多轮技术面则返回 `true`。
 */
function isHighPressureCompany(companyName?: string): boolean {
  return inferInterviewerStyle(companyName) === "高压深挖";
}

/**
 * 根据目标公司推断面试官风格，避免后续所有轮次都使用同一种语气。
 * @param {string | undefined} companyName 目标公司名称。
 * @returns {string} 面试官风格标签。
 */
function inferInterviewerStyle(companyName?: string): string {
  return findCompanyPlaybook(companyName || "")?.interviewStyle || "结构化追问";
}

/**
 * 汇总当前公司和岗位下的面经主题映射，写入阶段配置与规划摘要。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @returns {Array<Record<string, unknown>>} 面经主题映射。
 */
function buildCompanyExperienceMapping(
  input: CreateInterviewPlanInput
): Array<Record<string, unknown>> {
  return getCompanyExperienceThemes(input.companyName || "", input.roleName || "").map(
    (item) => ({
      stageType: item.stageType,
      label: item.label,
      focus: item.focus,
      tags: item.tags,
    })
  );
}

/**
 * 将前端输入的重点、模板和简历优势统一收口为计划的 focusAreas。
 * @param {CreateInterviewPlanInput} input 创建计划时的原始输入。
 * @returns {string[]} 去重后的重点方向列表。
 */
function buildFocusAreas(input: CreateInterviewPlanInput): string[] {
  const rawValues = [
    input.focus,
    input.interviewTemplateLabel,
    ...(input.persona?.strengths || []),
  ];

  const result: string[] = [];
  for (const value of rawValues) {
    if (!value) {
      continue;
    }

    for (const item of value.split(/[\n,，、/]/)) {
      const normalizedItem = item.trim();
      if (!normalizedItem || result.includes(normalizedItem)) {
        continue;
      }

      result.push(normalizedItem);
    }
  }

  return result.slice(0, 8);
}

/**
 * 判断当前岗位是否倾向使用更长的多轮技术面。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @returns {boolean} 若需要第三轮技术面则返回 `true`。
 */
function shouldAddThirdTechnicalRound(input: CreateInterviewPlanInput): boolean {
  const normalizedText = [
    input.targetLevel,
    input.interviewTemplateLabel,
    input.persona?.seniority,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /资深|高级|专家|lead|leader|senior|staff/.test(normalizedText) ||
    isHighPressureCompany(input.companyName)
  );
}

/**
 * 为阶段面试构造单轮面试草案。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @returns {InterviewStageDraft[]} 只有一个阶段的计划草案。
 */
function buildStageInterviewDrafts(
  input: CreateInterviewPlanInput
): InterviewStageDraft[] {
  const questionBudget =
    input.limitType === "question" ? input.questionLimit || 10 : 10;
  const expectedDurationMinutes =
    input.limitType === "duration" ? input.durationLimitMinutes || 30 : 30;
  const interviewerStyle = inferInterviewerStyle(input.companyName);
  const codingRequired = stageTypeRequiresCoding("STAGE_INTERVIEW");
  const companyExperienceMapping = buildCompanyExperienceMapping(input);

  return [
    {
      stageType: InterviewStageType.STAGE_INTERVIEW,
      stageLabel: getInterviewStageDefaultLabel("STAGE_INTERVIEW"),
      stageOrder: 1,
      status: InterviewStageStatus.READY,
      scheduledAt: null,
      interviewerStyle,
      expectedDurationMinutes,
      questionBudget,
      codingRequired,
      strategySummary: buildStageAgentStrategySummary(InterviewStageType.STAGE_INTERVIEW),
      stageConfig: {
        launchMode: "stage",
        interviewMode: input.mode || "text",
        focusAreas: buildFocusAreas(input),
        limitType: input.limitType || "none",
        companyExperienceMapping,
        agentTeam: getInterviewStageAgentTeamProfile("STAGE_INTERVIEW"),
      },
    },
  ];
}

/**
 * 为全流程面试构造动态多轮草案。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @returns {InterviewStageDraft[]} 覆盖技术面、HR 面和 Offer 结论的轮次草案。
 */
function buildFullFlowDrafts(
  input: CreateInterviewPlanInput
): InterviewStageDraft[] {
  const now = new Date();
  const firstRoundAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const secondRoundAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const thirdRoundAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const hrRoundAt = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
  const offerReviewAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const interviewerStyle = inferInterviewerStyle(input.companyName);
  const companyExperienceMapping = buildCompanyExperienceMapping(input);
  const stageDrafts: InterviewStageDraft[] = [
    {
      stageType: InterviewStageType.FIRST_ROUND,
      stageLabel: getInterviewStageDefaultLabel("FIRST_ROUND"),
      stageOrder: 1,
      status: InterviewStageStatus.READY,
      scheduledAt: firstRoundAt,
      interviewerStyle,
      expectedDurationMinutes: 35,
      questionBudget: 8,
      codingRequired: stageTypeRequiresCoding("FIRST_ROUND"),
      strategySummary: buildStageAgentStrategySummary(InterviewStageType.FIRST_ROUND),
      stageConfig: {
        theme: "基础技术 + 项目深挖",
        evidenceSources: ["简历项目", "岗位 JD", "历史薄弱点"],
        companyExperienceMapping: companyExperienceMapping.filter(
          (item) => item.stageType === "FIRST_ROUND"
        ),
        agentTeam: getInterviewStageAgentTeamProfile("FIRST_ROUND"),
      },
    },
    {
      stageType: InterviewStageType.SECOND_ROUND,
      stageLabel: getInterviewStageDefaultLabel("SECOND_ROUND"),
      stageOrder: 2,
      status: InterviewStageStatus.PENDING,
      scheduledAt: secondRoundAt,
      interviewerStyle,
      expectedDurationMinutes: 45,
      questionBudget: 6,
      codingRequired: stageTypeRequiresCoding("SECOND_ROUND"),
      strategySummary: buildStageAgentStrategySummary(InterviewStageType.SECOND_ROUND),
      stageConfig: {
        theme: "系统设计 + 技术深度",
        evidenceSources: ["岗位关键词", "项目架构", "公司风格题型"],
        companyExperienceMapping: companyExperienceMapping.filter(
          (item) => item.stageType === "SECOND_ROUND"
        ),
        agentTeam: getInterviewStageAgentTeamProfile("SECOND_ROUND"),
      },
    },
  ];

  if (shouldAddThirdTechnicalRound(input)) {
    stageDrafts.push({
      stageType: InterviewStageType.THIRD_ROUND,
      stageLabel: getInterviewStageDefaultLabel("THIRD_ROUND"),
      stageOrder: 3,
      status: InterviewStageStatus.PENDING,
      scheduledAt: thirdRoundAt,
      interviewerStyle,
      expectedDurationMinutes: 50,
      questionBudget: 5,
      codingRequired: false,
      strategySummary: buildStageAgentStrategySummary(InterviewStageType.THIRD_ROUND),
      stageConfig: {
        theme: "综合技术判断 + 业务协同",
        evidenceSources: ["项目经历", "领导力信号", "业务理解"],
        companyExperienceMapping: companyExperienceMapping.filter(
          (item) => item.stageType === "THIRD_ROUND"
        ),
        agentTeam: getInterviewStageAgentTeamProfile("THIRD_ROUND"),
      },
    });
  }

  stageDrafts.push(
    {
      stageType: InterviewStageType.HR_ROUND,
      stageLabel: getInterviewStageDefaultLabel("HR_ROUND"),
      stageOrder: stageDrafts.length + 1,
      status: InterviewStageStatus.PENDING,
      scheduledAt: hrRoundAt,
      interviewerStyle: "温和引导",
      expectedDurationMinutes: 20,
      questionBudget: 5,
      codingRequired: false,
      strategySummary: buildStageAgentStrategySummary(InterviewStageType.HR_ROUND),
      stageConfig: {
        theme: "职业规划 + 求职动机",
        evidenceSources: ["目标公司", "目标级别", "用户表达风格"],
        companyExperienceMapping: companyExperienceMapping.filter(
          (item) => item.stageType === "HR_ROUND"
        ),
        agentTeam: getInterviewStageAgentTeamProfile("HR_ROUND"),
      },
    },
    {
      stageType: InterviewStageType.OFFER_REVIEW,
      stageLabel: getInterviewStageDefaultLabel("OFFER_REVIEW"),
      stageOrder: stageDrafts.length + 2,
      status: InterviewStageStatus.PENDING,
      scheduledAt: offerReviewAt,
      interviewerStyle: "结论裁决",
      expectedDurationMinutes: 10,
      questionBudget: 2,
      codingRequired: false,
      strategySummary: buildStageAgentStrategySummary(InterviewStageType.OFFER_REVIEW),
      stageConfig: {
        theme: "综合裁决",
        evidenceSources: ["各轮评分", "关键风险", "亮点总结"],
        agentTeam: getInterviewStageAgentTeamProfile("OFFER_REVIEW"),
      },
    }
  );

  return stageDrafts;
}

/**
 * 根据发起模式生成完整的轮次草案。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @returns {InterviewStageDraft[]} 计划中所有阶段草案。
 */
function buildStageDrafts(input: CreateInterviewPlanInput): InterviewStageDraft[] {
  const planMode = normalizePlanMode(input.launchFlowMode);
  return planMode === InterviewPlanMode.FULL_FLOW
    ? buildFullFlowDrafts(input)
    : buildStageInterviewDrafts(input);
}

/**
 * 为 `Resume Analyst` 生成结构化输出摘要，避免只存一段空文案。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @returns {Record<string, unknown>} 简历分析结果摘要。
 */
function buildResumeAnalysisOutput(
  input: CreateInterviewPlanInput
): Record<string, unknown> {
  return {
    targetRole: input.roleName?.trim() || null,
    projectCount: input.projects?.length || 0,
    projectHighlights: (input.projects || []).slice(0, 3),
    strengths: input.persona?.strengths || [],
    risks: input.persona?.risks || [],
    communicationStyle: input.persona?.communicationStyle || null,
    resumeSummaryPreview: input.resumeText?.trim().slice(0, 280) || null,
  };
}

/**
 * 为 `JD Analyst` 生成结构化输出摘要。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @returns {Record<string, unknown>} JD 解析结果摘要。
 */
function buildJdAnalysisOutput(
  input: CreateInterviewPlanInput
): Record<string, unknown> {
  const jdText = input.jdText?.trim() || "";
  return {
    companyName: input.companyName?.trim() || null,
    roleName: input.roleName?.trim() || null,
    departmentName: input.departmentName?.trim() || null,
    hasJd: Boolean(jdText),
    jdPreview: jdText ? jdText.slice(0, 280) : null,
    targetLevel: input.targetLevel?.trim() || null,
  };
}

/**
 * 生成可写入计划表的规划摘要。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @param {InterviewStageDraft[]} stageDrafts 计划轮次草案。
 * @returns {Record<string, unknown>} 规划摘要 JSON。
 */
function buildPlanningSummary(
  input: CreateInterviewPlanInput,
  stageDrafts: InterviewStageDraft[]
): Record<string, unknown> {
  const companyPlaybook = findCompanyPlaybook(input.companyName || "");
  const companyExperienceMapping = buildCompanyExperienceMapping(input);
  return {
    launchFlowMode: input.launchFlowMode || "stage",
    interviewMode: input.mode || "text",
    departmentName: input.departmentName?.trim() || null,
    template: {
      id: input.interviewTemplateId || null,
      label: input.interviewTemplateLabel || null,
      intensity: input.interviewIntensity || null,
    },
    experienceCollection: {
      taskId: input.experienceTaskId || null,
      insightCount: input.experienceInsights?.length || 0,
      insights: (input.experienceInsights || []).map((item) => ({
        stageType: item.stageType || null,
        title: item.title || null,
        summary: item.summary || null,
        tags: item.tags || [],
      })),
    },
    focusAreas: buildFocusAreas(input),
    stageCount: stageDrafts.length,
    generatedAt: new Date().toISOString(),
    companyStyle: inferInterviewerStyle(input.companyName),
    companyPlaybook: companyPlaybook
      ? {
          companyName: companyPlaybook.companyName,
          interviewStyle: companyPlaybook.interviewStyle,
          supportedModes: companyPlaybook.supportedModes,
          matchedRoleName: input.roleName?.trim() || null,
        }
      : null,
    companyExperienceMapping,
    stages: stageDrafts.map((stage) => ({
      stageType: stage.stageType,
      stageLabel: stage.stageLabel,
      scheduledAt: stage.scheduledAt?.toISOString() || null,
      codingRequired: stage.codingRequired,
      questionBudget: stage.questionBudget,
      expectedDurationMinutes: stage.expectedDurationMinutes,
      strategySummary: stage.strategySummary,
      agentTeam: asRecord(stage.stageConfig.agentTeam),
    })),
  };
}

/**
 * 为计划级和阶段级 Agent 生成运行种子记录。
 * @param {CreateInterviewPlanInput} input 创建计划时的输入。
 * @param {InterviewStageDraft[]} stageDrafts 当前计划的轮次草案。
 * @param {Record<string, unknown>} planningSummary 规划摘要。
 * @returns {InterviewAgentRunSeed[]} 待写入数据库的 Agent 运行记录。
 */
function buildAgentRunSeeds(
  input: CreateInterviewPlanInput,
  stageDrafts: InterviewStageDraft[],
  planningSummary: Record<string, unknown>
): InterviewAgentRunSeed[] {
  const now = new Date();
  const planAgentBlueprints = listInterviewAgentBlueprints();
  const agentNameMap = new Map(
    planAgentBlueprints.map((blueprint) => [blueprint.role, blueprint.name])
  );

  const seeds: InterviewAgentRunSeed[] = [
    {
      agentRole: AgentRunRole.RESUME_ANALYST,
      status: AgentRunStatus.COMPLETED,
      modelName: "v2-resume-analysis",
      input: {
        resumeProvided: Boolean(input.resumeText?.trim()),
        projectCount: input.projects?.length || 0,
      },
      output: {
        agentName: agentNameMap.get("RESUME_ANALYST") || "简历分析 Agent",
        ...buildResumeAnalysisOutput(input),
      },
      startedAt: now,
      finishedAt: now,
    },
    {
      agentRole: AgentRunRole.JD_ANALYST,
      status: input.jdText?.trim()
        ? AgentRunStatus.COMPLETED
        : AgentRunStatus.SKIPPED,
      modelName: "v2-jd-analysis",
      input: {
        jdProvided: Boolean(input.jdText?.trim()),
        companyName: input.companyName?.trim() || null,
      },
      output: {
        agentName: agentNameMap.get("JD_ANALYST") || "JD 分析 Agent",
        ...buildJdAnalysisOutput(input),
      },
      startedAt: now,
      finishedAt: now,
    },
    {
      agentRole: AgentRunRole.PLANNER,
      status: AgentRunStatus.COMPLETED,
      modelName: "v2-plan-orchestrator",
      input: {
        launchFlowMode: input.launchFlowMode || "stage",
        templateId: input.interviewTemplateId || null,
        targetLevel: input.targetLevel?.trim() || null,
      },
      output: {
        agentName: agentNameMap.get("PLANNER") || "面试计划 Agent",
        planningSummary,
      },
      startedAt: now,
      finishedAt: now,
    },
  ];

  for (const stageDraft of stageDrafts) {
    for (const agentRole of [
      AgentRunRole.INTERVIEWER,
      AgentRunRole.EVIDENCE,
      AgentRunRole.SCORER,
      AgentRunRole.SUMMARY,
      AgentRunRole.REPORT,
      AgentRunRole.COACH,
      AgentRunRole.CODE_INTERVIEWER,
    ]) {
      const shouldSkipCodeInterviewer =
        agentRole === AgentRunRole.CODE_INTERVIEWER && !stageDraft.codingRequired;

      seeds.push({
        stageOrder: stageDraft.stageOrder,
        agentRole,
        status: shouldSkipCodeInterviewer
          ? AgentRunStatus.SKIPPED
          : AgentRunStatus.PENDING,
        modelName: `v2-runtime-orchestrator/${String(stageDraft.stageType).toLowerCase()}/${String(agentRole).toLowerCase()}`,
        input: {
          stageLabel: stageDraft.stageLabel,
          stageType: stageDraft.stageType,
          codingRequired: stageDraft.codingRequired,
          strategySummary: stageDraft.strategySummary,
          agentTeam: asRecord(stageDraft.stageConfig.agentTeam),
        },
        output: shouldSkipCodeInterviewer
          ? {
              reason: "该轮次不包含代码面试环节。",
            }
          : null,
        startedAt: shouldSkipCodeInterviewer ? now : null,
        finishedAt: shouldSkipCodeInterviewer ? now : null,
      });
    }
  }

  return seeds;
}

/**
 * 将创建后的 Prisma 记录转换成前端可直接消费的阶段摘要。
 * @param {Array<{ id: string; stageType: InterviewStageType; stageLabel: string; stageOrder: number; status: InterviewStageStatus; codingRequired: boolean; interviewerStyle: string | null; expectedDurationMinutes: number | null; questionBudget: number | null; strategySummary: string | null; }>} stageRecords 数据库中的阶段记录。
 * @param {Map<string, string>} roundIdByStageId 轮次映射。
 * @returns {InterviewStageSnapshotV2[]} 计划阶段摘要。
 */
function toStageSnapshots(
  stageRecords: Array<{
    id: string;
    stageType: InterviewStageType;
    stageLabel: string;
    stageOrder: number;
    status: InterviewStageStatus;
    scheduledAt: Date | null;
    codingRequired: boolean;
    interviewerStyle: string | null;
    expectedDurationMinutes: number | null;
    questionBudget: number | null;
    strategySummary: string | null;
  }>,
  roundIdByStageId: Map<string, string>
): InterviewStageSnapshotV2[] {
  return stageRecords.map((stageRecord) => ({
    stageId: stageRecord.id,
    roundId: roundIdByStageId.get(stageRecord.id) || "",
    stageType: stageRecord.stageType,
    stageLabel: stageRecord.stageLabel,
    stageOrder: stageRecord.stageOrder,
    status: stageRecord.status,
    scheduledAt: stageRecord.scheduledAt?.toISOString() || null,
    codingRequired: stageRecord.codingRequired,
    interviewerStyle: stageRecord.interviewerStyle,
    expectedDurationMinutes: stageRecord.expectedDurationMinutes,
    questionBudget: stageRecord.questionBudget,
    strategySummary: stageRecord.strategySummary,
  }));
}

/**
 * 创建 v2 面试计划，并同步写入轮次、首轮执行记录和多 Agent 运行种子。
 * @param {CreateInterviewPlanInput} input 当前创建计划所需的真实输入。
 * @returns {Promise<InterviewPlanCreationResultV2>} 创建后的计划摘要。
 */
export async function createInterviewPlanWithRuntime(
  input: CreateInterviewPlanInput
): Promise<InterviewPlanCreationResultV2> {
  const mode = normalizePlanMode(input.launchFlowMode);
  const focusAreas = buildFocusAreas(input);
  const stageDrafts = buildStageDrafts(input);
  const planningSummary = buildPlanningSummary(input, stageDrafts);
  const agentRunSeeds = buildAgentRunSeeds(input, stageDrafts, planningSummary);

  const transactionResult = await prisma.$transaction(async (tx) => {
    const plan = await tx.interviewPlan.create({
      data: {
        userId: input.userId,
        mode,
        status: InterviewPlanStatus.PLANNED,
        sourceLaunchId: input.launchId?.trim() || null,
        companyName: input.companyName?.trim() || null,
        roleName: input.roleName?.trim() || null,
        targetLevel: input.targetLevel?.trim() || null,
        language: input.language?.trim() || null,
        intensity: input.interviewIntensity?.trim() || null,
        jdText: input.jdText?.trim() || null,
        resumeText: input.resumeText?.trim() || null,
        focusAreas,
        planningSummary: toPrismaJson(planningSummary),
        latestProfileInput: toPrismaJson(input),
      },
      select: {
        id: true,
        mode: true,
        status: true,
        companyName: true,
        roleName: true,
      },
    });

    const stageRecords = [];
    for (const stageDraft of stageDrafts) {
      const stageRecord = await tx.interviewPlanStage.create({
        data: {
          planId: plan.id,
          stageType: stageDraft.stageType,
          stageLabel: stageDraft.stageLabel,
          stageOrder: stageDraft.stageOrder,
          status: stageDraft.status,
          scheduledAt: stageDraft.scheduledAt,
          interviewerStyle: stageDraft.interviewerStyle,
          expectedDurationMinutes: stageDraft.expectedDurationMinutes,
          questionBudget: stageDraft.questionBudget,
          codingRequired: stageDraft.codingRequired,
          strategySummary: stageDraft.strategySummary,
          stageConfig: toPrismaJson(stageDraft.stageConfig),
        },
        select: {
          id: true,
          stageType: true,
          stageLabel: true,
          stageOrder: true,
          status: true,
          scheduledAt: true,
          codingRequired: true,
          interviewerStyle: true,
          expectedDurationMinutes: true,
          questionBudget: true,
          strategySummary: true,
        },
      });

      stageRecords.push(stageRecord);
    }

    const roundIdByStageId = new Map<string, string>();
    for (const stageRecord of stageRecords) {
      const roundRecord = await tx.interviewRound.create({
        data: {
          planId: plan.id,
          stageId: stageRecord.id,
          userId: input.userId,
          status: InterviewRoundStatus.PENDING,
          roundMode: input.mode || "text",
          totalQuestionCount: stageRecord.questionBudget || 0,
        },
        select: {
          id: true,
          stageId: true,
        },
      });

      roundIdByStageId.set(roundRecord.stageId, roundRecord.id);
    }

    for (const seed of agentRunSeeds) {
      const targetStage =
        typeof seed.stageOrder === "number"
          ? stageRecords.find((item) => item.stageOrder === seed.stageOrder)
          : null;

      await tx.interviewAgentRun.create({
        data: {
          planId: plan.id,
          stageId: targetStage?.id || null,
          roundId: targetStage?.id ? roundIdByStageId.get(targetStage.id) || null : null,
          agentRole: seed.agentRole,
          status: seed.status,
          modelName: seed.modelName,
          input: toPrismaJson(seed.input),
          output: toNullablePrismaJson(seed.output),
          startedAt: seed.startedAt,
          finishedAt: seed.finishedAt,
        },
      });
    }

    return {
      plan,
      stageRecords,
      roundIdByStageId,
    };
  });

  const stageSnapshots = toStageSnapshots(
    transactionResult.stageRecords,
    transactionResult.roundIdByStageId
  );
  const initialStage = stageSnapshots.find((item) => item.stageOrder === 1) || null;
  const interviewModeQuery =
    transactionResult.plan.mode === InterviewPlanMode.FULL_FLOW ? "text" : "text";
  const initialActionPath = initialStage
    ? `/interview?planId=${transactionResult.plan.id}&stageId=${initialStage.stageId}&roundId=${initialStage.roundId}&mode=${interviewModeQuery}`
    : null;

  return {
    planId: transactionResult.plan.id,
    mode: transactionResult.plan.mode,
    status: transactionResult.plan.status,
    companyName: transactionResult.plan.companyName,
    roleName: transactionResult.plan.roleName,
    departmentName: input.departmentName?.trim() || null,
    focusAreas,
    initialStageId: initialStage?.stageId || null,
    initialRoundId: initialStage?.roundId || null,
    initialActionPath,
    stages: stageSnapshots,
  };
}

/**
 * 输出用户的 v2 面试计划列表，供全流程面试首页展示真实记录。
 * @param {{ userId: string; mode?: InterviewPlanMode }} input 查询条件。
 * @returns {Promise<InterviewPlanListItemV2[]>} 按时间倒序的计划列表。
 */
export async function listInterviewPlans(input: {
  userId: string;
  mode?: InterviewPlanMode;
}): Promise<InterviewPlanListItemV2[]> {
  await processInterviewPlanLifecycle({
    userId: input.userId,
  });

  const plans = await prisma.interviewPlan.findMany({
    where: {
      userId: input.userId,
      ...(input.mode ? { mode: input.mode } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    include: {
      stages: {
        orderBy: {
          stageOrder: "asc",
        },
      },
      rounds: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          stageId: true,
          status: true,
        },
      },
    },
  });

  return Promise.all(plans.map(async (plan) => {
    const planningSummary = asRecord(plan.planningSummary);
    const latestProfileInput = asRecord(plan.latestProfileInput);
    const orchestration = asRecord(planningSummary?.orchestration);
    const latestDecision = asRecord(orchestration?.latestDecision);
    const latestDecisionSummary =
      typeof latestDecision?.summary === "string" ? latestDecision.summary : null;
    const reviewPassed =
      typeof latestDecision?.decision === "string"
        ? latestDecision.decision === "PASS"
        : null;
    const latestDecisionCode =
      typeof latestDecision?.decision === "string" ? latestDecision.decision : null;
    const hasOfferReviewStage = plan.stages.some((stage) => stage.stageType === "OFFER_REVIEW");
    const isTerminalPlan = plan.status === "COMPLETED" || plan.status === "ARCHIVED";
    const lifecycleDecision = latestDecisionCode;
    const activeStage =
      isTerminalPlan
        ? null
        : plan.stages.find((stage) => stage.status === "ACTIVE") ||
          plan.stages.find((stage) => stage.status === "READY") ||
          plan.stages.find((stage) => stage.status === "PENDING") ||
          plan.stages[plan.stages.length - 1] ||
          null;
    const activeRound =
      activeStage
        ? plan.rounds.find(
            (round) =>
              round.stageId === activeStage?.id &&
              ["ASKING", "USER_ANSWERING", "FOLLOW_UP", "PENDING", "SCORING", "CODING"].includes(
                round.status
              )
          ) ||
          plan.rounds.find((round) => round.stageId === activeStage?.id) ||
          null
        : null;
    const completedCount = plan.stages.filter(
      (stage) => stage.status === "COMPLETED"
    ).length;
    const nextScheduledStage =
      plan.stages.find(
        (stage) =>
          ["READY", "PENDING", "ACTIVE"].includes(stage.status) && stage.scheduledAt
      ) || activeStage;
    const finalDecision: InterviewPlanListItemV2["finalDecision"] =
      plan.status === "COMPLETED"
        ? lifecycleDecision === "MISSED"
          ? "eliminated"
          : lifecycleDecision === "EXITED_FAIL"
            ? "eliminated"
          : reviewPassed === true && hasOfferReviewStage
          ? "offer"
          : reviewPassed === false
            ? "eliminated"
            : "finished"
        : "in_progress";
    const resultLabel =
      finalDecision === "offer"
        ? "🎉 已拿到 Offer"
        : finalDecision === "eliminated"
          ? "摸摸头，继续加油"
          : plan.status === "COMPLETED"
            ? "已完成"
            : plan.status === "ARCHIVED"
              ? "已归档"
              : "进行中";
    const statusLabel =
      finalDecision === "offer"
        ? "流程已结束 · 恭喜你通过全部轮次"
        : finalDecision === "eliminated" && lifecycleDecision === "MISSED"
          ? "流程已结束 · 未按时参加，系统已自动淘汰"
          : finalDecision === "eliminated" && lifecycleDecision === "EXITED_FAIL"
            ? "流程已结束 · 主动结束本轮，系统已按淘汰收口"
          : finalDecision === "eliminated"
          ? "流程已结束 · 本次流程未通过"
          : plan.status === "COMPLETED"
            ? "流程已结束"
            : plan.status === "ARCHIVED"
              ? "流程已归档"
              : activeStage?.stageLabel
                ? `流程中 · ${activeStage.stageLabel}`
                : "待开始";
    const progressLabel =
      plan.stages.length > 0
        ? `${completedCount}/${plan.stages.length} 轮`
        : "待开始";
    const nextInterviewAt = nextScheduledStage?.scheduledAt?.toISOString() || null;
    const nextInterviewLabel =
      finalDecision === "offer"
        ? "Offer 已确认"
        : finalDecision === "eliminated"
          ? "建议先查看反馈并针对性复盘"
          : nextInterviewAt
            ? nextScheduledStage?.stageLabel
              ? `${nextScheduledStage.stageLabel} · ${nextScheduledStage.scheduledAt?.toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "已安排下一轮"
            : "待安排下一轮";
    const feedbackPath = `/feedback?planId=${plan.id}`;
    const departmentName =
      typeof latestProfileInput?.departmentName === "string"
        ? latestProfileInput.departmentName
        : typeof planningSummary?.departmentName === "string"
          ? planningSummary.departmentName
          : null;
    const stages = plan.stages.map((stage) => ({
      stageId: stage.id,
      stageLabel: stage.stageLabel,
      stageOrder: stage.stageOrder,
      status: stage.status,
      isCurrent: Boolean(activeStage?.id === stage.id),
    }));

    return {
      planId: plan.id,
      companyName: plan.companyName,
      roleName: plan.roleName,
      departmentName,
      mode: plan.mode,
      status: plan.status,
      finalDecision,
      currentStageLabel: activeStage?.stageLabel || null,
      currentStageStatus: activeStage?.status || null,
      progressLabel,
      resultLabel,
      statusLabel,
      nextInterviewAt,
      nextInterviewLabel,
      summary: latestDecisionSummary,
      createdAt: plan.createdAt.toISOString(),
      actionPath: finalDecision === "in_progress" && activeStage
        ? `/interview?planId=${plan.id}&stageId=${activeStage.id}${
            activeRound ? `&roundId=${activeRound.id}` : ""
          }&mode=text`
        : null,
      feedbackPath,
      stages,
    };
  }));
}

/**
 * 按计划与轮次恢复房间运行时画像，确保“继续当前轮次 / 刷新页面”时仍能还原真实上下文。
 * @param input 当前用户与计划标识。
 * @returns 可直接写回前端缓存的运行时画像；不存在时返回 `null`。
 */
export async function getInterviewRuntimeProfile(input: {
  userId: string;
  planId: string;
  stageId?: string | null;
  roundId?: string | null;
}): Promise<InterviewRuntimeProfileV2 | null> {
  await processInterviewPlanLifecycle({
    userId: input.userId,
    planId: input.planId,
  });

  const plan = await prisma.interviewPlan.findFirst({
    where: {
      id: input.planId,
      userId: input.userId,
    },
    include: {
      stages: {
        orderBy: {
          stageOrder: "asc",
        },
      },
      rounds: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!plan) {
    return null;
  }

  const roundMatchedStageId =
    plan.rounds.find((item) => item.id === input.roundId)?.stageId || null;
  const stage =
    plan.stages.find((item) => item.id === input.stageId) ||
    (roundMatchedStageId
      ? plan.stages.find((item) => item.id === roundMatchedStageId) || null
      : null);
  const resolvedStage =
    stage ||
    plan.stages.find((item) => item.status === "ACTIVE") ||
    plan.stages.find((item) => item.status === "READY") ||
    plan.stages[0] ||
    null;
  const resolvedRound =
    plan.rounds.find((item) => item.id === input.roundId) ||
    plan.rounds.find((item) => item.stageId === resolvedStage?.id) ||
    null;
  const latestProfileInput = asRecord(plan.latestProfileInput);
  const personaRecord = asRecord(latestProfileInput?.persona);
  const projects = Array.isArray(latestProfileInput?.projects)
    ? latestProfileInput.projects
        .map((item) => {
          const projectRecord = asRecord(item);
          const name =
            typeof projectRecord?.name === "string" ? projectRecord.name.trim() : "";
          const points =
            typeof projectRecord?.points === "string" ? projectRecord.points.trim() : "";

          if (!name && !points) {
            return null;
          }

          return {
            name,
            points,
          };
        })
        .filter((item): item is ParsedProjectInput => Boolean(item))
    : [];

  const runtimeMode = normalizeInterviewMode(
    resolvedRound?.roundMode || latestProfileInput?.mode
  );

  return {
    interviewPlanId: plan.id,
    interviewStageId: resolvedStage?.id || null,
    interviewRoundId: resolvedRound?.id || null,
    interviewRoomKey: [
      "plan",
      plan.id,
      resolvedStage?.id || "none",
      resolvedRound?.id || "none",
      runtimeMode,
    ].join(":"),
    launchFlowMode: plan.mode === InterviewPlanMode.FULL_FLOW ? "full_flow" : "stage",
    companyName: plan.companyName || null,
    targetRoleName: plan.roleName || null,
    role: plan.roleName || null,
    targetLevel: plan.targetLevel || null,
    focus: plan.focusAreas[0] || null,
    mode: runtimeMode,
    language: plan.language || null,
    resumeSummaryMarkdown:
      typeof latestProfileInput?.resumeSummaryMarkdown === "string"
        ? latestProfileInput.resumeSummaryMarkdown
        : typeof latestProfileInput?.resumeText === "string"
          ? latestProfileInput.resumeText
          : null,
    jdText: typeof latestProfileInput?.jdText === "string" ? latestProfileInput.jdText : null,
    persona: personaRecord
      ? {
          seniority:
            typeof personaRecord.seniority === "string" ? personaRecord.seniority : undefined,
          strengths: Array.isArray(personaRecord.strengths)
            ? personaRecord.strengths.filter((item): item is string => typeof item === "string")
            : undefined,
          risks: Array.isArray(personaRecord.risks)
            ? personaRecord.risks.filter((item): item is string => typeof item === "string")
            : undefined,
          communicationStyle:
            typeof personaRecord.communicationStyle === "string"
              ? personaRecord.communicationStyle
              : undefined,
        }
      : null,
    projects,
    currentStageType: resolvedStage?.stageType || null,
    currentStageLabel: resolvedStage?.stageLabel || null,
    currentStageStatus: resolvedStage?.status || null,
    currentRoundStatus: resolvedRound?.status || null,
    codingRequired: Boolean(resolvedStage?.codingRequired),
    experienceInsights: extractExperienceInsightsFromPlanningSummary(plan.planningSummary),
  };
}

export type { CreateInterviewPlanInput };
