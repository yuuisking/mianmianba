"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import type {
  InterviewExperienceCollectionTaskDTO,
  InterviewPlanCreationResultV2,
  InterviewPlanListItemV2,
} from "@/lib/interview-v2/domain";
import {
  buildInterviewLimitStrategy,
  buildInterviewRoomKey,
  createInterviewLaunchId,
  DURATION_LIMIT_OPTIONS,
  QUESTION_LIMIT_OPTIONS,
  resolveInterviewLimits,
  writeStoredInterviewProfile,
  type InterviewLimitType,
  type InterviewLimitValue,
  type InterviewMode,
} from "@/lib/interview/config";
import {
  findCompanyPlaybook,
  getCompanyExperienceThemes,
  getCompanyLevelOptions,
  getCompanyRoleOptions,
  listCompanyPlaybooks,
} from "@/lib/interview-v2/companyPlaybooks";

type LaunchFlowMode = "stage" | "full_flow";
type FullFlowInitStage = "idle" | "prepare_profile" | "prepare_questions" | "prepare_process";
type FullFlowInitStepKey = "prepare_profile" | "prepare_questions" | "prepare_process";

type InterviewPlansResponse = {
  data?: InterviewPlanListItemV2[];
  error?: string;
};

type UserInterviewTemplateRecord = {
  id: string;
  name: string;
  flowMode?: string | null;
  resumeText?: string | null;
  companyName?: string | null;
  roleName?: string | null;
  targetLevel?: string | null;
  focusKeyword?: string | null;
  interviewIntensity?: string | null;
  mode?: string | null;
  limitType?: string | null;
  questionLimit?: number | null;
  durationLimitMinutes?: number | null;
  interviewerName?: string | null;
  interviewerStyle?: string | null;
  portraitUrl?: string | null;
};

type InterviewTemplatesResponse = {
  data?: UserInterviewTemplateRecord[];
  error?: string;
};

type InterviewExperienceTaskResponse = {
  data?: InterviewExperienceCollectionTaskDTO | null;
  error?: string;
};

type CreatePlanResponse = {
  data?: InterviewPlanCreationResultV2;
  error?: string;
};

type ResumeQuickFacts = {
  name: string;
  workYears: string;
  city: string;
  education: string;
};

const SETUP_FLOW_MODE_STORAGE_KEY = "setupLaunchFlowMode";

/**
 * 从当前 URL 或会话缓存恢复发起页模式，避免全流程初始化后因刷新或重渲染掉回阶段面试。
 * @returns {LaunchFlowMode} 当前应恢复的发起模式。
 */
function readInitialLaunchFlowMode(): LaunchFlowMode {
  if (typeof window === "undefined") {
    return "stage";
  }

  const urlMode = new URLSearchParams(window.location.search).get("flow");
  if (urlMode === "full_flow") {
    return "full_flow";
  }

  const cachedMode = window.sessionStorage.getItem(SETUP_FLOW_MODE_STORAGE_KEY);
  return cachedMode === "full_flow" ? "full_flow" : "stage";
}

/**
 * 尽量把接口响应解析成 JSON；若后端返回空体或网关错误页，则安全返回 `null`。
 * @param {Response} response 当前 fetch 响应。
 * @returns {Promise<T | null>} 成功时返回 JSON，失败时返回 `null`。
 */
async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return null;
  }
}

/**
 * 从多组正则中提取第一个命中的简历字段，避免页面解析面板长期显示占位符。
 * @param {string} text 当前简历文本。
 * @param {RegExp[]} patterns 依次尝试的匹配规则。
 * @returns {string} 提取到的字段值；未命中时返回空字符串。
 */
function extractFirstResumeMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim() || "";
    if (value) {
      return value.replace(/[，,。；;]+$/g, "").trim();
    }
  }

  return "";
}

/**
 * 基于简历原文做轻量字段抽取，优先修复发起页右侧“解析信息”全是待解析的问题。
 * @param {string} text 用户粘贴或上传得到的简历文本。
 * @returns {ResumeQuickFacts} 可直接展示的姓名、工作年限、城市和学历。
 */
function extractResumeQuickFacts(text: string): ResumeQuickFacts {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return {
      name: "",
      workYears: "",
      city: "",
      education: "",
    };
  }

  const educationFromKeyword =
    normalizedText.match(/(博士研究生|硕士研究生|本科|硕士|博士|大专|专科|中专)/)?.[1] || "";
  const workYearsFromKeyword =
    normalizedText.match(/(\d+(?:\.\d+)?\s*年(?:工作经验|经验)?|[一二三四五六七八九十]+\s*年(?:工作经验|经验)?)/)?.[1] ||
    "";

  return {
    name: extractFirstResumeMatch(normalizedText, [
      /(?:姓名|名字|候选人)[:：]\s*([^\n，,；;\s]{2,20})/i,
      /^([^\n]{2,8})\s+(?:男|女)\b/m,
    ]),
    workYears: extractFirstResumeMatch(normalizedText, [
      /(?:工作年限|工作经验|从业年限|经验年限)[:：]\s*([^\n，,；;]+)/i,
    ]) || workYearsFromKeyword.replace(/\s+/g, ""),
    city: extractFirstResumeMatch(normalizedText, [
      /(?:当前城市|所在城市|现居住地|现居地|所在地|城市)[:：]\s*([^\n，,；;]+)/i,
    ]),
    education: extractFirstResumeMatch(normalizedText, [
      /(?:学历|教育背景|最高学历)[:：]\s*([^\n，,；;]+)/i,
    ]) || educationFromKeyword,
  };
}

/**
 * 根据当前初始化阶段，返回全流程步骤条中每一项的状态。
 * @param {FullFlowInitStage} currentStage 当前初始化阶段。
 * @param {FullFlowInitStepKey} stepKey 当前步骤标识。
 * @returns {"pending" | "active" | "done"} 该步骤的展示状态。
 */
function getFullFlowInitStepStatus(
  currentStage: FullFlowInitStage,
  stepKey: FullFlowInitStepKey
): "pending" | "active" | "done" {
  const stageOrder: FullFlowInitStepKey[] = [
    "prepare_profile",
    "prepare_questions",
    "prepare_process",
  ];
  const currentIndex = stageOrder.indexOf(currentStage as FullFlowInitStepKey);
  const stepIndex = stageOrder.indexOf(stepKey);
  if (currentIndex === -1) {
    return "pending";
  }
  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    return "active";
  }
  return "pending";
}

type FullFlowInitStepItem = {
  key: FullFlowInitStepKey;
  title: string;
  desc: string;
};

/**
 * 将后台采集任务状态翻译成用户可见的初始化描述，避免暴露内部实现细节。
 * @param {InterviewExperienceCollectionTaskDTO | null} task 当前面经准备任务。
 * @returns {{ title: string; desc: string }} 用户可见的步骤标题与描述。
 */
function resolveQuestionPreparationCopy(
  task: InterviewExperienceCollectionTaskDTO | null
): { title: string; desc: string } {
  const currentStep = task?.currentStep?.trim() || "";

  if (!currentStep) {
    return {
      title: "整理面试重点",
      desc: "系统正在汇总岗位背景、部门要求与题目线索。",
    };
  }

  if (currentStep.includes("初始化")) {
    return {
      title: "整理面试重点",
      desc: "系统正在校验岗位、部门与简历信息。",
    };
  }

  if (currentStep.includes("抓取") || currentStep.includes("抽取")) {
    return {
      title: "整理面试重点",
      desc: "系统正在汇总岗位资料并提炼本场追问重点。",
    };
  }

  if (currentStep.includes("完成")) {
    return {
      title: "生成首轮问题",
      desc: "系统正在收束首轮追问方向，马上进入流程装载。",
    };
  }

  if (currentStep.includes("失败") || currentStep.includes("超时")) {
    return {
      title: "补齐题目线索",
      desc: "系统正在切换到稳定题目方案，请稍候进入面试。",
    };
  }

  return {
    title: "整理面试重点",
    desc: "系统正在准备本场题目与追问方向。",
  };
}

type StageInterviewExperience = "text" | "realtime" | "behavior";

type InterviewTemplate = {
  id: string;
  label: string;
  origin: "official" | "private";
  category: "all" | "campus" | "social" | "senior" | "ai" | "english" | "hr" | "mine";
  audience: string;
  focus: string;
  questionRange: string;
  durationRange: string;
  targetLevel: string;
  focusKeyword: string;
  intensity: string;
  resumeText?: string;
  interviewerName: string;
  interviewerStyle: string;
  portraitUrl: string;
  companyName?: string;
  roleName?: string;
  mode?: StageInterviewExperience;
  limitType?: InterviewLimitType;
  questionLimit?: InterviewLimitValue;
  durationLimitMinutes?: InterviewLimitValue;
};

/**
 * 为模板卡片生成固定的面试官形象图地址。
 * @param {string} prompt 模板形象描述。
 * @returns {string} 图片地址。
 */
