import { callDeepSeek } from "@/lib/ai/deepseek";
import { learningDb, type KbInfo, type TopicContent, type TreeData } from "@/lib/db/learningDb";
import { learningStudio, type StudioRunRecord, type StudioSourceSnapshot } from "@/lib/db/learningStudio";
import { buildAutomaticTaxonomy } from "@/lib/learning/autoFactory";
import {
  evaluateContentQuality,
  normalizeStructuredContent,
  type PublishDecision,
  type RiskLevel,
} from "@/lib/learning/contentQuality";
import { buildAutoDiscoveredSources, buildKnowledgeTopicProfile } from "@/lib/learning/sourceDiscovery";
import {
  buildStarterBankMeta,
  buildStarterTopicContent,
  buildStarterTree,
  getStarterBankBlueprint,
} from "@/lib/learning/starterBankBlueprints";

type ArchitectCategoryPlan = {
  id: string;
  title: string;
  goal: string;
};

type ArchitectPlan = {
  bankName: string;
  subtitle: string;
  description: string;
  tags: string[];
  categories: ArchitectCategoryPlan[];
};

type QuestionPlan = {
  id: string;
  title: string;
  angle: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
};

type CategoryQuestionPlan = {
  categoryId: string;
  categoryTitle: string;
  questions: QuestionPlan[];
};

type AnswerPlan = {
  questionId: string;
  title: string;
  content: TopicContent;
};

type ReviewerDecision = {
  questionId: string;
  score: number;
  verdict: "accepted" | "needs_revision";
  notes: string[];
  blockers: string[];
  warnings: string[];
  riskLevel: RiskLevel;
  decision: PublishDecision;
};

type BuiltBankResult = {
  kb: KbInfo;
  tree: TreeData;
  contents: Array<{
    subjectId: string;
    topicId: string;
    content: TopicContent;
  }>;
  warnings: string[];
};

export const DEFAULT_BANK_TOPICS = [
  "Java 基础",
  "Java 集合",
  "Java 并发",
  "JVM",
  "Spring",
  "SpringBoot",
  "SpringCloud",
  "MySQL",
  "Redis",
  "Kafka",
  "计算机网络",
  "操作系统",
  "消息队列",
  "后端系统设计",
  "设计模式",
  "JavaScript",
  "TypeScript",
  "前端工程化",
  "Vue 3",
  "React",
];

/**
 * Converts a free-form text string into a stable slug identifier.
 * @param {string} value Raw text.
 * @returns {string} Stable identifier safe for topic and bank ids.
 */
function toStableId(value: string): string {
  const encoded = encodeURIComponent(value.trim().toLowerCase());
  return encoded.replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "node";
}

/**
 * Builds a stable public bank id from the requested topic.
 * @param {string} topic Raw bank topic.
 * @returns {string} Stable bank identifier.
 */
function buildBankId(topic: string): string {
  return `bank-${toStableId(topic)}`;
}

/**
 * Converts internal difficulty to the Chinese label shown in learning quick facts.
 * @param {"easy" | "medium" | "hard"} difficulty Internal difficulty value.
 * @returns {string} User-facing difficulty label.
 */
function formatDifficulty(difficulty: "easy" | "medium" | "hard"): string {
  return difficulty === "easy" ? "简单" : difficulty === "hard" ? "困难" : "中等";
}

/**
 * Forces generated quick facts to stay consistent with the planned question metadata.
 * @param {TopicContent["quickFacts"]} facts Generated quick facts.
 * @param {QuestionPlan} question Current question plan.
 * @param {string} categoryTitle Current category title.
 * @returns {TopicContent["quickFacts"]} Normalized quick facts with stable metadata.
 */
function normalizeAnswerQuickFacts(
  facts: TopicContent["quickFacts"],
  question: QuestionPlan,
  categoryTitle: string
): TopicContent["quickFacts"] {
  const next = (facts ?? []).filter((item) => item.k.trim().length > 0 || item.v.trim().length > 0);
  const upsert = (k: string, v: string) => {
    const existing = next.find((item) => item.k === k);
    if (existing) {
      existing.v = v;
    } else {
      next.push({ k, v });
    }
  };

  upsert("知识点", question.title);
  upsert("所属模块", categoryTitle);
  upsert("难度", formatDifficulty(question.difficulty));
  upsert("面试定位", question.angle);
  upsert(
    "回答重点",
    question.difficulty === "hard"
      ? "讲清原理、边界、性能风险和项目取舍。"
      : question.difficulty === "medium"
        ? "讲清机制、场景、常见追问和误区。"
        : "讲清定义、作用、典型场景和基础误区。"
  );

  return next.slice(0, 8);
}

/**
 * Extracts the first JSON object or array from an LLM response body.
 * @param {string} value Raw model output.
 * @returns {string} JSON text candidate.
 */
function extractJsonText(value: string): string {
  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/i) ?? value.match(/```\s*([\s\S]*?)```/i);
  const source = fencedMatch?.[1] ?? value;
  const objectStart = source.indexOf("{");
  const arrayStart = source.indexOf("[");

  if (objectStart === -1 && arrayStart === -1) {
    return source.trim();
  }

  const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  return source.slice(start).trim();
}

