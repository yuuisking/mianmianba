import { type QuickFact, type TopicContent } from "@/lib/db/learningDb";

type QualityDimension = {
  key: string;
  label: string;
  score: number;
  passed: boolean;
  detail: string;
};

export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4";
export type PublishDecision = "auto_publish" | "auto_rewrite" | "manual_queue" | "discard";

export type ContentQualityReport = {
  score: number;
  passed: boolean;
  issues: string[];
  blockers: string[];
  warnings: string[];
  riskLevel: RiskLevel;
  decision: PublishDecision;
  dimensions: QualityDimension[];
};

/**
 * 将标题拆成适合相关性判断的关键词。
 * @param {string} title 当前题目标题。
 * @returns {string[]} 可用于相关性判断的关键词数组。
 */
function extractKeywords(title: string): string[] {
  return Array.from(
    new Set(
      title
        .replace(/[？?]/g, "")
        .split(/[、，,：:\s/()（）]+/)
        .map((item) => item.trim())
        .filter(
          (item) =>
            item.length >= 2 &&
            !/(什么|区别|如何|为什么|实现|原理|机制|流程|作用|场景|问题|有哪些|怎么|以及|还有|核心|常见)/.test(item)
        )
    )
  ).slice(0, 6);
}

/**
 * 将结构化题目内容拉平成纯文本，用于质量判断。
 * @param {TopicContent} content 当前题目内容。
 * @returns {string} 拼接后的纯文本。
 */
