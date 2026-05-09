import { type KbInfo } from "../db/learningDb";
import { type SourceType } from "../db/learningFactory";

export type DiscoveredSourceCategory = "official" | "community" | "github";
export type SourceQualityGate = "accepted" | "rejected";
export type SourceBoundaryVerdict = "in_scope" | "out_of_scope";
export type KnowledgeDomainId =
  | "java-core"
  | "frontend-general"
  | "vue-frontend"
  | "react-frontend"
  | "ai-ml"
  | "general-engineering";

export type KnowledgeTopicProfile = {
  rawTopic: string;
  normalizedTopic: string;
  kbId: string;
  kbName: string;
  subtitle: string;
  description: string;
  tags: string[];
  domainId: KnowledgeDomainId;
  domainLabel: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  qualityThreshold: number;
  maxSources: number;
  boundarySummary: string;
};

export type DiscoveredSourceSeed = {
  title: string;
  url: string;
  type: SourceType;
  subject: string;
  category: DiscoveredSourceCategory;
  rationale: string;
  authorityScore: number;
  freshnessScore: number;
  relevanceBoost?: number;
  qualityScore: number;
  qualityGate: SourceQualityGate;
  boundaryVerdict: SourceBoundaryVerdict;
  selectionReason: string;
};

export type DiscoveredSourceSelection = {
  profile: KnowledgeTopicProfile;
  accepted: DiscoveredSourceSeed[];
  rejected: DiscoveredSourceSeed[];
};

type SourceCatalogItem = {
  title: string;
  url: string;
  type: SourceType;
  subject: string;
  category: DiscoveredSourceCategory;
  rationale: string;
  authorityScore: number;
  freshnessScore: number;
  relevanceBoost?: number;
};

type DomainDefinition = {
  label: string;
  canonicalKbId: string;
  canonicalKbName: string;
  matchers: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  tags: string[];
  qualityThreshold: number;
  maxSources: number;
  boundarySummary: string;
  sources: SourceCatalogItem[];
};