/**
 * Calls one AI agent with a strict JSON contract and falls back to a deterministic builder on failure.
 * @template T
 * @param {string} prompt Full prompt text.
 * @param {() => T} fallbackBuilder Deterministic fallback builder.
 * @returns {Promise<T>} Parsed structured payload.
 */
async function callJsonAgent<T>(prompt: string, fallbackBuilder: () => T): Promise<T> {
  try {
    const raw = await callDeepSeek({
      prompt,
      temperature: 0.3,
      maxTokens: 4096,
    });
    const parsed = JSON.parse(extractJsonText(raw)) as T;
    return parsed;
  } catch {
    return fallbackBuilder();
  }
}

/**
 * Maps discovered sources into the lightweight studio snapshot shape.
 * @param {ReturnType<typeof buildAutoDiscoveredSources>["accepted"]} sources Accepted source list.
 * @returns {StudioSourceSnapshot[]} Compact source snapshots for run state.
 */
function mapStudioSources(
  sources: ReturnType<typeof buildAutoDiscoveredSources>["accepted"]
): StudioSourceSnapshot[] {
  return sources.map((source) => ({
    title: source.title,
    url: source.url,
    category: source.category,
    qualityScore: source.qualityScore,
    selectionReason: source.selectionReason,
  }));
}

/**
 * Builds a deterministic architect fallback using the automatic taxonomy template.
 * @param {string} topic Requested learning topic.
 * @returns {ArchitectPlan} Fallback architect plan.
 */
function buildArchitectFallback(topic: string): ArchitectPlan {
  const profile = buildKnowledgeTopicProfile(topic);
  const tree = buildAutomaticTaxonomy(profile);
  return {
    bankName: `${profile.rawTopic}题库`,
    subtitle: `${profile.domainLabel} 高频面试题库`,
    description: `围绕“${profile.rawTopic}”整理高频考点与结构化答案，适合按分类系统刷题。`,
    tags: Array.from(new Set(profile.tags)).slice(0, 6),
    categories: tree.groups.slice(0, 5).map((group) => ({
      id: toStableId(group.title),
      title: group.title,
      goal: `围绕 ${group.title} 建立可连续刷题的面试主线。`,
    })),
  };
}

/**
 * Builds a deterministic question fallback for one architect category.
 * @param {ArchitectCategoryPlan[]} categories Planned categories.
 * @returns {CategoryQuestionPlan[]} Fallback category question plans.
 */
function buildQuestionFallback(categories: ArchitectCategoryPlan[]): CategoryQuestionPlan[] {
  return categories.map((category) => ({
    categoryId: category.id,
    categoryTitle: category.title,
    questions: [
      {
        id: `${category.id}-1`,
        title: `${category.title} 最值得优先掌握的核心原理是什么？`,
        angle: "从结论、核心机制和适用场景切入，作为该分类的主问题。",
        difficulty: "easy",
        tags: [category.title, "基础"],
      },
      {
        id: `${category.id}-2`,
        title: `${category.title} 中最容易混淆的结构、概念或对比点是什么？`,
        angle: "围绕核心对比、关键差异和常见误区展开。",
        difficulty: "medium",
        tags: [category.title, "对比"],
      },
      {
        id: `${category.id}-3`,
        title: `${category.title} 在真实项目里最关键的设计取舍或排障问题是什么？`,
        angle: "从项目场景、性能影响、风险和验证方式展开。",
        difficulty: "hard",
        tags: [category.title, "项目实战"],
      },
    ],
  }));
}

/**
 * 将扩写式标题归一为核心题标题，避免把文章章节伪装成导航题。
 * @param {string} title 原始题目标题。
 * @returns {string} 归一化后的核心题标题。
 */
function normalizeQuestionTitleForNavigation(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  const wrappedMatch = normalized.match(/^围绕[「“](.+?)[」”]/);
  if (wrappedMatch?.[1]) {
    return wrappedMatch[1].trim();
  }

  return normalized
    .replace(/\s*的底层原因和关键机制是什么[？?]?$/u, "")
    .replace(/\s*如果放到线上项目里，会带来哪些收益和代价[？?]?$/u, "")
    .replace(/\s*最容易忽略的实现细节和边界条件是什么[？?]?$/u, "")
    .replace(/\s*在真实项目里通常怎么落地[？?]?$/u, "")
    .replace(/\s*落到真实项目时应该如何说明取舍和风险[？?]?$/u, "")
    .replace(/\s*最容易忽略的边界条件和误区是什么[？?]?$/u, "")
    .replace(/\s*各自适合什么场景[？?]?$/u, "")
    .replace(/\s*有哪些容易答错的点[？?]?$/u, "")
    .trim();
}

/**
 * 对同分类下的题目去重，强制只保留核心题。
 * @param {CategoryQuestionPlan["questions"]} questions 原始题目列表。
 * @returns {CategoryQuestionPlan["questions"]} 去重后的核心题列表。
 */
function dedupeQuestionPlans(questions: CategoryQuestionPlan["questions"]): CategoryQuestionPlan["questions"] {
  const seen = new Set<string>();
  const deduped: CategoryQuestionPlan["questions"] = [];

  for (const question of questions) {
    const normalizedTitle = normalizeQuestionTitleForNavigation(question.title);
    if (!normalizedTitle || seen.has(normalizedTitle)) {
      continue;
    }

    seen.add(normalizedTitle);
    deduped.push({
      ...question,
      title: normalizedTitle,
    });
  }

  return deduped;
}