function flattenContent(content: TopicContent): string {
  const parts: string[] = [];
  for (const fact of content.quickFacts) {
    parts.push(`${fact.k} ${fact.v}`.trim());
  }
  for (const section of content.sections) {
    parts.push(section.h2);
    parts.push(...(section.paragraphs ?? []));
    parts.push(...(section.bullets ?? []));
    if (section.callout) {
      parts.push(section.callout);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * 获取指定章节的首个命中项。
 * @param {TopicContent["sections"]} sections 章节数组。
 * @param {RegExp} pattern 章节标题匹配规则。
 * @returns {TopicContent["sections"][number] | null} 命中的章节或 null。
 */
function findSection(sections: TopicContent["sections"], pattern: RegExp): TopicContent["sections"][number] | null {
  return sections.find((item) => pattern.test(item.h2)) ?? null;
}

/**
 * 构建三段式文档缺失时的默认面试追问。
 * @param {string} title 当前题目标题。
 * @returns {string[]} 通用追问数组。
 */
function buildInterviewPrompts(title: string): string[] {
  const plainTitle = title.replace(/[？?]+$/g, "").trim();
  return [
    `面试官问到「${plainTitle}」时，30 秒内应该先给出什么结论？`,
    `如果继续追问原理，应该补充哪些关键机制和边界条件？`,
    `在真实项目里，什么场景会用到这个知识点，怎么说明取舍？`,
    `这个问题最容易答错的误区是什么，应该如何纠正？`,
  ];
}

/**
 * 补齐面试追问链路，避免模型只给 1-2 个浅层问题。
 * @param {TopicContent["sections"][number]} section 原始面试章节。
 * @param {string} title 当前题目标题。
 * @returns {TopicContent["sections"][number]} 至少 4 个递进追问的面试章节。
 */
function ensureInterviewSectionDepth(
  section: TopicContent["sections"][number],
  title: string
): TopicContent["sections"][number] {
  const existing = [...(section.bullets ?? []), ...(section.paragraphs ?? [])].filter((item) => item.trim().length > 0);
  const prompts = buildInterviewPrompts(title);
  const bullets = Array.from(new Set([...existing, ...prompts])).slice(0, 6);

  return {
    ...section,
    bullets,
    callout: section.callout ?? "面试模式下建议先给 30 秒结论，再按原理、边界、项目场景逐层展开。",
  };
}

/**
 * 补齐参考答案的口头表达层次。
 * @param {TopicContent["sections"][number]} section 原始答案章节。
 * @param {string} title 当前题目标题。
 * @returns {TopicContent["sections"][number]} 包含 30 秒、1 分钟和深入追问表达的答案章节。
 */
function ensureAnswerSectionDepth(
  section: TopicContent["sections"][number],
  title: string
): TopicContent["sections"][number] {
  const paragraphs = [...(section.paragraphs ?? [])].filter((item) => item.trim().length > 0);
  const joined = [...paragraphs, ...(section.bullets ?? [])].join(" ");
  const supplements: string[] = [];

  if (!/30\s*秒|三十秒/.test(joined)) {
    supplements.push(`30 秒回答：先说明「${title}」解决什么问题，再给出最核心的机制或结论。`);
  }
  if (!/1\s*分钟|一分钟/.test(joined)) {
    supplements.push(`1 分钟回答：继续按“定义和目标 -> 原理机制 -> 典型场景 -> 边界误区”的顺序展开，让答案既完整又容易复述。`);
  }
  if (!/深入追问|继续追问|项目表达/.test(joined)) {
    supplements.push("深入追问：如果面试官继续问项目经验，要补充真实场景、方案取舍、风险控制和线上排查思路。");
  }

  return {
    ...section,
    paragraphs: [...paragraphs, ...supplements],
    bullets:
      section.bullets && section.bullets.length > 0
        ? section.bullets
        : [
            "先给结论，避免一上来散讲概念。",
            "再讲原理、场景、边界和误区。",
            "最后补项目中的取舍、风险或排查经验。",
          ],
  };
}

/**
 * 判断知识点正文是否仍然带有面试回答套路化脚手架，避免“知识点总结”变成答题模板。
 * @param {string} text 待判断的正文文本。
 * @returns {boolean} 命中套路化脚手架时返回 true。
 */
function containsKnowledgeScaffold(text: string): boolean {
  return (
    /回答时|如果面试官继续追问|建议按|先给一句话定义|最后结合项目经验说明如何落地和排障/.test(text) ||
    /先说明.+定义和核心目标/.test(text) ||
    /再说明.+关键流程、数据结构或设计思想/.test(text) ||
    /然后补充.+适用场景、限制条件和常见误区/.test(text)
  );
}

/**
 * 检查标题是否存在模板化、语病或过泛风险。
 * @param {string} title 当前题目标题。
 * @returns {{ blockers: string[]; warnings: string[] }} 标题质量问题列表。
 */
function detectTitleQuality(title: string): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const normalized = title.trim();

  if (
    /能否按顺序拆开讲清楚|如果让你结合项目经验回答|如果要回答得更像面试表达|最容易被面试官继续深挖/.test(
      normalized
    )
  ) {
    blockers.push("标题模板化严重，不符合真实面试问题表达。");
  }

  if (/是什么\s+的|区别.*体现在哪些设计和实现上/.test(normalized)) {
    blockers.push("标题存在明显语病或模板拼接痕迹。");
  }

  if (/在高并发或大数据量场景下最关键的风险点是什么/.test(normalized)) {
    warnings.push("标题过泛，考察目标不够聚焦。");
  }

  if (normalized.length > 42) {
    warnings.push("标题偏长，真实面试感偏弱。");
  }

  return { blockers, warnings };
}

/**
 * 从摘要中提取当前题目的难度元数据。
 * @param {QuickFact[]} facts 题目摘要。
 * @returns {"easy" | "medium" | "hard" | null} 解析出的难度。
 */
function extractDifficulty(facts: QuickFact[]): "easy" | "medium" | "hard" | null {
  const raw = facts.find((item) => item.k === "难度")?.v ?? "";
  if (raw.includes("困难")) {
    return "hard";
  }
  if (raw.includes("中等")) {
    return "medium";
  }
  if (raw.includes("简单")) {
    return "easy";
  }
  return null;
}

/**
 * 检查难度和正文深度是否冲突。
 * @param {TopicContent} content 当前题目内容。
 * @returns {{ blockers: string[]; warnings: string[] }} 难度一致性问题。
 */
function detectDifficultyMismatch(content: TopicContent): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const difficulty = extractDifficulty(content.quickFacts ?? []);
  const fullText = flattenContent(content);

  const hasPrincipleDepth = /原理|机制|底层|边界|取舍|性能|线程安全|源码|流程/.test(fullText);
  const hasProjectTransfer = /项目|排查|排障|落地|取舍|治理|线上/.test(fullText);

  if (difficulty === "hard" && (!hasPrincipleDepth || !hasProjectTransfer)) {
    blockers.push("困难题缺少原理深度或工程取舍，难度与正文不一致。");
  }

  if (difficulty === "easy" && /红黑树|AQS|CAS|JMM|MVCC|字节码|双亲委派/.test(fullText) && fullText.length > 420) {
    warnings.push("简单题正文偏重进阶原理，建议收敛难度或下调元数据。");
  }

  return { blockers, warnings };
}

/**
 * 检查正文是否缺少项目迁移与工程表达。
 * @param {TopicContent} content 当前题目内容。
 * @returns {{ blockers: string[]; warnings: string[] }} 工程迁移问题。
 */
function detectEngineeringTransfer(content: TopicContent): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const fullText = flattenContent(content);

  if (!/项目|场景|排查|排障|取舍|落地|线上/.test(fullText)) {
    warnings.push("缺少项目表达或工程迁移信息。");
  }

  return { blockers, warnings };
}

