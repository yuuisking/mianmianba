import { NextResponse } from "next/server";
import { learningDb, type TopicContent } from "@/lib/db/learningDb";

type LearningPlanCoverageStatus = "high" | "partial" | "missing";

type LearningPlanDoc = {
  kbId: string;
  kbName: string;
  topicId: string;
  title: string;
  reason: string;
  evidence: string;
};

type LearningPlanStep = {
  order: number;
  title: string;
  objective: string;
  recommendedReason: string;
  capabilityGap: string;
  coverageStatus: LearningPlanCoverageStatus;
  coverageSummary: string;
  docs: LearningPlanDoc[];
};

type LearningPlan = {
  id: string;
  goal: string;
  createdAt: string;
  trackKey: string;
  trackLabel: string;
  overview: string;
  coverageOverview: string;
  steps: LearningPlanStep[];
  uncovered: string[];
};

type PlanRequestBody = {
  goal?: unknown;
};

type TopicCandidate = {
  kbId: string;
  kbName: string;
  topicId: string;
  title: string;
  summary: string;
  systemTitle: string;
  searchableText: string;
  normalizedText: string;
  score: number;
  tags: string[];
};

type RoadmapKey = "java-backend" | "frontend" | "vue" | "general";

type RoadmapConcept = {
  label: string;
  keywords: string[];
};

type RoadmapStepBlueprint = {
  key: string;
  title: string;
  objective: string;
  recommendedReason: string;
  capabilityGap: string;
  expectedCoverage: string;
  maxDocs: number;
  concepts: RoadmapConcept[];
  preferredKbIds?: string[];
};

type RoadmapBlueprint = {
  key: RoadmapKey;
  label: string;
  overview: string;
  uncovered: string[];
  steps: RoadmapStepBlueprint[];
};

type StepMatchResult = {
  candidate: TopicCandidate;
  matchedConcepts: string[];
  stepScore: number;
};

const JAVA_CORE_KB_ID = "javae79fa5e8af86e5ba93";

