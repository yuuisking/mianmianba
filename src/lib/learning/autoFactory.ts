import type { TopicContent, TreeData } from "@/lib/db/learningDb";
import type { DiscoveredSourceSeed, KnowledgeDomainId, KnowledgeTopicProfile } from "@/lib/learning/sourceDiscovery";
import {
  buildMissingBlockNote,
  buildOptionalBlockNote,
  resolveArtifactRequirements,
} from "@/lib/learning/documentTemplate";

export type AutoPublishedTopic = {
  subjectId: string;
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
  content: TopicContent;
};

type TemplateGroup = {
  title: string;
  topics: string[];
};

const DOMAIN_TEMPLATES: Record<KnowledgeDomainId, TemplateGroup[]> = {
  "java-core": [
    {
      title: "Java 核心基础",
      topics: ["Java 基础语法与面向对象", "异常 / 泛型 / 反射", "集合体系与常用源码", "I/O / NIO / 网络编程"],
    },
    {
      title: "JVM 与并发",
      topics: ["线程模型与并发工具", "JMM / volatile / synchronized", "JVM 内存结构 / GC / 调优", "锁优化 / AQS / 线程池实战"],
    },
    {
      title: "Spring 生态",
      topics: ["Spring IOC / AOP", "Spring MVC 请求链路", "Spring Boot 自动配置", "Spring 常见面试题与源码入口"],
    },
    {
      title: "数据库与缓存",
      topics: ["MySQL 索引 / 锁 / 事务", "MyBatis / ORM 实践", "Redis 数据结构与缓存设计", "缓存一致性 / 穿透 / 击穿 / 雪崩"],
    },
    {
      title: "分布式与中间件",
      topics: ["消息队列与异步解耦", "注册中心 / 配置中心 / 服务治理", "分布式事务与幂等设计", "接口限流 / 熔断 / 降级"],
    },
    {
      title: "后端工程化",
      topics: ["Maven / Gradle 与工程化", "测试体系 / JUnit / Mock", "日志 / 监控 / 链路追踪", "性能调优与线上排障"],
    },
    {
      title: "高频面试题",
      topics: ["Java 八股主线与回答框架", "场景设计题与系统设计", "项目难点拆解与表达模板", "源码阅读切入点与答题策略"],
    },
  ],
  "frontend-general": [
    {
      title: "Web 基础",
      topics: ["HTML / CSS / 布局体系", "DOM / BOM / 事件模型", "浏览器渲染流程与缓存", "网络协议 / 跨域 / 安全基础"],
    },
    {
      title: "JavaScript 与 TypeScript",
      topics: ["JavaScript 核心语法与执行机制", "异步 / 事件循环 / Promise", "闭包 / 原型链 / this", "TypeScript 类型系统与工程实践"],
    },
    {
      title: "浏览器与性能",
      topics: ["浏览器存储 / 缓存策略", "性能指标 / Core Web Vitals", "渲染优化 / 长任务治理", "可访问性与兼容性"],
    },
    {
      title: "工程化与框架认知",
      topics: ["模块化 / 打包 / Vite 工程化", "组件化 / 状态 / 路由基础", "测试 / CI / 代码质量", "性能优化与质量保障"],
    },
    {
      title: "场景与面试",
      topics: ["前端系统设计题", "权限 / 表单 / 文件上传等高频场景", "前端高频面试题与回答框架", "项目亮点拆解与复盘表达"],
    },
  ],
  "vue-frontend": [
    {
      title: "Vue3 核心",
      topics: ["Vue3 入门与组合式 API", "响应式原理 / 模板 / 指令", "组件通信 / 插槽 / 复用模式", "生命周期 / 渲染机制 / diff"],
    },
    {
      title: "生态与工程化",
      topics: ["Pinia 状态管理", "Vue Router 路由设计", "Vite / Nuxt 与项目工程化", "SSR / SSG / 服务端渲染边界"],
    },
    {
      title: "组件与业务场景",
      topics: ["表单 / 表格 / 弹窗组件封装", "权限路由与后台系统实践", "请求层 / 错误处理 / 状态管理协作", "大型项目目录设计"],
    },
    {
      title: "源码与性能",
      topics: ["响应式源码理解入口", "编译器 / runtime 核心概念", "Vue 性能优化与可测试性", "Vue 高频面试题与回答框架"],
    },
  ],
  "react-frontend": [
    {
      title: "React 核心",
      topics: ["React 组件模型与 JSX", "状态 / 副作用 / Hooks", "组件通信与数据流", "Context / 自定义 Hook / 复用模式"],
    },
    {
      title: "应用架构与生态",
      topics: ["React Router 与页面组织", "状态管理 / 表单 / 数据流", "Next.js 路由 / 渲染 / 数据获取", "服务端组件 / SSR / CSR 边界"],
    },
    {
      title: "业务场景与工程化",
      topics: ["权限系统 / 中后台页面组织", "测试 / CI / lint / monorepo", "请求缓存 / 数据同步策略", "组件库与设计系统协作"],
    },
    {
      title: "源码与性能",
      topics: ["渲染性能与工程质量", "Fiber / 调度 / 更新机制", "React 源码理解入口", "React 高频面试题与回答框架"],
    },
  ],
  "ai-ml": [
    {
      title: "基础认知",
      topics: ["机器学习 / 深度学习基础", "大模型工作方式与核心概念", "训练 / 推理 / 评测指标", "Transformer / Attention / Token 基础"],
    },
    {
      title: "LLM 应用",
      topics: ["Prompt 设计与上下文工程", "RAG 基础链路", "Agent 工作流 / 工具调用 / 结构化输出", "多轮对话 / 记忆 / 规划策略"],
    },
    {
      title: "平台与工程化",
      topics: ["推理服务 / 向量检索 / 数据准备", "评测体系 / 观察性 / 安全治理", "成本 / 延迟 / Token 消耗优化", "微调 / LoRA / 数据构造"],
    },
    {
      title: "场景与面试",
      topics: ["AI 产品案例拆解", "企业知识库 / Copilot / Agent 场景", "AI 高频面试题与案例拆解", "论文阅读与源码追踪入口"],
    },
  ],
  "general-engineering": [
    {
      title: "主题总览",
      topics: ["课题总览与核心术语", "系统组成与关键流程", "落地场景与常见风险", "关键概念关系图"],
    },
    {
      title: "工程落地",
      topics: ["工程化要点与质量治理", "常见问题与排障思路", "监控 / 测试 / 稳定性建设", "上线流程与风险控制"],
    },
    {
      title: "面试与系统设计",
      topics: ["高频面试题与回答框架", "项目经验表达模板", "系统设计题拆解", "源码与文档追踪入口"],
    },
  ],
};

