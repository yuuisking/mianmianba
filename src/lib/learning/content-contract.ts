import type { Prisma } from "@prisma/client";

export type ArticleSectionType = "text" | "diagram" | "code" | "mistake" | "comparison" | "quiz";

export type ScorePoint = {
  point: string;
  why?: string;
  weight?: string;
};

export type DeductPoint = {
  point: string;
  why?: string;
};

export type FollowUp = {
  question: string;
  difficulty?: "easy" | "medium" | "hard";
  keyAnswer?: string;
};

export type GradingCriterion = {
  criterion: string;
  points: number;
  description: string;
};

export type SelfTest = {
  label?: string;
  question: string;
  hint?: string;
  answer?: string;
  gradingCriteria?: GradingCriterion[];
};

export type CodeExample = {
  title: string;
  language: string;
  code: string;
  explanation?: string;
};

export type MistakeItem = {
  mistake: string;
  whyWrong?: string;
  correct?: string;
};

export type ComparisonTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

export type DiagramFlowNode = {
  id: string;
  label: string;
  shortLabel?: string;
};

export type DiagramFlowEdge = {
  from: string;
  to: string;
  label?: string;
};

export type StandardDiagramSpec = {
  type: "flow";
  title?: string;
  notes?: string[];
  nodes: DiagramFlowNode[];
  edges: DiagramFlowEdge[];
};

export type LearningSource = {
  title: string;
  url: string;
  type?: string;
  applicableVersion?: string;
  facts?: string[];
  reviewedAt?: string;
};

export type ArticleSection = {
  id: string;
  type: ArticleSectionType;
  heading?: string;
  body?: string;
  highlight?: string;
  diagramCode?: string;
  fallbackDescription?: string;
  diagramSpec?: StandardDiagramSpec;
  codeExample?: CodeExample;
  mistake?: MistakeItem;
  comparison?: ComparisonTable;
  quiz?: SelfTest;
};

export type LearningArticle = {
  conclusion: string;
  keyTakeaways: string[];
  learningGoals: string[];
  plainSummary?: string;
  plainRetell?: string;
  strongSummary?: string;
  sections: ArticleSection[];
};

export type LearningContent = {
  templateType?: "concept" | "principle" | "comparison" | "governance" | "design";
  examPoint?: string;
  summary?: string;
  scenario?: string;
  prerequisites?: string[];
  quickCard?: {
    keyPoints: Array<{
      number: number;
      title: string;
      summary: string;
    }>;
    interviewAnswer: string;
  };
  concepts?: Array<{ name: string; description: string }>;
  details?: Array<{ title: string; content: string }>;
  diagrams?: string[];
  codeExamples?: CodeExample[];
  commonMistakes?: MistakeItem[];
  comparisons?: ComparisonTable[];
  selfTests?: SelfTest[];
  sources?: LearningSource[];
  article?: LearningArticle;
};

export type InterviewContent = {
  question: string;
  questionVariants: string[];
  answer30s: string;
  answer2min: string;
  advancedAnswer: string;
  essentialPoints: ScorePoint[];
  bonusPoints: ScorePoint[];
  advancedPoints: ScorePoint[];
  deductPoints: DeductPoint[];
  followUps: FollowUp[];
};

export type QualityReportPayload = {
  totalScore?: number | null;
  factScore?: number | null;
  learningScore?: number | null;
  interviewScore?: number | null;
  originalityScore?: number | null;
  readabilityScore?: number | null;
  codeDiagramScore?: number | null;
  issues?: string[];
  suggestions?: string[];
  pass?: boolean;
};

export type EngineeringValidationCheck = {
  name: string;
  pass: boolean;
  detail?: string;
};

export type EngineeringValidationResult = {
  pass: boolean;
  checks: EngineeringValidationCheck[];
};

export type DeepReadValidationResult = {
  ready: boolean;
  templateType: NonNullable<LearningContent["templateType"]>;
  missingBlocks: string[];
};

/**
 * 将未知 JSON 结构规范化为字符串数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {string[]} 过滤空值后的字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

/**
 * 将未知 JSON 收口为来源与可信度字段，统一适配版本、引用事实和最近复核时间。
 * @param {unknown} value 任意 JSON 值。
 * @returns {LearningSource[]} 标准化后的来源数组。
 */