const ROADMAP_BLUEPRINTS: Record<RoadmapKey, RoadmapBlueprint> = {
  "java-backend": {
    key: "java-backend",
    label: "Java 后端路线",
    overview:
      "目标更接近 Java 后端主流学习路线，建议先打语言基础，再补集合并发、JVM、排障调优，最后进入框架与分布式实战。",
    uncovered: [
      "当前公开知识库没有系统覆盖 Spring / Spring Boot、MySQL、Redis、MQ、分布式事务与微服务治理，这一段只能保留路线提醒，不能伪造文档链接。",
    ],
    steps: [
      {
        key: "java-foundation",
        title: "第 1 步：先打 Java 语言与核心机制基础",
        objective: "先建立语法、关键字、泛型、反射与语言机制的整体框架，避免后面学集合、并发和框架时只会背结论。",
        recommendedReason: "Java 后端路线里，语言机制是后续所有源码题、JVM 题和框架题的前置基础，必须先补齐。",
        capabilityGap: "如果这一层不牢，面试里容易把泛型擦除、反射、代理、SPI 等高频问题说成碎片知识点。",
        expectedCoverage: "语法、关键字、泛型、反射、代理、SPI",
        maxDocs: 4,
        preferredKbIds: [JAVA_CORE_KB_ID],
        concepts: [
          { label: "Java 基础语法", keywords: ["java基础", "基础常见面试题", "语法", "关键字", "java 关键字"] },
          { label: "泛型与类型系统", keywords: ["泛型", "通配符", "wildcard"] },
          { label: "反射与代理", keywords: ["反射", "代理"] },
          { label: "扩展机制", keywords: ["spi", "unsafe"] },
        ],
      },
      {
        key: "java-collections-concurrency",
        title: "第 2 步：补集合、并发与线程协作模型",
        objective: "把集合底层结构、并发容器、锁机制和线程池串起来，形成源码题与实战题的共同底座。",
        recommendedReason: "Java 面试和日常后端开发里，集合与并发是最常见的追问区，越早补越能提升答题质量。",
        capabilityGap: "如果只会背 HashMap、AQS、线程池结论，不清楚使用边界和实现取舍，就很难承接高频追问。",
        expectedCoverage: "集合源码、并发容器、AQS、锁、线程池",
        maxDocs: 4,
        preferredKbIds: [JAVA_CORE_KB_ID],
        concepts: [
          { label: "集合与源码结构", keywords: ["hashmap", "arraylist", "linkedhashmap", "priorityqueue", "集合"] },
          { label: "并发容器", keywords: ["concurrenthashmap", "copyonwritearraylist", "arrayblockingqueue"] },
          { label: "锁与同步器", keywords: ["aqs", "reentrantlock", "乐观锁", "悲观锁", "atomic"] },
          { label: "线程池", keywords: ["线程池", "thread pool"] },
        ],
      },
      {
        key: "java-jvm",
        title: "第 3 步：进入 JVM、类加载与内存模型",
        objective: "在具备语言和并发基础后，再系统补 JVM、类加载、运行时内存和 GC，形成排障与性能调优的解释能力。",
        recommendedReason: "JVM 题通常不是孤立知识点，而是和对象分配、类加载、线程模型、GC 日志分析连在一起的。",
        capabilityGap: "如果缺少运行时视角，遇到 OOM、GC 抖动、类加载冲突或线上性能波动时，往往只会背参数不会定位。",
        expectedCoverage: "JVM 入门、类加载、内存区域、GC、参数与字节码",
        maxDocs: 4,
        preferredKbIds: [JAVA_CORE_KB_ID],
        concepts: [
          { label: "JVM 基本认知", keywords: ["jvm", "虚拟机", "内存区域"] },
          { label: "类加载机制", keywords: ["类加载", "classloader", "class file"] },
          { label: "GC 与内存回收", keywords: ["垃圾回收", "gc", "memory area"] },
          { label: "参数与诊断", keywords: ["jvm参数", "监控", "故障处理工具"] },
        ],
      },
      {
        key: "java-troubleshooting",
        title: "第 4 步：补性能调优、线上排障与语言机制串联",
        objective: "把 JVM、并发和语言机制落到真实排障场景，形成“现象 -> 定位 -> 验证 -> 修复”的表达链路。",
        recommendedReason: "主流 Java 后端路线不能只停在概念层，最终要能解释线上问题、调优路径和取舍过程。",
        capabilityGap: "如果没有问题排查视角，面对线上 CPU 飙高、Full GC、线程阻塞或类加载异常时会明显失分。",
        expectedCoverage: "线上排障、监控工具、调优案例、语言机制联动",
        maxDocs: 4,
        preferredKbIds: [JAVA_CORE_KB_ID],
        concepts: [
          { label: "线上排障案例", keywords: ["线上问题", "性能调优", "故障处理", "监控"] },
          { label: "JVM 参数与工具", keywords: ["jvm参数", "监控和故障处理工具"] },
          { label: "语言机制扩展", keywords: ["spi", "代理", "反射", "unsafe"] },
        ],
      },
      {
        key: "java-frameworks",
        title: "第 5 步：进入框架、中间件与分布式实战",
        objective: "最后再把语言、并发、JVM 底层能力迁移到 Spring、数据库、缓存、消息队列和分布式系统设计。",
        recommendedReason: "这一步才是 Java 后端路线真正落到业务开发的部分，但前面的基础不牢会导致这里只会背八股。",
        capabilityGap: "如果没有框架与中间件层的积累，很难覆盖业务项目里最常见的接口设计、缓存一致性、事务和高并发场景。",
        expectedCoverage: "Spring、数据库、缓存、MQ、微服务与分布式设计",
        maxDocs: 3,
        concepts: [
          { label: "Spring 生态", keywords: ["spring", "spring boot", "ioc", "aop"] },
          { label: "数据库与缓存", keywords: ["mysql", "redis", "事务", "索引"] },
          { label: "中间件与分布式", keywords: ["mq", "消息队列", "微服务", "分布式"] },
        ],
      },
    ],
  },
  frontend: {
    key: "frontend",
    label: "前端主流路线",
    overview:
      "目标更接近前端主流学习路线，建议按“Web 基础 -> 浏览器与网络 -> 工程化 -> 框架 -> 性能测试”推进。",
    uncovered: [
      "当前公开知识库没有系统覆盖 HTML、CSS、JavaScript、浏览器、TypeScript、React、工程化与测试文档，所以只能给出真实的学习顺序和缺口提示，不能补不存在的链接。",
    ],
    steps: [
      {
        key: "frontend-foundation",
        title: "第 1 步：先补 Web 基础与 JavaScript",
        objective: "先打 HTML、CSS、JavaScript 与 DOM 事件基础，确保后续学框架时不是只会套组件。",
        recommendedReason: "前端路线里，语言和页面基础决定了后面能不能真正理解组件、状态和渲染机制。",
        capabilityGap: "如果这一步缺失，常见的事件流、原型链、异步模型和布局问题会反复卡住。",
        expectedCoverage: "HTML、CSS、JavaScript、DOM、异步",
        maxDocs: 3,
        concepts: [
          { label: "HTML/CSS", keywords: ["html", "css", "布局"] },
          { label: "JavaScript 基础", keywords: ["javascript", "js", "语法", "异步"] },
          { label: "DOM 与浏览器交互", keywords: ["dom", "事件", "浏览器"] },
        ],
      },
      {
        key: "frontend-browser-network",
        title: "第 2 步：理解浏览器、HTTP 与网络安全",
        objective: "把渲染流程、缓存、网络协议和安全边界补起来，形成页面性能与问题定位的基础能力。",
        recommendedReason: "主流前端岗位会高频追问浏览器渲染、缓存策略、跨域和安全问题，这一步不能跳。",
        capabilityGap: "如果只会写页面但不懂浏览器与网络，性能优化和线上问题排查会缺少底层解释能力。",
        expectedCoverage: "浏览器渲染、缓存、HTTP、跨域与安全",
        maxDocs: 3,
        concepts: [
          { label: "浏览器渲染", keywords: ["浏览器", "渲染", "event loop"] },
          { label: "HTTP 与缓存", keywords: ["http", "缓存", "network"] },
          { label: "安全", keywords: ["安全", "xss", "csrf", "跨域"] },
        ],
      },
      {
        key: "frontend-engineering",
        title: "第 3 步：补 TypeScript 与工程化",
        objective: "在基础能力稳定后，再补 TypeScript、包管理、构建工具、模块化和 CI/CD。",
        recommendedReason: "真实前端工作很少停在页面级开发，工程化能力会直接决定协作效率和可维护性。",
        capabilityGap: "如果这一层缺失，项目规模一变大就容易在类型、安全发布、构建和依赖管理上失控。",
        expectedCoverage: "TypeScript、模块化、Vite/Webpack、包管理、CI/CD",
        maxDocs: 3,
        concepts: [
          { label: "TypeScript", keywords: ["typescript", "ts"] },
          { label: "构建工具", keywords: ["vite", "webpack", "构建"] },
          { label: "工程协作", keywords: ["ci/cd", "测试", "包管理"] },
        ],
      },
      {
        key: "frontend-framework",
        title: "第 4 步：进入框架思维与组件化开发",
        objective: "再系统学习组件、状态管理、路由、请求管理和页面拆分，形成主流框架思维。",
        recommendedReason: "前端岗位最终还是要落到 React 或 Vue 等主流框架，这一步决定项目交付能力。",
        capabilityGap: "如果没有框架思维，组件边界、状态流转、路由组织和复用策略都会比较混乱。",
        expectedCoverage: "React/Vue、组件化、状态管理、路由",
        maxDocs: 3,
        concepts: [
          { label: "组件化", keywords: ["组件", "component"] },
          { label: "状态管理", keywords: ["state", "pinia", "redux", "状态"] },
          { label: "路由与应用组织", keywords: ["router", "路由"] },
        ],
      },
      {
        key: "frontend-performance",
        title: "第 5 步：补性能优化、测试与稳定性",
        objective: "最后再收口首屏性能、可维护性、测试和监控，形成可上线的前端工程能力。",
        recommendedReason: "主流前端路线的后半段重点不只是会写页面，而是能把应用长期稳定跑起来。",
        capabilityGap: "如果没有性能和测试视角，页面虽然能做出来，但很难支撑复杂业务和持续迭代。",
        expectedCoverage: "性能优化、监控、测试、SSR/SEO",
        maxDocs: 3,
        concepts: [
          { label: "性能优化", keywords: ["性能", "优化"] },
          { label: "测试", keywords: ["测试", "unit test", "e2e"] },
          { label: "SSR 与稳定性", keywords: ["ssr", "seo", "监控"] },
        ],
      },
    ],
  },
  vue: {
    key: "vue",
    label: "Vue 主流路线",
    overview:
      "目标更接近 Vue 主流学习路线，建议按“Web 基础 -> Vue 3 响应式 -> 路由与状态 -> 工程化 -> 性能与 SSR”推进。",
    uncovered: [
      "当前公开知识库没有系统覆盖 Vue 3、组合式 API、Router、Pinia、Vite、Nuxt 等内容，所以会明确缺口而不是硬塞无关文档。",
    ],
    steps: [
      {
        key: "vue-foundation",
        title: "第 1 步：先补 Web 基础与 JavaScript/TypeScript",
        objective: "Vue 之前先打语言和页面基础，避免把响应式和组件通信当成框架黑盒。",
        recommendedReason: "Vue 学习路线虽然上手快，但没有 JS / TS / DOM 基础，后面很容易卡在响应式细节和调试问题上。",
        capabilityGap: "如果基础不牢，组合式 API、异步更新、模板编译和组件调试都会比较吃力。",
        expectedCoverage: "HTML、CSS、JavaScript、TypeScript、DOM",
        maxDocs: 3,
        concepts: [
          { label: "Web 基础", keywords: ["html", "css", "dom", "布局"] },
          { label: "JavaScript", keywords: ["javascript", "js", "异步"] },
          { label: "TypeScript", keywords: ["typescript", "ts"] },
        ],
      },
      {
        key: "vue-reactivity",
        title: "第 2 步：掌握 Vue 3 响应式与组合式 API",
        objective: "把 `ref`、`reactive`、`computed`、`watch` 和组合式 API 理顺，建立 Vue 3 的核心心智模型。",
        recommendedReason: "Vue 3 的主流写法已经全面转向组合式 API，这一步决定你后续组件设计是否自然。",
        capabilityGap: "如果不理解响应式原理和组合式 API，组件抽象、状态拆分和调试体验会比较混乱。",
        expectedCoverage: "响应式、组合式 API、组件生命周期",
        maxDocs: 3,
        concepts: [
          { label: "响应式系统", keywords: ["reactive", "ref", "响应式", "computed", "watch"] },
          { label: "组合式 API", keywords: ["composition api", "组合式", "setup"] },
          { label: "生命周期", keywords: ["生命周期", "lifecycle"] },
        ],
      },
      {
        key: "vue-application",
        title: "第 3 步：补路由、状态管理与组件通信",
        objective: "在核心语法稳定后，再补 Router、Pinia、组件通信和应用级目录组织方式。",
        recommendedReason: "Vue 岗位的真实项目通常会考察单页应用组织能力，而不是只会写单个组件。",
        capabilityGap: "如果这一步缺失，页面拆分、跨组件协作和复杂状态流转会很容易失控。",
        expectedCoverage: "Vue Router、Pinia、组件通信、页面组织",
        maxDocs: 3,
        concepts: [
          { label: "路由", keywords: ["router", "路由"] },
          { label: "状态管理", keywords: ["pinia", "状态", "store"] },
          { label: "组件通信", keywords: ["props", "emit", "provide", "inject"] },
        ],
      },
      {
        key: "vue-engineering",
        title: "第 4 步：补 Vite、构建与工程协作",
        objective: "继续补 Vite、模块化、环境变量、发布流程和测试，形成团队协作的工程能力。",
        recommendedReason: "Vue 只是框架层，真正交付项目还需要工程化能力来支撑开发、构建和发布。",
        capabilityGap: "如果没有工程化基础，开发环境、构建配置、依赖升级和测试链路都会成为瓶颈。",
        expectedCoverage: "Vite、构建配置、测试、发布流程",
        maxDocs: 3,
        concepts: [
          { label: "Vite 与构建", keywords: ["vite", "构建"] },
          { label: "测试", keywords: ["测试", "vitest", "cypress"] },
          { label: "发布与环境配置", keywords: ["发布", "环境变量", "ci/cd"] },
        ],
      },
      {
        key: "vue-performance",
        title: "第 5 步：补性能优化、SSR 与 Nuxt 方向",
        objective: "最后再补性能、首屏优化、SSR/SEO 和 Nuxt 等进阶方向，完成 Vue 主流路线闭环。",
        recommendedReason: "Vue 路线的后半段重点在于应用级优化与交付能力，而不是继续堆砌语法点。",
        capabilityGap: "如果缺少这一层，应用规模一上来就会在首屏性能、SEO 和可维护性上暴露短板。",
        expectedCoverage: "性能优化、SSR、SEO、Nuxt",
        maxDocs: 3,
        concepts: [
          { label: "性能优化", keywords: ["性能", "优化"] },
          { label: "SSR 与 SEO", keywords: ["ssr", "seo"] },
          { label: "Nuxt", keywords: ["nuxt"] },
        ],
      },
    ],
  },
  general: {
    key: "general",
    label: "通用技术路线",
    overview:
      "当前目标没有明显落在 Java 后端、前端或 Vue 单一路线，我先按通用学习顺序整理现有公开知识库的真实覆盖情况。",
    uncovered: [
      "如果目标更像具体岗位，请补充岗位名称、JD 关键词或技术栈，学习顺序会更贴近主流路线。",
    ],
    steps: [
      {
        key: "general-foundation",
        title: "第 1 步：先补基础概念与核心术语",
        objective: "先建立当前方向的概念地图，保证后续阅读不是零散跳题。",
        recommendedReason: "没有基础概念打底，后面的源码、排障或工程实践都很容易失去上下文。",
        capabilityGap: "如果基础术语和概念图谱不完整，通常只能记住结论，无法解释原因和边界。",
        expectedCoverage: "基础概念、关键术语、入门认知",
        maxDocs: 3,
        concepts: [
          { label: "基础概念", keywords: ["基础", "介绍", "概览", "入门"] },
          { label: "核心术语", keywords: ["核心", "概念", "机制"] },
        ],
      },
      {
        key: "general-principles",
        title: "第 2 步：补底层原理与实现机制",
        objective: "再从原理、源码或机制层面理解关键模块，形成可解释能力。",
        recommendedReason: "大多数技术方向的中段学习都依赖对核心机制的理解，而不是只看 API 结论。",
        capabilityGap: "如果缺少机制层理解，遇到深入追问时很容易停留在表层用法。",
        expectedCoverage: "底层原理、实现机制、源码视角",
        maxDocs: 3,
        concepts: [
          { label: "原理", keywords: ["原理", "机制", "源码"] },
          { label: "实现细节", keywords: ["实现", "过程", "结构"] },
        ],
      },
      {
        key: "general-practice",
        title: "第 3 步：补工程实践与问题排查",
        objective: "最后再把原理迁移到真实工程、调优和排障场景。",
        recommendedReason: "真正能支撑面试和工作交付的，通常是“原理 + 实战 + 排障”一起成立。",
        capabilityGap: "如果没有实战视角，知识点容易停留在记忆层，难以迁移到业务问题。",
        expectedCoverage: "工程实践、调优、排障案例",
        maxDocs: 3,
        concepts: [
          { label: "工程实践", keywords: ["实践", "案例", "实战"] },
          { label: "调优排障", keywords: ["调优", "排查", "监控", "故障"] },
        ],
      },
    ],
  },
};