/**
 * Builds one deterministic answer fallback payload when the answer agent fails.
 * @param {string} bankName Current bank name.
 * @param {string} categoryTitle Current category title.
 * @param {QuestionPlan} question Current question plan.
 * @returns {AnswerPlan} Fallback answer payload.
 */
function buildFallbackAnswer(bankName: string, categoryTitle: string, question: QuestionPlan): AnswerPlan {
  const answerHint =
    question.difficulty === "hard"
      ? "重点放在底层机制、边界条件、性能影响和真实项目中的取舍。"
      : question.difficulty === "medium"
        ? "重点放在定义、核心机制、常见追问和项目中的使用方式。"
        : "重点放在定义、作用、典型使用场景和常见误区。";

  return {
    questionId: question.id,
    title: question.title,
    content: {
      title: question.title,
      breadcrumb: [bankName, categoryTitle, question.title],
      quickFacts: [
        { k: "知识点", v: question.title },
        { k: "所属模块", v: categoryTitle },
        { k: "难度", v: formatDifficulty(question.difficulty) },
        { k: "面试定位", v: question.angle },
        { k: "回答重点", v: answerHint },
      ],
      sections: [
        {
          id: `${question.id}-summary`,
          h2: "知识点总结",
          paragraphs: [
            `「${question.title}」属于「${categoryTitle}」中的核心知识点，理解它时需要先看清定义、设计目标，以及它实际解决了什么问题。`,
            "继续展开时，还要补齐关键原理、典型使用场景、边界条件，以及和相近方案之间的差异，避免只背一句结论。",
            "如果放到真实项目里，还要能说明它解决了什么工程问题、可能带来什么风险，以及如何验证使用效果。",
          ],
          bullets: [
            "核心概念与设计目标决定了它为什么存在。",
            "底层原理、执行流程或关键结构决定了它如何工作。",
            "适用场景、限制条件和常见误区决定了它在项目中的边界。",
            "工程取舍、线上排查和性能影响决定了社招面试中的回答深度。",
          ],
        },
        {
          id: `${question.id}-interview`,
          h2: "面试常问",
          bullets: [
            `面试官问「${question.title}」时，30 秒内应该先给什么结论？`,
            `如果继续追问原理，应该补充哪些关键流程、数据结构或底层机制？`,
            `如果把它落到真实项目中，最常见的风险、坑点或排查方向是什么？`,
            `它和相似方案相比有什么差异与取舍，什么场景不适合使用？`,
          ],
        },
        {
          id: `${question.id}-answer`,
          h2: "参考答案和解析",
          paragraphs: [
            `30 秒回答：这道题可以先回答「它是什么、解决什么问题、最核心的机制是什么」，不要一上来堆概念。`,
            `1 分钟回答：围绕「${question.title}」，先给清晰结论，再补原理、典型场景、边界限制和常见误区。`,
            `深入追问：${answerHint} 如果是社招面试，还应该补一个项目中的使用、取舍或线上排查例子。`,
          ],
          bullets: [
            "先说这道题到底在解释什么问题。",
            "再说背后的关键机制或设计原因。",
            "然后补使用场景、限制条件和常见误区。",
            "最后结合项目里的取舍或排障经验收口。",
          ],
        },
      ],
    },
  };
}

/**
 * Builds a deterministic reviewer fallback that accepts all structured answers with basic quality notes.
 * @param {AnswerPlan[]} answers Generated answer list.
 * @returns {ReviewerDecision[]} Fallback review decisions.
 */
function buildReviewerFallback(answers: AnswerPlan[]): ReviewerDecision[] {
  return answers.map((item) => ({
    questionId: item.questionId,
    score: item.content.sections.length >= 2 ? 86 : 72,
    verdict: item.content.sections.length >= 2 ? "accepted" : "needs_revision",
    notes: item.content.sections.length >= 2 ? ["结构完整，可进入发布链路。"] : ["结构不完整，建议补充回答框架与展开细节。"],
    blockers: [],
    warnings: [],
    riskLevel: item.content.sections.length >= 2 ? "R1" : "R4",
    decision: item.content.sections.length >= 2 ? "auto_rewrite" : "discard",
  }));
}

/**
 * Creates the architect prompt used by the planning agent.
 * @param {string} topic Requested learning topic.
 * @param {StudioSourceSnapshot[]} sources Accepted source snapshots.
 * @returns {string} Full architect prompt.
 */
function buildArchitectPrompt(topic: string, sources: StudioSourceSnapshot[]): string {
  return [
    "你是学习题库的 Architect Agent。",
    "请围绕指定课题规划一个可刷题的面试题库结构。",
    "输出 JSON，格式必须为：",
    '{"bankName":"", "subtitle":"", "description":"", "tags":[""], "categories":[{"id":"","title":"","goal":""}]}',
    "要求：",
    "1. 分类数量控制在 4 到 6 个。",
    "2. 分类命名要像面试题库，不要像知识库目录。",
    "3. 不要输出 markdown，不要解释。",
    `课题：${topic}`,
    `高质量参考来源：${sources.map((item) => `${item.title}(${item.category}/${item.qualityScore})`).join("；")}`,
  ].join("\n");
}