function normalizeLearningSources(value: unknown): LearningSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const source = item as Record<string, unknown>;
      const title = typeof source.title === "string" ? source.title.trim() : "";
      const url = typeof source.url === "string" ? source.url.trim() : "";
      if (!title && !url) {
        return null;
      }

      return {
        title,
        url,
        type: typeof source.type === "string" ? source.type.trim() : undefined,
        applicableVersion: typeof source.applicableVersion === "string" ? source.applicableVersion.trim() : undefined,
        facts: normalizeStringArray(source.facts),
        reviewedAt: typeof source.reviewedAt === "string" ? source.reviewedAt.trim() : undefined,
      } satisfies LearningSource;
    })
    .filter((item): item is LearningSource => Boolean(item));
}

/**
 * 将未知 JSON 收口为标准流程图节点数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {DiagramFlowNode[]} 标准化后的流程图节点。
 */
function normalizeDiagramNodes(value: unknown): DiagramFlowNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      if (!label) {
        return null;
      }

      return {
        id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `node-${index + 1}`,
        label,
        shortLabel: typeof record.shortLabel === "string" ? record.shortLabel.trim() : undefined,
      } satisfies DiagramFlowNode;
    })
    .filter((item): item is DiagramFlowNode => Boolean(item));
}

/**
 * 将未知 JSON 收口为标准流程图边数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {DiagramFlowEdge[]} 标准化后的流程图边。
 */
function normalizeDiagramEdges(value: unknown): DiagramFlowEdge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const from = typeof record.from === "string" ? record.from.trim() : "";
      const to = typeof record.to === "string" ? record.to.trim() : "";
      if (!from || !to) {
        return null;
      }

      return {
        from,
        to,
        label: typeof record.label === "string" ? record.label.trim() : undefined,
      } satisfies DiagramFlowEdge;
    })
    .filter((item): item is DiagramFlowEdge => Boolean(item));
}

/**
 * 将未知 JSON 收口为标准图组件协议。
 * @param {unknown} value 任意 JSON 值。
 * @returns {StandardDiagramSpec | undefined} 可渲染的标准图协议。
 */
function normalizeDiagramSpec(value: unknown): StandardDiagramSpec | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const type = record.type === "flow" ? "flow" : null;
  const nodes = normalizeDiagramNodes(record.nodes);
  const edges = normalizeDiagramEdges(record.edges);

  if (!type || nodes.length === 0 || edges.length === 0) {
    return undefined;
  }

  return {
    type,
    title: typeof record.title === "string" ? record.title.trim() : undefined,
    notes: normalizeStringArray(record.notes),
    nodes,
    edges,
  };
}

/**
 * 规范化章节标题，便于做深读模块门禁判断。
 * @param {string} value 原始标题文本。
 * @returns {string} 去空白后的标题。
 */
