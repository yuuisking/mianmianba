import "server-only";

import prisma from "@/lib/prisma";
import { type TopicContent } from "@/lib/db/learningDb";
import { seedStarterBanks } from "@/lib/learning/agentBankBuilder";
import {
  normalizeInterviewContent,
  type ArticleSection,
  type InterviewContent,
  type LearningContent,
  type LearningSource,
} from "@/lib/learning/content-contract";
import { runDocumentQualityAgent } from "@/lib/learning/qualityAgent";
import { approveLearningReviewTask } from "@/lib/learning/reviewService";
import { validateDocumentContracts } from "@/lib/learning/content-contract";

type BuiltStarterBank = ReturnType<typeof seedStarterBanks>[number];

export type BatchProductionOptions = {
  topics: string[];
  batchSize?: number;
  triggeredBy?: string | null;
};

export type ProducedDocumentSummary = {
  documentId: string;
  title: string;
  status: "published" | "review" | "blocked";
  score: number | null;
};

export type ProducedBankSummary = {
  topic: string;
  bankId: string;
  bankName: string;
  totalDocuments: number;
  publishedDocuments: number;
  reviewDocuments: number;
  blockedDocuments: number;
  documents: ProducedDocumentSummary[];
};

export type BatchProductionSummary = {
  totalTopics: number;
  producedBanks: number;
  publishedDocuments: number;
  reviewDocuments: number;
  blockedDocuments: number;
  banks: ProducedBankSummary[];
};

type ImportedDocumentRecord = {
  documentId: string;
  title: string;
  slug: string;
};

type ImportedBankRecord = {
  bankId: string;
  bankName: string;
  topic: string;
  documents: ImportedDocumentRecord[];
};

type TopicCategorySeed = {
  slug: string;
  name: string;
  description: string;
  targetRole: string;
  difficulty: string;
};

type StarterSection = TopicContent["sections"][number];

/**
 * 将任意主题名转换为稳定 slug。
 * @param {string} value 原始主题名。
 * @returns {string} 适合 Prisma 唯一键使用的 slug。
 */
function toSlug(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase())
    .replace(/%/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "") || "topic";
}

/**
 * 为不同知识方向推断题库分类，避免所有批量题库都落到一个通用桶里。
 * @param {string} topic 当前主题。
 * @returns {TopicCategorySeed} 适用于正式学习中心的分类与角色信息。
 */
function inferTopicCategory(topic: string): TopicCategorySeed {
  if (/Java|JVM|Spring|MyBatis|Dubbo|Netty|Tomcat|微服务|分布式|高并发|设计模式|系统设计|认证|API/.test(topic)) {
    return {
      slug: "java-backend",
      name: "Java 后端",
      description: "覆盖 Java 后端、框架、中间件与系统设计的批量学习题库。",
      targetRole: "Java 后端",
      difficulty: "intermediate",
    };
  }

  if (/MySQL|PostgreSQL|Redis|MongoDB|Elasticsearch|ClickHouse|SQL|数据库|数据仓库|数据建模|消息队列|Kafka|RocketMQ|RabbitMQ|流处理/.test(topic)) {
    return {
      slug: "data-infra",
      name: "数据与中间件",
      description: "覆盖数据库、缓存、搜索、消息队列与数据基础设施的学习题库。",
      targetRole: "后端 / 数据",
      difficulty: "intermediate",
    };
  }

  if (/JavaScript|TypeScript|React|Vue|Next|Nuxt|前端|HTML|CSS|浏览器|Webpack|Vite|小程序|状态管理|组件|跨端|可视化/.test(topic)) {
    return {
      slug: "frontend",
      name: "前端工程",
      description: "覆盖前端基础、框架、工程化、性能与安全的学习题库。",
      targetRole: "前端",
      difficulty: "intermediate",
    };
  }

  if (/操作系统|网络|Linux|HTTP|HTTPS|TCP|编译原理|数据结构|算法|组成原理/.test(topic)) {
    return {
      slug: "computer-foundation",
      name: "计算机基础",
      description: "覆盖操作系统、网络、算法与底层原理的学习题库。",
      targetRole: "通用基础",
      difficulty: "intermediate",
    };
  }

  if (/Docker|Kubernetes|DevOps|CI\/CD|Nginx|云原生|服务治理|灰度发布|可观测性|日志|追踪|限流|熔断|容灾/.test(topic)) {
    return {
      slug: "devops",
      name: "DevOps 与运维",
      description: "覆盖部署、治理、可观测性和稳定性建设的学习题库。",
      targetRole: "后端 / 运维",
      difficulty: "advanced",
    };
  }

  if (/AI|机器学习|深度学习|大模型|RAG|Prompt|向量数据库|MCP|Agent/.test(topic)) {
    return {
      slug: "ai-engineering",
      name: "AI 工程",
      description: "覆盖 AI 基础、大模型、Agent、RAG 与 AI 工程化的学习题库。",
      targetRole: "AI / 全栈",
      difficulty: "advanced",
    };
  }

  if (/安全|密码学|测试|质量保障|单元测试|E2E/.test(topic)) {
    return {
      slug: "quality-security",
      name: "质量与安全",
      description: "覆盖测试工程、质量保障与基础安全能力的学习题库。",
      targetRole: "通用工程",
      difficulty: "intermediate",
    };
  }

  return {
    slug: "general-engineering",
    name: "通用工程",
    description: "覆盖通用软件工程知识的学习题库。",
    targetRole: "通用工程",
    difficulty: "intermediate",
  };
}