/**
 * 将任意标题转换成稳定、可读且适合树节点使用的 ID。
 * @param {string} value 原始标题文本。
 * @returns {string} 稳定的节点 ID。
 */
function toStableId(value: string): string {
  const encoded = encodeURIComponent(value.trim().toLowerCase());
  return encoded.replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "node";
}

/**
 * 构造单个章节的 Mermaid 学习路径图，方便管理员快速检查目录顺序。
 * @param {string} chapterTitle 章节标题。
 * @param {string[]} topics 章节内的主题列表。
 * @returns {string} 包含 Mermaid 代码块的字符串。
 */
function buildMermaidPath(chapterTitle: string, topics: string[]): string {
  const lines = topics.map((topic, index) => {
    const fromId = index === 0 ? "A" : String.fromCharCode(65 + index);
    const toId = String.fromCharCode(66 + index);
    return `${fromId}[${index === 0 ? chapterTitle : topics[index - 1]}] --> ${toId}[${topic}]`;
  });

  return `\`\`\`mermaid
flowchart LR
${lines.join("\n")}
\`\`\``;
}

/**
 * 构造单个章节的 Mermaid 架构示意图，用于展示主题拆解与结构边界。
 * @param {string} chapterTitle 章节标题。
 * @param {string[]} topics 章节内的主题列表。
 * @returns {string} 包含 Mermaid 代码块的字符串。
 */
function buildMermaidArchitecture(chapterTitle: string, topics: string[]): string {
  const nodes = topics.map((topic, index) => `T${index + 1}[${topic}]`).join("\n");
  const links = topics.map((_, index) => `Core --> T${index + 1}`).join("\n");
  return `\`\`\`mermaid
flowchart TB
    Core[${chapterTitle}]
${nodes}
${links}
\`\`\``;
}

/**
 * 将来源列表压缩成适合文档正文展示的文本。
 * @param {DiscoveredSourceSeed[]} sources 通过质量门槛的来源列表。
 * @returns {string} 简短来源摘要。
 */
function buildSourceSummary(sources: DiscoveredSourceSeed[]): string {
  return sources
    .slice(0, 5)
    .map((source) => `${source.title}(${source.category}/${source.qualityScore}分)`)
    .join("、");
}