const DOMAIN_DEFINITIONS: Record<KnowledgeDomainId, DomainDefinition> = {
  "java-core": {
    label: "Java 核心与后端基础",
    canonicalKbId: "kb-java",
    canonicalKbName: "Java",
    matchers: ["java", "jvm", "spring", "后端", "并发", "集合", "jdbc"],
    includeKeywords: ["java", "jvm", "spring", "并发", "集合", "后端", "jdk"],
    excludeKeywords: ["android", "kotlin", "jetpack", "compose", "flutter", "ios"],
    tags: ["Java", "后端", "基础", "面试"],
    qualityThreshold: 82,
    maxSources: 14,
    boundarySummary: "聚焦 Java 语言、JVM、并发、集合与主流后端工程实践，不混入 Android 与移动端专题。",
    sources: [
      {
        title: "Oracle Java 文档",
        url: "https://docs.oracle.com/en/java/",
        type: "web_page",
        subject: "Java 语言与标准库",
        category: "official",
        rationale: "JDK 语法、标准库和版本能力以官方文档为准。",
        authorityScore: 98,
        freshnessScore: 94,
        relevanceBoost: 10,
      },
      {
        title: "OpenJDK 官方文档",
        url: "https://openjdk.org/",
        type: "web_page",
        subject: "JVM 与 JDK",
        category: "official",
        rationale: "JVM、JEP 与 OpenJDK 的演进以官方来源为准。",
        authorityScore: 97,
        freshnessScore: 92,
        relevanceBoost: 9,
      },
      {
        title: "Spring Framework 官方文档",
        url: "https://docs.spring.io/",
        type: "web_page",
        subject: "Spring 与工程化",
        category: "official",
        rationale: "Java 后端工程实践需要稳定的 Spring 主文档入口。",
        authorityScore: 96,
        freshnessScore: 91,
        relevanceBoost: 8,
      },
      {
        title: "Apache Maven 官方指南",
        url: "https://maven.apache.org/guides/",
        type: "web_page",
        subject: "构建与依赖管理",
        category: "official",
        rationale: "构建、依赖管理和插件配置以 Maven 官方说明为准。",
        authorityScore: 95,
        freshnessScore: 87,
        relevanceBoost: 7,
      },
      {
        title: "Java Language Specification",
        url: "https://docs.oracle.com/javase/specs/",
        type: "web_page",
        subject: "Java 语言规范",
        category: "official",
        rationale: "语法、类型、泛型与内存模型等底层规则以语言规范为准。",
        authorityScore: 98,
        freshnessScore: 90,
        relevanceBoost: 9,
      },
      {
        title: "Spring Boot Reference Documentation",
        url: "https://docs.spring.io/spring-boot/reference/",
        type: "web_page",
        subject: "Spring Boot 实战",
        category: "official",
        rationale: "Java 后端主流工程化落地通常离不开 Spring Boot 参考文档。",
        authorityScore: 96,
        freshnessScore: 93,
        relevanceBoost: 8,
      },
      {
        title: "MyBatis 官方文档",
        url: "https://mybatis.org/mybatis-3/zh_CN/index.html",
        type: "web_page",
        subject: "数据访问与 ORM",
        category: "official",
        rationale: "数据访问体系需要覆盖主流 ORM / SQL 映射实践。",
        authorityScore: 90,
        freshnessScore: 86,
        relevanceBoost: 7,
      },
      {
        title: "JUnit 5 User Guide",
        url: "https://junit.org/junit5/docs/current/user-guide/",
        type: "web_page",
        subject: "测试体系",
        category: "official",
        rationale: "Java 工程体系应补齐测试、断言与自动化质量保障资料。",
        authorityScore: 91,
        freshnessScore: 92,
        relevanceBoost: 6,
      },
      {
        title: "spring-projects/spring-boot",
        url: "https://github.com/spring-projects/spring-boot",
        type: "github_directory",
        subject: "Spring Boot 样例与源码",
        category: "github",
        rationale: "高 star 官方仓库，可用于补齐目录与工程化样例。",
        authorityScore: 94,
        freshnessScore: 93,
        relevanceBoost: 8,
      },
      {
        title: "openjdk/jdk",
        url: "https://github.com/openjdk/jdk",
        type: "github_directory",
        subject: "JDK 源码",
        category: "github",
        rationale: "适合为底层原理、集合与并发专题提供源码参考。",
        authorityScore: 95,
        freshnessScore: 90,
        relevanceBoost: 9,
      },
      {
        title: "Baeldung Java",
        url: "https://www.baeldung.com/",
        type: "web_page",
        subject: "Java 与 Spring 实战",
        category: "community",
        rationale: "社区里覆盖度较好的 Java / Spring 实战教程，可作为辅材。",
        authorityScore: 86,
        freshnessScore: 86,
        relevanceBoost: 8,
      },
      {
        title: "Spring Guides",
        url: "https://spring.io/guides",
        type: "web_page",
        subject: "Spring 实战指南",
        category: "official",
        rationale: "适合补齐 Java 后端从基础到落地的场景化样例。",
        authorityScore: 92,
        freshnessScore: 91,
        relevanceBoost: 8,
      },
      {
        title: "Alibaba Java 开发手册",
        url: "https://github.com/alibaba/p3c",
        type: "github_directory",
        subject: "Java 规范与工程实践",
        category: "github",
        rationale: "适合补齐工程规范、编码习惯与质量门槛。",
        authorityScore: 88,
        freshnessScore: 85,
        relevanceBoost: 7,
      },
      {
        title: "Apache Dubbo 官方文档",
        url: "https://dubbo.apache.org/zh-cn/overview/what/",
        type: "web_page",
        subject: "分布式服务治理",
        category: "official",
        rationale: "Java 大而全目录需要覆盖 RPC、服务治理与分布式协作。",
        authorityScore: 89,
        freshnessScore: 86,
        relevanceBoost: 7,
      },
      {
        title: "Redis 官方文档",
        url: "https://redis.io/docs/latest/",
        type: "web_page",
        subject: "缓存与数据结构",
        category: "official",
        rationale: "Java 后端面试体系通常离不开缓存设计与 Redis 实战。",
        authorityScore: 95,
        freshnessScore: 94,
        relevanceBoost: 7,
      },
      {
        title: "Java Design Patterns",
        url: "https://java-design-patterns.com/",
        type: "web_page",
        subject: "设计模式",
        category: "community",
        rationale: "适合补设计模式案例，但权威性低于官方资料。",
        authorityScore: 76,
        freshnessScore: 78,
        relevanceBoost: 6,
      },
    ],
  },
  "frontend-general": {
    label: "前端基础与工程化",
    canonicalKbId: "kb-frontend",
    canonicalKbName: "前端",
    matchers: ["frontend", "前端", "javascript", "typescript", "浏览器", "web", "html", "css"],
    includeKeywords: ["前端", "javascript", "typescript", "浏览器", "web", "html", "css", "工程化"],
    excludeKeywords: ["android", "ios", "java", "spring", "mysql"],
    tags: ["前端", "JavaScript", "TypeScript", "工程化"],
    qualityThreshold: 80,
    maxSources: 14,
    boundarySummary: "聚焦 Web 前端基础、浏览器机制、TypeScript 与工程化，不混入 Java 后端或移动端专题。",
    sources: [
      {
        title: "MDN Web Docs",
        url: "https://developer.mozilla.org/zh-CN/",
        type: "web_page",
        subject: "Web 基础",
        category: "official",
        rationale: "HTML、CSS、JavaScript 与 Web API 的基础能力以 MDN 为主。",
        authorityScore: 98,
        freshnessScore: 94,
        relevanceBoost: 10,
      },
      {
        title: "TypeScript 官方文档",
        url: "https://www.typescriptlang.org/docs/",
        type: "web_page",
        subject: "TypeScript",
        category: "official",
        rationale: "类型系统、配置与新特性优先使用官方文档。",
        authorityScore: 97,
        freshnessScore: 92,
        relevanceBoost: 10,
      },
      {
        title: "web.dev",
        url: "https://web.dev/",
        type: "web_page",
        subject: "性能与现代 Web",
        category: "community",
        rationale: "适合补性能、可访问性与现代 Web 实战。",
        authorityScore: 88,
        freshnessScore: 90,
        relevanceBoost: 8,
      },
      {
        title: "javascript.info",
        url: "https://javascript.info/",
        type: "web_page",
        subject: "JavaScript 核心",
        category: "community",
        rationale: "适合整理语言基础、浏览器机制和事件循环等体系化材料。",
        authorityScore: 86,
        freshnessScore: 83,
        relevanceBoost: 9,
      },
      {
        title: "Vite 官方文档",
        url: "https://vite.dev/guide/",
        type: "web_page",
        subject: "前端工程化",
        category: "official",
        rationale: "前端工程化构建能力可以从 Vite 官方指南补齐。",
        authorityScore: 95,
        freshnessScore: 91,
        relevanceBoost: 8,
      },
      {
        title: "vitejs/vite",
        url: "https://github.com/vitejs/vite",
        type: "github_directory",
        subject: "构建工具源码",
        category: "github",
        rationale: "高 star 构建工具仓库，可用于补充工程化案例。",
        authorityScore: 91,
        freshnessScore: 92,
        relevanceBoost: 7,
      },
      {
        title: "CSS-Tricks",
        url: "https://css-tricks.com/",
        type: "web_page",
        subject: "CSS 与布局",
        category: "community",
        rationale: "适合补 CSS 细节，但整体质量不应压过基础官方来源。",
        authorityScore: 77,
        freshnessScore: 78,
        relevanceBoost: 6,
      },
      {
        title: "W3C Web Standards",
        url: "https://www.w3.org/TR/",
        type: "web_page",
        subject: "Web 标准",
        category: "official",
        rationale: "大而全前端目录需要有标准规范类资料兜底。",
        authorityScore: 94,
        freshnessScore: 88,
        relevanceBoost: 7,
      },
      {
        title: "WHATWG HTML",
        url: "https://html.spec.whatwg.org/",
        type: "web_page",
        subject: "HTML 标准",
        category: "official",
        rationale: "表单、语义化、浏览器行为等问题适合回到标准层。",
        authorityScore: 94,
        freshnessScore: 90,
        relevanceBoost: 7,
      },
      {
        title: "HTTP MDN 指南",
        url: "https://developer.mozilla.org/zh-CN/docs/Web/HTTP",
        type: "web_page",
        subject: "网络协议",
        category: "official",
        rationale: "前端大目录需要覆盖缓存、跨域、Cookie、HTTP 语义等专题。",
        authorityScore: 97,
        freshnessScore: 93,
        relevanceBoost: 8,
      },
      {
        title: "Google Chrome Developers",
        url: "https://developer.chrome.com/docs",
        type: "web_page",
        subject: "浏览器能力与性能",
        category: "official",
        rationale: "可补齐性能、PWA、渲染和 DevTools 相关知识。",
        authorityScore: 90,
        freshnessScore: 92,
        relevanceBoost: 7,
      },
    ],
  },
  "vue-frontend": {
    label: "Vue 体系与工程化",
    canonicalKbId: "kb-vue",
    canonicalKbName: "Vue",
    matchers: ["vue", "vue3", "pinia", "nuxt", "组合式 api", "composition api"],
    includeKeywords: ["vue", "vue3", "pinia", "vite", "nuxt", "组合式"],
    excludeKeywords: ["react", "redux", "android", "spring", "java"],
    tags: ["Vue", "Vue3", "组合式 API", "工程化"],
    qualityThreshold: 82,
    maxSources: 14,
    boundarySummary: "聚焦 Vue3、组合式 API、路由、状态管理与工程化，不混入 React 或无关后端专题。",
    sources: [
      {
        title: "Vue 官方文档",
        url: "https://cn.vuejs.org/",
        type: "web_page",
        subject: "Vue3 基础",
        category: "official",
        rationale: "Vue3 组合式 API、模板与响应式能力以官方文档为准。",
        authorityScore: 98,
        freshnessScore: 94,
        relevanceBoost: 10,
      },
      {
        title: "Vue Router 官方文档",
        url: "https://router.vuejs.org/zh/",
        type: "web_page",
        subject: "路由",
        category: "official",
        rationale: "单页应用路由能力应以 Vue Router 官方文档为准。",
        authorityScore: 96,
        freshnessScore: 90,
        relevanceBoost: 9,
      },
      {
        title: "Pinia 官方文档",
        url: "https://pinia.vuejs.org/zh/",
        type: "web_page",
        subject: "状态管理",
        category: "official",
        rationale: "Vue 当前主流状态管理方案以 Pinia 为主。",
        authorityScore: 95,
        freshnessScore: 90,
        relevanceBoost: 9,
      },
      {
        title: "Nuxt 官方文档",
        url: "https://nuxt.com/docs",
        type: "web_page",
        subject: "SSR 与全栈",
        category: "official",
        rationale: "Vue 生态里的 SSR 与工程化能力适合由 Nuxt 官方补齐。",
        authorityScore: 94,
        freshnessScore: 91,
        relevanceBoost: 8,
      },
      {
        title: "Vite 官方文档",
        url: "https://vite.dev/guide/",
        type: "web_page",
        subject: "构建与工程化",
        category: "official",
        rationale: "Vue 项目的主流构建链路通常由 Vite 负责。",
        authorityScore: 95,
        freshnessScore: 91,
        relevanceBoost: 8,
      },
      {
        title: "vuejs/core",
        url: "https://github.com/vuejs/core",
        type: "github_directory",
        subject: "Vue 核心源码",
        category: "github",
        rationale: "高 star 官方仓库，适合补响应式原理与运行时实现。",
        authorityScore: 96,
        freshnessScore: 93,
        relevanceBoost: 9,
      },
      {
        title: "vuejs/pinia",
        url: "https://github.com/vuejs/pinia",
        type: "github_directory",
        subject: "Pinia 源码",
        category: "github",
        rationale: "可作为状态管理专题的源码补充。",
        authorityScore: 92,
        freshnessScore: 90,
        relevanceBoost: 8,
      },
      {
        title: "Awesome Vue",
        url: "https://github.com/vuejs/awesome-vue",
        type: "github_directory",
        subject: "社区生态",
        category: "community",
        rationale: "适合补生态参考，但不应作为首要事实依据。",
        authorityScore: 76,
        freshnessScore: 82,
        relevanceBoost: 5,
      },
      {
        title: "Vue School Articles",
        url: "https://vueschool.io/articles/",
        type: "web_page",
        subject: "Vue 实战专题",
        category: "community",
        rationale: "可补齐组件封装、Nuxt、项目实践类内容。",
        authorityScore: 80,
        freshnessScore: 84,
        relevanceBoost: 6,
      },
      {
        title: "nuxt/nuxt",
        url: "https://github.com/nuxt/nuxt",
        type: "github_directory",
        subject: "Nuxt 源码",
        category: "github",
        rationale: "适合补 SSR、服务端渲染和全栈能力专题。",
        authorityScore: 91,
        freshnessScore: 92,
        relevanceBoost: 7,
      },
      {
        title: "Element Plus 文档",
        url: "https://element-plus.org/zh-CN/",
        type: "web_page",
        subject: "Vue 组件库实践",
        category: "official",
        rationale: "中后台业务场景通常离不开组件库与表单表格实践。",
        authorityScore: 86,
        freshnessScore: 88,
        relevanceBoost: 6,
      },
    ],
  },
  "react-frontend": {
    label: "React 体系与工程化",
    canonicalKbId: "kb-react",
    canonicalKbName: "React",
    matchers: ["react", "next", "redux", "hooks", "react router"],
    includeKeywords: ["react", "hooks", "next", "redux", "react router"],
    excludeKeywords: ["vue", "pinia", "android", "spring", "java"],
    tags: ["React", "Hooks", "前端", "工程化"],
    qualityThreshold: 82,
    maxSources: 14,
    boundarySummary: "聚焦 React、Hooks、状态管理与工程化，不混入 Vue 或无关后端专题。",
    sources: [
      {
        title: "React 官方文档",
        url: "https://react.dev/",
        type: "web_page",
        subject: "React 核心",
        category: "official",
        rationale: "组件、Hooks 与最新推荐实践以官方文档为准。",
        authorityScore: 98,
        freshnessScore: 94,
        relevanceBoost: 10,
      },
      {
        title: "Next.js 官方文档",
        url: "https://nextjs.org/docs",
        type: "web_page",
        subject: "应用框架",
        category: "official",
        rationale: "React 主流应用框架的路由、渲染与部署应以官方文档为准。",
        authorityScore: 95,
        freshnessScore: 92,
        relevanceBoost: 9,
      },
      {
        title: "React Router 文档",
        url: "https://reactrouter.com/",
        type: "web_page",
        subject: "路由",
        category: "official",
        rationale: "客户端路由应优先读取官方文档。",
        authorityScore: 93,
        freshnessScore: 88,
        relevanceBoost: 8,
      },
      {
        title: "Redux Toolkit 文档",
        url: "https://redux-toolkit.js.org/",
        type: "web_page",
        subject: "状态管理",
        category: "official",
        rationale: "React 状态管理中的工程化方案可以用 Redux Toolkit 补齐。",
        authorityScore: 92,
        freshnessScore: 87,
        relevanceBoost: 7,
      },
      {
        title: "facebook/react",
        url: "https://github.com/facebook/react",
        type: "github_directory",
        subject: "React 源码",
        category: "github",
        rationale: "高 star 官方仓库，可作为 Hooks 与调度机制的源码参考。",
        authorityScore: 96,
        freshnessScore: 92,
        relevanceBoost: 8,
      },
      {
        title: "vercel/next.js",
        url: "https://github.com/vercel/next.js",
        type: "github_directory",
        subject: "Next.js 源码",
        category: "github",
        rationale: "主流 React 应用框架的高 star 仓库，可辅助工程化专题。",
        authorityScore: 94,
        freshnessScore: 93,
        relevanceBoost: 7,
      },
      {
        title: "Kent C. Dodds Blog",
        url: "https://kentcdodds.com/blog",
        type: "web_page",
        subject: "React 实践",
        category: "community",
        rationale: "适合补实践经验，但优先级低于官方文档。",
        authorityScore: 78,
        freshnessScore: 80,
        relevanceBoost: 6,
      },
      {
        title: "TanStack Query 文档",
        url: "https://tanstack.com/query/latest",
        type: "web_page",
        subject: "数据同步与缓存",
        category: "official",
        rationale: "React 大而全目录需要覆盖服务端状态管理与请求缓存。",
        authorityScore: 90,
        freshnessScore: 91,
        relevanceBoost: 7,
      },
      {
        title: "react-hook-form 文档",
        url: "https://react-hook-form.com/",
        type: "web_page",
        subject: "表单工程化",
        category: "official",
        rationale: "React 业务场景中表单是高频模块，适合作为专题来源。",
        authorityScore: 87,
        freshnessScore: 88,
        relevanceBoost: 6,
      },
      {
        title: "ant-design/ant-design",
        url: "https://github.com/ant-design/ant-design",
        type: "github_directory",
        subject: "中后台组件库",
        category: "github",
        rationale: "适合补齐 React 中后台项目、组件库和设计系统实践。",
        authorityScore: 90,
        freshnessScore: 89,
        relevanceBoost: 6,
      },
    ],
  },
  "ai-ml": {
    label: "AI / 大模型 / Agent",
    canonicalKbId: "kb-ai",
    canonicalKbName: "AI",
    matchers: ["ai", "llm", "rag", "agent", "大模型", "人工智能", "机器学习", "推理", "深度学习"],
    includeKeywords: ["ai", "llm", "rag", "agent", "模型", "推理", "训练", "机器学习"],
    excludeKeywords: ["android", "spring", "mysql", "ios"],
    tags: ["AI", "LLM", "Agent", "RAG"],
    qualityThreshold: 82,
    maxSources: 14,
    boundarySummary: "聚焦 AI、LLM、RAG 与 Agent 工程，不混入无关移动端或传统 CRUD 后端专题。",
    sources: [
      {
        title: "Hugging Face 文档",
        url: "https://huggingface.co/docs",
        type: "web_page",
        subject: "模型与推理",
        category: "official",
        rationale: "模型、数据集和推理工具链可以从 Hugging Face 主文档拉取。",
        authorityScore: 97,
        freshnessScore: 94,
        relevanceBoost: 10,
      },
      {
        title: "PyTorch 官方文档",
        url: "https://pytorch.org/docs/stable/index.html",
        type: "web_page",
        subject: "训练与深度学习框架",
        category: "official",
        rationale: "训练、推理和算子能力优先使用 PyTorch 官方文档。",
        authorityScore: 97,
        freshnessScore: 93,
        relevanceBoost: 9,
      },
      {
        title: "LangChain 官方文档",
        url: "https://python.langchain.com/docs/introduction/",
        type: "web_page",
        subject: "Agent 与工作流",
        category: "official",
        rationale: "Agent、工作流和 RAG 工具链适合从官方入口补齐。",
        authorityScore: 93,
        freshnessScore: 91,
        relevanceBoost: 8,
      },
      {
        title: "OpenAI 开发者文档",
        url: "https://platform.openai.com/docs/overview",
        type: "web_page",
        subject: "大模型应用",
        category: "official",
        rationale: "模型调用、结构化输出与工具调用场景可从官方文档补齐。",
        authorityScore: 94,
        freshnessScore: 91,
        relevanceBoost: 8,
      },
      {
        title: "huggingface/transformers",
        url: "https://github.com/huggingface/transformers",
        type: "github_directory",
        subject: "模型工程源码",
        category: "github",
        rationale: "高 star 工程仓库，适合补推理与训练落地案例。",
        authorityScore: 95,
        freshnessScore: 93,
        relevanceBoost: 9,
      },
      {
        title: "langchain-ai/langchain",
        url: "https://github.com/langchain-ai/langchain",
        type: "github_directory",
        subject: "Agent 工程源码",
        category: "github",
        rationale: "适合为 Agent 与工作流专题提供高 star 源码参考。",
        authorityScore: 92,
        freshnessScore: 92,
        relevanceBoost: 8,
      },
      {
        title: "Lil'Log",
        url: "https://lilianweng.github.io/",
        type: "web_page",
        subject: "AI 原理",
        category: "community",
        rationale: "适合补强化学习、Agent 与 RAG 等专题的高质量长文。",
        authorityScore: 87,
        freshnessScore: 83,
        relevanceBoost: 8,
      },
      {
        title: "Machine Learning Mastery",
        url: "https://machinelearningmastery.com/",
        type: "web_page",
        subject: "机器学习实战",
        category: "community",
        rationale: "适合整理入门到实战的机器学习材料，但权威性低于官方框架文档。",
        authorityScore: 78,
        freshnessScore: 79,
        relevanceBoost: 6,
      },
      {
        title: "Anthropic Docs",
        url: "https://docs.anthropic.com/",
        type: "web_page",
        subject: "模型 API 与工具调用",
        category: "official",
        rationale: "Agent、工具调用和结构化输出需要补充一手模型文档。",
        authorityScore: 94,
        freshnessScore: 93,
        relevanceBoost: 8,
      },
      {
        title: "DeepSeek API 文档",
        url: "https://api-docs.deepseek.com/",
        type: "web_page",
        subject: "模型调用与推理服务",
        category: "official",
        rationale: "当前产品本身依赖 DeepSeek，适合补齐真实调用链路资料。",
        authorityScore: 92,
        freshnessScore: 92,
        relevanceBoost: 8,
      },
      {
        title: "LlamaIndex 文档",
        url: "https://docs.llamaindex.ai/",
        type: "web_page",
        subject: "RAG 与数据连接",
        category: "official",
        rationale: "RAG 大而全体系需要覆盖索引、检索、数据接入等专题。",
        authorityScore: 89,
        freshnessScore: 90,
        relevanceBoost: 7,
      },
    ],
  },
  "general-engineering": {
    label: "通用工程化课题",
    canonicalKbId: "kb-general-engineering",
    canonicalKbName: "工程化",
    matchers: [],
    includeKeywords: [],
    excludeKeywords: [],
    tags: ["工程化", "知识库"],
    qualityThreshold: 78,
    maxSources: 8,
    boundarySummary: "当前课题未命中强领域模板，先按通用工程化范围建库，后续由管理员补充更细边界。",
    sources: [
      {
        title: "Martin Fowler",
        url: "https://martinfowler.com/",
        type: "web_page",
        subject: "架构与工程实践",
        category: "community",
        rationale: "通用工程化课题常需要稳定的架构与设计实践材料。",
        authorityScore: 88,
        freshnessScore: 82,
        relevanceBoost: 8,
      },
      {
        title: "system-design-primer",
        url: "https://github.com/donnemartin/system-design-primer",
        type: "github_directory",
        subject: "系统设计",
        category: "github",
        rationale: "高 star 工程资料仓库，适合当通用课题的结构化补充来源。",
        authorityScore: 90,
        freshnessScore: 85,
        relevanceBoost: 7,
      },
      {
        title: "GitHub Explore",
        url: "https://github.com/explore",
        type: "web_page",
        subject: "社区趋势",
        category: "community",
        rationale: "用于补充开源趋势与热门项目，但不应充当唯一事实来源。",
        authorityScore: 75,
        freshnessScore: 85,
        relevanceBoost: 5,
      },
    ],
  },
};

