import type { ContentSection, DraftSummary } from "../db/learningDb";
import { buildKnowledgeTopicProfile } from "./sourceDiscovery";

export type FormalSectionKey = "summary" | "analysis" | "artifacts" | "interview";
export type ArtifactKey = "flowchart" | "architecture" | "codeExample";

export type ArtifactRequirement = {
  key: ArtifactKey;
  label: string;
  required: boolean;
  reason: string;
};

export type DraftQualityChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type DraftQualityCheck = {
  publishReady: boolean;
  blockingIssues: string[];
  checklist: DraftQualityChecklistItem[];
  artifactRequirements: ArtifactRequirement[];
  purityRiskKeywords: string[];
};

const FORMAL_SECTION_TITLES: Record<FormalSectionKey, string> = {
  summary: "总结归纳",
  analysis: "正文解析",
  artifacts: "流程图/架构图/代码实例",
  interview: "面试常考",
};

const SECTION_ALIASES: Record<FormalSectionKey, string[]> = {
  summary: ["总结归纳", "核心摘要", "核心总结", "摘要速览"],
  analysis: ["正文解析", "底层原理剖析", "原理解析", "深入解析", "正文拆解"],
  artifacts: ["流程图/架构图/代码实例", "图解与代码实例", "深度图解 (Mermaid)", "图解与代码示例"],
  interview: ["面试常考", "高频面试题", "面试问答", "常考问题"],
};

const MISSING_MARKER = "[缺失标记]";
const OPTIONAL_MARKER = "[按主题可选]";

const FLOWCHART_KEYWORDS = [
  "流程",
  "链路",
  "工作流",
  "pipeline",
  "路由",
  "渲染",
  "生命周期",
  "调度",
  "扩容",
  "垃圾回收",
  "gc",
  "事务",
  "请求",
  "执行",
  "编译",
  "发布",
  "排障",
];

const ARCHITECTURE_KEYWORDS = [
  "架构",
  "系统",
  "模块",
  "组件",
  "分层",
  "容器",
  "agent",
  "rag",
  "jvm",
  "浏览器",
  "router",
  "pinia",
  "next.js",
  "nuxt",
  "spring",
];

const CODE_SKIP_KEYWORDS = ["面试题", "面试表达", "总览", "概览", "术语", "常见问题", "课题总览"];
const CODE_FORCE_KEYWORDS = [
  "源码",
  "语法",
  "api",
  "hook",
  "组件",
  "集合",
  "并发",
  "typescript",
  "javascript",
  "java",
  "vue",
  "react",
  "vite",
  "router",
  "pinia",
  "maven",
  "spring",
  "jvm",
  "事务",
  "工程化",
  "agent",
  "rag",
];

/**
 * 统一规范化章节标题，便于做固定骨架与历史别名映射。
 * @param {string} value 原始章节标题。
 * @returns {string} 去空格、小写后的比对字符串。
 */