function normalizeHeading(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

/**
 * 根据题目标题识别内容类型模板，避免所有主题套同一种骨架。
 * @param {string} title 当前题目标题。
 * @returns {NonNullable<LearningContent["templateType"]>} 文档内容类型。
 */
export function resolveLearningContentTemplateType(
  title: string
): NonNullable<LearningContent["templateType"]> {
  const normalized = title.trim();
  if (/区别|对比|差异|vs|和.+有什么区别/.test(normalized)) {
    return "comparison";
  }
  if (/怎么治理|怎么解决|怎么处理|如何治理|如何限流|为什么会压垮|如何防止/.test(normalized)) {
    return "governance";
  }
  if (/如何设计|怎么设计|设计一个|系统设计|实战|秒杀|分布式锁/.test(normalized)) {
    return "design";
  }
  if (/为什么|原理|底层|工作|机制/.test(normalized)) {
    return "principle";
  }
  return "concept";
}

/**
 * 校验 15 分钟深读是否达到最低结构标准。
 * @param {string} title 当前文档标题。
 * @param {LearningContent} learningContent 学习内容。
 * @returns {DeepReadValidationResult} 深读门禁结果。
 */
export function validateDeepReadReadiness(
  title: string,
  learningContent: LearningContent
): DeepReadValidationResult {
  const article = learningContent.article;
  const selfTests = learningContent.selfTests ?? [];
  const sections = article?.sections ?? [];
  const sectionHeadings = sections.map((section) => normalizeHeading(section.heading ?? ""));
  const fullText = [
    article?.conclusion ?? "",
    article?.plainSummary ?? "",
    article?.plainRetell ?? "",
    article?.strongSummary ?? "",
    ...sections.map((section) => [section.heading, section.body, section.highlight].filter(Boolean).join(" ")),
  ]
    .join(" ")
    .trim();
  const templateType = learningContent.templateType ?? resolveLearningContentTemplateType(title);
  const hasVisualArtifact = sections.some(
    (section) => section.type === "diagram" || section.type === "comparison" || section.type === "code"
  );
  const hasScenario = /真实场景|场景|线上|业务|项目/.test(fullText);
  const hasEngineering = /工程|落地|治理|监控|兜底|取舍|排查|排障|风险/.test(fullText);
  const hasMisunderstanding = /误区|边界|限制|风险|常见坑|坑点/.test(fullText);
  const hasSummary = Boolean(article?.strongSummary && article.strongSummary.trim());
  const hasRetell = Boolean(article?.plainRetell && article.plainRetell.trim());
  const isConcurrencyTopic = /AQS|线程池|volatile|并发|JMM|happens-before|锁|Condition|Semaphore|CountDownLatch/.test(title);
  const hasConcurrencyStructure = /state|CAS|队列|park|unpark|线程状态|可见性|原子性|共享模式|独占模式|任务队列/.test(fullText);
  const hasConcurrencyMapping = /ReentrantLock|Semaphore|CountDownLatch|Condition|ThreadPoolExecutor|synchronized|volatile|AQS|JMM/.test(
    fullText
  );
  const hasConcurrencyDiagnosis = /WAITING|TIMED_WAITING|parking|线程dump|线程 dump|jstack|排查|阻塞/.test(fullText);
  const missingBlocks: string[] = [];

  if (!article?.conclusion?.trim()) {
    missingBlocks.push("一句话结论");
  }
  if ((article?.keyTakeaways.length ?? 0) === 0) {
    missingBlocks.push("本题核心要点");
  }
  if ((article?.learningGoals.length ?? 0) === 0) {
    missingBlocks.push("学完能回答");
  }
  if (!article?.plainSummary?.trim()) {
    missingBlocks.push("用大白话说");
  }
  if (!hasScenario) {
    missingBlocks.push("真实场景");
  }
  if (sections.length < 4) {
    missingBlocks.push("核心原理展开");
  }
  if (!hasVisualArtifact) {
    missingBlocks.push("图解/流程图/对比图");
  }
  if (!hasEngineering) {
    missingBlocks.push("工程落地");
  }
  if (!hasMisunderstanding) {
    missingBlocks.push("常见误区");
  }
  if (!sections.some((section) => section.type === "code")) {
    missingBlocks.push("代码/命令/配置示例");
  }
  if (!hasSummary) {
    missingBlocks.push("最后总结");
  }
  if (!hasRetell) {
    missingBlocks.push("你能这样复述");
  }
  if (selfTests.length < 2) {
    missingBlocks.push("至少 2 道自测");
  }
  if ((learningContent.sources?.length ?? 0) === 0) {
    missingBlocks.push("来源与可信度");
  }

  if (templateType === "comparison" && !sections.some((section) => section.type === "comparison")) {
    missingBlocks.push("对比表");
  }
  if (isConcurrencyTopic && !hasConcurrencyStructure) {
    missingBlocks.push("并发核心机制（状态/队列/可见性等）");
  }
  if (isConcurrencyTopic && !hasConcurrencyMapping) {
    missingBlocks.push("具体 JUC 组件映射");
  }
  if (isConcurrencyTopic && !hasConcurrencyDiagnosis) {
    missingBlocks.push("线程状态或排查视角");
  }

  return {
    ready: missingBlocks.length === 0,
    templateType,
    missingBlocks,
  };
}

/**
 * 将未知 JSON 结构规范化为问答评分标准数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {GradingCriterion[]} 标准化后的评分标准。
 */
function normalizeGradingCriteria(value: unknown): GradingCriterion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const criterion = typeof record.criterion === "string" ? record.criterion.trim() : "";
      const points =
        typeof record.points === "number"
          ? record.points
          : typeof record.fullScore === "number"
            ? record.fullScore
            : typeof record.maxPoints === "number"
              ? record.maxPoints
              : 0;
      const description = typeof record.description === "string" ? record.description.trim() : "";

      if (!criterion) {
        return null;
      }

      return {
        criterion,
        points,
        description,
      } satisfies GradingCriterion;
    })
    .filter((item): item is GradingCriterion => Boolean(item));
}