function buildTemplatePortraitUrl(prompt: string): string {
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt
  )}&image_size=portrait_4_3`;
}

/**
 * 将数据库中的用户模板映射为发起页可直接使用的模板结构。
 * @param {UserInterviewTemplateRecord} record 当前模板记录。
 * @returns {InterviewTemplate} 页面模板结构。
 */
function mapStoredTemplateToInterviewTemplate(
  record: UserInterviewTemplateRecord
): InterviewTemplate {
  const questionRange =
    typeof record.questionLimit === "number" && Number.isFinite(record.questionLimit)
      ? `题量：${record.questionLimit} 题`
      : "题量：按配置";
  const durationRange =
    typeof record.durationLimitMinutes === "number" &&
    Number.isFinite(record.durationLimitMinutes)
      ? `时长：${record.durationLimitMinutes} 分钟`
      : "时长：按配置";

  return {
    id: record.id,
    label: record.name,
    origin: "private",
    category: "mine",
    audience: `适合：${record.roleName?.trim() || "当前岗位"} ${record.targetLevel?.trim() || "自定义职级"} 模拟`,
    focus: `重点：${record.focusKeyword?.trim() || "自定义重点"}`,
    questionRange,
    durationRange,
    targetLevel: record.targetLevel?.trim() || "校招 / 应届生",
    focusKeyword: record.focusKeyword?.trim() || "综合面试",
    intensity: record.interviewIntensity?.trim() || "标准",
    resumeText: record.resumeText?.trim() || "",
    interviewerName: record.interviewerName?.trim() || "我的面试官",
    interviewerStyle: record.interviewerStyle?.trim() || "按你上次保存的配置直接复用。",
    portraitUrl:
      record.portraitUrl?.trim() ||
      buildTemplatePortraitUrl(
        "half body portrait, chinese technical interviewer, premium studio, soft light, clean hiring platform card"
      ),
    companyName: record.companyName?.trim() || "",
    roleName: record.roleName?.trim() || "",
    mode:
      record.mode === "realtime"
        ? "realtime"
        : record.mode === "behavior"
          ? "behavior"
          : "text",
    limitType:
      record.limitType === "question" || record.limitType === "duration"
        ? record.limitType
        : "question",
    questionLimit:
      typeof record.questionLimit === "number" && Number.isFinite(record.questionLimit)
        ? record.questionLimit
        : 10,
    durationLimitMinutes:
      typeof record.durationLimitMinutes === "number" &&
      Number.isFinite(record.durationLimitMinutes)
        ? record.durationLimitMinutes
        : null,
  };
}

const stageTemplates: InterviewTemplate[] = [
  {
    id: "general-tech",
    label: "综合技术面",
    origin: "official",
    category: "campus",
    audience: "适合：需要完整热身的一轮常规技术面",
    focus: "重点：基础知识、项目表达、即时追问",
    questionRange: "题量：8-12 题",
    durationRange: "时长：30 分钟",
    targetLevel: "校招 / 应届生",
    focusKeyword: "综合面试",
    intensity: "标准",
    resumeText: "",
    interviewerName: "小河",
    interviewerStyle: "冷静、清晰、会一步步把你的表达拉回主线。",
    portraitUrl: buildTemplatePortraitUrl(
      "half body portrait, chinese female technical interviewer, calm smile, clean short hair, cream studio background, premium hiring platform card"
    ),
  },
  {
    id: "project-deep-dive",
    label: "项目深挖面",
    origin: "official",
    category: "social",
    audience: "适合：需要重点拆项目、方案和排障细节",
    focus: "重点：项目职责、技术选型、落地细节",
    questionRange: "题量：8-10 题",
    durationRange: "时长：45 分钟",
    targetLevel: "1-3 年经验",
    focusKeyword: "项目深挖",
    intensity: "深挖",
    resumeText: "",
    interviewerName: "云舟",
    interviewerStyle: "追问连续、关注方案边界和你本人贡献。",
    portraitUrl: buildTemplatePortraitUrl(
      "half body portrait, chinese male senior software interviewer, sharp eyes, navy blazer, premium light studio, product card style"
    ),
  },
  {
    id: "system-design",
    label: "系统设计面",
    origin: "official",
    category: "senior",
    audience: "适合：需要重点演练架构、容量与高可用",
    focus: "重点：架构设计、容量估算、高可用",
    questionRange: "题量：3-5 题",
    durationRange: "时长：60 分钟",
    targetLevel: "资深 / 专家",
    focusKeyword: "系统设计",
    intensity: "压力",
    resumeText: "",
    interviewerName: "小天",
    interviewerStyle: "强压式架构追问，持续逼问容量、可用性和取舍。",
    portraitUrl: buildTemplatePortraitUrl(
      "half body portrait, chinese male principal engineer interviewer, serious expression, dark suit, cool gray studio, premium hiring app aesthetic"
    ),
  },
  {
    id: "behavior-communication",
    label: "表达与行为面",
    origin: "official",
    category: "hr",
    audience: "适合：需要强化 STAR、表达层次和稳定度",
    focus: "重点：行为问题、表达逻辑、证据支撑",
    questionRange: "题量：6-8 题",
    durationRange: "时长：30 分钟",
    targetLevel: "1-3 年经验",
    focusKeyword: "行为软技能（HR）",
    intensity: "标准",
    resumeText: "",
    interviewerName: "vivi",
    interviewerStyle: "活泼但有压感，擅长行为问题和表达稳定性观察。",
    portraitUrl: buildTemplatePortraitUrl(
      "half body portrait, chinese female hr interviewer, lively expression, elegant office wear, warm premium studio background, hiring product card"
    ),
  },
];

const defaultFullFlowLevels = ["校招 / 应届生", "1-3 年经验", "资深 / 专家"];

/**
 * 生成全流程官方模板，名称明确带上公司与岗位，避免与阶段面试模板混用。
 * @param {ReturnType<typeof listCompanyPlaybooks>} playbooks 公司题库列表。
 * @param {string} companyName 当前目标公司。
 * @param {string} roleName 当前目标岗位。
 * @returns {InterviewTemplate[]} 全流程模板列表。
 */
function buildFullFlowTemplates(
  playbooks: ReturnType<typeof listCompanyPlaybooks>,
  companyName: string,
  roleName: string
): InterviewTemplate[] {
  const normalizedCompany = companyName.trim();
  const normalizedRole = roleName.trim();
  const candidatePlaybooks = normalizedCompany
    ? playbooks.filter((item) => item.companyName.includes(normalizedCompany)).slice(0, 4)
    : playbooks.slice(0, 6);

  return candidatePlaybooks.flatMap((playbook, playbookIndex) => {
    const matchedRoles = normalizedRole
      ? playbook.rolePlaybooks.filter((item) => item.roleName.includes(normalizedRole)).slice(0, 2)
      : playbook.rolePlaybooks.slice(0, 2);
    const roles = matchedRoles.length > 0 ? matchedRoles : playbook.rolePlaybooks.slice(0, 1);

    return roles.map((rolePlaybook, roleIndex) => ({
      id: `full-${playbookIndex}-${roleIndex}-${playbook.companyName}-${rolePlaybook.roleName}`,
      label: `${playbook.companyName} - ${rolePlaybook.roleName} - 全流程模拟`,
      origin: "official" as const,
      category: "all" as const,
      audience: `适合：${playbook.companyName} ${rolePlaybook.roleName} 的多轮招聘流程模拟`,
      focus: `重点：${rolePlaybook.experienceThemes.map((item) => item.focus).join(" / ")}`,
      questionRange: "轮次：一面 / 二面 / 三面 / HR",
      durationRange: "节奏：按真实招聘流程推进",
      targetLevel: rolePlaybook.levels[0] || "校招 / 应届生",
      focusKeyword: rolePlaybook.experienceThemes[0]?.focus || "全流程面试",
      intensity: rolePlaybook.recommendedIntensities[0] || "标准",
      resumeText: "",
      interviewerName: `${playbook.companyName} 招聘委员会`,
      interviewerStyle: `${playbook.interviewStyle}，并结合最新面经与历史题型持续调整轮次追问。`,
      portraitUrl: buildTemplatePortraitUrl(
        `half body portrait, chinese senior interviewer panel, ${playbook.companyName} hiring committee, premium studio, polished recruiting dashboard card, role ${rolePlaybook.roleName}`
      ),
      companyName: playbook.companyName,
      roleName: rolePlaybook.roleName,
      mode: "realtime",
      limitType: "question",
      questionLimit: 10,
      durationLimitMinutes: null,
    }));
  });
}

/**
 * 判断当前错误是否属于适合自动重试的临时性失败。
 * @param {unknown} error 当前请求抛出的异常对象。
 * @returns {boolean} 是否建议立即自动重试一次。
 */
function shouldRetryAnalysis(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  if (!message) {
    return false;
  }

  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Load failed") ||
    message.includes("The operation was aborted")
  );
}

/**
 * 在两次尝试内提交解析请求，优先兜底临时性网络中断。
 * @param {HeadersInit} headers 当前请求头。
 * @param {FormData | string} body 当前请求体。
 * @returns {Promise<Record<string, unknown>>} 解析接口返回的 JSON 数据。
 */
async function requestParseProfile(
  headers: HeadersInit,
  body: FormData | string
): Promise<Record<string, unknown>> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers,
        body,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized");
        }

        let errorMessage = "解析失败，请重试。";
        try {
          const errorBody = (await response.json()) as { error?: string };
          if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch (parseError) {
          console.error("Failed to parse parse-api error body", parseError);
        }

        throw new Error(errorMessage);
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      lastError = error;
      if (!shouldRetryAnalysis(error) || attempt === 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("解析失败，请重试。");
}

/**
 * 根据当前配置生成确认弹窗中的面试官形象图。
 * @param {{ companyName: string; roleName: string; launchFlowMode: LaunchFlowMode }} input 当前配置摘要。
 * @returns {string} 形象图 URL。
 */
function buildInterviewerPortraitUrl(input: {
  companyName: string;
  roleName: string;
  launchFlowMode: LaunchFlowMode;
}): string {
  const prompt = encodeURIComponent(
    `half body portrait, premium product shot, ${
      input.companyName || "互联网公司"
    } ${
      input.launchFlowMode === "full_flow" ? "资深面试官" : "技术面试官"
    }, polished studio lighting, professional business outfit, calm confident expression, realistic Chinese interviewer, role ${input.roleName || "software engineer"}, refined hiring platform visual`
  );
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${prompt}&image_size=portrait_4_3`;
}

/**
 * 展示 v2.0 发起面试页，并在提交前生成可复用的画像上下文。
 * @returns {JSX.Element} 发起面试页。
 */