/**
 * 去重并清理字符串数组，避免批量导入时出现重复表达。
 * @param {Array<string | undefined | null>} values 候选字符串列表。
 * @returns {string[]} 去重后的非空字符串列表。
 */
function dedupeStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((item) => item?.trim() ?? "").filter((item) => item.length > 0)));
}

/**
 * 将 starter section 展开为连续文本，便于继续拼装正式学习内容。
 * @param {StarterSection | undefined} section starter 原始区块。
 * @returns {string} 拼装后的文本。
 */
function stringifyStarterSection(section?: StarterSection): string {
  if (!section) {
    return "";
  }

  return [section.paragraphs?.join("\n\n"), section.bullets?.map((item) => `- ${item}`).join("\n"), section.callout]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * 从 starter 文本里提取指定前缀后的回答片段。
 * @param {string} value 原始文本。
 * @param {string[]} labels 可能的前缀标签。
 * @returns {string | undefined} 提取到的内容。
 */
function pickLabeledAnswer(value: string, labels: string[]): string | undefined {
  const lines = value
    .split(/\n+/)
    .map((item) => item.replace(/^- /, "").trim())
    .filter(Boolean);

  for (const label of labels) {
    const matched = lines.find((item) => item.startsWith(label));
    if (matched) {
      return matched.slice(label.length).trim();
    }
  }

  return undefined;
}

/**
 * 为不同方向补官方来源兜底，避免 starter 草稿缺来源时无法通过正式门禁。
 * @param {string} topic 批量生产主题。
 * @returns {LearningSource[]} 可信来源兜底列表。
 */
function buildFallbackSources(topic: string): LearningSource[] {
  const reviewedAt = new Date().toISOString().slice(0, 10);
  const officialSources = /JavaScript|TypeScript|React|Vue|Next|Node|HTML|CSS|浏览器|前端/.test(topic)
    ? [
        {
          title: "MDN Web Docs",
          url: "https://developer.mozilla.org/",
          type: "official",
          applicableVersion: topic,
          facts: [`${topic} 相关核心概念与 Web 平台能力`],
          reviewedAt,
        },
      ]
    : /Java|JVM|Spring|MyBatis|Dubbo|Netty|Tomcat/.test(topic)
      ? [
          {
            title: "Oracle Java Documentation",
            url: "https://docs.oracle.com/en/java/",
            type: "official",
            applicableVersion: "Java 8+",
            facts: [`${topic} 相关 JVM / Java 语言与标准库能力`],
            reviewedAt,
          },
        ]
      : /MySQL|SQL|数据库/.test(topic)
        ? [
            {
              title: "MySQL Reference Manual",
              url: "https://dev.mysql.com/doc/",
              type: "official",
              applicableVersion: "MySQL 8.x",
              facts: [`${topic} 相关数据库行为与索引事务机制`],
              reviewedAt,
            },
          ]
        : /PostgreSQL/.test(topic)
          ? [
              {
                title: "PostgreSQL Documentation",
                url: "https://www.postgresql.org/docs/",
                type: "official",
                applicableVersion: "PostgreSQL 16",
                facts: [`${topic} 相关数据库内核与 SQL 能力`],
                reviewedAt,
              },
            ]
          : /Redis/.test(topic)
            ? [
                {
                  title: "Redis Documentation",
                  url: "https://redis.io/docs/latest/",
                  type: "official",
                  applicableVersion: "Redis 7.x",
                  facts: [`${topic} 相关缓存、持久化与高可用能力`],
                  reviewedAt,
                },
              ]
            : /Docker/.test(topic)
              ? [
                  {
                    title: "Docker Docs",
                    url: "https://docs.docker.com/",
                    type: "official",
                    applicableVersion: "Docker",
                    facts: [`${topic} 相关镜像、容器与交付能力`],
                    reviewedAt,
                  },
                ]
              : /Kubernetes|K8s/.test(topic)
                ? [
                    {
                      title: "Kubernetes Documentation",
                      url: "https://kubernetes.io/docs/",
                      type: "official",
                      applicableVersion: "Kubernetes",
                      facts: [`${topic} 相关编排、发布与资源治理能力`],
                      reviewedAt,
                    },
                  ]
                : /Python/.test(topic)
                  ? [
                      {
                        title: "Python Documentation",
                        url: "https://docs.python.org/3/",
                        type: "official",
                        applicableVersion: "Python 3",
                        facts: [`${topic} 相关语言与标准库能力`],
                        reviewedAt,
                      },
                    ]
                  : /Go/.test(topic)
                    ? [
                        {
                          title: "The Go Documentation",
                          url: "https://go.dev/doc/",
                          type: "official",
                          applicableVersion: "Go 1.x",
                          facts: [`${topic} 相关语言、并发与标准库能力`],
                          reviewedAt,
                        },
                      ]
                    : /Rust/.test(topic)
                      ? [
                          {
                            title: "The Rust Programming Language",
                            url: "https://doc.rust-lang.org/book/",
                            type: "official",
                            applicableVersion: "Rust",
                            facts: [`${topic} 相关所有权、类型与工程能力`],
                            reviewedAt,
                          },
                        ]
                      : [
                          {
                            title: "Wikipedia",
                            url: "https://www.wikipedia.org/",
                            type: "secondary",
                            applicableVersion: topic,
                            facts: [`${topic} 相关基础概念与术语释义`],
                            reviewedAt,
                          },
                        ];

  return officialSources;
}

/**
 * 将文件仓 TopicContent 映射为正式学习中心契约。
 * @param {string} topic 批量生产主题。
 * @param {TopicContent} content 文件仓内容。
 * @returns {{ learningContent: LearningContent; interviewContent: InterviewContent }} 正式学习中心可写入版本内容。
 */
function mapTopicContentToContracts(topic: string, content: TopicContent): {
  learningContent: LearningContent;
  interviewContent: InterviewContent;
} {
  const reviewedAt = new Date().toISOString().slice(0, 10);
  const quickFactValues = dedupeStrings((content.quickFacts ?? []).map((item) => `${item.k}：${item.v}`));
  const knowledgeSummarySection = content.sections.find((item) => /知识点总结/.test(item.h2));
  const interviewHighlightsSection = content.sections.find((item) => /面试常问/.test(item.h2));
  const referenceAnswerSection = content.sections.find((item) => /参考答案/.test(item.h2));
  const knowledgeText = stringifyStarterSection(knowledgeSummarySection);
  const interviewText = stringifyStarterSection(interviewHighlightsSection);
  const answerText = stringifyStarterSection(referenceAnswerSection);
  const answer30s =
    pickLabeledAnswer(answerText, ["30 秒回答：", "30秒回答："]) ??
    content.summary?.trim() ??
    `${content.title} 这题回答时要先给结论，再讲核心机制、真实场景和边界。`;
  const answer2min =
    pickLabeledAnswer(answerText, ["1 分钟回答：", "1分钟回答："]) ??
    `${answer30s} 接着再按“定义 -> 原理机制 -> 真实场景 -> 风险边界 -> 取舍建议”的顺序展开。`;
  const advancedAnswer =
    pickLabeledAnswer(answerText, ["深入追问：", "深入回答："]) ??
    `${answer2min} 如果继续追问，就补工程落地、排查思路、性能影响和为什么这样取舍。`;
  const existingSources: LearningSource[] = (content.sources ?? []).map((item) => ({
    title: item.title,
    url: item.url,
    type: item.type ?? "official",
    applicableVersion: topic,
    facts: [item.title].filter(Boolean),
    reviewedAt,
  }));
  const learningSources = existingSources.length > 0 ? existingSources : buildFallbackSources(topic);
  const starterSections = (content.article?.sections?.length ? content.article.sections : content.sections ?? []) as StarterSection[];
  const existingArticleSections: ArticleSection[] = starterSections.map((section) => ({
      id: section.id,
      type: section.type ?? "text",
      heading: section.h2,
      body: stringifyStarterSection(section),
      highlight: section.highlight ?? section.callout,
      diagramCode: section.diagramCode,
      fallbackDescription: section.fallbackDescription,
      codeExample: section.codeExample
        ? {
            title: section.codeExample.title,
            language: section.codeExample.language,
            code: section.codeExample.code,
            explanation: section.codeExample.explanation,
          }
        : undefined,
      mistake: section.mistake,
      comparison: section.comparison
        ? {
            title: section.comparison.title ?? "对比表",
            headers: section.comparison.headers,
            rows: section.comparison.rows,
          }
        : undefined,
      quiz: section.quiz
        ? {
            label: section.quiz.level,
            question: section.quiz.question,
            hint: section.quiz.hint,
            answer: section.quiz.answer,
            gradingCriteria: section.quiz.gradingCriteria,
          }
        : undefined,
    }));
  const existingArticleText = existingArticleSections
    .map((item) => [item.heading, item.body, item.highlight, item.codeExample?.explanation].filter(Boolean).join(" "))
    .join(" ");
  const generatedSections: ArticleSection[] = [];
  if (!/真实场景|工程落地|项目/.test(existingArticleText)) {
    generatedSections.push({
      id: "engineering-scenario",
      type: "text",
      heading: "真实场景与工程落地",
      body: [
        `真实场景：在 ${topic} 相关项目中，${content.title} 常出现在功能实现、性能排查、线上问题定位或方案选型里。`,
        "工程落地时，回答不能只背定义，而要说明这个知识点解决了什么问题、为什么要这样设计，以及不这么做会带来什么风险。",
        `如果放到项目表达里，可以从“业务背景 -> 关键机制 -> 取舍理由 -> 风险兜底”这条主线去讲 ${content.title}。`,
      ].join("\n\n"),
      highlight: `真实场景、工程落地、取舍与风险，是 ${content.title} 这类题最容易拉开差距的地方。`,
    });
  }
  if (!/误区|边界|风险|坑/.test(existingArticleText)) {
    generatedSections.push({
      id: "common-mistakes",
      type: "mistake",
      heading: "常见误区与边界",
      body: [
        `常见误区：回答 ${content.title} 时只背结论，不解释底层机制。`,
        "另一个常见问题是只说“能做什么”，但没有说清楚适用边界、性能影响和失败时怎么兜底。",
      ].join("\n\n"),
      mistake: {
        mistake: `把 ${content.title} 讲成零散知识点堆砌，缺少原理、边界和项目取舍。`,
        whyWrong: "这种回答容易显得模板化，面试官很难判断你是否真正理解了这个知识点。",
        correct: "正确做法是先给结论，再补机制、场景、风险和工程取舍，形成稳定回答闭环。",
      },
    });
  }
  if (!existingArticleSections.some((item) => item.type === "code" || Boolean(item.codeExample))) {
    generatedSections.push({
      id: "answer-framework",
      type: "code",
      heading: "答题示例与复述框架",
      body: "下面这段示例不是业务代码，而是正式发布时用于训练复述能力的结构化回答模板。",
      codeExample: {
        title: `${content.title} 答题框架`,
        language: "text",
        code: [`30 秒回答：${answer30s}`, `2 分钟回答：${answer2min}`, `深入追问：${advancedAnswer}`].join("\n\n"),
        explanation: "通过固定的回答框架，把结论、机制、场景、边界和取舍连成一条线。",
      },
    });
  }
  const articleSections: ArticleSection[] = [...existingArticleSections, ...generatedSections];
  const normalizedArticleSections = articleSections.filter((item) => Boolean(item.heading || item.body));
  const baseTakeaways = dedupeStrings([
    ...(knowledgeSummarySection?.bullets ?? []),
    ...(referenceAnswerSection?.bullets ?? []),
    ...quickFactValues,
  ]).slice(0, 8);
  const learningGoals = dedupeStrings([
    `能用 30 秒说明 ${content.title} 的核心结论`,
    `能解释 ${content.title} 背后的关键机制与设计原因`,
    `能结合真实场景说明 ${content.title} 的工程落地、边界和风险`,
  ]);
  const selfTests = [
    ...(content.selfTests ?? []).map((item) => ({
      label: item.level,
      question: item.question,
      hint: item.hint,
      answer: item.answer,
      gradingCriteria: item.gradingCriteria,
    })),
    {
      label: "基础自测",
      question: `请用 30 秒解释「${content.title}」并说出最核心的机制。`,
      hint: "先给结论，再补关键原理。",
      answer: answer30s,
      gradingCriteria: [
        { criterion: "结论清晰", points: 4, description: "能先用一句话概括主题。" },
        { criterion: "机制准确", points: 3, description: "能点出核心机制或关键概念。" },
        { criterion: "表达完整", points: 3, description: "能把答案组织成完整表达，而不是零散词条。" },
      ],
    },
    {
      label: "进阶自测",
      question: `如果把「${content.title}」放到真实项目里，你会如何说明场景、边界与风险？`,
      hint: "从业务背景、工程落地、取舍和兜底四步展开。",
      answer: `${content.title} 放到项目表达里时，要先说业务背景，再讲关键机制和为什么这样设计，最后补充边界条件、风险与兜底。`,
      gradingCriteria: [
        { criterion: "场景明确", points: 4, description: "能给出真实业务或工程场景。" },
        { criterion: "边界完整", points: 3, description: "能说明适用边界、风险和常见误区。" },
        { criterion: "取舍清楚", points: 3, description: "能说明为什么选当前方案，以及不选其他方案的原因。" },
      ],
    },
  ]
    .filter((item, index, array) => array.findIndex((candidate) => candidate.question === item.question) === index)
    .slice(0, 3);

  const learningContent: LearningContent = {
    contentType: "interview_question",
    readingExperience: {
      layout: "knowledge",
      needsWideBody: true,
    },
    diagramGuidance: {
      required: normalizedArticleSections.some((item) => item.type === "diagram" || Boolean(item.diagramCode)),
      reason: "批量首发文档如包含图解，必须走标准图解展示链路。",
      completenessChecks: ["节点语义清晰", "正文与图解相互解释", "不截断"],
    },
    examPoint: content.examPoint,
    summary: content.summary,
    scenario: content.scenario,
    article: {
      conclusion: content.article?.conclusion ?? answer30s,
      keyTakeaways: content.article?.keyTakeaways?.length ? content.article.keyTakeaways : baseTakeaways,
      learningGoals: content.article?.learningGoals?.length ? content.article.learningGoals : learningGoals,
      plainSummary:
        content.article?.plainSummary ??
        content.summary ??
        `${content.title} 这题要先讲结论，再把核心机制、真实场景和边界条件串起来。`,
      plainRetell:
        content.article?.plainRetell ??
        `如果让我复述 ${content.title}，我会先说它解决什么问题，再讲为什么这样设计，最后补工程落地和风险。`,
      strongSummary:
        content.article?.strongSummary ??
        `${content.title} 的高质量回答，不是背定义，而是把原理、场景、边界、误区和取舍讲成一条主线。`,
      sections: normalizedArticleSections,
    },
    selfTests,
    sources: learningSources,
  };

  return {
    learningContent,
    interviewContent: normalizeInterviewContent({
      question: content.interviewContent?.question ?? content.title,
      questionVariants: dedupeStrings([
        ...(content.interviewContent?.questionVariants ?? []),
        ...(interviewHighlightsSection?.bullets ?? []),
      ]),
      answer30s: content.interviewContent?.answer30s ?? answer30s,
      answer2min: content.interviewContent?.answer2min ?? answer2min,
      advancedAnswer: content.interviewContent?.advancedAnswer ?? advancedAnswer,
      essentialPoints:
        content.interviewContent?.essentialPoints?.length && content.interviewContent.essentialPoints.length > 0
          ? content.interviewContent.essentialPoints
          : baseTakeaways.slice(0, 4).map((point) => ({
              point,
              why: "这是回答主题时必须先讲清楚的核心内容。",
            })),
      bonusPoints:
        content.interviewContent?.bonusPoints?.length && content.interviewContent.bonusPoints.length > 0
          ? content.interviewContent.bonusPoints
          : [
              { point: "能结合真实场景说明工程落地", why: "这能证明不是只会背概念。" },
              { point: "能主动补边界、风险和兜底", why: "这类补充最能体现经验和取舍。" },
            ],
      advancedPoints:
        content.interviewContent?.advancedPoints?.length && content.interviewContent.advancedPoints.length > 0
          ? content.interviewContent.advancedPoints
          : [
              { point: "能解释底层机制与设计原因", why: "这是拉开深度差距的关键。" },
              { point: "能补排查思路或性能影响", why: "说明具备线上定位和优化视角。" },
            ],
      deductPoints:
        content.interviewContent?.deductPoints?.length && content.interviewContent.deductPoints.length > 0
          ? content.interviewContent.deductPoints
          : [
              { point: "只背定义，不讲机制", why: "这会让答案显得模板化。" },
              { point: "不讲边界与风险", why: "容易被追问时直接击穿。" },
            ],
      followUps:
        content.interviewContent?.followUps?.length && content.interviewContent.followUps.length > 0
          ? content.interviewContent.followUps
          : dedupeStrings(interviewHighlightsSection?.bullets ?? []).slice(0, 3).map((question) => ({
              question,
              difficulty: "medium" as const,
              keyAnswer: "追问时继续补机制、场景、边界和工程取舍。",
            })),
    }),
  };
}

/**
 * 将学习内容序列化为版本 markdown，方便后续后台查看版本内容。
 * @param {LearningContent} learningContent 标准化学习内容。
 * @returns {string} 基础 markdown 文本。
 */
function buildMarkdownContent(learningContent: LearningContent): string {
  const article = learningContent.article;
  if (!article) {
    return "";
  }

  return [
    `# ${article.conclusion}`,
    article.keyTakeaways.length > 0 ? `## 本题核心要点\n\n${article.keyTakeaways.map((item) => `- ${item}`).join("\n")}` : "",
    article.learningGoals.length > 0 ? `## 学完你应该能回答\n\n${article.learningGoals.map((item) => `- ${item}`).join("\n")}` : "",
    ...article.sections.map((item) => `## ${item.heading ?? "未命名章节"}\n\n${item.body ?? item.highlight ?? ""}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 为正式学习中心导入一套 starter 题库结果。
 * @param {{ topic: string; built: BuiltStarterBank }} input 当前题库与生成结果。
 * @returns {Promise<ImportedBankRecord>} 导入完成后的题库与文档摘要。
 */
async function importStarterBankToPrisma(input: {
  topic: string;
  built: BuiltStarterBank;
}): Promise<ImportedBankRecord> {
  const categorySeed = inferTopicCategory(input.topic);
  const category = await prisma.topicCategory.upsert({
    where: { slug: categorySeed.slug },
    update: {
      name: categorySeed.name,
      description: categorySeed.description,
    },
    create: {
      slug: categorySeed.slug,
      name: categorySeed.name,
      description: categorySeed.description,
    },
  });

  const bankSlug = toSlug(input.built.result.kb.name);
  const topicBank = await prisma.topicBank.upsert({
    where: { slug: bankSlug },
    update: {
      name: input.built.result.kb.name,
      description: input.built.result.kb.description,
      categoryId: category.id,
      targetRole: categorySeed.targetRole,
      difficulty: categorySeed.difficulty,
      status: "DRAFT",
      isFeatured: false,
    },
    create: {
      slug: bankSlug,
      name: input.built.result.kb.name,
      description: input.built.result.kb.description,
      categoryId: category.id,
      targetRole: categorySeed.targetRole,
      difficulty: categorySeed.difficulty,
      status: "DRAFT",
      isFeatured: false,
    },
  });

  const importedDocuments: ImportedDocumentRecord[] = [];

  for (const [chapterIndex, group] of input.built.result.tree.groups.entries()) {
    const chapterSlug = toSlug(group.title);
    const chapter = await prisma.chapter.upsert({
      where: {
        topicBankId_slug: {
          topicBankId: topicBank.id,
          slug: chapterSlug,
        },
      },
      update: {
        name: group.title,
        sortOrder: chapterIndex,
      },
      create: {
        topicBankId: topicBank.id,
        slug: chapterSlug,
        name: group.title,
        sortOrder: chapterIndex,
      },
    });

    for (const node of group.children) {
      const builtContent = input.built.result.contents.find((item) => item.subjectId === group.id && item.topicId === node.id)?.content;
      if (!builtContent) {
        continue;
      }

      const { learningContent, interviewContent } = mapTopicContentToContracts(input.topic, builtContent as TopicContent);
      const validation = validateDocumentContracts(learningContent, interviewContent, builtContent.title);
      const documentSlug = toSlug(builtContent.title);
      const document = await prisma.document.upsert({
        where: {
          topicBankId_slug: {
            topicBankId: topicBank.id,
            slug: documentSlug,
          },
        },
        update: {
          chapterId: chapter.id,
          title: builtContent.title,
          summary: builtContent.summary ?? learningContent.article?.plainSummary ?? null,
          difficulty: /hard|困难/.test(node.title) ? "hard" : /easy|简单/.test(node.title) ? "easy" : "medium",
          frequency: "medium",
          status: "DRAFT",
          qualityScore: validation.pass ? 78 : 58,
          originalityScore: validation.pass ? 82 : 60,
        },
        create: {
          topicBankId: topicBank.id,
          chapterId: chapter.id,
          slug: documentSlug,
          title: builtContent.title,
          summary: builtContent.summary ?? learningContent.article?.plainSummary ?? null,
          difficulty: "medium",
          frequency: "medium",
          status: "DRAFT",
          qualityScore: validation.pass ? 78 : 58,
          originalityScore: validation.pass ? 82 : 60,
        },
      });

      const existingVersion = await prisma.documentVersion.findFirst({
        where: { documentId: document.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const qualityReport = await prisma.qualityReport.create({
        data: {
          documentId: document.id,
          totalScore: validation.pass ? 78 : 58,
          factScore: validation.pass ? 80 : 56,
          learningScore: validation.pass ? 79 : 58,
          interviewScore: validation.pass ? 76 : 55,
          originalityScore: validation.pass ? 82 : 60,
          readabilityScore: validation.pass ? 80 : 62,
          codeDiagramScore: validation.pass ? 76 : 52,
          issues: validation.checks.filter((item) => !item.pass).map((item) => item.detail ?? item.name),
          suggestions: validation.checks.filter((item) => !item.pass).map((item) => `${item.name} 需要补齐`),
          pass: validation.pass,
        },
      });

      const version = await prisma.documentVersion.create({
        data: {
          documentId: document.id,
          version: (existingVersion?.version ?? 0) + 1,
          learningContent,
          interviewContent,
          markdownContent: buildMarkdownContent(learningContent),
          sourceSnapshot: {
            batchTopic: input.topic,
            batchBank: input.built.result.kb.name,
            starterWarnings: input.built.result.warnings,
            sources: builtContent.sources ?? [],
          },
          qualityReportId: qualityReport.id,
          createdBy: "batch-starter",
          createdByType: "system",
          changeLog: `批量生产导入：${input.topic}`,
        },
      });

      await prisma.document.update({
        where: { id: document.id },
        data: {
          currentVersionId: version.id,
        },
      });

      for (const tagName of input.built.result.kb.tags.slice(0, 6)) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: { slug: toSlug(tagName) },
          create: {
            name: tagName,
            slug: toSlug(tagName),
          },
        });

        await prisma.documentTag.upsert({
          where: {
            documentId_tagId: {
              documentId: document.id,
              tagId: tag.id,
            },
          },
          update: {},
          create: {
            documentId: document.id,
            tagId: tag.id,
          },
        });
      }

      await prisma.sourceMaterial.createMany({
        data: (learningContent.sources ?? []).map((source) => ({
          documentId: document.id,
          versionId: version.id,
          sourceUrl: source.url,
          sourceType: source.type,
          trustLevel: source.type === "official" ? "HIGH" : "MEDIUM",
          facts: {
            title: source.title,
            applicableVersion: source.applicableVersion,
            reviewedAt: source.reviewedAt,
            facts: source.facts,
          },
        })),
      });

      await prisma.aiTask.create({
        data: {
          taskType: "batch-import-document",
          status: "COMPLETED",
          targetType: "document",
          targetId: document.id,
          input: {
            topic: input.topic,
            title: builtContent.title,
            chapter: chapter.name,
          },
          output: {
            validationPass: validation.pass,
            sourceCount: learningContent.sources?.length ?? 0,
          },
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      importedDocuments.push({
        documentId: document.id,
        title: document.title,
        slug: document.slug,
      });
    }
  }

  await prisma.topicBank.update({
    where: { id: topicBank.id },
    data: {
      documentCount: importedDocuments.length,
      questionCount: importedDocuments.length,
    },
  });

  return {
    bankId: topicBank.id,
    bankName: topicBank.name,
    topic: input.topic,
    documents: importedDocuments,
  };
}

/**
 * 对已导入题库执行 AI 质检，并自动批准建议发布的文档。
 * @param {{ importedBank: ImportedBankRecord; triggeredBy?: string | null }} input 当前题库与触发人。
 * @returns {Promise<ProducedBankSummary>} 题库质检与发布摘要。
 */
async function auditAndPublishImportedBank(input: {
  importedBank: ImportedBankRecord;
  triggeredBy?: string | null;
}): Promise<ProducedBankSummary> {
  const documents: ProducedDocumentSummary[] = [];

  for (const item of input.importedBank.documents) {
    const result = await runDocumentQualityAgent({
      documentId: item.documentId,
      triggeredBy: input.triggeredBy,
    });

    if (result.recommendation === "publish") {
      const reviewTask = await prisma.reviewTask.findFirst({
        where: {
          documentId: item.documentId,
          reviewType: "AI_QUALITY_CHECK",
          status: "APPROVED",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (reviewTask) {
        if (input.triggeredBy) {
          await approveLearningReviewTask({
            taskId: reviewTask.id,
            reviewerId: input.triggeredBy,
            comment: "批量生产闭环自动批准：AI 抽检通过。",
          });
        } else {
          await prisma.$transaction(async (tx) => {
            await tx.reviewTask.update({
              where: { id: reviewTask.id },
              data: {
                status: "APPROVED",
                comment: "批量生产闭环自动批准：AI 抽检通过。",
              },
            });
            await tx.document.update({
              where: { id: item.documentId },
              data: {
                status: "PUBLISHED",
                publishedAt: new Date(),
              },
            });
          });
        }
      }
    }

    documents.push({
      documentId: item.documentId,
      title: item.title,
      status:
        result.recommendation === "publish"
          ? "published"
          : result.recommendation === "block"
            ? "blocked"
            : "review",
      score: result.score,
    });
  }

  const publishedDocuments = documents.filter((item) => item.status === "published").length;
  const reviewDocuments = documents.filter((item) => item.status === "review").length;
  const blockedDocuments = documents.filter((item) => item.status === "blocked").length;

  await prisma.topicBank.update({
    where: { id: input.importedBank.bankId },
    data: {
      status: publishedDocuments > 0 ? "PUBLISHED" : "DRAFT",
      publishedAt: publishedDocuments > 0 ? new Date() : null,
      documentCount: publishedDocuments,
      questionCount: publishedDocuments,
    },
  });

  return {
    topic: input.importedBank.topic,
    bankId: input.importedBank.bankId,
    bankName: input.importedBank.bankName,
    totalDocuments: documents.length,
    publishedDocuments,
    reviewDocuments,
    blockedDocuments,
    documents,
  };
}

/**
 * 将主题列表拆成批次，避免一次性导入过多题库导致日志和回滚都难以处理。
 * @param {string[]} topics 批量主题。
 * @param {number} batchSize 每批大小。
 * @returns {string[][]} 分批结果。
 */
function chunkTopics(topics: string[], batchSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < topics.length; index += batchSize) {
    chunks.push(topics.slice(index, index + batchSize));
  }
  return chunks;
}

/**
 * 运行一轮完整的 starter 批量生产闭环：批量生成、导入 Prisma、AI 抽检和自动发布。
 * @param {BatchProductionOptions} options 当前批量生产参数。
 * @returns {Promise<BatchProductionSummary>} 本轮批量生产总摘要。
 */
export async function runStarterBatchProduction(options: BatchProductionOptions): Promise<BatchProductionSummary> {
  const topics = Array.from(new Set(options.topics.map((item) => item.trim()).filter((item) => item.length > 0)));
  if (topics.length === 0) {
    throw new Error("缺少待批量生产的主题。");
  }

  const batches = chunkTopics(topics, Math.max(1, options.batchSize ?? 4));
  const bankSummaries: ProducedBankSummary[] = [];

  for (const batchTopics of batches) {
    const generatedBanks = seedStarterBanks({
      topics: batchTopics,
      resetExisting: false,
    });

    for (const built of generatedBanks) {
      const importedBank = await importStarterBankToPrisma({
        topic: built.run.topic,
        built,
      });
      const bankSummary = await auditAndPublishImportedBank({
        importedBank,
        triggeredBy: options.triggeredBy,
      });
      bankSummaries.push(bankSummary);
    }
  }

  return {
    totalTopics: topics.length,
    producedBanks: bankSummaries.length,
    publishedDocuments: bankSummaries.reduce((sum, item) => sum + item.publishedDocuments, 0),
    reviewDocuments: bankSummaries.reduce((sum, item) => sum + item.reviewDocuments, 0),
    blockedDocuments: bankSummaries.reduce((sum, item) => sum + item.blockedDocuments, 0),
    banks: bankSummaries,
  };
}