/**
 * 将未知 JSON 结构规范化为自测题数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {SelfTest[]} 标准化后的自测题数组。
 */
function normalizeSelfTests(value: unknown): SelfTest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const question = typeof record.question === "string" ? record.question.trim() : "";
      if (!question) {
        return null;
      }

      return {
        label:
          typeof record.label === "string"
            ? record.label.trim()
            : typeof record.level === "string"
              ? record.level.trim()
              : undefined,
        question,
        hint: typeof record.hint === "string" ? record.hint.trim() : undefined,
        answer: typeof record.answer === "string" ? record.answer.trim() : undefined,
        gradingCriteria: normalizeGradingCriteria(record.gradingCriteria),
      } satisfies SelfTest;
    })
    .filter((item): item is SelfTest => Boolean(item));
}

/**
 * 将任意对象数组收口为打分点数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {ScorePoint[]} 标准化后的打分点。
 */
function normalizeScorePoints(value: unknown): ScorePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const point = item.trim();
        return point ? ({ point } satisfies ScorePoint) : null;
      }

      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const point = typeof record.point === "string" ? record.point.trim() : "";
      if (!point) {
        return null;
      }

      return {
        point,
        why: typeof record.why === "string" ? record.why.trim() : undefined,
        weight: typeof record.weight === "string" ? record.weight.trim() : undefined,
      } satisfies ScorePoint;
    })
    .filter((item): item is ScorePoint => Boolean(item));
}

/**
 * 将任意对象数组收口为扣分点数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {DeductPoint[]} 标准化后的扣分点。
 */
function normalizeDeductPoints(value: unknown): DeductPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const point = item.trim();
        return point ? ({ point } satisfies DeductPoint) : null;
      }

      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const point = typeof record.point === "string" ? record.point.trim() : "";
      if (!point) {
        return null;
      }

      return {
        point,
        why: typeof record.why === "string" ? record.why.trim() : undefined,
      } satisfies DeductPoint;
    })
    .filter((item): item is DeductPoint => Boolean(item));
}

/**
 * 将任意对象数组收口为追问数组。
 * @param {unknown} value 任意 JSON 值。
 * @returns {FollowUp[]} 标准化后的追问数组。
 */
function normalizeFollowUps(value: unknown): FollowUp[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const question = item.trim();
        return question ? ({ question } satisfies FollowUp) : null;
      }

      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const question = typeof record.question === "string" ? record.question.trim() : "";
      if (!question) {
        return null;
      }

      const difficultyValue = typeof record.difficulty === "string" ? record.difficulty.trim() : undefined;

      return {
        question,
        difficulty:
          difficultyValue === "easy" || difficultyValue === "medium" || difficultyValue === "hard"
            ? difficultyValue
            : undefined,
        keyAnswer: typeof record.keyAnswer === "string" ? record.keyAnswer.trim() : undefined,
      } satisfies FollowUp;
    })
    .filter((item): item is FollowUp => Boolean(item));
}

/**
 * 将未知 JSON 收口为学习内容契约。
 * @param {Prisma.JsonValue | null | undefined} value 数据库存储的学习内容 JSON。
 * @returns {LearningContent} 统一后的学习内容对象。
 */