/**
 * 判断正文是否有足够的追问递进，而不是只罗列相关题。
 * @param {TopicContent["sections"][number] | null} section 面试常问章节。
 * @returns {boolean} 追问链路是否满足最低质量。
 */
function hasFollowUpDepth(section: TopicContent["sections"][number] | null): boolean {
  const items = [...(section?.paragraphs ?? []), ...(section?.bullets ?? [])].join(" ");
  const questionCount = (items.match(/[？?]/g) ?? []).length;
  return questionCount >= 3 && /为什么|怎么|区别|场景|取舍|风险|误区|项目|继续追问/.test(items);
}

/**
 * 判断参考答案是否具备口头复述价值。
 * @param {TopicContent["sections"][number] | null} section 参考答案章节。
 * @returns {boolean} 是否适合用户拿去组织面试表达。
 */
function hasRepeatableAnswer(section: TopicContent["sections"][number] | null): boolean {
  const text = [...(section?.paragraphs ?? []), ...(section?.bullets ?? []), section?.callout ?? ""].join(" ");
  return text.length >= 180 && /先|首先|其次|然后|最后|可以这样答|面试|结论|原理|场景|项目|取舍/.test(text);
}

/**
 * 判断内容是否覆盖学习文档应具备的关键解释层次。
 * @param {string} fullText 题目全文。
 * @returns {boolean} 是否覆盖概念、机制、边界、误区中的多数维度。
 */
function hasLearningCompleteness(fullText: string): boolean {
  const checks = [/定义|概念|是什么/, /原理|机制|流程|底层|实现/, /场景|适合|使用/, /边界|限制|误区|风险|问题/];
  return checks.filter((item) => item.test(fullText)).length >= 3;
}

/**
 * 根据分数与阻断项给出自动发布决策。
 * @param {{ score: number; blockers: string[]; warnings: string[] }} input 当前质量结果。
 * @returns {{ riskLevel: RiskLevel; decision: PublishDecision }} 风险等级与发布决策。
 */
function decideAutoPublish(input: {
  score: number;
  blockers: string[];
  warnings: string[];
}): { riskLevel: RiskLevel; decision: PublishDecision } {
  if (input.blockers.length > 0) {
    const riskLevel: RiskLevel = input.score < 80 ? "R4" : "R3";
    return {
      riskLevel,
      decision: riskLevel === "R4" ? "discard" : "manual_queue",
    };
  }

  if (input.score >= 92) {
    return { riskLevel: "R0", decision: "auto_publish" };
  }
  if (input.score >= 88) {
    return { riskLevel: "R1", decision: "auto_rewrite" };
  }
  if (input.score >= 80) {
    return { riskLevel: "R2", decision: "auto_rewrite" };
  }
  return { riskLevel: "R4", decision: "discard" };
}

/**
 * 为 quickFacts 补齐最低信息密度，避免知识点总结为空壳。
 * @param {QuickFact[]} facts 原始摘要信息。
 * @param {string} title 当前题目标题。
 * @param {string} categoryTitle 所属分类标题。
 * @returns {QuickFact[]} 至少 4 条的摘要信息数组。
 */
function ensureQuickFacts(facts: QuickFact[], title: string, categoryTitle: string): QuickFact[] {
  const next = facts.filter((item) => (item.k || item.v).trim().length > 0).slice(0, 6);
  const fallback: QuickFact[] = [
    { k: "知识点", v: title },
    { k: "所属模块", v: categoryTitle },
    { k: "学习重点", v: "围绕定义、原理、场景、边界和误区建立完整知识理解。" },
    { k: "知识主线", v: "不要只记结论，要搞清它为什么这样设计、适合什么场景、容易踩什么坑。" },
  ];

  for (const item of fallback) {
    if (next.length >= 4) {
      break;
    }
    next.push(item);
  }

  return next;
}