/**
 * 将目标描述拆成中英文关键词，供知识库匹配使用。
 * @param {string} goal 用户输入的岗位目标或学习目标。
 * @returns {string[]} 参与匹配的关键词数组。
 */
function tokenizeGoal(goal: string): string[] {
  const baseTokens =
    goal.toLowerCase().match(/[a-z0-9+#./-]+|[\u4e00-\u9fa5]{2,}/g)?.map((item) => item.trim()) ?? [];

  return Array.from(new Set([goal.trim().toLowerCase(), ...baseTokens].filter(Boolean)));
}

/**
 * 将任意文本归一化为便于关键词匹配的小写串。
 * @param {string} value 原始文本。
 * @returns {string} 归一化后的文本。
 */
function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * 判断文本中是否命中任一关键词。
 * @param {string} text 已归一化的文本。
 * @param {string[]} keywords 候选关键词数组。
 * @returns {boolean} 是否至少命中一个关键词。
 */
function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

/**
 * 从文档内容中提取一个适合作为计划摘要的短句。
 * @param {TopicContent} content 文档正文结构。
 * @returns {string} 文档摘要。
 */
function buildTopicSummary(content: TopicContent): string {
  return (
    content.quickFacts.find((item) => item.k.includes("一句话"))?.v ||
    content.quickFacts[0]?.v ||
    content.sections[0]?.paragraphs?.[0] ||
    `${content.title} 可作为当前目标的学习材料。`
  );
}

/**
 * 从文档面包屑中提取更符合“体系”表达的标题。
 * @param {string} kbName 当前知识库名称。
 * @param {TopicContent} content 当前文档内容。
 * @returns {string} 对应的体系标题。
 */
function resolveSystemTitle(kbName: string, content: TopicContent): string {
  const candidates = content.breadcrumb.filter(Boolean);
  return candidates[1] || candidates[0] || kbName;
}

/**
 * 基于文档文本推断候选文档所属方向标签，避免 Java 路线误命中过多 Android 文档。
 * @param {string} normalizedText 已归一化的候选文本。
 * @returns {string[]} 候选文档标签集合。
 */
function inferCandidateTags(normalizedText: string): string[] {
  const tags = new Set<string>();

  if (
    includesAnyKeyword(normalizedText, [
      "android",
      "activity",
      "fragment",
      "intent",
      "recyclerview",
      "jetpack compose",
      "compose",
      "okhttp",
      "retrofit",
      "adb",
      "room",
    ])
  ) {
    tags.add("android");
  }

  if (
    includesAnyKeyword(normalizedText, [
      "jvm",
      "classloader",
      "类加载",
      "垃圾回收",
      "gc",
      "hashmap",
      "aqs",
      "线程池",
      "反射",
      "spi",
    ])
  ) {
    tags.add("java-core");
  }

  if (includesAnyKeyword(normalizedText, ["ai", "agent", "rag", "workflow", "mcp"])) {
    tags.add("ai");
  }

  return Array.from(tags);
}

/**
 * 计算候选文档与目标描述的相关度分数。
 * @param {string} searchableText 候选文档的可搜索文本。
 * @param {string[]} tokens 用户目标关键词。
 * @returns {number} 简单匹配分数，分数越高越相关。
 */
function scoreCandidate(searchableText: string, tokens: string[]): number {
  const text = searchableText.toLowerCase();
  return tokens.reduce((score, token) => {
    if (!token) {
      return score;
    }

    if (text.includes(token)) {
      return score + Math.max(token.length, 2);
    }

    return score;
  }, 0);
}

/**
 * 构建学习计划可用的文档候选池。
 * @param {string[]} tokens 用户目标关键词。
 * @returns {TopicCandidate[]} 已按相关度排序的候选文档数组。
 */
function buildCandidates(tokens: string[]): TopicCandidate[] {
  const data = learningDb.getLearningData();
  const candidates: TopicCandidate[] = [];

  for (const kb of data.kbs) {
    const topics = data.contents[kb.id] ?? {};

    for (const [topicId, content] of Object.entries(topics)) {
      const summary = buildTopicSummary(content);
      const systemTitle = resolveSystemTitle(kb.name, content);
      const searchableText = [
        kb.name,
        kb.subtitle,
        kb.tags.join(" "),
        content.title,
        content.breadcrumb.join(" "),
        systemTitle,
        summary,
        content.sections.map((section) => section.h2).join(" "),
        content.sections
          .flatMap((section) => section.paragraphs ?? [])
          .slice(0, 4)
          .join(" "),
        content.sections
          .flatMap((section) => section.bullets ?? [])
          .slice(0, 8)
          .join(" "),
      ]
        .filter(Boolean)
        .join(" ");
      const normalizedText = normalizeText(searchableText);

      candidates.push({
        kbId: kb.id,
        kbName: kb.name,
        topicId,
        title: content.title,
        summary,
        systemTitle,
        searchableText,
        normalizedText,
        score: scoreCandidate(searchableText, tokens),
        tags: inferCandidateTags(normalizedText),
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}

/**
 * 根据用户目标识别更贴近的学习路线基线。
 * @param {string} goal 用户原始目标文本。
 * @param {string[]} tokens 用户目标关键词。
 * @returns {RoadmapBlueprint} 对应的路线定义。
 */
function detectRoadmap(goal: string, tokens: string[]): RoadmapBlueprint {
  const normalizedGoal = normalizeText(goal);
  const tokenText = `${normalizedGoal} ${tokens.join(" ")}`;

  if (includesAnyKeyword(tokenText, ["vue", "vue3", "vue 3", "nuxt", "pinia", "组合式 api"])) {
    return ROADMAP_BLUEPRINTS.vue;
  }

  if (
    includesAnyKeyword(tokenText, [
      "前端",
      "frontend",
      "react",
      "javascript",
      "typescript",
      "浏览器",
      "html",
      "css",
      "vite",
      "webpack",
    ])
  ) {
    return ROADMAP_BLUEPRINTS.frontend;
  }

  if (
    includesAnyKeyword(tokenText, [
      "java",
      "后端",
      "backend",
      "jvm",
      "spring",
      "spring boot",
      "并发",
      "集合",
      "mysql",
      "redis",
    ])
  ) {
    return ROADMAP_BLUEPRINTS["java-backend"];
  }

  return ROADMAP_BLUEPRINTS.general;
}

/**
 * 计算候选文档与某一步学习目标的命中情况与排序分数。
 * @param {TopicCandidate} candidate 当前候选文档。
 * @param {RoadmapStepBlueprint} step 当前步骤定义。
 * @param {RoadmapKey} roadmapKey 当前路线标识。
 * @returns {StepMatchResult | null} 命中结果；若完全不匹配则返回 `null`。
 */
function matchCandidateToStep(
  candidate: TopicCandidate,
  step: RoadmapStepBlueprint,
  roadmapKey: RoadmapKey
): StepMatchResult | null {
  const matchedConcepts = step.concepts
    .filter((concept) => includesAnyKeyword(candidate.normalizedText, concept.keywords))
    .map((concept) => concept.label);

  if (matchedConcepts.length === 0) {
    return null;
  }

  let stepScore = candidate.score + matchedConcepts.length * 28;

  if (step.preferredKbIds?.includes(candidate.kbId)) {
    stepScore += 10;
  }

  if (roadmapKey === "java-backend" && candidate.tags.includes("android")) {
    stepScore -= 18;
  }

  if (roadmapKey === "general" && candidate.score === 0) {
    stepScore -= 6;
  }

  return {
    candidate,
    matchedConcepts,
    stepScore,
  };
}

/**
 * 将候选文档说明收口为计划中展示的推荐理由。
 * @param {TopicCandidate} candidate 命中的候选文档。
 * @param {string[]} matchedConcepts 该文档命中的能力点。
 * @returns {string} 前端可直接展示的推荐理由。
 */
function buildDocumentReason(candidate: TopicCandidate, matchedConcepts: string[]): string {
  const conceptLabel = matchedConcepts.slice(0, 2).join("、") || candidate.systemTitle;
  const normalizedSummary = candidate.summary.replace(/\s+/g, " ").trim();
  const conciseSummary =
    normalizedSummary.length > 68 ? `${normalizedSummary.slice(0, 68).trim()}...` : normalizedSummary;

  return `优先补 ${conceptLabel}，${conciseSummary}`;
}

/**
 * 将文档来源整理成更明确的展示依据。
 * @param {TopicCandidate} candidate 命中的候选文档。
 * @returns {string} 文档依据描述。
 */
function buildDocumentEvidence(candidate: TopicCandidate): string {
  return `依据：${candidate.kbName} / ${candidate.systemTitle}`;
}

/**
 * 生成单个学习步骤的覆盖状态。
 * @param {RoadmapStepBlueprint} step 当前步骤定义。
 * @param {Set<string>} matchedConcepts 当前步骤已命中的能力点。
 * @param {number} docsCount 当前步骤命中的文档数量。
 * @returns {LearningPlanCoverageStatus} 覆盖状态。
 */
function resolveCoverageStatus(
  step: RoadmapStepBlueprint,
  matchedConcepts: Set<string>,
  docsCount: number
): LearningPlanCoverageStatus {
  if (docsCount === 0 || matchedConcepts.size === 0) {
    return "missing";
  }

  const conceptCoverage = matchedConcepts.size / Math.max(step.concepts.length, 1);
  if (conceptCoverage >= 0.6 || docsCount >= Math.min(3, step.maxDocs)) {
    return "high";
  }

  return "partial";
}

/**
 * 生成单个学习步骤的覆盖范围说明。
 * @param {RoadmapStepBlueprint} step 当前步骤定义。
 * @param {Set<string>} matchedConcepts 当前步骤已命中的能力点。
 * @param {LearningPlanCoverageStatus} status 当前步骤覆盖状态。
 * @returns {string} 覆盖说明。
 */
function buildCoverageSummary(
  step: RoadmapStepBlueprint,
  matchedConcepts: Set<string>,
  status: LearningPlanCoverageStatus
): string {
  const covered = Array.from(matchedConcepts);
  const missing = step.concepts
    .map((concept) => concept.label)
    .filter((label) => !matchedConcepts.has(label));

  if (status === "missing") {
    return `当前公开知识库暂无“${step.expectedCoverage}”的有效文档，这一步保留为主流路线提醒，后续需要补库。`;
  }

  if (status === "high") {
    return missing.length > 0
      ? `当前已覆盖 ${covered.join("、")}；剩余 ${missing.join("、")} 还可以继续补强。`
      : `当前已覆盖 ${covered.join("、")}，可以按这一步的顺序直接开始阅读。`;
  }

  return `当前已覆盖 ${covered.join("、")}；但 ${missing.join("、")} 仍然偏弱，这一步只能算部分覆盖。`;
}

/**
 * 生成单个学习步骤的缺口说明。
 * @param {RoadmapStepBlueprint} step 当前步骤定义。
 * @param {Set<string>} matchedConcepts 当前步骤已命中的能力点。
 * @param {LearningPlanCoverageStatus} status 当前步骤覆盖状态。
 * @returns {string} 能力缺口说明。
 */
function buildCapabilityGap(
  step: RoadmapStepBlueprint,
  matchedConcepts: Set<string>,
  status: LearningPlanCoverageStatus
): string {
  const missing = step.concepts
    .map((concept) => concept.label)
    .filter((label) => !matchedConcepts.has(label));

  if (status === "missing") {
    return `${step.capabilityGap} 当前知识库还缺少这一步的对应文档，需要后续补充 ${step.expectedCoverage}。`;
  }

  if (status === "partial" && missing.length > 0) {
    return `${step.capabilityGap} 目前还缺 ${missing.join("、")} 的系统材料。`;
  }

  return step.capabilityGap;
}

/**
 * 为单个路线步骤挑选最合适的真实文档，并整理成前端可解释结果。
 * @param {params} 步骤构建参数。
 * @returns {LearningPlanStep} 单个步骤的计划结果。
 */
function buildPlanStep(params: {
  step: RoadmapStepBlueprint;
  order: number;
  roadmapKey: RoadmapKey;
  candidates: TopicCandidate[];
  usedTopics: Set<string>;
}): LearningPlanStep {
  const { step, order, roadmapKey, candidates, usedTopics } = params;
  const matches = candidates
    .filter((candidate) => !usedTopics.has(`${candidate.kbId}:${candidate.topicId}`))
    .map((candidate) => matchCandidateToStep(candidate, step, roadmapKey))
    .filter((match): match is StepMatchResult => Boolean(match))
    .sort(
      (left, right) =>
        right.stepScore - left.stepScore ||
        right.matchedConcepts.length - left.matchedConcepts.length ||
        left.candidate.title.localeCompare(right.candidate.title)
    )
    .slice(0, step.maxDocs);

  const matchedConcepts = new Set<string>();
  const docs = matches.map((match) => {
    usedTopics.add(`${match.candidate.kbId}:${match.candidate.topicId}`);
    match.matchedConcepts.forEach((label) => matchedConcepts.add(label));

    return {
      kbId: match.candidate.kbId,
      kbName: match.candidate.kbName,
      topicId: match.candidate.topicId,
      title: match.candidate.title,
      reason: buildDocumentReason(match.candidate, match.matchedConcepts),
      evidence: buildDocumentEvidence(match.candidate),
    };
  });

  const coverageStatus = resolveCoverageStatus(step, matchedConcepts, docs.length);

  return {
    order,
    title: step.title,
    objective: step.objective,
    recommendedReason: step.recommendedReason,
    capabilityGap: buildCapabilityGap(step, matchedConcepts, coverageStatus),
    coverageStatus,
    coverageSummary: buildCoverageSummary(step, matchedConcepts, coverageStatus),
    docs,
  };
}

/**
 * 构造学习计划主键，便于前端做历史记录归档。
 * @param {string} goal 用户目标。
 * @param {string} createdAt 计划生成时间。
 * @returns {string} 稳定的计划标识。
 */
function buildPlanId(goal: string, createdAt: string): string {
  return `${createdAt}-${encodeURIComponent(goal).slice(0, 48)}`;
}

/**
 * 汇总路线步骤中的覆盖缺口，明确哪些主流能力点在当前知识库中仍为空白。
 * @param {RoadmapBlueprint} roadmap 当前路线定义。
 * @param {LearningPlanStep[]} steps 已生成的步骤结果。
 * @returns {string[]} 需要在前端展示的缺口提示。
 */
function buildUncoveredSummary(roadmap: RoadmapBlueprint, steps: LearningPlanStep[]): string[] {
  const uncovered = [...roadmap.uncovered];

  for (const step of steps) {
    if (step.coverageStatus === "missing") {
      uncovered.push(`${step.title} 目前没有真实文档支撑，建议后续优先补这一段知识库。`);
      continue;
    }

    if (step.coverageStatus === "partial") {
      uncovered.push(`${step.title} 只有部分覆盖，阅读时要明确它还不能替代完整路线。`);
    }
  }

  return Array.from(new Set(uncovered)).slice(0, 8);
}

/**
 * 根据路线命中情况生成总览说明，帮助用户快速理解当前计划依据。
 * @param {RoadmapBlueprint} roadmap 当前路线定义。
 * @param {LearningPlanStep[]} steps 已生成的步骤结果。
 * @returns {string} 学习计划总览。
 */
function buildCoverageOverview(roadmap: RoadmapBlueprint, steps: LearningPlanStep[]): string {
  const highCount = steps.filter((step) => step.coverageStatus === "high").length;
  const partialCount = steps.filter((step) => step.coverageStatus === "partial").length;
  const missingCount = steps.filter((step) => step.coverageStatus === "missing").length;

  return `${roadmap.label}共 ${steps.length} 步：${highCount} 步可直接阅读，${partialCount} 步部分覆盖，${missingCount} 步仍缺公开文档。`;
}

/**
 * 基于主流路线基线和当前真实知识库生成可解释学习计划。
 * @param {string} goal 用户目标描述。
 * @param {string[]} tokens 用户目标关键词。
 * @param {TopicCandidate[]} candidates 相关候选文档。
 * @returns {LearningPlan} 可直接返回前端的学习计划。
 */
function buildLearningPlan(goal: string, tokens: string[], candidates: TopicCandidate[]): LearningPlan {
  const roadmap = detectRoadmap(goal, tokens);
  const createdAt = new Date().toISOString();
  const usedTopics = new Set<string>();
  const steps = roadmap.steps.map((step, index) =>
    buildPlanStep({
      step,
      order: index + 1,
      roadmapKey: roadmap.key,
      candidates,
      usedTopics,
    })
  );

  return {
    id: buildPlanId(goal, createdAt),
    goal,
    createdAt,
    trackKey: roadmap.key,
    trackLabel: roadmap.label,
    overview: `${roadmap.overview} 结果只引用当前公开知识库里的真实文档，不会补不存在的链接。`,
    coverageOverview: buildCoverageOverview(roadmap, steps),
    steps,
    uncovered: buildUncoveredSummary(roadmap, steps),
  };
}

/**
 * 处理公开学习中心的学习计划生成请求。
 * @param {Request} request POST 请求。
 * @returns {Promise<NextResponse>} 可直接在前端渲染的学习计划结果。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as PlanRequestBody;
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";

  if (!goal) {
    return NextResponse.json({ error: "请输入岗位 JD、目标岗位或学习目标。" }, { status: 400 });
  }

  const tokens = tokenizeGoal(goal);
  const candidates = buildCandidates(tokens);
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "当前公开学习中心还没有可用于生成计划的文档。" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ plan: buildLearningPlan(goal, tokens, candidates) });
  } catch (error) {
    console.error("Learning plan generation failed:", error);
    return NextResponse.json({ error: "学习计划生成失败，请稍后重试。" }, { status: 500 });
  }
}