export function normalizeLearningContent(value?: Prisma.JsonValue | null): LearningContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const article = record.article && typeof record.article === "object" && !Array.isArray(record.article)
    ? (record.article as Record<string, unknown>)
    : null;

  const sections = Array.isArray(article?.sections)
    ? article.sections
        .map((item, index) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const section = item as Record<string, unknown>;
          const typeValue = typeof section.type === "string" ? section.type : "text";
          const type: ArticleSectionType =
            typeValue === "diagram" ||
            typeValue === "code" ||
            typeValue === "mistake" ||
            typeValue === "comparison" ||
            typeValue === "quiz"
              ? typeValue
              : "text";

          return {
            id: typeof section.id === "string" && section.id.trim() ? section.id : `section-${index + 1}`,
            type,
            heading: typeof section.heading === "string" ? section.heading.trim() : undefined,
            body: typeof section.body === "string" ? section.body.trim() : undefined,
            highlight: typeof section.highlight === "string" ? section.highlight.trim() : undefined,
            diagramCode: typeof section.diagramCode === "string" ? section.diagramCode.trim() : undefined,
            fallbackDescription:
              typeof section.fallbackDescription === "string" ? section.fallbackDescription.trim() : undefined,
            diagramSpec: normalizeDiagramSpec(section.diagramSpec),
            codeExample:
              section.codeExample && typeof section.codeExample === "object" && !Array.isArray(section.codeExample)
                ? {
                    title:
                      typeof (section.codeExample as Record<string, unknown>).title === "string"
                        ? ((section.codeExample as Record<string, unknown>).title as string).trim()
                        : "示例",
                    language:
                      typeof (section.codeExample as Record<string, unknown>).language === "string"
                        ? ((section.codeExample as Record<string, unknown>).language as string).trim()
                        : "text",
                    code:
                      typeof (section.codeExample as Record<string, unknown>).code === "string"
                        ? ((section.codeExample as Record<string, unknown>).code as string).trim()
                        : "",
                    explanation:
                      typeof (section.codeExample as Record<string, unknown>).explanation === "string"
                        ? ((section.codeExample as Record<string, unknown>).explanation as string).trim()
                        : undefined,
                  }
                : undefined,
            mistake:
              section.mistake && typeof section.mistake === "object" && !Array.isArray(section.mistake)
                ? {
                    mistake:
                      typeof (section.mistake as Record<string, unknown>).mistake === "string"
                        ? ((section.mistake as Record<string, unknown>).mistake as string).trim()
                        : "",
                    whyWrong:
                      typeof (section.mistake as Record<string, unknown>).whyWrong === "string"
                        ? ((section.mistake as Record<string, unknown>).whyWrong as string).trim()
                        : undefined,
                    correct:
                      typeof (section.mistake as Record<string, unknown>).correct === "string"
                        ? ((section.mistake as Record<string, unknown>).correct as string).trim()
                        : undefined,
                  }
                : undefined,
            comparison:
              section.comparison && typeof section.comparison === "object" && !Array.isArray(section.comparison)
                ? {
                    title:
                      typeof (section.comparison as Record<string, unknown>).title === "string"
                        ? ((section.comparison as Record<string, unknown>).title as string).trim()
                        : "结构对比",
                    headers: normalizeStringArray((section.comparison as Record<string, unknown>).headers),
                    rows: Array.isArray((section.comparison as Record<string, unknown>).rows)
                      ? ((section.comparison as Record<string, unknown>).rows as unknown[])
                          .map((row) =>
                            Array.isArray(row)
                              ? row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? "")))
                              : []
                          )
                          .filter((row) => row.length > 0)
                      : [],
                  }
                : undefined,
            quiz:
              section.quiz && typeof section.quiz === "object" && !Array.isArray(section.quiz)
                ? normalizeSelfTests([section.quiz])[0]
                : undefined,
          } satisfies ArticleSection;
        })
        .filter((item): item is ArticleSection => Boolean(item))
    : [];

  return {
    templateType:
      typeof record.templateType === "string" &&
      ["concept", "principle", "comparison", "governance", "design"].includes(record.templateType)
        ? (record.templateType as LearningContent["templateType"])
        : undefined,
    examPoint: typeof record.examPoint === "string" ? record.examPoint.trim() : undefined,
    summary: typeof record.summary === "string" ? record.summary.trim() : undefined,
    scenario: typeof record.scenario === "string" ? record.scenario.trim() : undefined,
    prerequisites: normalizeStringArray(record.prerequisites),
    quickCard:
      record.quickCard && typeof record.quickCard === "object" && !Array.isArray(record.quickCard)
        ? {
            keyPoints: Array.isArray((record.quickCard as Record<string, unknown>).keyPoints)
              ? ((record.quickCard as Record<string, unknown>).keyPoints as unknown[])
                  .map((item, index) => {
                    if (!item || typeof item !== "object") {
                      return null;
                    }
                    const point = item as Record<string, unknown>;
                    const title = typeof point.title === "string" ? point.title.trim() : "";
                    const summary = typeof point.summary === "string" ? point.summary.trim() : "";
                    if (!title || !summary) {
                      return null;
                    }
                    return {
                      number: typeof point.number === "number" ? point.number : index + 1,
                      title,
                      summary,
                    };
                  })
                  .filter(
                    (
                      item
                    ): item is {
                      number: number;
                      title: string;
                      summary: string;
                    } => Boolean(item)
                  )
              : [],
            interviewAnswer:
              typeof (record.quickCard as Record<string, unknown>).interviewAnswer === "string"
                ? ((record.quickCard as Record<string, unknown>).interviewAnswer as string).trim()
                : "",
          }
        : undefined,
    concepts: Array.isArray(record.concepts)
      ? (record.concepts as unknown[])
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const concept = item as Record<string, unknown>;
            const name = typeof concept.name === "string" ? concept.name.trim() : "";
            const description = typeof concept.description === "string" ? concept.description.trim() : "";
            if (!name || !description) {
              return null;
            }
            return { name, description };
          })
          .filter((item): item is { name: string; description: string } => Boolean(item))
      : [],
    details: Array.isArray(record.details)
      ? (record.details as unknown[])
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const detail = item as Record<string, unknown>;
            const title = typeof detail.title === "string" ? detail.title.trim() : "";
            const content = typeof detail.content === "string" ? detail.content.trim() : "";
            if (!title || !content) {
              return null;
            }
            return { title, content };
          })
          .filter((item): item is { title: string; content: string } => Boolean(item))
      : [],
    diagrams: normalizeStringArray(record.diagrams),
    codeExamples: Array.isArray(record.codeExamples)
      ? (record.codeExamples as unknown[])
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const example = item as Record<string, unknown>;
            const title = typeof example.title === "string" ? example.title.trim() : "示例";
            const language = typeof example.language === "string" ? example.language.trim() : "text";
            const code = typeof example.code === "string" ? example.code.trim() : "";
            if (!code) {
              return null;
            }
            return {
              title,
              language,
              code,
              explanation: typeof example.explanation === "string" ? example.explanation.trim() : undefined,
            } satisfies CodeExample;
          })
          .filter((item): item is CodeExample => Boolean(item))
      : [],
    commonMistakes: Array.isArray(record.commonMistakes)
      ? (record.commonMistakes as unknown[])
          .map((item) => {
            if (typeof item === "string") {
              const mistake = item.trim();
              return mistake ? ({ mistake } satisfies MistakeItem) : null;
            }
            if (!item || typeof item !== "object") {
              return null;
            }
            const recordItem = item as Record<string, unknown>;
            const mistake = typeof recordItem.mistake === "string" ? recordItem.mistake.trim() : "";
            if (!mistake) {
              return null;
            }
            return {
              mistake,
              whyWrong: typeof recordItem.whyWrong === "string" ? recordItem.whyWrong.trim() : undefined,
              correct: typeof recordItem.correct === "string" ? recordItem.correct.trim() : undefined,
            } satisfies MistakeItem;
          })
          .filter((item): item is MistakeItem => Boolean(item))
      : [],
    comparisons: Array.isArray(record.comparisons)
      ? (record.comparisons as unknown[])
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const table = item as Record<string, unknown>;
            const title = typeof table.title === "string" ? table.title.trim() : "结构对比";
            const headers = normalizeStringArray(table.headers);
            const rows = Array.isArray(table.rows)
              ? (table.rows as unknown[])
                  .map((row) =>
                    Array.isArray(row)
                      ? row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? "")))
                      : []
                  )
                  .filter((row) => row.length > 0)
              : [];
            return { title, headers, rows } satisfies ComparisonTable;
          })
          .filter((item): item is ComparisonTable => Boolean(item))
      : [],
    selfTests: normalizeSelfTests(record.selfTests),
    sources: normalizeLearningSources(record.sources),
    article: article
      ? {
          conclusion: typeof article.conclusion === "string" ? article.conclusion.trim() : "",
          keyTakeaways: normalizeStringArray(article.keyTakeaways),
          learningGoals: normalizeStringArray(article.learningGoals),
          plainSummary: typeof article.plainSummary === "string" ? article.plainSummary.trim() : undefined,
          plainRetell: typeof article.plainRetell === "string" ? article.plainRetell.trim() : undefined,
          strongSummary: typeof article.strongSummary === "string" ? article.strongSummary.trim() : undefined,
          sections,
        }
      : undefined,
  };
}