/**
 * Creates the question-planning prompt used by the question agent.
 * @param {string} topic Requested learning topic.
 * @param {ArchitectPlan} architectPlan Current architect plan.
 * @returns {string} Full question agent prompt.
 */
function buildQuestionPrompt(topic: string, architectPlan: ArchitectPlan): string {
  return [
    "你是学习题库的 Questioner Agent。",
    "请基于分类结构，为每个分类生成 3 道核心题。",
    "输出 JSON 数组，格式必须为：",
    '[{"categoryId":"","categoryTitle":"","questions":[{"id":"","title":"","angle":"","difficulty":"easy|medium|hard","tags":[""]}]}]',
    "要求：",
    "1. 题目要像真实面试中的独立核心题，不能把同一知识点拆成“底层原因 / 项目收益 / 边界条件”三四道并列题。",
    "2. 每道题必须是用户会独立搜索、独立学习、独立被问到的核心问题，追问、误区、边界、项目取舍应该放进文档内部，而不是占左侧导航。",
    "3. 每个分类恰好 3 道核心题，难度要有层次，但禁止用模板化扩写凑数量。",
    "4. 禁止标题：不要写“底层原因和关键机制是什么”“如果放到线上项目里，会带来哪些收益和代价”“最容易忽略的实现细节和边界条件是什么”“在真实项目里通常怎么落地”。",
    "5. 题目类型优先覆盖：核心原理、关键结构/对比、实战设计或排障，而不是同一主题换壳改写。",
    `课题：${topic}`,
    `分类规划：${JSON.stringify(architectPlan.categories)}`,
  ].join("\n");
}

/**
 * Creates the answer-generation prompt used by the answer agent.
 * @param {string} bankName Current bank name.
 * @param {CategoryQuestionPlan} category Current category question batch.
 * @returns {string} Full answer agent prompt.
 */
function buildAnswerPrompt(bankName: string, category: CategoryQuestionPlan): string {
  return [
    "你是学习题库的 Answerer Agent。",
    "请为同一分类下的题目批量生成结构化答案。",
    "输出 JSON 数组，格式必须为：",
    '[{"questionId":"","title":"","quickFacts":[{"k":"","v":""}],"sections":[{"id":"","h2":"","paragraphs":[""],"bullets":[""],"callout":""}]}]',
    "要求：",
    "1. 每道题至少 5 个 quickFacts，必须包含“知识点、所属模块、难度、面试定位、回答重点”。难度必须与题目 difficulty 一致。",
    "2. 每道题必须输出“知识点总结 / 面试常问 / 参考答案和解析”三段内容。",
    "3. 知识点总结必须讲概念、原理、场景、边界和误区，禁止写成答题套路、回答提纲或空泛套话。",
    "4. 面试常问必须是递进追问链，至少 4 个问题，覆盖 30 秒结论、原理、边界、项目场景。",
    "5. 参考答案和解析必须包含 30 秒回答、1 分钟回答、深入追问、项目表达四层，能直接拿去复述。",
    "6. 禁止复制外部资料原文，必须用自己的结构化表达。",
    `题库：${bankName}`,
    `分类：${category.categoryTitle}`,
    `题目：${JSON.stringify(category.questions)}`,
  ].join("\n");
}

/**
 * Creates the review prompt used by the reviewer agent.
 * @param {string} bankName Current bank name.
 * @param {AnswerPlan[]} answers Candidate answers.
 * @returns {string} Full reviewer prompt.
 */
function buildReviewPrompt(bankName: string, answers: AnswerPlan[]): string {
  return [
    "你是学习题库的 Reviewer Agent。",
    "请审核每道题的内容质量，判断是否适合直接发布。",
    "输出 JSON 数组，格式必须为：",
    '[{"questionId":"","score":0,"verdict":"accepted|needs_revision","notes":[""]}]',
    "要求：",
    "1. 重点检查是否空泛、是否跑题、是否缺少面试回答框架、是否缺少项目迁移。",
    "2. 分数范围 0 到 100，低于 92 不要给 accepted。",
    "3. 只有结构完整、内容聚焦、追问递进、项目表达具体时才给 accepted。",
    `题库：${bankName}`,
    `答案内容：${JSON.stringify(answers.map((item) => ({ questionId: item.questionId, title: item.title, content: item.content })))}`,
  ].join("\n");
}

/**
 * Builds a tree structure from the architect and question plans.
 * @param {string} kbId Current bank identifier.
 * @param {string} bankName Current bank name.
 * @param {CategoryQuestionPlan[]} questionPlans Category question plans.
 * @returns {TreeData} Persistable bank tree.
 */
function buildTreeData(kbId: string, bankName: string, questionPlans: CategoryQuestionPlan[]): TreeData {
  return {
    id: kbId,
    title: bankName,
    groups: questionPlans.map((category) => ({
      id: category.categoryId,
      title: category.categoryTitle,
      children: category.questions.map((question) => ({
        id: question.id,
        title: question.title,
      })),
    })),
  };
}