function normalizeSectionTitle(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

/**
 * 为章节生成一个稳定的回退 ID。
 * @param {string} title 章节标题。
 * @returns {string} 适合文档块使用的稳定 ID。
 */
function buildSectionId(title: string): string {
  const normalized = normalizeSectionTitle(title);
  return normalized || "section";
}

/**
 * 收集一个章节中的全部文本，便于做关键字和缺失标记检查。
 * @param {ContentSection | undefined} section 目标章节。
 * @returns {string} 合并后的纯文本视图。
 */
function collectSectionText(section: ContentSection | undefined): string {
  if (!section) {
    return "";
  }
  return [...(section.paragraphs ?? []), ...(section.bullets ?? []), section.callout ?? ""]
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * 判断一个章节是否已经具备可发布的有效内容，而不是仅有缺失占位。
 * @param {ContentSection | undefined} section 目标章节。
 * @returns {boolean} 是否包含有效正文。
 */
function hasMeaningfulContent(section: ContentSection | undefined): boolean {
  if (!section) {
    return false;
  }

  const fragments = [...(section.paragraphs ?? []), ...(section.bullets ?? []), section.callout ?? ""]
    .map((item) => item.trim())
    .filter(Boolean);

  if (fragments.length === 0) {
    return false;
  }

  return fragments.some((item) => !item.includes(MISSING_MARKER) && item.replace(/\s+/g, "").length >= 8);
}

/**
 * 为固定骨架中的缺失块生成统一提示，避免系统用空话补位。
 * @param {string} label 缺失块名称。
 * @param {string} reason 为什么该块必须或应该补齐。
 * @returns {string} 固定格式的缺失提示文本。
 */
export function buildMissingBlockNote(label: string, reason: string): string {
  return `${MISSING_MARKER} 当前主题缺少「${label}」，原因：${reason}。暂未拿到可核对依据时，必须保持缺失标记，禁止用空泛描述填充。`;
}

/**
 * 为按主题可选的块生成统一说明，避免审核时误判为强制缺失。
 * @param {string} label 可选块名称。
 * @returns {string} 固定格式的可选说明文本。
 */
export function buildOptionalBlockNote(label: string): string {
  return `${OPTIONAL_MARKER} 当前主题暂不强制要求「${label}」，如后续拿到可信依据可补充。`;
}

/**
 * 匹配一个章节属于固定骨架中的哪一类。
 * @param {string} title 章节标题。
 * @returns {FormalSectionKey | null} 固定骨架键，未命中时返回 `null`。
 */
function matchFormalSectionKey(title: string): FormalSectionKey | null {
  const normalized = normalizeSectionTitle(title);
  for (const key of Object.keys(SECTION_ALIASES) as FormalSectionKey[]) {
    if (SECTION_ALIASES[key].some((alias) => normalizeSectionTitle(alias) === normalized)) {
      return key;
    }
  }
  return null;
}

/**
 * 从草稿标题中提取主课题，兼容“课题 · 章节”命名方式。
 * @param {string} topic 草稿标题。
 * @returns {string} 主课题文本。
 */
function extractPrimaryTopic(topic: string): string {
  return topic
    .split("·")[0]
    .split("|")[0]
    .trim();
}

/**
 * 根据主题判断哪些图例或代码块是正式文档必须补齐的。
 * @param {string} topic 草稿标题或主题文本。
 * @returns {ArtifactRequirement[]} 三类块的要求清单。
 */
export function resolveArtifactRequirements(topic: string): ArtifactRequirement[] {
  const haystack = topic.trim().toLowerCase();
  const flowchartRequired = FLOWCHART_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
  const architectureRequired = ARCHITECTURE_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
  const codeExampleRequired =
    CODE_FORCE_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase())) ||
    !CODE_SKIP_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));

  return [
    {
      key: "flowchart",
      label: "流程图",
      required: flowchartRequired,
      reason: flowchartRequired ? "主题包含流程、链路或生命周期特征，需要图解执行顺序。" : "当前主题不以流程链路为主。",
    },
    {
      key: "architecture",
      label: "架构图",
      required: architectureRequired,
      reason: architectureRequired ? "主题包含系统、模块、组件或分层关系，需要展示结构边界。" : "当前主题不以系统结构为主。",
    },
    {
      key: "codeExample",
      label: "代码实例",
      required: codeExampleRequired,
      reason: codeExampleRequired ? "主题涉及实现或源码理解，需要用代码落到具体写法。" : "当前主题更偏概览或问答，不强制要求代码实例。",
    },
  ];
}

/**
 * 确保“流程图/架构图/代码实例”章节至少带有固定的块标签与降级策略。
 * @param {ContentSection} section 已存在的章节。
 * @param {ArtifactRequirement[]} requirements 当前主题的块要求。
 * @returns {ContentSection} 已规范化的图例章节。
 */
function normalizeArtifactSection(section: ContentSection, requirements: ArtifactRequirement[]): ContentSection {
  const paragraphs = [...(section.paragraphs ?? [])];
  const text = paragraphs.join("\n");

  if (!paragraphs.some((item) => item.includes("当前主题要求："))) {
    const requiredLabels = requirements.filter((item) => item.required).map((item) => item.label);
    paragraphs.unshift(
      `当前主题要求：${requiredLabels.length ? requiredLabels.join("、") : "当前图例块均为按主题可选"}。缺失时必须明确标记，禁止废话填充。`
    );
  }

  for (const requirement of requirements) {
    if (text.includes(requirement.label)) {
      continue;
    }
    paragraphs.push(`**${requirement.label}**`);
    paragraphs.push(
      requirement.required
        ? buildMissingBlockNote(requirement.label, requirement.reason)
        : buildOptionalBlockNote(requirement.label)
    );
  }

  return {
    ...section,
    id: section.id || buildSectionId(FORMAL_SECTION_TITLES.artifacts),
    h2: FORMAL_SECTION_TITLES.artifacts,
    paragraphs,
  };
}