/**
 * 将任意题目内容规整成正式发布所需的三段式结构。
 * @param {TopicContent} content 原始题目内容。
 * @param {{ title: string; categoryTitle: string }} options 题目标题与分类信息。
 * @returns {TopicContent} 满足三段式要求的规范化题目内容。
 */
export function normalizeStructuredContent(
  content: TopicContent,
  options: { title: string; categoryTitle: string }
): TopicContent {
  const sections = content.sections ?? [];
  const knowledgeSection =
    findSection(sections, /知识点总结|核心知识|知识点拆解/) ??
    ({
      id: "knowledge-summary",
      h2: "知识点总结",
      paragraphs: [
        `「${options.title}」首先要讲清它是什么、解决什么问题，以及它在「${options.categoryTitle}」这条知识主线中的位置。`,
        `理解这个知识点时，还需要继续展开它的关键原理、适用场景、边界条件，以及和相近概念的差异。`,
      ],
      bullets: [
        "核心概念与设计目标决定了它为什么存在。",
        "关键原理、执行流程或底层结构决定了它是如何工作的。",
        "适用场景、限制条件和常见误区决定了它在真实项目中的边界。",
      ],
    } satisfies TopicContent["sections"][number]);

  const normalizedKnowledgeSection = {
    ...knowledgeSection,
    h2: "知识点总结",
  };
  const interviewSection =
    findSection(sections, /面试常考|面试常问|高频追问|常见追问/) ??
    ({
      id: "interview-questions",
      h2: "面试常问",
      bullets: buildInterviewPrompts(options.title),
      callout: "面试模式下建议先按追问链路思考，再打开参考答案对照表达。",
    } satisfies TopicContent["sections"][number]);
  const normalizedInterviewSection = ensureInterviewSectionDepth({
    ...interviewSection,
    h2: "面试常问",
  }, options.title);

  const answerCandidates = sections.filter(
    (item) => item !== knowledgeSection && item !== interviewSection && item.h2.trim().length > 0
  );
  const answerSection =
    answerCandidates.length > 0
      ? {
          ...answerCandidates[0],
          h2: "参考答案和解析",
          paragraphs: [
            ...(answerCandidates[0].paragraphs ?? []),
            ...answerCandidates.slice(1).flatMap((item) => item.paragraphs ?? []),
          ],
          bullets: [
            ...(answerCandidates[0].bullets ?? []),
            ...answerCandidates.slice(1).flatMap((item) => item.bullets ?? []),
          ],
          callout: answerCandidates.map((item) => item.callout).filter((item): item is string => Boolean(item)).join("；") || answerCandidates[0].callout,
        }
      : ({
          id: "answer-analysis",
          h2: "参考答案和解析",
          paragraphs: [
            `标准回答：围绕「${options.title}」，先把结论说清，再把原理、场景、边界和项目取舍讲完整。`,
            `解析：这道题真正拉开差距的地方，不是空泛地下定义，而是能不能说明它为什么这样设计、适合什么场景、有哪些限制。`,
          ],
          bullets: [
            "先给清晰结论，再补核心原理。",
            "讲清适合什么场景，以及不适合什么场景。",
            "最后补一个真实项目中的使用、排查或取舍例子。",
          ],
        } satisfies TopicContent["sections"][number]);
  const normalizedAnswerSection = ensureAnswerSectionDepth(answerSection, options.title);

  return {
    ...content,
    title: content.title || options.title,
    quickFacts: ensureQuickFacts(content.quickFacts ?? [], options.title, options.categoryTitle),
    sections: [normalizedKnowledgeSection, normalizedInterviewSection, normalizedAnswerSection],
  };
}

/**
 * 对题目内容执行发布前质量评分。
 * @param {TopicContent} content 当前题目内容。
 * @param {{ title: string; categoryTitle: string }} options 题目与分类信息。
 * @returns {ContentQualityReport} 质量报告与阻断信息。
 */