/**
 * Runs the architect stage and returns a structured bank plan.
 * @param {string} topic Requested learning topic.
 * @param {StudioRunRecord} run Current studio run record.
 * @param {StudioSourceSnapshot[]} sources Accepted source snapshots.
 * @returns {Promise<ArchitectPlan>} Architect plan.
 */
async function runArchitectStage(
  topic: string,
  run: StudioRunRecord,
  sources: StudioSourceSnapshot[]
): Promise<ArchitectPlan> {
  learningStudio.updateStage(run.id, "architect", {
    status: "running",
    detail: "正在规划题库名称、分类结构和范围边界。",
  });

  const plan = await callJsonAgent<ArchitectPlan>(buildArchitectPrompt(topic, sources), () => buildArchitectFallback(topic));
  learningStudio.updateStage(run.id, "architect", {
    status: "completed",
    detail: `已规划 ${plan.categories.length} 个分类。`,
  });
  return {
    ...plan,
    categories: plan.categories.map((item, index) => ({
      id: item.id?.trim() ? toStableId(item.id) : `category-${index + 1}`,
      title: item.title,
      goal: item.goal,
    })),
  };
}

/**
 * Runs the questioner stage and returns structured question batches.
 * @param {string} topic Requested learning topic.
 * @param {string} runId Current studio run identifier.
 * @param {ArchitectPlan} architectPlan Architect plan.
 * @returns {Promise<CategoryQuestionPlan[]>} Planned question batches.
 */
async function runQuestionerStage(
  topic: string,
  runId: string,
  architectPlan: ArchitectPlan
): Promise<CategoryQuestionPlan[]> {
  learningStudio.updateStage(runId, "questioner", {
    status: "running",
    detail: "正在为每个分类生成题目。",
  });

  const plan = await callJsonAgent<CategoryQuestionPlan[]>(buildQuestionPrompt(topic, architectPlan), () =>
    buildQuestionFallback(architectPlan.categories)
  );

  const normalized = plan.map((category, categoryIndex) => ({
    categoryId:
      architectPlan.categories.find((item) => item.id === category.categoryId)?.id ??
      architectPlan.categories[categoryIndex]?.id ??
      `category-${categoryIndex + 1}`,
    categoryTitle:
      architectPlan.categories.find((item) => item.id === category.categoryId)?.title ??
      category.categoryTitle ??
      architectPlan.categories[categoryIndex]?.title ??
      `分类 ${categoryIndex + 1}`,
    questions: dedupeQuestionPlans(
      category.questions.slice(0, 6).map((question, questionIndex) => ({
        id: question.id?.trim() ? toStableId(question.id) : toStableId(`${category.categoryTitle}-${question.title}-${questionIndex}`),
        title: question.title,
        angle: question.angle,
        difficulty: question.difficulty,
        tags: Array.isArray(question.tags) ? question.tags.slice(0, 4) : [],
      }))
    ).slice(0, 3),
  }));

  learningStudio.updateStage(runId, "questioner", {
    status: "completed",
    detail: `已生成 ${normalized.reduce((sum, category) => sum + category.questions.length, 0)} 道题目。`,
    totalQuestions: normalized.reduce((sum, category) => sum + category.questions.length, 0),
  });
  return normalized;
}

/**
 * Runs the answerer stage and returns structured answer payloads.
 * @param {string} bankName Current bank name.
 * @param {string} runId Current studio run identifier.
 * @param {CategoryQuestionPlan[]} categories Category question batches.
 * @returns {Promise<AnswerPlan[]>} Generated answer payloads.
 */
async function runAnswererStage(
  bankName: string,
  runId: string,
  categories: CategoryQuestionPlan[]
): Promise<AnswerPlan[]> {
  learningStudio.updateStage(runId, "answerer", {
    status: "running",
    detail: "正在生成题目答案、解析与回答框架。",
    totalQuestions: categories.reduce((sum, category) => sum + category.questions.length, 0),
    completedQuestions: 0,
  });

  const answers: AnswerPlan[] = [];
  for (const category of categories) {
    const batch = await callJsonAgent<Array<Omit<AnswerPlan, "content"> & { quickFacts: TopicContent["quickFacts"]; sections: TopicContent["sections"] }>>(
      buildAnswerPrompt(bankName, category),
      () =>
        category.questions.map((question) => {
          const fallback = buildFallbackAnswer(bankName, category.categoryTitle, question);
          return {
            questionId: fallback.questionId,
            title: fallback.title,
            quickFacts: fallback.content.quickFacts,
            sections: fallback.content.sections,
          };
        })
    );

    for (const question of category.questions) {
      const matched = batch.find((item) => item.questionId === question.id) as
        | (Omit<AnswerPlan, "content"> & { quickFacts: TopicContent["quickFacts"]; sections: TopicContent["sections"] })
        | undefined;
      const nextItem =
        matched && Array.isArray(matched.quickFacts) && Array.isArray(matched.sections)
          ? {
              questionId: question.id,
              title: matched.title || question.title,
              content: normalizeStructuredContent(
                {
                title: matched.title || question.title,
                breadcrumb: [bankName, category.categoryTitle, matched.title || question.title],
                quickFacts: normalizeAnswerQuickFacts(matched.quickFacts, question, category.categoryTitle),
                sections: matched.sections,
                },
                {
                  title: matched.title || question.title,
                  categoryTitle: category.categoryTitle,
                }
              ),
            }
          : {
              ...buildFallbackAnswer(bankName, category.categoryTitle, question),
              content: normalizeStructuredContent(buildFallbackAnswer(bankName, category.categoryTitle, question).content, {
                title: question.title,
                categoryTitle: category.categoryTitle,
              }),
            };
      answers.push(nextItem);
    }

    learningStudio.updateStage(runId, "answerer", {
      status: "running",
      detail: `已完成分类「${category.categoryTitle}」的答案生成。`,
      totalQuestions: categories.reduce((sum, item) => sum + item.questions.length, 0),
      completedQuestions: answers.length,
    });
  }

  learningStudio.updateStage(runId, "answerer", {
    status: "completed",
    detail: `已完成 ${answers.length} 道题的结构化答案。`,
    totalQuestions: answers.length,
    completedQuestions: answers.length,
  });
  return answers;
}