/**
 * 将用户输入的课题压缩成适合 ID 和匹配的归一化文本。
 * @param {string} input 原始课题文本。
 * @returns {string} 归一化后的课题文本。
 */
function normalizeTopicText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/**
 * 判断文本中是否包含任意一个关键词。
 * @param {string} text 已归一化的搜索文本。
 * @param {string[]} keywords 关键词列表。
 * @returns {boolean} 命中任意关键词时返回 `true`。
 */
function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

/**
 * 组合知识库信息，便于自动识别课题所属领域。
 * @param {KbInfo} kb 当前知识库元信息。
 * @returns {string} 统一的课题搜索文本。
 */
function buildKbSearchText(kb: KbInfo): string {
  return [kb.name, kb.subtitle, kb.description ?? "", kb.tags.join(" ")].join(" ").toLowerCase();
}

/**
 * 根据课题文本命中最合适的知识领域模板。
 * @param {string} topicText 已归一化的课题文本。
 * @returns {KnowledgeDomainId} 匹配到的领域 ID。
 */
function resolveKnowledgeDomain(topicText: string): KnowledgeDomainId {
  const orderedDomainIds: KnowledgeDomainId[] = [
    "vue-frontend",
    "react-frontend",
    "java-core",
    "ai-ml",
    "frontend-general",
    "general-engineering",
  ];

  for (const domainId of orderedDomainIds) {
    const definition = DOMAIN_DEFINITIONS[domainId];
    if (definition.matchers.length > 0 && matchesAnyKeyword(topicText, definition.matchers)) {
      return domainId;
    }
  }

  return "general-engineering";
}