/**
 * 根据主题标题推断题目在面试中的主要发问类型。
 * @param {string} topicTitle 当前题目标题。
 * @returns {string} 题目定位文案。
 */
function inferInterviewAngle(topicTitle: string): string {
  if (/(原理|源码|机制|模型|内存|gc|aqs|diff|响应式|fiber|调优)/i.test(topicTitle)) {
    return "偏原理题，常被追问底层机制和实现细节。";
  }
  if (/(设计|架构|治理|工程化|排障|优化|实践|场景)/i.test(topicTitle)) {
    return "偏场景题，常被追问方案取舍、落地经验与风险控制。";
  }

  return "偏基础高频题，常被追问定义、作用、使用方式和边界。";
}

/**
 * 根据主题标题生成更具体的学习与作答提示。
 * @param {string} topicTitle 当前题目标题。
 * @returns {string} 面试回答建议。
 */
function buildAnswerHint(topicTitle: string): string {
  if (/(并发|锁|线程|volatile|synchronized|aqs|jmm)/i.test(topicTitle)) {
    return "重点放在并发问题背景、核心机制、线程安全边界和真实排障经验。";
  }
  if (/(mysql|redis|缓存|索引|事务|消息队列|kafka)/i.test(topicTitle)) {
    return "重点放在核心概念与数据流、设计原因、一致性、性能和故障场景。";
  }
  if (/(vue|react|javascript|typescript|工程化|vite|next)/i.test(topicTitle)) {
    return "重点放在概念、渲染或编译机制、项目里的使用场景和性能优化。";
  }

  return "重点放在定义、原理、场景、易错点和项目经验。";
}

/**
 * 构造图例与代码实例章节中的固定子块，确保缺失时只做显式标记。
 * @param {string} topic 草稿主题标题。
 * @param {string} chapterTitle 当前章节标题。
 * @param {string[]} topicTitles 当前章节子主题列表。
 * @returns {string[]} 结构化图例与代码块段落。
 */
function buildArtifactParagraphs(topic: string, chapterTitle: string, topicTitles: string[]): string[] {
  const requirements = resolveArtifactRequirements(topic);
  const requiredLabels = requirements.filter((item) => item.required).map((item) => item.label);
  const flowchartRequirement = requirements.find((item) => item.key === "flowchart");
  const architectureRequirement = requirements.find((item) => item.key === "architecture");
  const codeRequirement = requirements.find((item) => item.key === "codeExample");

  return [
    `当前主题要求：${requiredLabels.length ? requiredLabels.join("、") : "当前图例块均为按主题可选"}。缺失时必须明确标记，禁止废话填充。`,
    "**流程图**",
    flowchartRequirement?.required
      ? buildMermaidPath(chapterTitle, topicTitles)
      : buildOptionalBlockNote("流程图"),
    "**架构图**",
    architectureRequirement?.required
      ? buildMermaidArchitecture(chapterTitle, topicTitles)
      : buildOptionalBlockNote("架构图"),
    "**代码实例**",
    codeRequirement?.required
      ? buildMissingBlockNote(
          "代码实例",
          `当前主题「${topic}」偏实现理解，但自动链路尚未拿到可核对的源码或官方示例`
        )
      : buildOptionalBlockNote("代码实例"),
  ];
}

/**
 * 生成单篇自动发布文档的核心结构。
 * @param {KnowledgeTopicProfile} profile 当前课题画像。
 * @param {TreeData["groups"][number]} group 当前目录分组。
 * @param {{ id: string; title: string }} topic 当前主题节点。
 * @param {DiscoveredSourceSeed[]} sources 已通过门槛的来源列表。
 * @returns {AutoPublishedTopic} 可直接发布到知识库的文档。
 */