/**
 * Runs the reviewer stage and returns quality decisions.
 * @param {string} bankName Current bank name.
 * @param {string} runId Current studio run identifier.
 * @param {AnswerPlan[]} answers Candidate answers.
 * @returns {Promise<ReviewerDecision[]>} Review decisions.
 */
async function runReviewerStage(
  bankName: string,
  runId: string,
  answers: AnswerPlan[]
): Promise<ReviewerDecision[]> {
  learningStudio.updateStage(runId, "reviewer", {
    status: "running",
    detail: "正在审核题目结构、回答质量和发布门槛。",
  });

  const decisions = await callJsonAgent<ReviewerDecision[]>(buildReviewPrompt(bankName, answers), () =>
    buildReviewerFallback(answers)
  );
  const normalizedDecisions = answers.map((answer) => {
    const modelDecision = decisions.find((item) => item.questionId === answer.questionId);
    const qualityReport = evaluateContentQuality(answer.content, {
      title: answer.title,
      categoryTitle: answer.content.breadcrumb[1] ?? "题目分类",
    });
    const mergedScore = modelDecision ? Math.round((modelDecision.score + qualityReport.score) / 2) : qualityReport.score;

    return {
      questionId: answer.questionId,
      score: mergedScore,
      verdict: qualityReport.decision === "auto_publish" ? ("accepted" as const) : ("needs_revision" as const),
      notes: [
        ...qualityReport.issues,
        ...qualityReport.blockers.map((item) => `阻断项：${item}`),
        ...qualityReport.warnings.map((item) => `警告：${item}`),
        ...(modelDecision?.notes ?? []),
      ],
      blockers: qualityReport.blockers,
      warnings: qualityReport.warnings,
      riskLevel: qualityReport.riskLevel,
      decision: qualityReport.decision,
    };
  });

  learningStudio.updateStage(runId, "reviewer", {
    status: "completed",
    detail: `已完成质量审核，其中 ${normalizedDecisions.filter((item) => item.verdict === "accepted").length} 道题通过。`,
  });
  return normalizedDecisions;
}

/**
 * Runs the linker stage and derives publishable related-question warnings.
 * @param {string} runId Current studio run identifier.
 * @param {CategoryQuestionPlan[]} categories Category question batches.
 * @returns {Promise<string[]>} Linker warnings collected during linking.
 */
async function runLinkerStage(runId: string, categories: CategoryQuestionPlan[]): Promise<string[]> {
  learningStudio.updateStage(runId, "linker", {
    status: "running",
    detail: "正在补齐同分类题目间的关联关系。",
  });

  const warnings = categories
    .filter((category) => category.questions.length < 3)
    .map((category) => `分类「${category.categoryTitle}」题目少于 3 道，关联推荐会偏少。`);

  learningStudio.updateStage(runId, "linker", {
    status: "completed",
    detail: warnings.length > 0 ? "关联已生成，但存在少量分类题量不足。" : "已完成题目关联结构准备。",
  });
  return warnings;
}

/**
 * Persists a fully reviewed bank into the file-first learning store.
 * @param {string} topic Requested topic.
 * @param {ArchitectPlan} architectPlan Architect plan.
 * @param {CategoryQuestionPlan[]} questionPlans Planned questions.
 * @param {AnswerPlan[]} answers Generated answers.
 * @param {ReviewerDecision[]} decisions Reviewer decisions.
 * @param {string[]} linkerWarnings Linker warnings.
 * @returns {BuiltBankResult} Persisted bank result summary.
 */