/**
 * 将未知 JSON 收口为训练内容契约。
 * @param {Prisma.JsonValue | null | undefined} value 数据库存储的训练内容 JSON。
 * @returns {InterviewContent} 统一后的训练内容对象。
 */
export function normalizeInterviewContent(value?: Prisma.JsonValue | null): InterviewContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      question: "",
      questionVariants: [],
      answer30s: "",
      answer2min: "",
      advancedAnswer: "",
      essentialPoints: [],
      bonusPoints: [],
      advancedPoints: [],
      deductPoints: [],
      followUps: [],
    };
  }

  const record = value as Record<string, unknown>;

  return {
    question: typeof record.question === "string" ? record.question.trim() : "",
    questionVariants: normalizeStringArray(record.questionVariants),
    answer30s: typeof record.answer30s === "string" ? record.answer30s.trim() : "",
    answer2min: typeof record.answer2min === "string" ? record.answer2min.trim() : "",
    advancedAnswer: typeof record.advancedAnswer === "string" ? record.advancedAnswer.trim() : "",
    essentialPoints: normalizeScorePoints(record.essentialPoints ?? record.scorePoints),
    bonusPoints: normalizeScorePoints(record.bonusPoints),
    advancedPoints: normalizeScorePoints(record.advancedPoints),
    deductPoints: normalizeDeductPoints(record.deductPoints),
    followUps: normalizeFollowUps(record.followUps),
  };
}