export default function Setup(): JSX.Element {
  const router = useRouter();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const [launchFlowMode, setLaunchFlowMode] = useState<LaunchFlowMode>(() =>
    readInitialLaunchFlowMode()
  );
  const [targetLevel, setTargetLevel] = useState("校招 / 应届生");
  const [focus, setFocus] = useState("综合面试");
  const [companyName, setCompanyName] = useState("");
  const [targetRoleName, setTargetRoleName] = useState("");
  const [stageInterviewExperience, setStageInterviewExperience] =
    useState<StageInterviewExperience>("text");
  const [selectedInterviewMode, setSelectedInterviewMode] =
    useState<InterviewMode>("text");
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [interviewIntensity, setInterviewIntensity] = useState("标准");
  const [customIntensity, setCustomIntensity] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [limitType, setLimitType] = useState<InterviewLimitType>("question");
  const [questionLimit, setQuestionLimit] = useState<InterviewLimitValue>(10);
  const [durationLimitMinutes, setDurationLimitMinutes] = useState<InterviewLimitValue>(null);
  const [isQuestionCustomActive, setIsQuestionCustomActive] = useState(false);
  const [customQuestionInput, setCustomQuestionInput] = useState("12");
  const [isDurationCustomActive, setIsDurationCustomActive] = useState(false);
  const [customDurationInput, setCustomDurationInput] = useState("30");
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreatingFullFlow, setIsCreatingFullFlow] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isResolvingRole, setIsResolvingRole] = useState(false);
  const [roleResolutionMessage, setRoleResolutionMessage] = useState("");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [activeTemplateCategory, setActiveTemplateCategory] = useState<
    "all" | "campus" | "social" | "senior" | "ai" | "english" | "hr" | "mine"
  >("all");
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [templateSaveError, setTemplateSaveError] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<InterviewTemplate[]>([]);
  const [fullFlowPlans, setFullFlowPlans] = useState<InterviewPlanListItemV2[]>([]);
  const [isPlansLoading, setIsPlansLoading] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isFullFlowComposerOpen, setIsFullFlowComposerOpen] = useState(false);
  const [experienceTask, setExperienceTask] = useState<InterviewExperienceCollectionTaskDTO | null>(null);
  const [isCollectingExperiences, setIsCollectingExperiences] = useState(false);
  const [fullFlowInitStage, setFullFlowInitStage] = useState<FullFlowInitStage>("idle");
  const [portraitLoadFailed, setPortraitLoadFailed] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const companyBlurTimerRef = useRef<number | null>(null);
  const roleBlurTimerRef = useRef<number | null>(null);
  const analysisRequestIdRef = useRef(0);
  const companyPlaybooks = useMemo(() => listCompanyPlaybooks(), []);

  /**
   * 切换发起页模式时，同时把模式写入 URL 与会话缓存，避免初始化后页面回到默认阶段面试态。
   * @param {LaunchFlowMode} nextMode 目标模式。
   */
  const updateLaunchFlowMode = useCallback((nextMode: LaunchFlowMode): void => {
    setLaunchFlowMode(nextMode);
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(SETUP_FLOW_MODE_STORAGE_KEY, nextMode);
    const nextUrl = new URL(window.location.href);
    if (nextMode === "full_flow") {
      nextUrl.searchParams.set("flow", "full_flow");
    } else {
      nextUrl.searchParams.delete("flow");
    }
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }, []);

  const fullFlowTemplates = useMemo(
    () => buildFullFlowTemplates(companyPlaybooks, companyName, targetRoleName),
    [companyPlaybooks, companyName, targetRoleName]
  );
  const allTemplates = useMemo(
    () =>
      launchFlowMode === "full_flow"
        ? [...savedTemplates, ...fullFlowTemplates]
        : [...savedTemplates, ...stageTemplates],
    [fullFlowTemplates, launchFlowMode, savedTemplates]
  );
  const selectedTemplate =
    allTemplates.find((item) => item.id === selectedTemplateId) ?? null;
  const currentLimitStrategy = buildInterviewLimitStrategy(
    limitType,
    questionLimit,
    durationLimitMinutes
  );
  const matchedCompanyPlaybook = findCompanyPlaybook(companyName);
  const companyOptions = companyPlaybooks.map((item) => item.companyName);
  const visibleCompanyOptions = companyOptions
    .filter((item) =>
      !companyName.trim()
        ? true
        : item.toLowerCase().includes(companyName.trim().toLowerCase())
    )
    .slice(0, 8);
  const commonRoleOptions = Array.from(
    new Set(
      companyPlaybooks.flatMap((item) =>
        item.rolePlaybooks.map((rolePlaybook) => rolePlaybook.roleName)
      )
    )
  );
  const roleOptions = getCompanyRoleOptions(companyName);
  const mergedRoleOptions = Array.from(new Set([...roleOptions, ...commonRoleOptions]));
  const visibleRoleOptions = (mergedRoleOptions.length > 0 ? mergedRoleOptions : commonRoleOptions)
    .filter((item) =>
      !targetRoleName.trim()
        ? true
        : item.toLowerCase().includes(targetRoleName.trim().toLowerCase())
    )
    .slice(0, 8);
  const filteredTemplates = allTemplates.filter((template) => {
    const keyword = templateSearch.trim().toLowerCase();
    const matchesKeyword = !keyword
      ? true
      : [
          template.label,
          template.audience,
          template.focus,
          template.interviewerName,
          template.interviewerStyle,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
    const matchesCategory =
      activeTemplateCategory === "all" ? true : template.category === activeTemplateCategory;

    if (!matchesKeyword || !matchesCategory) {
      return false;
    }
    return true;
  });
  const levelOptions =
    getCompanyLevelOptions(companyName, targetRoleName) || defaultFullFlowLevels;
  const companyExperienceThemes = getCompanyExperienceThemes(companyName, targetRoleName);
  const collectedExperienceInsights = experienceTask?.insights || [];
  const resolvedInterviewIntensity =
    interviewIntensity === "自定义"
      ? customIntensity.trim() || "自定义"
      : interviewIntensity;

  /**
   * 记录用户上传的简历文件，不再在前端注入任何 mock 简历文本。
   * @param {ChangeEvent<HTMLInputElement>} event 文件选择事件。
   */
  function handleFileUpload(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setResumeText("");
      setSubmitError("");
    }
  }

  /**
   * 应用模板配置，统一更新模式、层级与重点方向。
   * @param {InterviewTemplate} template 当前选中的模板。
   */
  function applyTemplate(template: InterviewTemplate): void {
    setSelectedTemplateId(template.id);
    setTargetLevel(template.targetLevel);
    setFocus(template.focusKeyword);
    setInterviewIntensity(template.intensity);
    setCustomIntensity("");
    if (template.companyName) {
      setCompanyName(template.companyName);
    }
    if (template.roleName) {
      setTargetRoleName(template.roleName);
    }
    if (template.resumeText?.trim()) {
      setResumeText(template.resumeText.trim());
      setFile(null);
    }
    if (template.mode) {
      applyInterviewMode(template.mode);
    }
    if (template.limitType === "duration") {
      setLimitType("duration");
      setQuestionLimit(null);
      setDurationLimitMinutes(template.durationLimitMinutes ?? 20);
      setIsQuestionCustomActive(false);
      setIsDurationCustomActive(
        Boolean(
          template.durationLimitMinutes &&
            ![15, 30, 45].includes(template.durationLimitMinutes)
        )
      );
      setCustomDurationInput(String(template.durationLimitMinutes ?? 30));
    } else if (template.limitType === "question") {
      setLimitType("question");
      setQuestionLimit(template.questionLimit ?? 10);
      setDurationLimitMinutes(null);
      setIsDurationCustomActive(false);
      setIsQuestionCustomActive(
        Boolean(template.questionLimit && ![5, 10, 20].includes(template.questionLimit))
      );
      setCustomQuestionInput(String(template.questionLimit ?? 12));
    }
  }

  /**
   * 为“保存为模板”弹窗生成默认模板名称，减少手填成本。
   * @returns {string} 默认模板名。
   */
  function buildDefaultTemplateName(): string {
    const companyPart = companyName.trim();
    const rolePart = targetRoleName.trim() || focus.trim() || "面试";
    const levelPart = targetLevel.trim();
    return [companyPart, rolePart, levelPart].filter(Boolean).join(" · ") || "我的面试模板";
  }

  /**
   * 打开保存模板弹窗，并预填一个可编辑的模板名称。
   * @returns {void}
   */
  function openSaveTemplateModal(): void {
    setTemplateSaveError("");
    setTemplateDraftName(buildDefaultTemplateName());
    setIsSaveTemplateModalOpen(true);
  }

  /**
   * 打开站内信页面；未登录用户先完成登录再进入。
   * @returns {void}
   */
  function openNotificationsCenter(): void {
    if (session?.user?.id) {
      router.push("/notifications");
      return;
    }

    requestAuth({
      title: "登录后查看站内信",
      description: "登录后即可查看晋级、淘汰、缺席和反馈提醒。",
      callbackUrl: "/setup",
      onSuccess: () => {
        router.push("/notifications");
      },
    });
  }

  /**
   * 拉取当前登录用户的私有模板列表，供模板抽屉复用。
   * @returns {Promise<void>} 拉取完成后更新模板状态。
   */
  const fetchSavedTemplates = useCallback(async (): Promise<void> => {
    if (!session?.user?.id) {
      setSavedTemplates([]);
      return;
    }

    try {
      const response = await fetch(`/api/v2/interview-templates?flowMode=${launchFlowMode}`);
      const payload = (await response.json()) as InterviewTemplatesResponse;
      if (!response.ok) {
        throw new Error(payload.error || "读取模板失败");
      }

      setSavedTemplates((payload.data || []).map(mapStoredTemplateToInterviewTemplate));
    } catch (error) {
      console.error("Failed to fetch interview templates", error);
      setSavedTemplates([]);
    }
  }, [launchFlowMode, session?.user?.id]);

  /**
   * 将当前配置真实保存为用户私有模板，并立即回填到模板抽屉中。
   * @returns {Promise<void>} 保存完成。
   */
  async function saveCurrentTemplate(): Promise<void> {
    if (isSavingTemplate) {
      return;
    }

    if (!session?.user?.id) {
      requestAuth({
        title: "登录后保存面试模板",
        description: "登录后即可把当前配置保存为你的私有模板。",
        callbackUrl: "/setup",
        onSuccess: () => {
          setIsSaveTemplateModalOpen(true);
        },
      });
      return;
    }

    const name = templateDraftName.trim();
    if (!name) {
      setTemplateSaveError("请先填写模板名称。");
      return;
    }

    setIsSavingTemplate(true);
    setTemplateSaveError("");
    try {
      const response = await fetch("/api/v2/interview-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          flowMode: launchFlowMode,
          resumeText: resumeText.trim() || null,
          companyName: companyName.trim() || null,
          roleName: targetRoleName.trim() || null,
          targetLevel,
          focusKeyword: focus,
          interviewIntensity: resolvedInterviewIntensity,
          mode: launchFlowMode === "full_flow" ? selectedInterviewMode : stageInterviewExperience,
          limitType,
          questionLimit: limitType === "question" ? questionLimit : null,
          durationLimitMinutes: limitType === "duration" ? durationLimitMinutes : null,
          interviewerName: selectedTemplate?.interviewerName || confirmInterviewerName,
          interviewerStyle: selectedTemplate?.interviewerStyle || confirmInterviewerStyle,
          portraitUrl: selectedTemplate?.portraitUrl || confirmPortraitUrl,
        }),
      });
      const payload = (await response.json()) as {
        data?: UserInterviewTemplateRecord;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "保存模板失败");
      }

      const nextTemplate = mapStoredTemplateToInterviewTemplate(payload.data);
      setSavedTemplates((current) => [nextTemplate, ...current]);
      setSelectedTemplateId(nextTemplate.id);
      setIsSaveTemplateModalOpen(false);
    } catch (error) {
      console.error("Failed to save interview template", error);
      setTemplateSaveError(error instanceof Error ? error.message : "保存模板失败");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  /**
   * 读取当前公司与岗位最近一次面经采集任务。
   * @returns {Promise<void>} 拉取完成后更新最新任务状态。
   */
  const fetchLatestExperienceTask = useCallback(async (): Promise<void> => {
    if (!session?.user?.id || !companyName.trim() || !targetRoleName.trim()) {
      setExperienceTask(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        companyName: companyName.trim(),
        roleName: targetRoleName.trim(),
      });
      if (departmentName.trim()) {
        params.set("departmentName", departmentName.trim());
      }
      const response = await fetch(
        `/api/v2/interview-experience-tasks?${params.toString()}`
      );
      const payload = (await response.json()) as InterviewExperienceTaskResponse;
      if (!response.ok) {
        throw new Error(payload.error || "读取面经任务失败");
      }
      setExperienceTask(payload.data ?? null);
    } catch (error) {
      console.error("Failed to fetch latest interview experience task", error);
      setExperienceTask(null);
    }
  }, [companyName, departmentName, session?.user?.id, targetRoleName]);

  /**
   * 直接请求最新面经采集任务，供初始化过程轮询后台状态。
   * @param {{
   *   companyName: string;
   *   roleName: string;
   *   departmentName?: string;
   * }} input 当前采集参数。
   * @returns {Promise<InterviewExperienceCollectionTaskDTO | null>} 最新任务状态。
   */
  async function requestLatestExperienceTask(input: {
    companyName: string;
    roleName: string;
    departmentName?: string;
  }): Promise<InterviewExperienceCollectionTaskDTO | null> {
    const params = new URLSearchParams({
      companyName: input.companyName.trim(),
      roleName: input.roleName.trim(),
    });
    if (input.departmentName?.trim()) {
      params.set("departmentName", input.departmentName.trim());
    }

    const response = await fetch(`/api/v2/interview-experience-tasks?${params.toString()}`);
    const payload = await readJsonSafely<InterviewExperienceTaskResponse>(response);
    if (!response.ok) {
      throw new Error(payload?.error || "读取面经任务失败");
    }
    return payload?.data ?? null;
  }

  /**
   * 为当前公司与岗位执行一次最新面经采集，并把结构化洞察回填到页面。
   * @param {{
   *   companyName: string;
   *   roleName: string;
   *   departmentName?: string;
   *   silent?: boolean;
   * }} input 采集任务参数。
   * @returns {Promise<InterviewExperienceCollectionTaskDTO | null>} 最新采集任务状态。
   */
  async function collectLatestExperiences(input?: {
    companyName?: string;
    roleName?: string;
    departmentName?: string;
    silent?: boolean;
  }): Promise<InterviewExperienceCollectionTaskDTO | null> {
    const nextCompanyName = input?.companyName?.trim() || companyName.trim();
    const nextRoleName = input?.roleName?.trim() || targetRoleName.trim();
    const nextDepartmentName = input?.departmentName?.trim() || departmentName.trim();
    if (isCollectingExperiences) {
      return experienceTask;
    }
    if (!nextCompanyName || !nextRoleName) {
      if (!input?.silent) {
        setSubmitError("请先选择目标公司和目标岗位，再采集最新面经。");
      }
      return null;
    }
    if (!session?.user?.id) {
      requestAuth({
        title: "登录后采集公开面经",
        description: "登录后即可保存采集任务，并把公开网页审核后的面经洞察写入你的全流程配置。",
        callbackUrl: "/setup",
        onSuccess: () => {
          void collectLatestExperiences(input);
        },
      });
      return null;
    }

    setIsCollectingExperiences(true);
    if (!input?.silent) {
      setSubmitError("");
    }
    setExperienceTask((current) => ({
      id: current?.id || "pending",
      companyName: nextCompanyName,
      roleName: nextRoleName,
      status: "RUNNING",
      progress: current?.progress || 12,
      currentStep: "正在初始化采集任务",
      summary: current?.summary || null,
      resultSummary: current?.resultSummary || null,
      errorMessage: null,
      latestSourceCount: current?.latestSourceCount || 0,
      startedAt: current?.startedAt || null,
      finishedAt: null,
      createdAt: current?.createdAt || new Date().toISOString(),
      insights: current?.insights || [],
    }));

    try {
      const response = await fetch("/api/v2/interview-experience-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyName: nextCompanyName,
          roleName: nextRoleName,
          departmentName: nextDepartmentName || undefined,
        }),
      });
      const payload = await readJsonSafely<InterviewExperienceTaskResponse>(response);
      if (response.ok && payload?.data) {
        setExperienceTask(payload.data);
        return payload.data;
      }

      const latestTask = await requestLatestExperienceTask({
        companyName: nextCompanyName,
        roleName: nextRoleName,
        departmentName: nextDepartmentName,
      });
      setExperienceTask(latestTask);

      if (response.ok) {
        if (!input?.silent) {
          setSubmitError("采集任务已创建，结果回传稍慢，请稍后刷新当前任务状态。");
        }
        return latestTask;
      }

      throw new Error(payload?.error || "采集最新面经失败");
    } catch (error) {
      console.error("Failed to collect latest interview experiences", error);
      if (!input?.silent) {
        setSubmitError(error instanceof Error ? error.message : "采集最新面经失败");
      }
      return null;
    } finally {
      setIsCollectingExperiences(false);
    }
  }

  /**
   * 轮询等待面经采集任务完成，供全流程初始化阶段隐藏执行真实准备动作。
   * @param {{
   *   companyName: string;
   *   roleName: string;
   *   departmentName?: string;
   * }} input 当前采集参数。
   * @returns {Promise<InterviewExperienceCollectionTaskDTO | null>} 最终任务状态或超时前的最新状态。
   */
  async function waitForExperienceCollectionTask(input: {
    companyName: string;
    roleName: string;
    departmentName?: string;
  }): Promise<InterviewExperienceCollectionTaskDTO | null> {
    let latestTask = await collectLatestExperiences({
      ...input,
      silent: true,
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (!latestTask || latestTask.status !== "RUNNING") {
        return latestTask;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      latestTask = await requestLatestExperienceTask(input);
      setExperienceTask(latestTask);
      if (latestTask?.progress) {
        setProgress(Math.max(18, Math.min(56, Math.round(18 + latestTask.progress * 0.38))));
      }
    }

    return latestTask;
  }

  /**
   * 将界面上的模式选择收口为实际面试模式与视频开关。
   * @param {StageInterviewExperience} nextValue 用户选择的展示模式。
   */
  function applyInterviewMode(nextValue: StageInterviewExperience): void {
    setStageInterviewExperience(nextValue);
    if (nextValue === "text") {
      setSelectedInterviewMode("text");
      setVideoEnabled(false);
      return;
    }

    if (nextValue === "realtime") {
      setSelectedInterviewMode("realtime");
      setVideoEnabled(false);
      return;
    }

    setSelectedInterviewMode("text");
    setVideoEnabled(false);
  }

  /**
   * 关闭公司下拉面板，避免焦点切换时面板残留。
   * @returns {void}
   */
  function closeCompanyDropdown(): void {
    if (companyBlurTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(companyBlurTimerRef.current);
      companyBlurTimerRef.current = null;
    }
    setIsCompanyDropdownOpen(false);
  }

  /**
   * 延迟关闭公司下拉面板，允许用户点击候选项。
   * @returns {void}
   */
  function scheduleCloseCompanyDropdown(): void {
    if (typeof window === "undefined") {
      setIsCompanyDropdownOpen(false);
      return;
    }

    if (companyBlurTimerRef.current !== null) {
      window.clearTimeout(companyBlurTimerRef.current);
    }
    companyBlurTimerRef.current = window.setTimeout(() => {
      setIsCompanyDropdownOpen(false);
      companyBlurTimerRef.current = null;
    }, 140);
  }

  /**
   * 更新目标公司，同时同步关闭下拉面板和错误提示。
   * @param {string} nextCompany 用户当前输入或选择的公司名。
   * @returns {void}
   */
  function handleCompanyChange(nextCompany: string): void {
    setCompanyName(nextCompany);
    setSubmitError("");
  }

  /**
   * 关闭岗位下拉面板，避免 blur 与 click 冲突。
   * @returns {void}
   */
  function closeRoleDropdown(): void {
    if (roleBlurTimerRef.current) {
      window.clearTimeout(roleBlurTimerRef.current);
      roleBlurTimerRef.current = null;
    }
    setIsRoleDropdownOpen(false);
  }

  /**
   * 延迟关闭岗位下拉面板，让用户可以点击候选项。
   * @returns {void}
   */
  function scheduleCloseRoleDropdown(): void {
    if (roleBlurTimerRef.current) {
      window.clearTimeout(roleBlurTimerRef.current);
    }
    roleBlurTimerRef.current = window.setTimeout(() => {
      setIsRoleDropdownOpen(false);
      roleBlurTimerRef.current = null;
    }, 120);
  }

  /**
   * 根据当前界面选择返回展示给用户的面试方式名称。
   * @returns {string} 面试方式标签。
   */
  function getSelectedModeLabel(): string {
    if (stageInterviewExperience === "behavior") {
      return "AI行为面试";
    }

    if (selectedInterviewMode === "realtime") {
      return "实时面试";
    }

    return "文字面试";
  }

  /**
   * 基于解析结果或当前简历文本补做岗位识别，避免目标岗位完全依赖手输。
   * @param {Record<string, unknown>} parsedData 当前解析返回。
   * @returns {Promise<string>} 最终可用的岗位名称。
   */
  async function resolveRoleName(parsedData: Record<string, unknown>): Promise<string> {
    const manualRole = targetRoleName.trim();
    if (manualRole) {
      return manualRole;
    }

    const parsedRole =
      typeof parsedData.role === "string" ? parsedData.role.trim() : "";
    if (parsedRole) {
      return parsedRole;
    }

    const summary =
      typeof parsedData.resumeSummaryMarkdown === "string"
        ? parsedData.resumeSummaryMarkdown.trim()
        : resumeText.trim();
    if (!summary) {
      return "";
    }

    return requestRoleSuggestionFromText(summary);
  }

  /**
   * 基于真实简历摘要调用岗位识别接口，返回可直接写入配置的岗位名称。
   * @param {string} summary 用于识别岗位的真实简历摘要。
   * @returns {Promise<string>} 命中时返回岗位名称，否则返回空字符串。
   */
  async function requestRoleSuggestionFromText(summary: string): Promise<string> {
    try {
      const response = await fetch("/api/interview/resolve-targeted-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `请根据以下真实简历内容识别最匹配的目标岗位：\n\n${summary}`,
        }),
      });
      if (!response.ok) {
        return "";
      }

      const payload = (await response.json()) as {
        data?: { role?: string };
      };
      return payload.data?.role?.trim() || "";
    } catch (error) {
      console.error("Failed to resolve role on setup page", error);
      return "";
    }
  }

  /**
   * 在发起页直接根据当前简历内容自动识别岗位，减少用户手填成本。
   * @returns {Promise<void>} 识别完成后更新岗位输入框与提示文案。
   */
  async function handleResolveRoleFromCurrentInput(): Promise<void> {
    if (isResolvingRole) {
      return;
    }

    if (!file && !resumeText.trim()) {
      setSubmitError("请先上传简历文件，或直接粘贴真实简历内容后再识别岗位。");
      return;
    }

    setIsResolvingRole(true);
    setSubmitError("");
    setRoleResolutionMessage("正在根据真实简历内容识别岗位...");

    try {
      let roleName = "";
      if (resumeText.trim()) {
        roleName = await requestRoleSuggestionFromText(resumeText.trim());
      } else if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetLevel", targetLevel);
        formData.append("language", "中文");
        formData.append("focus", focus);
        formData.append("mode", selectedInterviewMode);
        formData.append("jdText", jdText);
        formData.append("resumeText", resumeText);

        const parsedData = await requestParseProfile({}, formData);
        const parsedSummary =
          typeof parsedData.resumeSummaryMarkdown === "string"
            ? parsedData.resumeSummaryMarkdown.trim()
            : "";
        if (parsedSummary) {
          setResumeText(parsedSummary);
        }

        roleName =
          (typeof parsedData.role === "string" ? parsedData.role.trim() : "") ||
          (parsedSummary ? await requestRoleSuggestionFromText(parsedSummary) : "");
      }

      if (!roleName) {
        setRoleResolutionMessage("暂未稳定识别到岗位，请手动选择或补充更完整的简历内容。");
        return;
      }

      setTargetRoleName(roleName);
      setRoleResolutionMessage(`已根据真实简历识别岗位：${roleName}`);
    } catch (error) {
      console.error("Failed to auto resolve role on setup page", error);
      setRoleResolutionMessage("岗位识别失败，请手动选择岗位后继续。");
    } finally {
      setIsResolvingRole(false);
    }
  }

  /**
   * 切换自动结束限制类别，并保证数量与时长不会同时生效。
   * @param {InterviewLimitType} nextType 用户选中的限制类别。
   */
  function handleLimitTypeChange(nextType: InterviewLimitType): void {
    setLimitType(nextType);
    if (nextType === "question") {
      setQuestionLimit((current) => current ?? QUESTION_LIMIT_OPTIONS[1]?.value ?? 10);
      setDurationLimitMinutes(null);
      setIsDurationCustomActive(false);
      return;
    }

    setQuestionLimit(null);
    setDurationLimitMinutes((current) => current ?? DURATION_LIMIT_OPTIONS[1]?.value ?? 20);
    setIsQuestionCustomActive(false);
  }

  /**
   * 应用题量上限选择，并清空时长限制。
   * @param {InterviewLimitValue} limit 题量上限。
   */
  function handleQuestionLimitSelect(limit: InterviewLimitValue): void {
    setLimitType("question");
    setQuestionLimit(limit);
    setDurationLimitMinutes(null);
    setIsQuestionCustomActive(false);
    setCustomQuestionInput(String(limit ?? 12));
  }

  /**
   * 应用时长上限选择，并清空题量限制。
   * @param {InterviewLimitValue} limit 时长上限（分钟）。
   */
  function handleDurationLimitSelect(limit: InterviewLimitValue): void {
    setLimitType("duration");
    setDurationLimitMinutes(limit);
    setQuestionLimit(null);
    setIsDurationCustomActive(false);
    setCustomDurationInput(String(limit ?? 30));
  }

  /**
   * 启用自定义题量输入，并预填一个可编辑值。
   * @returns {void}
   */
  function enableCustomQuestionLimit(): void {
    setLimitType("question");
    setDurationLimitMinutes(null);
    setIsQuestionCustomActive(true);
    const nextValue =
      typeof questionLimit === "number" && Number.isFinite(questionLimit) ? questionLimit : 12;
    setQuestionLimit(nextValue);
    setCustomQuestionInput(String(nextValue));
  }

  /**
   * 启用自定义时长输入，并预填一个可编辑值。
   * @returns {void}
   */
  function enableCustomDurationLimit(): void {
    setLimitType("duration");
    setQuestionLimit(null);
    setIsDurationCustomActive(true);
    const nextValue =
      typeof durationLimitMinutes === "number" && Number.isFinite(durationLimitMinutes)
        ? durationLimitMinutes
        : 30;
    setDurationLimitMinutes(nextValue);
    setCustomDurationInput(String(nextValue));
  }

  /**
   * 执行画像解析，并将 v2.0 发起面试上下文写入缓存。
   */
  const startAnalysis = async () => {
    if (isAnalyzing) {
      return;
    }

    if (!file && !resumeText.trim()) {
      setSubmitError("请先上传简历文件，或直接粘贴真实简历内容后再开始解析。");
      return;
    }

    const currentRequestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = currentRequestId;
    setSubmitError("");
    setIsAnalyzing(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((previous) => {
        const next = previous + 95 / 150;
        return next > 95 ? 95 : next;
      });
    }, 100);

    let success = false;

    try {
      let body: FormData | string;
      let headers: HeadersInit = {};
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetLevel", targetLevel);
        formData.append("language", "中文");
        formData.append("focus", focus);
        formData.append("mode", selectedInterviewMode);
        formData.append("jdText", jdText);
        formData.append("resumeText", resumeText);
        body = formData;
      } else {
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          targetLevel,
          language: "中文",
          focus,
          mode: selectedInterviewMode,
          jdText,
          resumeText,
        });
      }

      const data = await requestParseProfile(headers, body);
      if (analysisRequestIdRef.current !== currentRequestId) {
        return;
      }

      if (
        typeof data.resumeSummaryMarkdown === "string" &&
        data.resumeSummaryMarkdown.trim()
      ) {
        setResumeText(data.resumeSummaryMarkdown.trim());
      }

      const resolvedLimits = resolveInterviewLimits(
        limitType,
        questionLimit,
        durationLimitMinutes
      );
      const resolvedRoleName = await resolveRoleName(data);

      const launchId = createInterviewLaunchId();
      writeStoredInterviewProfile({
        ...data,
        launchId,
        launchFlowMode,
        companyName,
        targetRoleName: resolvedRoleName,
        role: resolvedRoleName,
        interviewTemplateId: selectedTemplate?.id || undefined,
        interviewTemplateLabel: selectedTemplate?.label || undefined,
        interviewIntensity: resolvedInterviewIntensity,
        jdText,
        targetLevel,
        language: "中文",
        focus,
        mode: selectedInterviewMode,
        displayInterviewModeLabel: getSelectedModeLabel(),
        videoEnabled,
        limitType: resolvedLimits.limitType,
        questionLimit: resolvedLimits.questionLimit,
        durationLimitMinutes: resolvedLimits.durationLimitMinutes,
      });

      setProgress(100);
      success = true;
      setTimeout(() => {
        router.push(`/profile?mode=${selectedInterviewMode}&launchId=${launchId}`);
      }, 500);
    } catch (error) {
      console.error(error);
      if (analysisRequestIdRef.current !== currentRequestId) {
        return;
      }

      if ((error as Error).message === "Unauthorized") {
        requestAuth({
          title: "登录后继续生成面试画像",
          description: "登录后即可继续创建本场面试计划与画像。",
          callbackUrl: "/setup",
          onSuccess: startAnalysis,
        });
      } else {
        const message = (error as Error).message || "解析失败，请重试。";
        setSubmitError(
          shouldRetryAnalysis(error)
            ? "网络波动导致本次解析未完成，请稍后再试。系统已避免并发重复提交。"
            : message
        );
      }
    } finally {
      clearInterval(interval);
      if (analysisRequestIdRef.current === currentRequestId && !success) {
        setIsAnalyzing(false);
      }
    }
  };

  /**
   * 处理“创建面试计划 / 生成画像”动作，匿名用户先完成登录再继续提交。
   */
  function handleStartAnalysis(): void {
    if (isAnalyzing) {
      return;
    }

    if (!file && !resumeText.trim()) {
      setSubmitError("请先上传简历文件，或直接粘贴真实简历内容后再开始解析。");
      return;
    }

    if (session?.user?.id) {
      void startAnalysis();
      return;
    }

    requestAuth({
      title: "登录后生成岗位画像",
      description: "登录后即可继续解析简历并生成画像。",
      callbackUrl: "/setup",
      onSuccess: startAnalysis,
    });
  }

  /**
   * 拉取当前用户的全流程面试记录列表，不使用任何 mock 数据。
   * @returns {Promise<void>} 请求完成后更新列表状态。
   */
  const fetchFullFlowPlans = useCallback(async (): Promise<void> => {
    if (!session?.user?.id) {
      setFullFlowPlans([]);
      return;
    }

    setIsPlansLoading(true);
    try {
      const response = await fetch("/api/v2/interview-plans?mode=FULL_FLOW");
      const payload = (await response.json()) as InterviewPlansResponse;
      if (!response.ok) {
        throw new Error(payload.error || "获取面试记录失败");
      }

      setFullFlowPlans(payload.data || []);
    } catch (error) {
      console.error("Failed to fetch full flow plans", error);
      setFullFlowPlans([]);
    } finally {
      setIsPlansLoading(false);
    }
  }, [session?.user?.id]);

  /**
   * 直接发起全流程面试，解析简历后创建真实计划并进入面试间。
   * @returns {Promise<void>} 创建成功后跳转到面试页。
   */
  async function startFullFlowInterview(): Promise<void> {
    if (isCreatingFullFlow) {
      return;
    }

    if (!companyName.trim()) {
      setSubmitError("请先填写目标公司，再预约全流程面试。");
      return;
    }
    if (!targetRoleName.trim()) {
      setSubmitError("请先填写目标岗位，再预约全流程面试。");
      return;
    }

    if (!file && !resumeText.trim()) {
      setSubmitError("请先上传简历文件，或直接粘贴真实简历内容后再预约。");
      return;
    }

    if (!session?.user?.id) {
      requestAuth({
        title: "登录后预约全流程面试",
        description: "登录后即可查看你的预约记录并继续发起全流程面试。",
        callbackUrl: "/setup",
        onSuccess: () => {
          void startFullFlowInterview();
        },
      });
      return;
    }

    setIsCreatingFullFlow(true);
    setSubmitError("");
    setProgress(0);
    setFullFlowInitStage("prepare_profile");

    try {
      const launchId = createInterviewLaunchId();
      let body: FormData | string;
      let headers: HeadersInit = {};
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetLevel", targetLevel);
        formData.append("language", "中文");
        formData.append("focus", "全流程面试");
        formData.append("mode", selectedInterviewMode);
        formData.append("resumeText", resumeText);
        body = formData;
      } else {
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          targetLevel,
          language: "中文",
          focus: "全流程面试",
          mode: selectedInterviewMode,
          resumeText,
        });
      }

      const parsedData = await requestParseProfile(headers, body);
      const resolvedRoleName = await resolveRoleName(parsedData);
      if (!resolvedRoleName) {
        throw new Error("未能从简历中识别目标岗位，请补充或选择目标岗位后再继续。");
      }
      setTargetRoleName(resolvedRoleName);

      setFullFlowInitStage("prepare_questions");
      setProgress(18);
      const latestExperienceTask = await waitForExperienceCollectionTask({
        companyName: companyName.trim(),
        roleName: resolvedRoleName,
        departmentName: departmentName.trim(),
      });
      const latestExperienceInsights =
        latestExperienceTask?.status === "COMPLETED" && latestExperienceTask.insights.length > 0
          ? latestExperienceTask.insights
          : collectedExperienceInsights;

      setFullFlowInitStage("prepare_process");
      setProgress(68);
      const response = await fetch("/api/v2/interview-plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          launchId,
          launchFlowMode: "full_flow",
          companyName: companyName.trim(),
          roleName: resolvedRoleName,
          departmentName: departmentName.trim() || undefined,
          targetLevel,
          language: "中文",
          focus: "全流程面试",
          mode: selectedInterviewMode,
          interviewTemplateId: null,
          interviewTemplateLabel: null,
          interviewIntensity: resolvedInterviewIntensity,
          jdText,
          resumeText:
            (typeof parsedData.resumeSummaryMarkdown === "string" &&
            parsedData.resumeSummaryMarkdown.trim()
              ? parsedData.resumeSummaryMarkdown.trim()
              : resumeText.trim()) || "",
          persona: parsedData.persona,
          projects: parsedData.projects,
          experienceTaskId: latestExperienceTask?.id || experienceTask?.id || undefined,
          experienceInsights:
            latestExperienceInsights.length > 0
              ? latestExperienceInsights.map((item) => ({
                  stageType: item.stageType,
                  title: item.title,
                  summary: item.summary,
                  tags: item.tags,
                }))
              : undefined,
          limitType: "none",
          questionLimit: null,
          durationLimitMinutes: null,
        }),
      });
      const payload = (await response.json()) as CreatePlanResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "创建全流程面试失败");
      }
      const planData = payload.data;
      const initialStage =
        planData.stages.find((item) => item.stageId === planData.initialStageId) ||
        planData.stages[0] ||
        null;

      const fullFlowProfile = {
        ...parsedData,
        launchId,
        launchFlowMode: "full_flow" as const,
        interviewPlanId: planData.planId,
        interviewStageId: planData.initialStageId || undefined,
        interviewRoundId: planData.initialRoundId || undefined,
        currentStageType: initialStage?.stageType,
        currentStageLabel: initialStage?.stageLabel,
        companyName: companyName.trim(),
        departmentName: departmentName.trim(),
        targetRoleName: resolvedRoleName,
        role: resolvedRoleName,
        targetLevel,
        language: "中文",
        focus: "全流程面试",
        mode: selectedInterviewMode,
        displayInterviewModeLabel: getSelectedModeLabel(),
        videoEnabled,
        experienceInsights:
          latestExperienceInsights.length > 0 ? latestExperienceInsights : undefined,
      };
      writeStoredInterviewProfile(
        fullFlowProfile,
        buildInterviewRoomKey({
          planId: planData.planId,
          stageId: planData.initialStageId,
          roundId: planData.initialRoundId,
          launchId,
          mode: selectedInterviewMode,
        })
      );

      setProgress(100);
      await fetchFullFlowPlans();
      router.push(
        `${planData.initialActionPath || `/interview?planId=${planData.planId}`}&mode=${selectedInterviewMode}`
      );
    } catch (error) {
      console.error("Failed to create full flow interview", error);
      setSubmitError(error instanceof Error ? error.message : "创建全流程面试失败");
    } finally {
      setFullFlowInitStage("idle");
      setIsCreatingFullFlow(false);
      setIsConfirmModalOpen(false);
    }
  }


  useEffect(() => {
    const nextLevels =
      companyName.trim() && getCompanyLevelOptions(companyName, targetRoleName).length > 0
        ? getCompanyLevelOptions(companyName, targetRoleName)
        : defaultFullFlowLevels;

    if (!nextLevels.includes(targetLevel)) {
      setTargetLevel(nextLevels[0] || "校招 / 应届生");
    }
  }, [companyName, targetLevel, targetRoleName]);

  useEffect(() => {
    if (!session?.user?.id) {
      setFullFlowPlans([]);
      setSavedTemplates([]);
      setExperienceTask(null);
      setUnreadNotificationCount(0);
      return;
    }

    void fetchFullFlowPlans();
    void fetchSavedTemplates();
    void (async () => {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        data?: {
          unreadCount?: number;
        };
      };
      setUnreadNotificationCount(payload.data?.unreadCount || 0);
    })();
  }, [fetchFullFlowPlans, fetchSavedTemplates, session?.user?.id]);
  useEffect(() => {
    if (launchFlowMode !== "full_flow") {
      return;
    }
    void fetchLatestExperienceTask();
  }, [fetchLatestExperienceTask, launchFlowMode]);
  useEffect(() => {
    if (launchFlowMode !== "full_flow" || experienceTask?.status !== "RUNNING") {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchLatestExperienceTask();
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [experienceTask?.status, fetchLatestExperienceTask, launchFlowMode]);
  useEffect(() => {
    setActiveTemplateCategory("all");
    setSelectedTemplateId(null);
    setTemplateSearch("");
  }, [launchFlowMode]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const expectedMode = readInitialLaunchFlowMode();
    if (expectedMode !== launchFlowMode) {
      setLaunchFlowMode(expectedMode);
      return;
    }
    window.sessionStorage.setItem(SETUP_FLOW_MODE_STORAGE_KEY, launchFlowMode);
  }, [launchFlowMode]);
  const portraitUrl = buildInterviewerPortraitUrl({
    companyName,
    roleName: targetRoleName,
    launchFlowMode,
  });
  const confirmPortraitUrl =
    launchFlowMode === "stage" && selectedTemplate?.portraitUrl
      ? selectedTemplate.portraitUrl
      : portraitUrl;
  const confirmInterviewerName =
    launchFlowMode === "stage" && selectedTemplate?.interviewerName
      ? selectedTemplate.interviewerName
      : companyName.trim() || "通用技术面试官";
  const confirmInterviewerStyle =
    launchFlowMode === "stage" && selectedTemplate?.interviewerStyle
      ? selectedTemplate.interviewerStyle
      : matchedCompanyPlaybook?.interviewStyle || "专业、冷静、连续追问";
  const isBusy = isAnalyzing || isCreatingFullFlow;
  const shouldHighlightStageResume =
    launchFlowMode === "stage" &&
    Boolean(submitError) &&
    (submitError.includes("简历") || submitError.includes("粘贴"));
  const shouldHighlightFullFlowResume =
    launchFlowMode === "full_flow" &&
    Boolean(submitError) &&
    (submitError.includes("简历") || submitError.includes("粘贴"));
  const shouldHighlightFullFlowCompany =
    launchFlowMode === "full_flow" && Boolean(submitError) && submitError.includes("目标公司");
  const shouldHighlightFullFlowRole =
    launchFlowMode === "full_flow" && Boolean(submitError) && submitError.includes("目标岗位");
  const stageLevelChoices = [
    { label: "校招 / 应届生", value: "校招 / 应届生" },
    { label: "1-3 年经验", value: "1-3 年经验" },
    { label: "资深 / 专家", value: "资深 / 专家" },
  ];
  const stageDirectionChoices = [
    "综合面试",
    "项目深挖",
    "系统设计",
    "场景问答",
    "行为软技能（HR）",
  ];
  const stageModeChoices: Array<{
    label: string;
    value: StageInterviewExperience;
    icon: string;
    desc: string;
  }> = [
    {
      label: "文字面试",
      value: "text",
      icon: "T",
      desc: "更适合复盘思考、细化表达和逐步完成答题。",
    },
    {
      label: "实时面试",
      value: "realtime",
      icon: "M",
      desc: "强调临场反应，表达流畅度和更接近真人的节奏。",
    },
    {
      label: "AI行为面试",
      value: "behavior",
      icon: "HR",
      desc: "更强调行为追问、动机、协作、抗压和表达稳定度。",
    },
  ];
  const launchQuestionCount =
    typeof questionLimit === "number" && Number.isFinite(questionLimit) ? questionLimit : 15;
  const launchDurationText =
    limitType === "duration" && durationLimitMinutes
      ? `${durationLimitMinutes} 分钟`
      : "25-35 分钟";
  const displayRoleName = targetRoleName.trim() || "待选择岗位";
  const displayTargetLevel = targetLevel.trim() || "校招 / 应届生";
  const displayModeLabel = getSelectedModeLabel();
  const stageSummaryTags = [
    displayRoleName,
    displayTargetLevel,
    displayModeLabel,
    focus,
    `${resolvedInterviewIntensity}强度`,
    limitType === "duration" ? launchDurationText : `${launchQuestionCount} 题`,
  ];
  const fullFlowSummaryTags = [
    "全流程面试",
    targetRoleName.trim() ? `岗位：${targetRoleName.trim()}` : "待选岗位",
    companyName.trim() ? `公司：${companyName.trim()}` : "待选公司",
    departmentName.trim() ? `部门：${departmentName.trim()}` : "部门：未填写",
    targetLevel.trim() ? `职级：${targetLevel.trim()}` : "待选职级",
    `方式：${selectedInterviewMode === "realtime" ? "实时面试" : "文字面试"}`,
    "系统自动加载题目与流程",
    file || resumeText.trim() ? "已补充简历 ✓" : "待补充简历",
  ];
  const questionPreparationCopy = resolveQuestionPreparationCopy(experienceTask);
  const fullFlowInitSteps: FullFlowInitStepItem[] = [
    {
      key: "prepare_profile",
      title: "校验岗位信息",
      desc: "系统正在确认岗位、部门、职级与简历是否完整。",
    },
    {
      key: "prepare_questions",
      title: questionPreparationCopy.title,
      desc: questionPreparationCopy.desc,
    },
    {
      key: "prepare_process",
      title: "装载面试流程",
      desc: `${companyName.trim() || "目标公司"} ${displayRoleName} 的轮次与当前环节正在同步装载。`,
    },
  ];
  const resumeQuickFacts = useMemo(() => extractResumeQuickFacts(resumeText), [resumeText]);
  const resumeInfoCells = [
    { label: "姓名", value: resumeQuickFacts.name || "待解析" },
    { label: "工作年限", value: resumeQuickFacts.workYears || displayTargetLevel },
    { label: "当前城市", value: resumeQuickFacts.city || "待解析" },
    { label: "学历", value: resumeQuickFacts.education || "待解析" },
    { label: "期望岗位", value: displayRoleName },
    { label: "项目经验", value: resumeText.trim() ? "已提供简历内容" : "待补充" },
  ];
  const previewTemplate = selectedTemplate ?? filteredTemplates[0] ?? null;

  return (
    <>
      <section className="v2-launch-shell launch-ref-shell">
        {launchFlowMode === "stage" ? (
          <div className="launch-ref-wrap">
            <div className="launch-ref-layout-shell">
              <div className="launch-ref-header-card" data-source="stage-header">
                <div className="launch-ref-header-spacer" aria-hidden="true" />
                <div className="launch-ref-header-switch">
                  <div className="launch-ref-seg">
                    <button type="button" className="active">
                      ▰ 阶段面试
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateLaunchFlowMode("full_flow");
                        setIsFullFlowComposerOpen(false);
                        setSubmitError("");
                      }}
                    >
                      ⌘ 全流程面试
                    </button>
                  </div>
                </div>
                <div className="launch-ref-header-actions">
                  <button type="button" className="btn" onClick={openNotificationsCenter}>
                    站内信{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ""}
                  </button>
                  <button
                    type="button"
                    className="btn ghost-orange"
                    onClick={() => setIsTemplateModalOpen(true)}
                  >
                    选择模板
                  </button>
                  <button type="button" className="btn" onClick={openSaveTemplateModal}>
                    ☆ 保存为模板
                  </button>
                </div>
              </div>

              <div className="launch-ref-main-grid" data-source="stage-content">
                <section className="launch-ref-card">
                  <div className="launch-ref-card-body">
                    <h2 className="section-title">
                      <span className="num">1</span>岗位信息
                      <span className="pill launch-ref-title-pill">{displayRoleName}</span>
                    </h2>
                    <div className="field-row">
                      <label className="field">
                        <span className="launch-ref-field-head">
                          <span className="label">目标岗位（可自动识别）</span>
                        </span>
                        <div
                          className={`v2-launch-combobox ${isRoleDropdownOpen ? "is-open" : ""}`}
                        >
                          <input
                            className="input"
                            value={targetRoleName}
                            placeholder="搜索或选择目标岗位"
                            onFocus={() => setIsRoleDropdownOpen(true)}
                            onClick={() => setIsRoleDropdownOpen(true)}
                            onBlur={scheduleCloseRoleDropdown}
                            onChange={(event) => {
                              setTargetRoleName(event.target.value);
                              setIsRoleDropdownOpen(true);
                              setSubmitError("");
                            }}
                          />
                          {isRoleDropdownOpen ? (
                            <div
                              className="v2-launch-combobox__panel"
                              onMouseDown={(event) => {
                                event.preventDefault();
                              }}
                            >
                              {visibleRoleOptions.length > 0 ? (
                                visibleRoleOptions.map((role) => (
                                  <button
                                    key={role}
                                    type="button"
                                    className={`v2-launch-combobox__option ${
                                      targetRoleName === role ? "is-active" : ""
                                    }`}
                                    onClick={() => {
                                      setTargetRoleName(role);
                                      closeRoleDropdown();
                                    }}
                                  >
                                    <span>{role}</span>
                                  </button>
                                ))
                              ) : (
                                <div className="v2-launch-combobox__empty">
                                  暂无匹配岗位，请继续输入搜索。
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </label>
                      <label className="field">
                        <span className="label">目标公司（非必选）</span>
                        <div
                          className={`v2-launch-combobox ${isCompanyDropdownOpen ? "is-open" : ""}`}
                        >
                          <input
                            className="input"
                            placeholder="搜索或选择目标公司"
                            value={companyName}
                            onFocus={() => setIsCompanyDropdownOpen(true)}
                            onClick={() => setIsCompanyDropdownOpen(true)}
                            onBlur={scheduleCloseCompanyDropdown}
                            onChange={(event) => {
                              handleCompanyChange(event.target.value);
                              setIsCompanyDropdownOpen(true);
                            }}
                          />
                          {isCompanyDropdownOpen ? (
                            <div
                              className="v2-launch-combobox__panel"
                              onMouseDown={(event) => {
                                event.preventDefault();
                              }}
                            >
                              {visibleCompanyOptions.length > 0 ? (
                                visibleCompanyOptions.map((company) => (
                                  <button
                                    key={company}
                                    type="button"
                                    className={`v2-launch-combobox__option ${
                                      companyName === company ? "is-active" : ""
                                    }`}
                                    onClick={() => {
                                      handleCompanyChange(company);
                                      closeCompanyDropdown();
                                    }}
                                  >
                                    <span>{company}</span>
                                  </button>
                                ))
                              ) : (
                                <div className="v2-launch-combobox__empty">
                                  暂无匹配公司，请继续输入搜索。
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    </div>
                    {roleResolutionMessage ? <p className="hint">{roleResolutionMessage}</p> : null}
                    <div className="field">
                      <span className="label">目标职级</span>
                      <div className="pills">
                        {(companyName.trim() && levelOptions.length > 0
                          ? levelOptions
                          : stageLevelChoices.map((item) => item.value)
                        ).map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`pill ${targetLevel === level ? "active" : ""}`}
                            onClick={() => setTargetLevel(level)}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <span className="label">岗位 JD</span>
                      <textarea
                        className="textarea"
                        placeholder="把岗位职责、任职要求和核心能力贴在这里，系统会用真实 JD 配合简历做画像。"
                        value={jdText}
                        onChange={(event) => setJdText(event.target.value)}
                      />
                    </div>
                  </div>
                </section>

                <section className="launch-ref-card">
                  <div className="launch-ref-card-body">
                    <h2 className="section-title">
                      <span className="num">2</span>配置模块
                    </h2>
                    <div className="strategy-block">
                      <div className="strategy-row">
                        <div className="row-head">面试强度</div>
                        <div className="pills">
                          {["标准", "深挖", "压力", "自定义"].map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={`pill ${interviewIntensity === item ? "active" : ""}`}
                              onClick={() => setInterviewIntensity(item)}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="strategy-row strategy-row--mode">
                        <div className="row-head">面试方式</div>
                        <div className="choice-card-grid">
                          {stageModeChoices.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              className={`choice-card ${
                                stageInterviewExperience === item.value ? "active" : ""
                              }`}
                              onClick={() => applyInterviewMode(item.value)}
                            >
                              <div className="choice-card__head">
                                <span className="mini">{item.icon}</span>
                                <b>{item.label}</b>
                              </div>
                              <p>{item.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="strategy-row">
                        <div className="row-head">本场重点</div>
                        <div className="pills">
                          {stageDirectionChoices.map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={`pill ${focus === item ? "active" : ""}`}
                              onClick={() => setFocus(item)}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="strategy-row">
                        <div className="row-head">面试时长</div>
                        <div>
                          <div className="pills">
                            <button
                              type="button"
                              className={`pill ${limitType === "question" ? "active" : ""}`}
                              onClick={() => handleLimitTypeChange("question")}
                            >
                              按数量
                            </button>
                            <button
                              type="button"
                              className={`pill ${limitType === "duration" ? "active" : ""}`}
                              onClick={() => handleLimitTypeChange("duration")}
                            >
                              按时长
                            </button>
                          </div>
                          <div className="divider" />
                          {limitType === "question" ? (
                            <div className="launch-ref-limit-grid">
                              <div className="pills">
                                {[5, 10, 20].map((count) => (
                                  <button
                                    key={count}
                                    type="button"
                                    className={`pill ${
                                      !isQuestionCustomActive && launchQuestionCount === count
                                        ? "active"
                                        : ""
                                    }`}
                                    onClick={() => handleQuestionLimitSelect(count)}
                                  >
                                    {count} 题
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className={`pill ${isQuestionCustomActive ? "active" : ""}`}
                                  onClick={enableCustomQuestionLimit}
                                >
                                  自定义
                                </button>
                              </div>
                              {isQuestionCustomActive ? (
                                <label className="launch-ref-inline-custom">
                                  <span>题数</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={customQuestionInput}
                                    onChange={(event) => {
                                      const value = event.target.value.replace(/[^\d]/g, "");
                                      setCustomQuestionInput(value);
                                      const parsed = Number(value);
                                      if (Number.isFinite(parsed) && parsed > 0) {
                                        setQuestionLimit(parsed);
                                      }
                                    }}
                                  />
                                </label>
                              ) : null}
                            </div>
                          ) : (
                            <div className="launch-ref-limit-grid">
                              <div className="pills">
                                {[15, 30, 45].map((minutes) => (
                                  <button
                                    key={minutes}
                                    type="button"
                                    className={`pill ${
                                      !isDurationCustomActive && durationLimitMinutes === minutes
                                        ? "active"
                                        : ""
                                    }`}
                                    onClick={() => handleDurationLimitSelect(minutes)}
                                  >
                                    {minutes} 分钟
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className={`pill ${isDurationCustomActive ? "active" : ""}`}
                                  onClick={enableCustomDurationLimit}
                                >
                                  自定义
                                </button>
                              </div>
                              {isDurationCustomActive ? (
                                <label className="launch-ref-inline-custom">
                                  <span>分钟</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={180}
                                    value={customDurationInput}
                                    onChange={(event) => {
                                      const value = event.target.value.replace(/[^\d]/g, "");
                                      setCustomDurationInput(value);
                                      const parsed = Number(value);
                                      if (Number.isFinite(parsed) && parsed > 0) {
                                        setDurationLimitMinutes(parsed);
                                      }
                                    }}
                                  />
                                </label>
                              ) : null}
                            </div>
                          )}
                          <div className="launch-ref-limit-summary">
                            当前策略：{currentLimitStrategy.summary}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="launch-ref-card">
                  <div className="launch-ref-card-body">
                    <h2 className="section-title">
                      <span className="num">3</span>简历模块
                    </h2>
                    <div className="field">
                      <span className="label">上传简历</span>
                      <div
                        className={`upload ${shouldHighlightStageResume ? "launch-ref-field-invalid" : ""}`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <strong>
                          {file
                            ? `已上传：${file.name}`
                            : "⇧ 点击上传简历文件，或直接粘贴简历正文"}
                        </strong>
                        <small>
                          支持 PDF / Markdown / TXT；系统只使用真实简历内容，不补造项目经历。
                        </small>
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: "none" }}
                          accept=".pdf,.doc,.docx,.md,.markdown,.txt,text/plain"
                          onChange={handleFileUpload}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <span className="label">已粘贴的简历内容</span>
                      <textarea
                        className={`textarea resume-text ${
                          shouldHighlightStageResume ? "launch-ref-field-invalid" : ""
                        }`}
                        value={resumeText}
                        placeholder="请粘贴真实简历内容，系统会结合项目经历、技术栈和岗位 JD 做画像。"
                        onChange={(event) => {
                          setResumeText(event.target.value);
                          setSubmitError("");
                        }}
                      />
                    </div>
                    <div className="parse-panel">
                      <div className="parse-title">解析重点（系统将结合简历进行画像）</div>
                      <div className="parse-items">
                        <div className="parse-item">技术栈匹配度</div>
                        <div className="parse-item">项目复杂度</div>
                        <div className="parse-item">经验关键词提取</div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <footer className="launch-ref-footer-bar" data-source="stage-footer">
                <div>
                  <b>当前策略摘要</b>
                  <div className="launch-ref-summary">
                    {stageSummaryTags.map((item) => (
                      <span key={item} className="launch-ref-tag">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="launch-ref-footer-cta"
                  disabled={isBusy}
                  onClick={handleStartAnalysis}
                >
                  确认面试配置 →
                </button>
              </footer>
              {submitError ? <p className="launch-stage-error">{submitError}</p> : null}
            </div>
          </div>
        ) : (
          <div className="launch-ref-wrap">
            <div className="launch-ref-layout-shell launch-ref-layout-shell--fullflow">
              <div className="launch-ref-header-card">
                <div className="launch-ref-header-spacer" aria-hidden="true" />
                <div className="launch-ref-header-switch">
                  <div className="launch-ref-seg">
                    <button
                      type="button"
                      onClick={() => {
                        updateLaunchFlowMode("stage");
                        setSubmitError("");
                      }}
                    >
                      ▰ 阶段面试
                    </button>
                    <button type="button" className="active">
                      ⌘ 全流程面试
                    </button>
                  </div>
                </div>
                <div className="launch-ref-header-actions">
                  <button type="button" className="btn" onClick={openNotificationsCenter}>
                    站内信{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ""}
                  </button>
                  {isFullFlowComposerOpen ? (
                    <>
                      <button
                        type="button"
                        className="btn ghost-orange"
                        onClick={() => setIsTemplateModalOpen(true)}
                      >
                        选择模板
                      </button>
                      <button type="button" className="btn" onClick={openSaveTemplateModal}>
                        ☆ 保存为模板
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setIsFullFlowComposerOpen(false);
                          setSubmitError("");
                        }}
                      >
                        返回列表
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost-orange"
                      onClick={() => {
                        setIsFullFlowComposerOpen(true);
                        setSubmitError("");
                      }}
                    >
                      发起面试
                    </button>
                  )}
                </div>
              </div>
              {isFullFlowComposerOpen ? (
                <>
                  <div className="launch-ref-flow-grid launch-ref-flow-grid--compact" data-source="flow-content">
                    <section className="launch-ref-card flow-card">
                      <div className="launch-ref-card-body">
                        <h2 className="section-title">▣ 岗位信息</h2>
                        <label className="field">
                          <span className="label">目标岗位（必选）</span>
                          <div
                            className={`v2-launch-combobox ${
                              isRoleDropdownOpen ? "is-open" : ""
                            } ${shouldHighlightFullFlowRole ? "is-invalid" : ""}`}
                          >
                            <input
                              className="input"
                              value={targetRoleName}
                              placeholder="搜索或选择目标岗位"
                              onFocus={() => setIsRoleDropdownOpen(true)}
                              onClick={() => setIsRoleDropdownOpen(true)}
                              onBlur={scheduleCloseRoleDropdown}
                              onChange={(event) => {
                                setTargetRoleName(event.target.value);
                                setIsRoleDropdownOpen(true);
                                setSubmitError("");
                              }}
                            />
                            {isRoleDropdownOpen ? (
                              <div
                                className="v2-launch-combobox__panel"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                }}
                              >
                                {visibleRoleOptions.length > 0 ? (
                                  visibleRoleOptions.map((role) => (
                                    <button
                                      key={role}
                                      type="button"
                                      className={`v2-launch-combobox__option ${
                                        targetRoleName === role ? "is-active" : ""
                                      }`}
                                      onClick={() => {
                                        setTargetRoleName(role);
                                        closeRoleDropdown();
                                      }}
                                    >
                                      <span>{role}</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="v2-launch-combobox__empty">
                                    暂无匹配岗位，请继续输入搜索。
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </label>
                        <label className="field">
                          <span className="label">目标公司（必选）</span>
                          <div
                            className={`v2-launch-combobox ${
                              isCompanyDropdownOpen ? "is-open" : ""
                            } ${shouldHighlightFullFlowCompany ? "is-invalid" : ""}`}
                          >
                            <input
                              className="input"
                              placeholder="搜索或选择目标公司"
                              value={companyName}
                              onFocus={() => setIsCompanyDropdownOpen(true)}
                              onClick={() => setIsCompanyDropdownOpen(true)}
                              onBlur={scheduleCloseCompanyDropdown}
                              onChange={(event) => {
                                handleCompanyChange(event.target.value);
                                setIsCompanyDropdownOpen(true);
                                setSubmitError("");
                              }}
                            />
                            {isCompanyDropdownOpen ? (
                              <div
                                className="v2-launch-combobox__panel"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                }}
                              >
                                {visibleCompanyOptions.length > 0 ? (
                                  visibleCompanyOptions.map((company) => (
                                    <button
                                      key={company}
                                      type="button"
                                      className={`v2-launch-combobox__option ${
                                        companyName === company ? "is-active" : ""
                                      }`}
                                      onClick={() => {
                                        handleCompanyChange(company);
                                        closeCompanyDropdown();
                                      }}
                                    >
                                      <span>{company}</span>
                                      {findCompanyPlaybook(company)?.interviewStyle ? (
                                        <small>{findCompanyPlaybook(company)?.interviewStyle}</small>
                                      ) : null}
                                    </button>
                                  ))
                                ) : (
                                  <div className="v2-launch-combobox__empty">
                                    暂无匹配公司，请继续输入搜索。
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </label>
                        <div className="field">
                          <span className="label">目标职级（随公司联动）</span>
                          <div className="pills">
                            {(levelOptions.length > 0 ? levelOptions : defaultFullFlowLevels).map(
                              (level) => (
                                <button
                                  key={level}
                                  type="button"
                                  className={`pill ${targetLevel === level ? "active" : ""}`}
                                  onClick={() => setTargetLevel(level)}
                                >
                                  {level}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                        <div className="field">
                          <span className="label">全流程面试方式</span>
                          <div className="choice-card-grid">
                            {([
                              {
                                value: "text" as const,
                                icon: "T",
                                label: "文字面试",
                                desc: "没有域名或暂时不方便开麦时，直接用文字方式完成全流程面试。",
                              },
                              {
                                value: "realtime" as const,
                                icon: "M",
                                label: "实时面试",
                                desc: "更接近真实语音节奏，需要浏览器麦克风权限和安全环境支持。",
                              },
                            ] as const).map((item) => (
                              <button
                                key={item.value}
                                type="button"
                                className={`choice-card ${
                                  selectedInterviewMode === item.value ? "active" : ""
                                }`}
                                onClick={() => applyInterviewMode(item.value)}
                              >
                                <div className="choice-card__head">
                                  <span className="mini">{item.icon}</span>
                                  <b>{item.label}</b>
                                </div>
                                <p>{item.desc}</p>
                              </button>
                            ))}
                          </div>
                          <p className="hint">
                            当前没有域名时，建议优先使用文字面试；后续具备 HTTPS 域名后再切到实时面试。
                          </p>
                        </div>
                        <label className="field">
                          <span className="label">目标部门（建议填写）</span>
                          <input
                            className="input"
                            value={departmentName}
                            placeholder="例如：广告平台、支付中台、推荐架构、商业化研发"
                            onChange={(event) => {
                              setDepartmentName(event.target.value);
                              setSubmitError("");
                            }}
                          />
                        </label>
                        <label className="field">
                          <span className="label">岗位 JD</span>
                          <textarea
                            className="textarea launch-ref-flow-jd"
                            value={jdText}
                            placeholder="补充岗位职责、任职要求和核心能力，系统会结合公开网页面经、岗位画像与简历做全流程规划。"
                            onChange={(event) => setJdText(event.target.value)}
                          />
                        </label>
                      </div>
                    </section>
                    <section className="launch-ref-card flow-card">
                      <div className="launch-ref-card-body">
                        <h2 className="section-title">▧ 简历模块</h2>
                        <div className="field">
                          <span className="label">上传简历</span>
                          <div
                            className={`upload ${
                              shouldHighlightFullFlowResume ? "launch-ref-field-invalid" : ""
                            }`}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <strong>
                              {file
                                ? `已上传：${file.name}`
                                : "⇧ 点击上传简历文件，或直接粘贴简历正文"}
                            </strong>
                            <small>
                              支持 PDF / Markdown / TXT，系统只使用真实内容，不补造项目经历。
                            </small>
                            <input
                              type="file"
                              ref={fileInputRef}
                              style={{ display: "none" }}
                              accept=".pdf,.md,.markdown,.txt,text/plain"
                              onChange={handleFileUpload}
                            />
                          </div>
                        </div>
                        <label className="field">
                          <span className="label">粘贴简历内容</span>
                          <textarea
                            className={`textarea resume-text ${
                              shouldHighlightFullFlowResume ? "launch-ref-field-invalid" : ""
                            }`}
                            value={resumeText}
                            placeholder="请粘贴真实简历内容，系统会结合岗位、公司、部门与自动生成的流程做全流程规划。"
                            onChange={(event) => {
                              setResumeText(event.target.value);
                              setSubmitError("");
                            }}
                          />
                        </label>
                        <div className="resume-info">
                          <div className="parse-title">解析信息（自动提取）</div>
                          <div className="info-grid">
                            {resumeInfoCells.map((item) => (
                              <div key={item.label} className="info-cell">
                                <b>{item.label}</b>
                                {item.value}
                              </div>
                            ))}
                          </div>
                          <div className="chip-row">
                            {[displayRoleName, displayTargetLevel, resolvedInterviewIntensity].map(
                              (item) => (
                                <span key={item} className="chip">
                                  {item}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                  <footer className="launch-ref-footer-bar">
                    <div className="launch-ref-bottom-tabs">
                      <b>面试配置总览</b>
                      {fullFlowSummaryTags.map((item) => (
                        <span key={item} className="launch-ref-mini-card">
                          {item}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="launch-ref-footer-cta"
                      disabled={isBusy}
                      onClick={startFullFlowInterview}
                    >
                      确认面试配置 →
                    </button>
                  </footer>
                  {submitError ? <p className="launch-stage-error">{submitError}</p> : null}
                </>
              ) : (
                <div className="launch-ref-fullflow-board" data-source="fullflow-list">
                  <div className="launch-ref-fullflow-board__hero">
                    <div>
                      <h2>全流程面试列表</h2>
                      <p>按真实招聘流程查看每个公司的进度、当前轮次与下一次面试时间。</p>
                    </div>
                    <button
                      type="button"
                      className="launch-ref-footer-cta"
                      onClick={() => {
                        setIsFullFlowComposerOpen(true);
                        setSubmitError("");
                      }}
                    >
                      确认面试配置
                    </button>
                  </div>
                  <div className="launch-ref-fullflow-list">
                    {isPlansLoading ? (
                      <div className="launch-ref-empty-state">正在读取你的全流程面试记录...</div>
                    ) : fullFlowPlans.length > 0 ? (
                      fullFlowPlans.map((plan) => (
                        <article key={plan.planId} className="launch-ref-fullflow-plan-card">
                          <div className="launch-ref-fullflow-plan-card__head">
                            <div>
                              <h3>{plan.companyName || "待定公司"} · {plan.roleName || "待定岗位"}</h3>
                              <p>
                                {plan.statusLabel}
                                {plan.departmentName ? ` · ${plan.departmentName}` : ""}
                              </p>
                            </div>
                            <span className="launch-ref-status-pill">{plan.resultLabel}</span>
                          </div>
                          <div className="launch-ref-fullflow-plan-card__meta">
                            <span>当前轮次：{plan.currentStageLabel || "待开始"}</span>
                            <span>进度：{plan.progressLabel}</span>
                            <span>下一次面试：{plan.nextInterviewLabel}</span>
                          </div>
                          {plan.stages.length > 0 ? (
                            <div className="launch-ref-fullflow-plan-card__timeline">
                              {plan.stages.map((stage) => (
                                <div
                                  key={stage.stageId}
                                  className={`launch-ref-stage-chip ${
                                    stage.isCurrent
                                      ? "is-current"
                                      : stage.status === "COMPLETED"
                                        ? "is-done"
                                        : stage.status === "BLOCKED" ||
                                            stage.status === "SKIPPED"
                                          ? "is-blocked"
                                          : ""
                                  }`}
                                >
                                  <span className="launch-ref-stage-chip__order">
                                    {stage.stageOrder}
                                  </span>
                                  <span>{stage.stageLabel}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {plan.finalDecision === "offer" ? (
                            <div className="launch-ref-fullflow-plan-card__summary">
                              恭喜你完成全部轮次，当前流程已收口为 Offer 结果，可以直接查看整套反馈与复盘建议。
                            </div>
                          ) : plan.finalDecision === "eliminated" ? (
                            <div className="launch-ref-fullflow-plan-card__summary">
                              这次流程先到这里，别灰心。建议先查看面试官反馈，把关键薄弱点补强后再继续冲刺。
                            </div>
                          ) : null}
                          <div className="launch-ref-fullflow-plan-card__actions">
                            {plan.actionPath ? (
                              <button
                                type="button"
                                className="btn ghost-orange"
                                onClick={() => {
                                  const actionPath = plan.actionPath || "/setup";
                                  window.location.href = actionPath.includes("mode=")
                                    ? actionPath
                                    : `${actionPath}${actionPath.includes("?") ? "&" : "?"}mode=text`;
                                }}
                              >
                                继续当前轮次
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn"
                                onClick={() => {
                                  setIsFullFlowComposerOpen(true);
                                  setCompanyName(plan.companyName || "");
                                  setTargetRoleName(plan.roleName || "");
                                  setDepartmentName(plan.departmentName || "");
                                }}
                              >
                                复用配置
                              </button>
                            )}
                            {plan.feedbackPath ? (
                              <button
                                type="button"
                                className="btn"
                                onClick={() => {
                                  window.location.href = plan.feedbackPath || "/review";
                                }}
                              >
                                查看反馈
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="launch-ref-empty-state">
                        还没有全流程面试记录。点击右上角“发起面试”，先创建一条标准招聘流程。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {isTemplateModalOpen ? (
        <div className="launch-ref-modal-scene" role="dialog" aria-modal="true">
          <button
            type="button"
            className="launch-ref-modal-backdrop"
            aria-label="关闭模板弹窗"
            onClick={() => setIsTemplateModalOpen(false)}
          />
          <div className="template-modal launch-ref-template-modal" data-source="template-modal">
            <div className="modal-head">
              <button
                type="button"
                className="close"
                aria-label="关闭模板弹窗"
                onClick={() => setIsTemplateModalOpen(false)}
              >
                ×
              </button>
              <h2 className="modal-title">选择面试模板</h2>
              <p className="modal-sub">
                {launchFlowMode === "full_flow"
                  ? "全流程模板按“公司 - 岗位 - 流程”独立维护，只会作用在全流程面试，不会影响阶段面试模板。"
                  : "模板将自动填充目标职级、面试方向、面试强度、题目数量及追问策略，快速配置一场高质量面试。"}
              </p>
            </div>
            <div className="modal-body">
              <div>
                <div className="search">
                  <span>⌕</span>
                  <input
                    placeholder="搜索模板名称、关键字或场景"
                    value={templateSearch}
                    onChange={(event) => setTemplateSearch(event.target.value)}
                  />
                </div>
                <div className="tabs">
                  <button
                    type="button"
                    className={`tab ${activeTemplateCategory === "all" ? "active" : ""}`}
                    onClick={() => setActiveTemplateCategory("all")}
                  >
                    全部
                  </button>
                  {launchFlowMode === "stage" ? (
                    <>
                      <button
                        type="button"
                        className={`tab ${activeTemplateCategory === "campus" ? "active" : ""}`}
                        onClick={() => setActiveTemplateCategory("campus")}
                      >
                        校招
                      </button>
                      <button
                        type="button"
                        className={`tab ${activeTemplateCategory === "social" ? "active" : ""}`}
                        onClick={() => setActiveTemplateCategory("social")}
                      >
                        社招
                      </button>
                      <button
                        type="button"
                        className={`tab ${activeTemplateCategory === "senior" ? "active" : ""}`}
                        onClick={() => setActiveTemplateCategory("senior")}
                      >
                        高阶
                      </button>
                      <button
                        type="button"
                        className={`tab ${activeTemplateCategory === "ai" ? "active" : ""}`}
                        onClick={() => setActiveTemplateCategory("ai")}
                      >
                        AI岗
                      </button>
                      <button
                        type="button"
                        className={`tab ${activeTemplateCategory === "english" ? "active" : ""}`}
                        onClick={() => setActiveTemplateCategory("english")}
                      >
                        英文
                      </button>
                      <button
                        type="button"
                        className={`tab ${activeTemplateCategory === "hr" ? "active" : ""}`}
                        onClick={() => setActiveTemplateCategory("hr")}
                      >
                        HR
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={`tab ${activeTemplateCategory === "mine" ? "active" : ""}`}
                    onClick={() => setActiveTemplateCategory("mine")}
                  >
                    我的模板
                  </button>
                </div>
                <div className="template-list">
                  {filteredTemplates.length > 0 ? (
                    filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`tpl-card ${
                          (selectedTemplateId ? selectedTemplateId === template.id : previewTemplate?.id === template.id)
                            ? "active"
                            : ""
                        }`}
                        onClick={() => {
                          applyTemplate(template);
                        }}
                      >
                        <span className="tpl-icon">{template.origin === "private" ? "★" : "</>"}</span>
                        <div>
                          <div className="tpl-title">
                            {template.label}
                            <span className={`pill ${template.origin === "private" ? "soft" : "blue"}`}>
                              {template.origin === "private" ? "我的模板" : "官方"}
                            </span>
                            <span className="pill">{template.intensity}</span>
                          </div>
                          <div className="tpl-line">{template.audience}</div>
                          <div className="tpl-line">{template.focus}</div>
                          <div className="tpl-line">
                            {template.questionRange}　　　　{template.durationRange}
                          </div>
                        </div>
                        <span className="star">
                          {(selectedTemplateId ? selectedTemplateId === template.id : previewTemplate?.id === template.id)
                            ? "●"
                            : "☆"}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="v2-review-empty">
                      暂无匹配模板。你可以先保存当前配置，稍后直接在这里复用。
                    </div>
                  )}
                </div>
              </div>
              <aside className="preview-pane">
                <h3>模板预览</h3>
                {previewTemplate ? (
                  <>
                    <div className="launch-ref-template-preview__meta launch-ref-template-preview__meta--plain">
                      <div className="launch-ref-template-preview__symbol">{previewTemplate.origin === "private" ? "★" : "</>"}</div>
                      <div>
                        <strong>{previewTemplate.label}</strong>
                        <p>{previewTemplate.audience.replace("适合：", "")}</p>
                      </div>
                    </div>
                    <div className="v2-preview-lines">
                      <div className="v2-preview-line">
                        <span>目标职级</span>
                        <b>{previewTemplate.targetLevel}</b>
                      </div>
                      <div className="v2-preview-line">
                        <span>{launchFlowMode === "full_flow" ? "目标公司 / 岗位" : "面试方向"}</span>
                        <b>
                          {launchFlowMode === "full_flow"
                            ? `${previewTemplate.companyName || "待定公司"} / ${previewTemplate.roleName || "待定岗位"}`
                            : previewTemplate.focus.replace("重点：", "")}
                        </b>
                      </div>
                      <div className="v2-preview-line">
                        <span>面试强度</span>
                        <b>{previewTemplate.intensity}</b>
                      </div>
                      <div className="v2-preview-line">
                        <span>{launchFlowMode === "full_flow" ? "流程 / 节奏" : "题量 / 时长"}</span>
                        <b>
                          {previewTemplate.questionRange.replace("题量：", "")} /{" "}
                          {previewTemplate.durationRange.replace("时长：", "")}
                        </b>
                      </div>
                    </div>
                    <div className="launch-ref-template-preview__fill">
                      <strong>将自动填充</strong>
                      <div className="launch-ref-template-preview__fill-list">
                        <div className="v2-preview-line">
                          <span>目标职级</span>
                          <b>{previewTemplate.targetLevel}</b>
                        </div>
                        <div className="v2-preview-line">
                          <span>面试方向</span>
                          <b>{previewTemplate.focusKeyword}</b>
                        </div>
                        <div className="v2-preview-line">
                          <span>面试强度</span>
                          <b>{previewTemplate.intensity}</b>
                        </div>
                        <div className="v2-preview-line">
                          <span>{launchFlowMode === "full_flow" ? "流程编排" : "题目数量"}</span>
                          <b>{previewTemplate.questionRange.replace("题量：", "")}</b>
                        </div>
                        <div className="v2-preview-line">
                          <span>{launchFlowMode === "full_flow" ? "采集策略" : "面试时长"}</span>
                          <b>{previewTemplate.durationRange.replace("时长：", "")}</b>
                        </div>
                      </div>
                    </div>
                    <div className="launch-ref-template-preview__actions">
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => setIsTemplateModalOpen(false)}
                      >
                        使用这个模板
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="page-sub">选择左侧模板后，这里会展示模板预览。</p>
                )}
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {isSaveTemplateModalOpen ? (
        <div className="v2-review-modal" role="dialog" aria-modal="true">
          <div className="v2-review-modal__card card v2-launch-save-dialog">
            <div className="v2-launch-drawer__header" style={{ marginBottom: "1rem" }}>
              <div>
                <h3>保存为模板</h3>
                <p>这次会真实保存到你的账号下，后续在模板抽屉中可直接复用。</p>
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">模板名称</label>
              <input
                className="input-control"
                value={templateDraftName}
                placeholder="例如：字节测试开发冲刺模板"
                onChange={(event) => {
                  setTemplateDraftName(event.target.value);
                  setTemplateSaveError("");
                }}
              />
            </div>
            <div className="v2-launch-confirm__panel" style={{ marginTop: "1rem" }}>
              <strong>将保存以下配置</strong>
              <div className="v2-preview-lines">
                <div className="v2-preview-line">
                  <span>目标岗位</span>
                  <b>{targetRoleName.trim() || "未填写"}</b>
                </div>
                <div className="v2-preview-line">
                  <span>目标公司</span>
                  <b>{companyName.trim() || "未填写"}</b>
                </div>
                <div className="v2-preview-line">
                  <span>模板类型</span>
                  <b>{launchFlowMode === "full_flow" ? "全流程模板" : "阶段模板"}</b>
                </div>
                <div className="v2-preview-line">
                  <span>面试方式</span>
                  <b>{getSelectedModeLabel()}</b>
                </div>
                <div className="v2-preview-line">
                  <span>面试强度</span>
                  <b>{resolvedInterviewIntensity}</b>
                </div>
                {launchFlowMode === "stage" ? (
                  <div className="v2-preview-line">
                    <span>结束方式</span>
                    <b>{currentLimitStrategy.summary}</b>
                  </div>
                ) : (
                  <div className="v2-preview-line">
                    <span>流程形态</span>
                    <b>一面 → 二面 → 三面 → HR 面</b>
                  </div>
                )}
                  <div className="v2-preview-line">
                    <span>简历正文</span>
                    <b>{resumeText.trim() ? "一起保存" : "未填写"}</b>
                  </div>
              </div>
            </div>
            <p className="v2-launch-inline-error" style={{ marginTop: "1rem" }}>
              {templateSaveError || "保存后会立即出现在模板抽屉的“我的模板”列表中。"}
            </p>
            <div className="v2-review-modal__actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setIsSaveTemplateModalOpen(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={isSavingTemplate}
                onClick={() => {
                  void saveCurrentTemplate();
                }}
              >
                {isSavingTemplate ? "保存中..." : "确认保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isConfirmModalOpen ? (
        <div className="v2-review-modal" role="dialog" aria-modal="true">
          <div className="v2-review-modal__card card v2-launch-dialog v2-launch-dialog--confirm">
            <div className="v2-launch-confirm">
              <div className="v2-launch-confirm__visual">
                {!portraitLoadFailed ? (
                  <img
                    src={confirmPortraitUrl}
                    alt="面试官形象预览"
                    className="v2-launch-confirm__portrait"
                    onError={() => setPortraitLoadFailed(true)}
                  />
                ) : (
                  <div className="v2-launch-confirm__portrait-fallback">
                    <span>{confirmInterviewerName.slice(0, 2)}</span>
                    <small>{confirmInterviewerStyle}</small>
                  </div>
                )}
                <div className="v2-launch-confirm__visual-meta">
                  <span className="pill blue">
                    {launchFlowMode === "stage" ? "阶段面试" : "全流程面试"}
                  </span>
                  <strong>{confirmInterviewerName}</strong>
                  <p>{confirmInterviewerStyle}</p>
                </div>
              </div>
              <div className="v2-launch-confirm__summary">
                <h3>{launchFlowMode === "stage" ? "确认阶段面试配置" : "确认预约全流程面试"}</h3>
                <p>
                  {launchFlowMode === "stage"
                    ? "确认后会先做真实画像解析，再进入本场面试。开始入口只保留在这个确认弹窗里，不再藏在页面别的位置。"
                    : "确认后会立即创建真实面试计划，并把公司、岗位、职级和流程状态带入面试间。"}
                </p>
                <div className="v2-launch-confirm__summary-grid">
                  <div className="v2-launch-confirm__panel">
                    <strong>本场参数</strong>
                    <div className="v2-preview-lines">
                      <div className="v2-preview-line">
                        <span>目标公司</span>
                        <b>{companyName.trim() || "未填写"}</b>
                      </div>
                      <div className="v2-preview-line">
                        <span>目标岗位</span>
                        <b>{targetRoleName.trim() || "将根据简历自动识别"}</b>
                      </div>
                      <div className="v2-preview-line">
                        <span>目标职级</span>
                        <b>{targetLevel}</b>
                      </div>
                      <div className="v2-preview-line">
                        <span>面试方式</span>
                        <b>{getSelectedModeLabel()}</b>
                      </div>
                      <div className="v2-preview-line">
                        <span>面试强度</span>
                        <b>{resolvedInterviewIntensity}</b>
                      </div>
                      {launchFlowMode === "stage" ? (
                        <>
                          <div className="v2-preview-line">
                            <span>模板</span>
                            <b>{selectedTemplate?.label ?? "未选择模板"}</b>
                          </div>
                          <div className="v2-preview-line">
                            <span>结束方式</span>
                            <b>{currentLimitStrategy.summary}</b>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="v2-launch-confirm__panel">
                    <strong>开始后会发生什么</strong>
                    <div className="v2-launch-confirm__theme-list">
                      <div className="v2-launch-confirm__theme-item">
                        <span>第 1 步</span>
                        <p>用真实简历和真实 JD 生成岗位画像，不补造经历、不伪造背景。</p>
                      </div>
                      <div className="v2-launch-confirm__theme-item">
                        <span>第 2 步</span>
                        <p>
                          {launchFlowMode === "stage"
                            ? "进入你刚才确认的文字 / 实时 / AI 行为面试，保留重点、强度和结束策略。"
                            : "创建真实全流程计划，并把公司考察方向和轮次状态一并写入。"}
                        </p>
                      </div>
                      <div className="v2-launch-confirm__theme-item">
                        <span>第 3 步</span>
                        <p>
                          {launchFlowMode === "stage"
                            ? "完成后会继续沉淀报告、画像与复盘，不会丢掉本场上下文。"
                            : "后续每轮推进会继续沉淀阶段记录、Agent 运行记录和复盘样本。"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {companyExperienceThemes.length > 0 ? (
                  <div className="v2-launch-confirm__panel">
                    <strong>当前公司常见考察方向</strong>
                    <div className="v2-launch-confirm__chips">
                      {companyExperienceThemes.map((item) => (
                        <span key={`confirm-${item.stageType}-${item.label}`} className="pill blue">
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="v2-review-modal__actions">
              <button className="btn btn-outline" type="button" onClick={() => setIsConfirmModalOpen(false)}>
                返回修改
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (launchFlowMode === "stage") {
                    setIsConfirmModalOpen(false);
                    handleStartAnalysis();
                    return;
                  }

                  void startFullFlowInterview();
                }}
              >
                {launchFlowMode === "stage" ? "确认并开始" : "确认并预约"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div id="loading-overlay" className={`loading-overlay ${isBusy ? "active" : ""}`}>
        <div className="spinner" />
        <h3 style={{ marginBottom: "0.5rem" }}>
          {launchFlowMode === "stage" ? "正在生成本场面试画像" : "正在初始化全流程面试"}
        </h3>
        <p className="text-muted" style={{ fontFamily: "var(--font-ui)" }}>
          {launchFlowMode === "stage"
            ? "正在处理你的真实配置和简历内容，请稍候..."
            : "正在根据岗位、部门、公司与简历准备本场全流程面试，请稍候..."}
        </p>
        {launchFlowMode === "full_flow" ? (
          <div className="launch-ref-init-stepper">
            {fullFlowInitSteps.map((item) => {
              const stepStatus = getFullFlowInitStepStatus(fullFlowInitStage, item.key);
              return (
                <div
                  key={item.key}
                  className={`launch-ref-init-step ${stepStatus === "active" ? "is-active" : stepStatus === "done" ? "is-done" : ""}`}
                >
                  <span className="launch-ref-init-step__dot" />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <div
          style={{
            width: "80%",
            maxWidth: "400px",
            backgroundColor: "var(--border-color)",
            height: "4px",
            borderRadius: "2px",
            marginTop: "1.5rem",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              backgroundColor: "var(--accent-green)",
              height: "100%",
              transition: "width 0.1s linear",
            }}
          />
        </div>
      </div>
    </>
  );
}