function buildPublishedTopic(
  profile: KnowledgeTopicProfile,
  group: TreeData["groups"][number],
  topic: { id: string; title: string },
  sources: DiscoveredSourceSeed[]
): AutoPublishedTopic {
  const topicTitles = group.children.map((child) => child.title);
  const sourceSummary = buildSourceSummary(sources);
  const artifactParagraphs = buildArtifactParagraphs(topic.title, group.title, topicTitles);
  const interviewAngle = inferInterviewAngle(topic.title);
  const answerHint = buildAnswerHint(topic.title);

  return {
    subjectId: group.id,
    subjectTitle: group.title,
    topicId: topic.id,
    topicTitle: topic.title,
    content: {
      title: topic.title,
      breadcrumb: [profile.kbName, group.title, topic.title],
      quickFacts: [
        { k: "知识点", v: topic.title },
        { k: "所属模块", v: group.title },
        { k: "面试定位", v: interviewAngle },
        { k: "回答提示", v: answerHint },
        { k: "参考来源", v: sourceSummary || "暂无通过门槛的来源" },
        { k: "范围边界", v: profile.boundarySummary },
      ],
      sections: [
        {
          id: "knowledge-summary",
          h2: "知识点总结",
          paragraphs: [
            `「${topic.title}」位于「${group.title}」模块，是 ${profile.kbName} 体系中的核心知识点。理解它时，首先要看清它解决什么问题，以及它在整条知识主线中的位置。`,
            `继续展开时，需要把原理细节、与相近方案的差异、真实项目中的使用方式和适用边界连起来理解。`,
          ],
          bullets: [
            `${topic.title} 的定义、作用和出现背景决定了它为什么值得学。`,
            `结合 ${topicTitles.filter((item) => item !== topic.title).slice(0, 2).join("、") || group.title} 一起看，更容易理解它在同模块中的位置。`,
            `真实项目里的使用场景、限制条件和常见误区，决定了这个知识点的边界。`,
          ],
          callout: `学习这个主题时，不要只背定义，要能说清“为什么会这样设计”。`,
        },
        {
          id: "interview-highlights",
          h2: "面试常考",
          paragraphs: [
            `围绕「${topic.title}」，面试通常不会只停留在定义，而是会继续追问原理、边界和项目落地。`,
          ],
          bullets: [
            `什么是 ${topic.title}？它主要解决了什么问题？`,
            `${topic.title} 的核心机制或关键流程是什么？`,
            `${topic.title} 和同类方案相比，有什么区别与取舍？`,
            `如果把 ${topic.title} 放到真实项目中，最容易踩的坑是什么？`,
          ],
        },
        {
          id: "answer-template",
          h2: "参考答案和解析",
          paragraphs: [
            `围绕「${topic.title}」作答时，好的表达通常会先给出结论，再把原理、场景、边界和取舍补完整。`,
            answerHint,
          ],
          bullets: [
            `先给出 ${topic.title} 的核心结论和使用目的。`,
            `再讲清关键原理、核心数据结构或执行流程。`,
            `然后结合项目场景补充为什么选它、怎么使用、怎么排障。`,
            `最后补上边界、缺点、替代方案和常见误区。`,
          ],
          callout: `真正高质量的回答，重点不是术语堆砌，而是能把概念、机制、场景和取舍串成一条线。`,
        },
        {
          id: "project-extension",
          h2: "项目延伸",
          paragraphs: artifactParagraphs,
          bullets: [
            `如果在项目里使用 ${topic.title}，建议提前准备监控指标、异常处理和回滚方案。`,
            `可以把 ${topic.title} 和 ${topicTitles.filter((item) => item !== topic.title).slice(0, 2).join("、") || group.title} 一起复盘，更容易形成系统表达。`,
          ],
        },
      ],
    },
  };
}

/**
 * 基于课题画像构建边界清晰的目录骨架。
 * @param {KnowledgeTopicProfile} profile 当前课题画像。
 * @returns {TreeData} 自动生成的目录树。
 */
export function buildAutomaticTaxonomy(profile: KnowledgeTopicProfile): TreeData {
  const groups = DOMAIN_TEMPLATES[profile.domainId].map((templateGroup, groupIndex) => {
    const groupId = `${groupIndex + 1}-${toStableId(templateGroup.title)}`;
    return {
      id: groupId,
      title: templateGroup.title,
      children: templateGroup.topics.map((topicTitle) => ({
        id: toStableId(topicTitle),
        title: topicTitle,
      })),
    };
  });

  return {
    id: profile.kbId,
    title: profile.kbName,
    groups,
  };
}

/**
 * 基于目录骨架和来源池生成首批自动发布文档。
 * @param {KnowledgeTopicProfile} profile 当前课题画像。
 * @param {TreeData} treeData 已生成的目录树。
 * @param {DiscoveredSourceSeed[]} sources 通过质量门槛的来源列表。
 * @returns {AutoPublishedTopic[]} 可直接写入知识库的文档列表。
 */
export function buildAutomaticPublishedTopics(
  profile: KnowledgeTopicProfile,
  treeData: TreeData,
  sources: DiscoveredSourceSeed[]
): AutoPublishedTopic[] {
  return treeData.groups.flatMap((group) =>
    group.children.map((topic) => buildPublishedTopic(profile, group, topic, sources))
  );
}