/**
 * 为单课题自动建库生成统一的课题画像。
 * @param {string} topic 原始课题文本。
 * @returns {KnowledgeTopicProfile} 自动来源、目录和草稿都会复用的课题画像。
 */
export function buildKnowledgeTopicProfile(topic: string): KnowledgeTopicProfile {
  const normalizedTopic = normalizeTopicText(topic);
  const lowerTopic = normalizedTopic.toLowerCase();
  const domainId = resolveKnowledgeDomain(lowerTopic);
  const definition = DOMAIN_DEFINITIONS[domainId];
  const safeTopic = normalizedTopic || "未命名课题";

  return {
    rawTopic: safeTopic,
    normalizedTopic,
    kbId: definition.canonicalKbId,
    kbName: definition.canonicalKbName,
    subtitle: `${definition.canonicalKbName} 大而全知识库`,
    description: `围绕“${safeTopic}”自动扩充到 ${definition.canonicalKbName} 总知识库，自动筛选高质量来源、补齐大章节目录并直接生成首批文档。${definition.boundarySummary}`,
    tags: Array.from(new Set([safeTopic, ...definition.tags])),
    domainId,
    domainLabel: definition.label,
    includeKeywords: definition.includeKeywords,
    excludeKeywords: definition.excludeKeywords,
    qualityThreshold: definition.qualityThreshold,
    maxSources: definition.maxSources,
    boundarySummary: definition.boundarySummary,
  };
}