function publishBank(
  topic: string,
  architectPlan: ArchitectPlan,
  questionPlans: CategoryQuestionPlan[],
  answers: AnswerPlan[],
  decisions: ReviewerDecision[],
  linkerWarnings: string[]
): BuiltBankResult {
  const kbId = buildBankId(topic);
  const existing = learningDb.getLearningData().kbs.find((item) => item.id === kbId);
  if (existing) {
    learningDb.deleteKb(kbId);
  }

  const kb: KbInfo = {
    id: kbId,
    name: architectPlan.bankName,
    subtitle: architectPlan.subtitle,
    tags: architectPlan.tags.slice(0, 6),
    updatedAt: new Date().toISOString().slice(0, 10),
    stats: { topics: 0, paths: 0 },
    description: architectPlan.description,
    visibility: "public",
    cover: architectPlan.bankName.slice(0, 1),
  };
  learningDb.createKb(kb);

  const acceptedQuestionIds = new Set(
    decisions.filter((item) => item.decision === "auto_publish" && item.verdict === "accepted").map((item) => item.questionId)
  );
  const publishWarnings = [
    ...linkerWarnings,
    ...decisions
      .filter((item) => item.verdict === "accepted")
      .map((item) => `${item.questionId} 质量得分 ${item.score}，自动发布。`)
      .slice(0, 6),
    ...decisions
      .filter((item) => item.verdict !== "accepted")
      .map((item) => `${item.questionId} 未自动发布，决策为 ${item.decision}，风险等级 ${item.riskLevel}。`),
  ];

  const normalizedPlans = questionPlans.map((category) => ({
    ...category,
    questions: category.questions.filter((question) => acceptedQuestionIds.has(question.id)),
  }));
  const tree = buildTreeData(kbId, architectPlan.bankName, normalizedPlans);
  learningDb.saveTaxonomy(kbId, tree);

  const contents: BuiltBankResult["contents"] = [];
  for (const category of normalizedPlans) {
    for (const question of category.questions) {
      const answer = answers.find((item) => item.questionId === question.id) ?? buildFallbackAnswer(architectPlan.bankName, category.categoryTitle, question);
      learningDb.addContent(kbId, category.categoryId, question.id, answer.content);
      contents.push({
        subjectId: category.categoryId,
        topicId: question.id,
        content: answer.content,
      });
    }
  }

  return {
    kb,
    tree,
    contents,
    warnings: publishWarnings,
  };
}

/**
 * Runs the full multi-agent generation pipeline and publishes the resulting bank into the file-first store.
 * @param {{ topic: string; resetExisting?: boolean }} input Generation request.
 * @returns {Promise<{ run: StudioRunRecord; result: BuiltBankResult }>} Final run record and publish result.
 */