/**
 * 构造固定骨架缺失时的默认占位章节。
 * @param {FormalSectionKey} key 固定章节键。
 * @param {ArtifactRequirement[]} requirements 当前主题的图例要求。
 * @returns {ContentSection} 标准化后的缺失占位章节。
 */
function createMissingSection(key: FormalSectionKey, requirements: ArtifactRequirement[]): ContentSection {
  if (key === "artifacts") {
    return normalizeArtifactSection(
      {
        id: buildSectionId(FORMAL_SECTION_TITLES.artifacts),
        h2: FORMAL_SECTION_TITLES.artifacts,
        paragraphs: [],
      },
      requirements
    );
  }

  if (key === "interview") {
    return {
      id: buildSectionId(FORMAL_SECTION_TITLES.interview),
      h2: FORMAL_SECTION_TITLES.interview,
      bullets: [buildMissingBlockNote("面试常考", "正式文档至少要提供 3 个围绕主题的高频追问。")],
    };
  }

  return {
    id: buildSectionId(FORMAL_SECTION_TITLES[key]),
    h2: FORMAL_SECTION_TITLES[key],
    paragraphs: [
      buildMissingBlockNote(
        FORMAL_SECTION_TITLES[key],
        key === "summary" ? "正式文档必须先给出可快速浏览的总结归纳。" : "正式文档必须给出基于正文的真实解析。"
      ),
    ],
  };
}

/**
 * 将任意草稿对齐到正式文档固定骨架，兼容旧标题和缺块情况。
 * @param {DraftSummary} summary 原始草稿摘要。
 * @returns {DraftSummary} 已对齐固定骨架的草稿摘要。
 */
export function alignDraftToFormalTemplate(summary: DraftSummary): DraftSummary {
  const requirements = resolveArtifactRequirements(summary.topic);
  const sections = summary.content.sections ?? [];
  const matched = new Map<FormalSectionKey, ContentSection>();
  const extras: ContentSection[] = [];

  for (const section of sections) {
    const key = matchFormalSectionKey(section.h2);
    if (!key || matched.has(key)) {
      extras.push(section);
      continue;
    }
    matched.set(key, section);
  }

  const formalSections = (Object.keys(FORMAL_SECTION_TITLES) as FormalSectionKey[]).map((key) => {
    const section = matched.get(key);
    if (!section) {
      return createMissingSection(key, requirements);
    }
    if (key === "artifacts") {
      return normalizeArtifactSection(section, requirements);
    }
    return {
      ...section,
      id: section.id || buildSectionId(FORMAL_SECTION_TITLES[key]),
      h2: FORMAL_SECTION_TITLES[key],
    };
  });

  return {
    ...summary,
    content: {
      ...summary.content,
      sections: [...formalSections, ...extras],
    },
  };
}

/**
 * 检查图例章节是否满足某个具体块的要求。
 * @param {string} text 图例章节全文。
 * @param {ArtifactRequirement} requirement 当前块要求。
 * @returns {{ passed: boolean; detail: string }} 检查结果与说明。
 */
function inspectArtifactBlock(
  text: string,
  requirement: ArtifactRequirement
): { passed: boolean; detail: string } {
  const lowerText = text.toLowerCase();
  const hasMermaid = /```mermaid[\s\S]*?```/i.test(text);
  const hasCodeFence = /```(?!mermaid)[a-z0-9_-]*\n[\s\S]*?```/i.test(text);
  const markedMissing = lowerText.includes("缺失标记") && lowerText.includes(requirement.label.toLowerCase());

  if (!requirement.required) {
    return {
      passed: true,
      detail: `按主题可选：${requirement.reason}`,
    };
  }

  if (requirement.key === "flowchart") {
    if (hasMermaid && (/流程图/.test(text) || /flowchart|sequencediagram|statediagram/i.test(text))) {
      return { passed: true, detail: "已提供可核对的流程图内容。" };
    }
    if (markedMissing) {
      return { passed: false, detail: "流程图已明确标记缺失，当前仍不可发布。" };
    }
    return { passed: false, detail: "缺少流程图，且未明确做缺失标记。" };
  }

  if (requirement.key === "architecture") {
    if (hasMermaid && /架构图|系统结构|分层图|模块图/i.test(text)) {
      return { passed: true, detail: "已提供可核对的架构图内容。" };
    }
    if (markedMissing) {
      return { passed: false, detail: "架构图已明确标记缺失，当前仍不可发布。" };
    }
    return { passed: false, detail: "缺少架构图，且未明确做缺失标记。" };
  }

  if (hasCodeFence && /代码实例|示例代码|sample/i.test(text)) {
    return { passed: true, detail: "已提供代码实例。" };
  }
  if (markedMissing) {
    return { passed: false, detail: "代码实例已明确标记缺失，当前仍不可发布。" };
  }
  return { passed: false, detail: "缺少代码实例，且未明确做缺失标记。" };
}