/**
 * 根据现有知识库信息反推课题画像，兼容旧的自动来源发现入口。
 * @param {KbInfo} kb 当前知识库元信息。
 * @returns {KnowledgeTopicProfile} 由知识库元信息推导出的课题画像。
 */
export function buildKnowledgeTopicProfileFromKb(kb: KbInfo): KnowledgeTopicProfile {
  const searchText = buildKbSearchText(kb);
  const profile = buildKnowledgeTopicProfile(kb.name || searchText);
  return {
    ...profile,
    subtitle: kb.subtitle || profile.subtitle,
    description: kb.description || profile.description,
    tags: Array.from(new Set([...profile.tags, ...kb.tags])),
  };
}

/**
 * 计算来源与当前课题的相关性得分。
 * @param {SourceCatalogItem} source 候选来源。
 * @param {KnowledgeTopicProfile} profile 当前课题画像。
 * @returns {number} 0 到 100 的相关性分数。
 */
function computeRelevanceScore(source: SourceCatalogItem, profile: KnowledgeTopicProfile): number {
  const haystack = `${source.title} ${source.subject} ${source.rationale} ${source.url}`.toLowerCase();
  const keywordHits = profile.includeKeywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
  const baseScore = Math.min(100, 68 + keywordHits * 8 + (source.relevanceBoost ?? 0));
  return baseScore;
}