export async function runAgentBankGeneration(input: {
  topic: string;
  resetExisting?: boolean;
}): Promise<{ run: StudioRunRecord; result: BuiltBankResult }> {
  const topic = input.topic.trim();
  if (!topic) {
    throw new Error("缺少待生成的学习主题。");
  }

  if (input.resetExisting) {
    learningDb.resetAll();
    learningStudio.resetAll();
  }

  const profile = buildKnowledgeTopicProfile(topic);
  const sourceSelection = buildAutoDiscoveredSources(profile);
  const kbId = buildBankId(topic);
  const run = learningStudio.createRun({
    kbId,
    topic,
    acceptedSources: mapStudioSources(sourceSelection.accepted),
    rejectedSources: sourceSelection.rejected.slice(0, 8).map((item) => ({
      title: item.title,
      url: item.url,
      category: item.category,
      qualityScore: item.qualityScore,
      selectionReason: item.selectionReason,
    })),
  });

  try {
    const architectPlan = await runArchitectStage(topic, run, mapStudioSources(sourceSelection.accepted));
    const questionPlans = await runQuestionerStage(topic, run.id, architectPlan);

    const answers = await runAnswererStage(architectPlan.bankName, run.id, questionPlans);
    const decisions = await runReviewerStage(architectPlan.bankName, run.id, answers);
    const linkerWarnings = await runLinkerStage(run.id, questionPlans);

    learningStudio.updateStage(run.id, "publisher", {
      status: "running",
      detail: "正在写入正式题库数据源。",
      totalQuestions: answers.length,
      completedQuestions: answers.length,
    });

    const result = publishBank(topic, architectPlan, questionPlans, answers, decisions, linkerWarnings);

    learningStudio.updateStage(run.id, "publisher", {
      status: "completed",
      detail: `已发布 ${result.tree.groups.length} 个分类、${result.contents.length} 道题目。`,
      totalQuestions: result.contents.length,
      completedQuestions: result.contents.length,
    });
    learningStudio.completeRun(run.id, {
      categoryCount: result.tree.groups.length,
      questionCount: result.contents.length,
      published: true,
    }, result.warnings);

    const finalRun = learningStudio.getRuns().find((item) => item.id === run.id) ?? run;
    return {
      run: finalRun,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "多 Agent 生成失败。";
    learningStudio.updateStage(run.id, learningStudio.getRuns().find((item) => item.id === run.id)?.currentStageKey ?? "architect", {
      status: "failed",
      detail: message,
    });
    learningStudio.failRun(run.id, message);
    throw error;
  }
}

/**
 * Seeds a batch of preset bank topics through the same multi-agent generation pipeline.
 * @param {{ topics?: string[]; resetExisting?: boolean }} input Batch seed request.
 * @returns {Promise<Array<{ run: StudioRunRecord; result: BuiltBankResult }>>} Generated bank results in order.
 */
export async function seedAgentBanks(input?: {
  topics?: string[];
  resetExisting?: boolean;
}): Promise<Array<{ run: StudioRunRecord; result: BuiltBankResult }>> {
  const topics = Array.from(
    new Set(
      (input?.topics ?? DEFAULT_BANK_TOPICS)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );

  if (topics.length === 0) {
    throw new Error("缺少待初始化的题库主题。");
  }

  const results: Array<{ run: StudioRunRecord; result: BuiltBankResult }> = [];
  for (const [index, topic] of topics.entries()) {
    const generated = await runAgentBankGeneration({
      topic,
      resetExisting: input?.resetExisting === true && index === 0,
    });
    results.push(generated);
  }

  return results;
}

/**
 * Seeds a completed studio run record for one deterministic starter bank.
 * @param {string} topic Requested bank topic.
 * @param {BuiltBankResult} result Published starter bank result.
 * @returns {StudioRunRecord} Completed studio run snapshot.
 */
function createStarterRun(topic: string, result: BuiltBankResult): StudioRunRecord {
  const run = learningStudio.createRun({
    kbId: result.kb.id,
    topic,
  });
  const totalQuestions = result.contents.length;

  learningStudio.updateStage(run.id, "architect", {
    status: "completed",
    detail: "已按预置正式模板规划题库结构。",
  });
  learningStudio.updateStage(run.id, "questioner", {
    status: "completed",
    detail: `已生成 ${totalQuestions} 道首批题目。`,
    totalQuestions,
    completedQuestions: totalQuestions,
  });
  learningStudio.updateStage(run.id, "answerer", {
    status: "completed",
    detail: "已写入首版结构化答案。",
    totalQuestions,
    completedQuestions: totalQuestions,
  });
  learningStudio.updateStage(run.id, "reviewer", {
    status: "completed",
    detail: "已通过首版发布门槛校验。",
    totalQuestions,
    completedQuestions: totalQuestions,
  });
  learningStudio.updateStage(run.id, "linker", {
    status: "completed",
    detail: "已补齐基础分类关联。",
    totalQuestions,
    completedQuestions: totalQuestions,
  });
  learningStudio.updateStage(run.id, "publisher", {
    status: "completed",
    detail: `已发布 ${result.tree.groups.length} 个分类、${totalQuestions} 道题目。`,
    totalQuestions,
    completedQuestions: totalQuestions,
  });
  learningStudio.completeRun(
    run.id,
    {
      categoryCount: result.tree.groups.length,
      questionCount: totalQuestions,
      published: true,
    },
    result.warnings
  );

  return learningStudio.getRuns().find((item) => item.id === run.id) ?? run;
}

/**
 * Quickly seeds a batch of formal starter banks for acceptance or first-time initialization.
 * @param {{ topics?: string[]; resetExisting?: boolean }} input Starter batch request.
 * @returns {Array<{ run: StudioRunRecord; result: BuiltBankResult }>} Seeded starter bank results.
 */
export function seedStarterBanks(input?: {
  topics?: string[];
  resetExisting?: boolean;
}): Array<{ run: StudioRunRecord; result: BuiltBankResult }> {
  const topics = Array.from(
    new Set(
      (input?.topics ?? DEFAULT_BANK_TOPICS)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );

  if (topics.length === 0) {
    throw new Error("缺少待初始化的题库主题。");
  }

  if (input?.resetExisting) {
    learningDb.resetAll();
    learningStudio.resetAll();
  }

  return topics.map((topic) => {
    const result = buildStarterBank(topic);
    return {
      run: createStarterRun(topic, result),
      result,
    };
  });
}

/**
 * Builds a deterministic starter bank using the previous automatic factory as a hard fallback.
 * @param {string} topic Requested learning topic.
 * @returns {BuiltBankResult} Fallback published bank.
 */
export function buildStarterBank(topic: string): BuiltBankResult {
  const kbId = buildBankId(topic);
  const blueprint = getStarterBankBlueprint(topic);
  const existing = learningDb.getLearningData().kbs.find((item) => item.id === kbId);
  if (existing) {
    learningDb.deleteKb(kbId);
  }

  const kb = buildStarterBankMeta(kbId, topic, blueprint);
  const tree = buildStarterTree(kbId, kb.name, blueprint);
  learningDb.createKb(kb);
  learningDb.saveTaxonomy(kbId, tree);

  const qualityWarnings: string[] = [];
  const contents = blueprint.groups.flatMap((group, groupIndex) =>
    group.questions.map((question, questionIndex) => {
      const subjectId = tree.groups[groupIndex]?.id ?? `${groupIndex + 1}-${toStableId(group.title)}`;
      const topicId = tree.groups[groupIndex]?.children[questionIndex]?.id ?? toStableId(question.title);
      const content = normalizeStructuredContent(buildStarterTopicContent(kb.name, topic, group.title, question), {
        title: question.title,
        categoryTitle: group.title,
      });
      const qualityReport = evaluateContentQuality(content, {
        title: question.title,
        categoryTitle: group.title,
      });
      if (!qualityReport.passed) {
        const details = [...qualityReport.blockers, ...qualityReport.issues, ...qualityReport.warnings].filter(Boolean);
        qualityWarnings.push(`${question.title} 质量待加强：${details.join("；") || `评分 ${qualityReport.score}，决策 ${qualityReport.decision}`}`);
      }
      learningDb.addContent(kbId, subjectId, topicId, content);
      return {
        subjectId,
        topicId,
        content,
      };
    })
  );

  return {
    kb,
    tree,
    contents,
    warnings: qualityWarnings,
  };
}