/**
 * 将数据库质量报告字段映射为前台和后台统一可消费的对象。
 * @param {Record<string, unknown> | null | undefined} report 质量报告查询结果。
 * @returns {QualityReportPayload | null} 标准质量报告。
 */
export function normalizeQualityReport(
  report?:
    | {
        totalScore: number | null;
        factScore: number | null;
        learningScore: number | null;
        interviewScore: number | null;
        originalityScore: number | null;
        readabilityScore: number | null;
        codeDiagramScore: number | null;
        issues: Prisma.JsonValue | null;
        suggestions: Prisma.JsonValue | null;
        pass: boolean;
      }
    | null
): QualityReportPayload | null {
  if (!report) {
    return null;
  }

  return {
    totalScore: report.totalScore,
    factScore: report.factScore,
    learningScore: report.learningScore,
    interviewScore: report.interviewScore,
    originalityScore: report.originalityScore,
    readabilityScore: report.readabilityScore,
    codeDiagramScore: report.codeDiagramScore,
    issues: normalizeStringArray(report.issues),
    suggestions: normalizeStringArray(report.suggestions),
    pass: report.pass,
  };
}

/**
 * 对学习内容执行最基础的工程结构验证。
 * @param {LearningContent} learningContent 学习内容。
 * @param {InterviewContent} interviewContent 训练内容。
 * @returns {EngineeringValidationResult} 基础结构检查结果。
 */
export function validateDocumentContracts(
  learningContent: LearningContent,
  interviewContent: InterviewContent,
  title = "当前文档"
): EngineeringValidationResult {
  const deepReadValidation = validateDeepReadReadiness(title, learningContent);
  const checks: EngineeringValidationCheck[] = [
    {
      name: "article_structure",
      pass: Boolean(
        learningContent.article?.conclusion &&
          learningContent.article.keyTakeaways.length > 0 &&
          learningContent.article.learningGoals.length > 0 &&
          learningContent.article.sections.length > 0 &&
          learningContent.article.plainSummary &&
          learningContent.article.plainRetell &&
          learningContent.article.strongSummary
      ),
      detail: "文章需具备结论、核心要点、学习目标、sections、plainSummary、plainRetell、strongSummary。",
    },
    {
      name: "self_tests",
      pass:
        (learningContent.selfTests?.length ?? 0) > 0 &&
        (learningContent.selfTests ?? []).every((item) => (item.gradingCriteria?.length ?? 0) > 0),
      detail: "每篇文档至少包含一组自测题，并且每题必须附带 gradingCriteria。",
    },
    {
      name: "interview_points",
      pass:
        interviewContent.essentialPoints.length > 0 &&
        interviewContent.bonusPoints.length > 0 &&
        interviewContent.advancedPoints.length > 0,
      detail: "训练内容必须同时具备必答点、加分点、进阶点。",
    },
    {
      name: "sources_present",
      pass: (learningContent.sources?.length ?? 0) > 0,
      detail: "来源字段不能为空。",
    },
    {
      name: "deep_read_gate",
      pass: deepReadValidation.ready,
      detail:
        deepReadValidation.missingBlocks.length === 0
          ? `15 分钟深读门禁通过，模板类型为 ${deepReadValidation.templateType}。`
          : `15 分钟深读缺少：${deepReadValidation.missingBlocks.join("、")}。`,
    },
  ];

  return {
    pass: checks.every((item) => item.pass),
    checks,
  };
}