/**
 * 判断来源是否越过了当前课题边界。
 * @param {SourceCatalogItem} source 候选来源。
 * @param {KnowledgeTopicProfile} profile 当前课题画像。
 * @returns {SourceBoundaryVerdict} 领域边界结论。
 */
function resolveBoundaryVerdict(
  source: SourceCatalogItem,
  profile: KnowledgeTopicProfile
): SourceBoundaryVerdict {
  if (profile.excludeKeywords.length === 0) {
    return "in_scope";
  }

  const haystack = `${source.title} ${source.subject} ${source.rationale} ${source.url}`.toLowerCase();
  return matchesAnyKeyword(haystack, profile.excludeKeywords) ? "out_of_scope" : "in_scope";
}

/**
 * 将候选来源转换为带质量门槛与边界结论的记录。
 * @param {SourceCatalogItem} source 候选来源。
 * @param {KnowledgeTopicProfile} profile 当前课题画像。
 * @returns {DiscoveredSourceSeed} 带质量决策的来源记录。
 */
function scoreDiscoveredSource(
  source: SourceCatalogItem,
  profile: KnowledgeTopicProfile
): DiscoveredSourceSeed {
  const relevanceScore = computeRelevanceScore(source, profile);
  const boundaryVerdict = resolveBoundaryVerdict(source, profile);
  const weightedScore = Math.round(
    source.authorityScore * 0.5 + relevanceScore * 0.35 + source.freshnessScore * 0.15
  );
  const qualityGate =
    boundaryVerdict === "in_scope" && weightedScore >= profile.qualityThreshold ? "accepted" : "rejected";
  const selectionReason =
    qualityGate === "accepted"
      ? `质量 ${weightedScore} 分，满足 ${profile.domainLabel} 的来源门槛。`
      : boundaryVerdict === "out_of_scope"
        ? `命中了领域排除词，已从 ${profile.rawTopic} 的来源池剔除。`
        : `质量 ${weightedScore} 分，低于自动建库门槛 ${profile.qualityThreshold} 分。`;

  return {
    title: source.title,
    url: source.url,
    type: source.type,
    subject: source.subject,
    category: source.category,
    rationale: source.rationale,
    authorityScore: source.authorityScore,
    freshnessScore: source.freshnessScore,
    qualityScore: weightedScore,
    qualityGate,
    boundaryVerdict,
    selectionReason,
  };
}

/**
 * 围绕单课题筛选高质量来源，并返回接受与拒绝结果。
 * @param {KnowledgeTopicProfile} profile 当前课题画像。
 * @returns {DiscoveredSourceSelection} 质量筛选后的来源集合。
 */
export function buildAutoDiscoveredSources(
  profile: KnowledgeTopicProfile
): DiscoveredSourceSelection {
  const definition = DOMAIN_DEFINITIONS[profile.domainId];
  const scoredSources = definition.sources
    .map((source) => scoreDiscoveredSource(source, profile))
    .sort((a, b) => b.qualityScore - a.qualityScore || a.title.localeCompare(b.title));
  const deduped = new Map<string, DiscoveredSourceSeed>();

  for (const source of scoredSources) {
    if (!deduped.has(source.url)) {
      deduped.set(source.url, source);
    }
  }

  const accepted = Array.from(deduped.values())
    .filter((source) => source.qualityGate === "accepted")
    .slice(0, profile.maxSources);
  const rejected = Array.from(deduped.values()).filter((source) => source.qualityGate === "rejected");

  return {
    profile,
    accepted,
    rejected,
  };
}