export function evaluateContentQuality(
  content: TopicContent,
  options: { title: string; categoryTitle: string }
): ContentQualityReport {
  const normalized = normalizeStructuredContent(content, options);
  const fullText = flattenContent(normalized);
  const keywords = extractKeywords(options.title);
  const structurePassed =
    Boolean(findSection(normalized.sections, /知识点总结/)) &&
    Boolean(findSection(normalized.sections, /面试常问/)) &&
    Boolean(findSection(normalized.sections, /参考答案和解析/));
  const densityPassed = normalized.quickFacts.length >= 4 && fullText.length >= 220;
  const relevancePassed = keywords.length === 0 || keywords.some((item) => fullText.includes(item));
  const knowledgeSection = findSection(normalized.sections, /知识点总结/);
  const interviewSection = findSection(normalized.sections, /面试常问/);
  const answerSection = findSection(normalized.sections, /参考答案和解析/);
  const knowledgeText = [
    ...(knowledgeSection?.paragraphs ?? []),
    ...(knowledgeSection?.bullets ?? []),
    knowledgeSection?.callout ?? "",
  ]
    .join(" ")
    .trim();
  const knowledgePurityPassed =
    Boolean(knowledgeSection) &&
    knowledgeText.length >= 80 &&
    !containsKnowledgeScaffold(knowledgeText);
  const followUpDepthPassed = hasFollowUpDepth(interviewSection);
  const answerRepeatabilityPassed = hasRepeatableAnswer(answerSection);
  const learningCompletenessPassed = hasLearningCompleteness(fullText);
  const engineeringTransferPassed = /项目|场景|排查|排障|取舍|落地|线上|性能|风险/.test(fullText);
  const interviewUsabilityPassed =
    Boolean(interviewSection) &&
    followUpDepthPassed &&
    answerRepeatabilityPassed;

  const dimensions: QualityDimension[] = [
    {
      key: "structure",
      label: "结构完整性",
      score: structurePassed ? 100 : 40,
      passed: structurePassed,
      detail: structurePassed ? "已包含知识点总结、面试常问、参考答案和解析三段结构。" : "三段式结构不完整。",
    },
    {
      key: "density",
      label: "信息密度",
      score: densityPassed ? 92 : 55,
      passed: densityPassed,
      detail: densityPassed ? "信息量达到最低发布门槛。" : "内容过短或摘要信息不足，用户很难学到东西。",
    },
    {
      key: "relevance",
      label: "主题相关性",
      score: relevancePassed ? 90 : 45,
      passed: relevancePassed,
      detail: relevancePassed ? "正文与当前题目主题保持相关。" : "正文与题目标题关联度不足，存在跑题风险。",
    },
    {
      key: "knowledge",
      label: "知识纯度",
      score: knowledgePurityPassed ? 92 : 38,
      passed: knowledgePurityPassed,
      detail: knowledgePurityPassed
        ? "知识点总结以原理、场景和边界讲解为主，没有退化成答题套路。"
        : "知识点总结仍带有面试回答模板痕迹，用户难以真正学到知识。",
    },
    {
      key: "interview",
      label: "面试可用性",
      score: interviewUsabilityPassed ? 94 : 48,
      passed: interviewUsabilityPassed,
      detail: interviewUsabilityPassed ? "已形成追问链路和可复用的回答框架。" : "面试常问或参考答案展开不足。",
    },
    {
      key: "learning",
      label: "学习完整性",
      score: learningCompletenessPassed ? 92 : 52,
      passed: learningCompletenessPassed,
      detail: learningCompletenessPassed ? "已覆盖概念、机制、场景、边界或误区等关键学习层次。" : "学习讲解层次不完整，容易变成浅层八股。",
    },
    {
      key: "engineering",
      label: "工程迁移",
      score: engineeringTransferPassed ? 92 : 58,
      passed: engineeringTransferPassed,
      detail: engineeringTransferPassed ? "已包含项目场景、工程取舍或风险排查表达。" : "缺少项目场景、工程取舍或线上排查信息。",
    },
  ];

  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  const issues = dimensions.filter((item) => !item.passed).map((item) => `${item.label}未达标：${item.detail}`);
  const titleQuality = detectTitleQuality(options.title);
  const difficultyMismatch = detectDifficultyMismatch(normalized);
  const engineeringTransfer = detectEngineeringTransfer(normalized);
  const blockers = [...titleQuality.blockers, ...difficultyMismatch.blockers];
  const warnings = [...titleQuality.warnings, ...difficultyMismatch.warnings, ...engineeringTransfer.warnings];
  const { riskLevel, decision } = decideAutoPublish({ score, blockers, warnings });

  return {
    score,
    passed:
      structurePassed &&
      densityPassed &&
      relevancePassed &&
      knowledgePurityPassed &&
      interviewUsabilityPassed &&
      blockers.length === 0 &&
      score >= 85,
    issues,
    blockers,
    warnings,
    riskLevel,
    decision,
    dimensions,
  };
}