/**
 * 对正式文档草稿做发布前质量检查，覆盖固定骨架、缺失标记和主题纯度。
 * @param {DraftSummary} summary 草稿摘要。
 * @returns {DraftQualityCheck} 可直接用于审核页和发布前拦截的检查结果。
 */
export function inspectDraftQuality(summary: DraftSummary): DraftQualityCheck {
  const aligned = alignDraftToFormalTemplate(summary);
  const sections = aligned.content.sections ?? [];
  const sectionMap = new Map<FormalSectionKey, ContentSection>();

  for (const section of sections) {
    const key = matchFormalSectionKey(section.h2);
    if (key && !sectionMap.has(key)) {
      sectionMap.set(key, section);
    }
  }

  const summarySection = sectionMap.get("summary");
  const analysisSection = sectionMap.get("analysis");
  const artifactSection = sectionMap.get("artifacts");
  const interviewSection = sectionMap.get("interview");
  const artifactRequirements = resolveArtifactRequirements(aligned.topic);
  const artifactText = collectSectionText(artifactSection);
  const primaryTopic = extractPrimaryTopic(aligned.topic) || aligned.topic.trim() || "未命名课题";
  const profile = buildKnowledgeTopicProfile(primaryTopic);
  const fullText = sections.map((section) => collectSectionText(section)).join("\n").toLowerCase();
  const purityRiskKeywords = profile.excludeKeywords.filter((keyword) => fullText.includes(keyword.toLowerCase()));

  const checklist: DraftQualityChecklistItem[] = [
    {
      key: "formal-structure",
      label: "固定骨架完整",
      passed: !!summarySection && !!analysisSection && !!artifactSection && !!interviewSection,
      detail: "正式文档需固定包含总结归纳、正文解析、流程图/架构图/代码实例、面试常考四块。",
    },
    {
      key: "summary-ready",
      label: "总结归纳可发布",
      passed: hasMeaningfulContent(summarySection),
      detail: hasMeaningfulContent(summarySection)
        ? "总结归纳已具备有效内容。"
        : "总结归纳仍为空或只剩缺失标记。",
    },
    {
      key: "analysis-ready",
      label: "正文解析可发布",
      passed: hasMeaningfulContent(analysisSection),
      detail: hasMeaningfulContent(analysisSection)
        ? "正文解析已具备有效内容。"
        : "正文解析仍为空或只剩缺失标记。",
    },
  ];

  for (const requirement of artifactRequirements) {
    const inspection = inspectArtifactBlock(artifactText, requirement);
    checklist.push({
      key: `artifact-${requirement.key}`,
      label: `${requirement.label}检查`,
      passed: inspection.passed,
      detail: inspection.detail,
    });
  }

  const interviewBullets = (interviewSection?.bullets ?? []).filter(
    (item) => item.trim() && !item.includes(MISSING_MARKER)
  );
  checklist.push({
    key: "interview-ready",
    label: "面试常考可发布",
    passed: interviewBullets.length >= 3,
    detail:
      interviewBullets.length >= 3
        ? `已提供 ${interviewBullets.length} 条面试常考。`
        : "面试常考少于 3 条，或仍然只是缺失占位。",
  });

  checklist.push({
    key: "topic-purity",
    label: "主题纯度检查",
    passed: purityRiskKeywords.length === 0,
    detail:
      purityRiskKeywords.length === 0
        ? `当前未发现明显越界关键词，边界为：${profile.boundarySummary}`
        : `检测到疑似越界关键词：${purityRiskKeywords.join("、")}`,
  });

  const blockingIssues = checklist.filter((item) => !item.passed).map((item) => `${item.label}：${item.detail}`);
  return {
    publishReady: blockingIssues.length === 0,
    blockingIssues,
    checklist,
    artifactRequirements,
    purityRiskKeywords,
  };
}
