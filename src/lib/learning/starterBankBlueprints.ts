import { type KbInfo, type QuickFact, type TopicContent, type TreeData } from "@/lib/db/learningDb";

type StarterQuestionBlueprint = {
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  interviewFrequency: "high" | "medium" | "low";
};

type StarterGroupBlueprint = {
  title: string;
  questions: StarterQuestionBlueprint[];
};

export type StarterBankBlueprint = {
  subtitle: string;
  description: string;
  tags: string[];
  groups: StarterGroupBlueprint[];
};

type StarterInsight = {
  overview: string[];
  highlights: string[];
  answer: string[];
  hint: string;
};

type StarterTopicBuildContext = {
  bankName: string;
  bankTopic: string;
  groupTitle: string;
  question: StarterQuestionBlueprint;
  difficultyText: string;
  frequencyText: string;
};

/**
 * Converts a text value into a stable id.
 * @param {string} value Raw text.
 * @returns {string} Stable id used by starter KB trees.
 */
function toStableId(value: string): string {
  const encoded = encodeURIComponent(value.trim().toLowerCase());
  return encoded.replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "node";
}

/**
 * Creates one starter question blueprint.
 * @param {string} title Question title.
 * @param {"easy" | "medium" | "hard"} difficulty Difficulty level.
 * @param {string[]} tags Display tags.
 * @param {"high" | "medium" | "low"} interviewFrequency Interview frequency.
 * @returns {StarterQuestionBlueprint} Starter question blueprint.
 */
function createQuestion(
  title: string,
  difficulty: "easy" | "medium" | "hard",
  tags: string[],
  interviewFrequency: "high" | "medium" | "low" = "high"
): StarterQuestionBlueprint {
  return {
    title,
    difficulty,
    tags,
    interviewFrequency,
  };
}

/**
 * 去掉题目结尾问号，方便衍生更多自然标题。
 * @param {string} title 原始题目标题。
 * @returns {string} 去掉结尾问号后的标题。
 */
function stripQuestionMark(title: string): string {
  return title.replace(/[？?]+$/g, "").trim();
}

/**
 * 从对比类题目中提取更自然的知识主题。
 * @param {string} title 原始题目标题。
 * @returns {string} 去掉“有什么区别”后的主题短语。
 */
function extractComparisonSubject(title: string): string {
  const plainTitle = stripQuestionMark(title);
  return plainTitle.replace(/\s*(?:有什么区别|有何区别|区别是什么)$/g, "").trim() || plainTitle;
}

/**
 * 将衍生追问标题还原为更稳定的知识主题，避免知识点总结跟着题目模板一起跑偏。
 * @param {string} title 原始题目标题。
 * @returns {string} 更接近真实知识主题的规范化标题。
 */
function normalizeInsightTopicTitle(title: string): string {
  const wrappedSubject = stripQuestionMark(title).match(/^围绕「(.+?)」，/);
  if (wrappedSubject?.[1]) {
    return wrappedSubject[1].trim();
  }

  return stripQuestionMark(title)
    .replace(/\s+在真实项目里分别适合什么场景$/g, "")
    .replace(/\s*各自适合什么场景$/g, "")
    .replace(/\s+在真实项目里通常怎么落地$/g, "")
    .replace(/\s+在线上项目中如何判断是否该使用它$/g, "")
    .replace(/\s+的底层实现差异会带来哪些性能影响$/g, "")
    .replace(/\s*的?关键差异体现在哪些设计和实现上$/g, "")
    .replace(/\s+的底层原因和关键机制是什么$/g, "")
    .replace(/\s+的核心执行步骤能否按顺序拆开讲清楚$/g, "")
    .replace(/\s+面试时应该按什么主线讲清楚$/g, "")
    .replace(/\s+在高并发或大数据量场景下最关键的风险点是什么$/g, "")
    .replace(/\s+在真实项目里最需要注意哪些边界和风险$/g, "")
    .replace(/\s+最容易被面试官继续深挖的边界问题有哪些$/g, "")
    .replace(/\s+最容易被追问的实现细节和边界条件是什么$/g, "")
    .replace(/\s+最容易被继续追问的原理和边界是什么$/g, "")
    .replace(/\s*容易混淆的边界和误区有哪些$/g, "")
    .replace(/\s+不适合的场景和替代方案是什么$/g, "")
    .replace(/\s+最容易踩的坑和治理方式是什么$/g, "")
    .replace(/\s+如果让你结合项目经验回答，应该怎么组织表达$/g, "")
    .replace(/\s+如果要回答得更像面试表达，应该怎么组织$/g, "")
    .trim();
}

/**
 * 转义正则中的特殊字符，供动态构建题目匹配规则使用。
 * @param {string} value 原始文本。
 * @returns {string} 可安全用于 RegExp 构造器的文本。
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 去掉句尾重复标点，避免拼接后出现双句号。
 * @param {string} value 原始句子。
 * @returns {string} 适合继续拼接的干净句子。
 */
function trimSentenceEnding(value: string): string {
  return value.trim().replace(/[；;，,。.!！？?]+$/g, "");
}

/**
 * 将多条中文要点整理成自然段落。
 * @param {string[]} items 要拼接的句子数组。
 * @returns {string} 适合正文展示的中文句子。
 */
function joinReadableSentence(items: string[]): string {
  const normalized = items.map((item) => trimSentenceEnding(item)).filter(Boolean);
  if (normalized.length === 0) {
    return "";
  }
  return `${normalized.join("；")}。`;
}

/**
 * 为基础题目生成左侧导航使用的核心题列表。
 * @param {string} topic 当前题库主题。
 * @param {string} groupTitle 当前分组标题。
 * @param {StarterQuestionBlueprint} question 当前基础题目。
 * @returns {StarterQuestionBlueprint[]} 只保留核心题，追问与边界统一放到文档内部。
 */
function expandStarterQuestionSet(
  topic: string,
  groupTitle: string,
  question: StarterQuestionBlueprint
): StarterQuestionBlueprint[] {
  void topic;
  void groupTitle;
  return [question];
}

/**
 * 将 starter 题库扩展到适合连续学习的题量规模。
 * @param {string} topic 当前题库主题。
 * @param {StarterGroupBlueprint[]} groups 当前题库分组。
 * @returns {StarterGroupBlueprint[]} 扩展后的题库分组。
 */
function expandStarterGroups(topic: string, groups: StarterGroupBlueprint[]): StarterGroupBlueprint[] {
  return groups.map((group) => ({
    ...group,
    questions: group.questions.flatMap((question) => expandStarterQuestionSet(topic, group.title, question)),
  }));
}

const STARTER_BANK_BLUEPRINTS: Record<string, StarterBankBlueprint> = {
  "Java 基础": {
    subtitle: "Java 基础与语法 高频面试题库",
    description: "覆盖 Java 语法、面向对象、异常、泛型和常用类，是 Java 面试最常见的基础题库。",
    tags: ["Java", "基础", "语法", "面向对象", "面试"],
    groups: [
      {
        title: "语言基础",
        questions: [
          createQuestion("Java 值传递和引用传递有什么区别？", "easy", ["Java", "基础", "高频"]),
          createQuestion("重载和重写有什么区别？", "easy", ["Java", "面向对象", "高频"]),
          createQuestion("== 和 equals 有什么区别？", "easy", ["Java", "对象", "高频"]),
          createQuestion("equals 和 hashCode 为什么要一起重写？", "medium", ["Java", "对象", "高频"]),
          createQuestion("final、finally、finalize 有什么区别？", "medium", ["Java", "关键字", "高频"]),
          createQuestion("抽象类和接口有什么区别？", "medium", ["Java", "面向对象", "设计"]),
        ],
      },
      {
        title: "常用特性",
        questions: [
          createQuestion("String、StringBuilder、StringBuffer 有什么区别？", "easy", ["String", "高频", "性能"]),
          createQuestion("异常 Exception 和 Error 有什么区别？", "easy", ["异常", "高频", "Java"]),
          createQuestion("Checked Exception 和 RuntimeException 有什么区别？", "medium", ["异常", "设计", "高频"]),
          createQuestion("自动装箱和拆箱有什么风险？", "medium", ["包装类型", "性能", "坑点"]),
          createQuestion("Java 泛型为什么会发生类型擦除？", "medium", ["泛型", "原理", "高频"]),
          createQuestion("Optional 适合什么场景，为什么不能滥用？", "medium", ["Optional", "实践", "边界"]),
        ],
      },
      {
        title: "机制与实践",
        questions: [
          createQuestion("反射的实现原理和使用场景是什么？", "medium", ["反射", "原理", "场景"]),
          createQuestion("注解的实现机制和常见使用方式是什么？", "medium", ["注解", "机制", "实践"]),
          createQuestion("Java 8 的 Lambda 和 Stream 带来了什么变化？", "easy", ["Java8", "Lambda", "Stream"]),
          createQuestion("SPI 机制是什么，适合解决什么问题？", "medium", ["SPI", "扩展", "机制"]),
          createQuestion("ClassLoader 和双亲委派模型应该怎么理解？", "hard", ["ClassLoader", "双亲委派", "原理"]),
          createQuestion("序列化和反序列化的核心流程是什么？", "medium", ["序列化", "Java", "机制"]),
        ],
      },
      {
        title: "体系梳理与实战",
        questions: [
          createQuestion("BigDecimal 为什么不能直接用 double 代替？", "medium", ["BigDecimal", "精度", "高频"]),
          createQuestion("不可变对象有什么价值，为什么 String 要设计成不可变？", "medium", ["不可变对象", "String", "设计"]),
          createQuestion("try-with-resources 为什么能自动释放资源？", "medium", ["IO", "异常处理", "语法"]),
          createQuestion("Java 对象创建的完整过程是什么？", "hard", ["对象创建", "JVM", "原理"]),
          createQuestion("深拷贝和浅拷贝有什么区别？", "medium", ["拷贝", "对象", "高频"]),
          createQuestion("NIO 和 BIO 有什么区别？", "medium", ["IO", "NIO", "BIO"]),
        ],
      },
    ],
  },
  "Java 集合": {
    subtitle: "Java 集合 高频面试题库",
    description: "聚焦 List、Set、Map、并发集合与源码实现，是 Java 集合相关面试的核心题库。",
    tags: ["Java 集合", "List", "Set", "Map", "源码"],
    groups: [
      {
        title: "集合体系总览",
        questions: [
          createQuestion("List、Set、Map 有什么区别？", "easy", ["集合", "基础", "高频"]),
          createQuestion("Collection 和 Collections 有什么区别？", "easy", ["集合", "工具类", "基础"]),
          createQuestion("ArrayList 和 LinkedList 有什么区别？", "easy", ["List", "源码", "高频"]),
          createQuestion("ArrayList 和 Vector 有什么区别？", "medium", ["List", "线程安全", "历史"]),
          createQuestion("Queue、Deque、BlockingQueue 分别适合什么场景？", "medium", ["Queue", "Deque", "BlockingQueue"]),
          createQuestion("Iterator 的 fail-fast 机制是什么？", "medium", ["Iterator", "fail-fast", "高频"]),
        ],
      },
      {
        title: "Map 与 Set",
        questions: [
          createQuestion("HashMap 的底层结构和 put 流程是什么？", "hard", ["HashMap", "源码", "高频"]),
          createQuestion("HashMap 为什么要扩容和树化？", "hard", ["HashMap", "扩容", "红黑树"]),
          createQuestion("HashMap 和 Hashtable 有什么区别？", "medium", ["HashMap", "Hashtable", "线程安全"]),
          createQuestion("HashSet、LinkedHashSet、TreeSet 有什么区别？", "medium", ["Set", "有序", "源码"]),
          createQuestion("LinkedHashMap 为什么能保证顺序？", "medium", ["LinkedHashMap", "源码", "有序"]),
          createQuestion("TreeMap 为什么能排序？", "medium", ["TreeMap", "红黑树", "排序"]),
        ],
      },
      {
        title: "并发与源码实践",
        questions: [
          createQuestion("ConcurrentHashMap 为什么线程安全？", "hard", ["ConcurrentHashMap", "并发", "高频"]),
          createQuestion("CopyOnWriteArrayList 适合什么场景？", "medium", ["并发集合", "COW", "场景"]),
          createQuestion("Collections.synchronizedList 和并发容器有什么区别？", "medium", ["并发", "集合", "线程安全"]),
          createQuestion("ConcurrentHashMap 和 Hashtable 有什么区别？", "medium", ["ConcurrentHashMap", "Hashtable", "对比"]),
          createQuestion("BlockingQueue 在生产者消费者模型里有什么价值？", "medium", ["BlockingQueue", "并发", "场景"]),
          createQuestion("为什么不建议在遍历集合时直接增删元素？", "easy", ["迭代器", "集合", "坑点"]),
        ],
      },
      {
        title: "体系梳理与实战",
        questions: [
          createQuestion("HashMap 的 key 为什么要尽量设计成不可变？", "medium", ["HashMap", "key", "设计"]),
          createQuestion("ArrayList 的扩容机制会带来哪些影响？", "medium", ["ArrayList", "扩容", "性能"]),
          createQuestion("LinkedList 为什么查询慢但插入删除看起来有优势？", "medium", ["LinkedList", "复杂度", "源码"]),
          createQuestion("Set 去重到底依赖什么机制？", "easy", ["Set", "去重", "高频"]),
          createQuestion("集合类在大数据量场景下如何做选型？", "hard", ["集合", "选型", "性能"]),
          createQuestion("如何排查集合使用导致的内存和性能问题？", "hard", ["集合", "排障", "性能"]),
        ],
      },
    ],
  },
  "Java 并发": {
    subtitle: "Java 并发 高频面试题库",
    description: "覆盖线程模型、可见性、有序性、锁和线程池，是 Java 并发最常见的考点集合。",
    tags: ["Java 并发", "线程", "锁", "JUC", "线程池"],
    groups: [
      {
        title: "线程基础",
        questions: [
          createQuestion("线程和进程有什么区别？", "easy", ["线程", "进程", "基础"]),
          createQuestion("sleep、wait、join 有什么区别？", "medium", ["线程", "wait", "join"]),
          createQuestion("ThreadLocal 的实现原理和使用风险是什么？", "medium", ["ThreadLocal", "原理", "风险"]),
        ],
      },
      {
        title: "并发原理",
        questions: [
          createQuestion("synchronized 的底层原理是什么？", "hard", ["synchronized", "锁", "高频"]),
          createQuestion("Java 内存模型 JMM 解决了什么问题？", "hard", ["JMM", "内存模型", "高频"]),
          createQuestion("volatile 为什么能保证可见性？", "hard", ["volatile", "JMM", "高频"]),
          createQuestion("CAS 和 AQS 分别解决了什么问题？", "hard", ["CAS", "AQS", "高频"]),
        ],
      },
      {
        title: "并发工具",
        questions: [
          createQuestion("线程池的核心参数有哪些？", "medium", ["线程池", "Executor", "高频"]),
          createQuestion("CompletableFuture 有什么优势和坑点？", "medium", ["CompletableFuture", "异步", "实践"]),
          createQuestion("如何分析和排查死锁问题？", "medium", ["死锁", "排查", "实践"]),
        ],
      },
    ],
  },
  JVM: {
    subtitle: "JVM 高频面试题库",
    description: "覆盖内存结构、类加载、垃圾回收和性能调优，是 Java 后端面试的核心原理题库。",
    tags: ["JVM", "内存", "GC", "类加载", "调优"],
    groups: [
      {
        title: "内存与对象",
        questions: [
          createQuestion("JVM 运行时内存区域有哪些？", "easy", ["JVM", "内存", "高频"]),
          createQuestion("对象在 JVM 中是如何创建和分配的？", "medium", ["对象", "内存分配", "JVM"]),
          createQuestion("栈和堆有什么区别？", "easy", ["栈", "堆", "基础"]),
        ],
      },
      {
        title: "类加载与执行",
        questions: [
          createQuestion("类加载过程和双亲委派机制是什么？", "hard", ["类加载", "双亲委派", "高频"]),
          createQuestion("JIT 和解释执行有什么区别？", "medium", ["JIT", "编译", "执行"]),
          createQuestion("字节码增强和动态代理和 JVM 有什么关系？", "medium", ["字节码", "代理", "原理"]),
        ],
      },
      {
        title: "GC 与调优",
        questions: [
          createQuestion("常见 GC 算法和垃圾收集器有什么区别？", "hard", ["GC", "收集器", "高频"]),
          createQuestion("什么时候会发生 Full GC？", "medium", ["Full GC", "JVM", "高频"]),
          createQuestion("线上 OOM 应该如何定位和排查？", "hard", ["OOM", "排查", "调优"]),
        ],
      },
    ],
  },
  Spring: {
    subtitle: "Spring 核心 高频面试题库",
    description: "覆盖 IOC、AOP、事务、MVC 和常见扩展点，是 Spring 核心能力的面试题库。",
    tags: ["Spring", "IOC", "AOP", "事务", "MVC"],
    groups: [
      {
        title: "IOC 与 Bean",
        questions: [
          createQuestion("Spring IOC 容器解决了什么问题？", "easy", ["Spring", "IOC", "高频"]),
          createQuestion("Bean 的生命周期是怎样的？", "medium", ["Bean", "生命周期", "高频"]),
          createQuestion("Spring 如何解决循环依赖？", "hard", ["循环依赖", "Spring", "源码"]),
        ],
      },
      {
        title: "AOP 与事务",
        questions: [
          createQuestion("Spring AOP 的实现原理是什么？", "hard", ["AOP", "动态代理", "高频"]),
          createQuestion("@Transactional 为什么会失效？", "medium", ["事务", "高频", "Spring"]),
          createQuestion("事务传播行为和隔离级别怎么理解？", "medium", ["事务", "传播", "隔离"]),
        ],
      },
      {
        title: "MVC 与扩展",
        questions: [
          createQuestion("Spring MVC 的请求处理流程是什么？", "medium", ["Spring MVC", "流程", "高频"]),
          createQuestion("过滤器、拦截器、AOP 有什么区别？", "medium", ["Filter", "Interceptor", "AOP"]),
          createQuestion("BeanPostProcessor 在 Spring 中起什么作用？", "medium", ["BeanPostProcessor", "扩展", "源码"]),
        ],
      },
    ],
  },
  SpringBoot: {
    subtitle: "Spring Boot 高频面试题库",
    description: "聚焦自动配置、配置加载、Starter、Actuator 和生产实践，是 Spring Boot 面试常见题库。",
    tags: ["Spring Boot", "自动配置", "Starter", "Actuator", "配置"],
    groups: [
      {
        title: "自动配置",
        questions: [
          createQuestion("Spring Boot 自动配置的原理是什么？", "hard", ["自动配置", "Condition", "高频"]),
          createQuestion("@SpringBootApplication 做了哪些事？", "medium", ["启动注解", "Spring Boot", "高频"]),
          createQuestion("Starter 机制解决了什么问题？", "easy", ["Starter", "依赖管理", "实践"]),
        ],
      },
      {
        title: "配置与运行",
        questions: [
          createQuestion("Spring Boot 配置文件的加载顺序是什么？", "medium", ["配置", "优先级", "高频"]),
          createQuestion("Actuator 常用在什么场景？", "easy", ["Actuator", "监控", "实践"]),
          createQuestion("内嵌容器启动流程是什么？", "medium", ["Tomcat", "启动", "原理"]),
        ],
      },
      {
        title: "生产实践",
        questions: [
          createQuestion("Spring Boot 如何做启动优化？", "medium", ["启动优化", "性能", "实践"]),
          createQuestion("如何设计一个可复用的 Spring Boot Starter？", "medium", ["Starter", "设计", "实践"]),
          createQuestion("线上配置管理和环境隔离怎么做？", "medium", ["配置中心", "环境", "实践"]),
        ],
      },
    ],
  },
  SpringCloud: {
    subtitle: "Spring Cloud 高频面试题库",
    description: "覆盖注册发现、配置中心、网关、熔断限流和服务治理，是微服务常见面试题库。",
    tags: ["Spring Cloud", "微服务", "网关", "注册中心", "治理"],
    groups: [
      {
        title: "注册发现",
        questions: [
          createQuestion("注册中心在微服务里解决了什么问题？", "easy", ["注册中心", "微服务", "高频"]),
          createQuestion("Nacos 和 Eureka 有什么区别？", "medium", ["Nacos", "Eureka", "高频"]),
          createQuestion("配置中心的价值和风险点是什么？", "medium", ["配置中心", "实践", "治理"]),
        ],
      },
      {
        title: "调用链路",
        questions: [
          createQuestion("Feign 的调用流程和常见问题是什么？", "medium", ["Feign", "调用链路", "高频"]),
          createQuestion("Gateway 为什么适合作为统一网关？", "medium", ["Gateway", "网关", "高频"]),
          createQuestion("负载均衡和服务降级如何协同工作？", "medium", ["负载均衡", "降级", "实践"]),
        ],
      },
      {
        title: "服务治理",
        questions: [
          createQuestion("限流、熔断、降级分别解决什么问题？", "medium", ["限流", "熔断", "降级"]),
          createQuestion("分布式链路追踪常见方案有哪些？", "medium", ["链路追踪", "SkyWalking", "Zipkin"]),
          createQuestion("微服务下如何处理幂等和重试？", "hard", ["幂等", "重试", "分布式"]),
        ],
      },
    ],
  },
  MySQL: {
    subtitle: "MySQL 高频面试题库",
    description: "覆盖索引、锁、事务、MVCC 和 SQL 优化，是后端数据库面试的核心题库。",
    tags: ["MySQL", "索引", "事务", "锁", "SQL"],
    groups: [
      {
        title: "索引原理",
        questions: [
          createQuestion("MySQL 索引为什么通常使用 B+ 树？", "hard", ["索引", "B+树", "高频"]),
          createQuestion("什么是聚簇索引和二级索引？", "medium", ["聚簇索引", "二级索引", "高频"]),
          createQuestion("联合索引为什么强调最左前缀？", "medium", ["联合索引", "最左前缀", "高频"]),
        ],
      },
      {
        title: "事务与锁",
        questions: [
          createQuestion("MySQL 事务 ACID 是如何保证的？", "medium", ["事务", "ACID", "高频"]),
          createQuestion("MySQL 的四种隔离级别有什么区别？", "medium", ["事务", "隔离级别", "高频"]),
          createQuestion("MVCC 是如何实现读写并发的？", "hard", ["MVCC", "事务", "高频"]),
          createQuestion("什么是间隙锁和 next-key lock？", "hard", ["间隙锁", "next-key", "锁"]),
        ],
      },
      {
        title: "SQL 优化",
        questions: [
          createQuestion("Explain 中哪些字段最值得重点关注？", "medium", ["Explain", "SQL优化", "高频"]),
          createQuestion("慢查询应该如何定位和优化？", "medium", ["慢查询", "优化", "高频"]),
          createQuestion("深分页为什么慢，如何优化？", "medium", ["分页", "性能", "实践"]),
        ],
      },
    ],
  },
  Redis: {
    subtitle: "Redis 高频面试题库",
    description: "覆盖数据结构、持久化、高可用和缓存问题，是 Redis 面试最常见的题库。",
    tags: ["Redis", "缓存", "高可用", "数据结构", "面试"],
    groups: [
      {
        title: "数据结构",
        questions: [
          createQuestion("Redis 常见数据结构及其使用场景是什么？", "easy", ["Redis", "数据结构", "高频"]),
          createQuestion("为什么 Redis 性能这么高？", "medium", ["Redis", "性能", "高频"]),
          createQuestion("ZSet 适合解决什么问题？", "medium", ["ZSet", "场景", "Redis"]),
        ],
      },
      {
        title: "持久化与高可用",
        questions: [
          createQuestion("RDB 和 AOF 有什么区别？", "medium", ["RDB", "AOF", "高频"]),
          createQuestion("Redis 主从、哨兵、集群分别解决什么问题？", "medium", ["主从", "哨兵", "集群"]),
          createQuestion("Redis Cluster 的数据分片机制是什么？", "hard", ["Cluster", "分片", "Redis"]),
        ],
      },
      {
        title: "缓存实践",
        questions: [
          createQuestion("缓存穿透、击穿、雪崩分别怎么处理？", "medium", ["缓存", "高频", "实践"]),
          createQuestion("Redis 如何实现滑动窗口限流？", "hard", ["滑动窗口", "限流", "Redis"]),
          createQuestion("如何保证缓存与数据库的一致性？", "hard", ["一致性", "缓存", "高频"]),
          createQuestion("大 key 和热 key 应该如何治理？", "medium", ["大key", "热key", "治理"]),
        ],
      },
    ],
  },
  Kafka: {
    subtitle: "Kafka 高频面试题库",
    description: "覆盖分区、副本、生产消费、顺序与可靠性，是 Kafka 核心面试题库。",
    tags: ["Kafka", "消息队列", "分区", "副本", "可靠性"],
    groups: [
      {
        title: "基础架构",
        questions: [
          createQuestion("Kafka 的分区、副本、Topic 分别是什么？", "easy", ["Kafka", "分区", "高频"]),
          createQuestion("Kafka 为什么吞吐量高？", "medium", ["Kafka", "吞吐", "高频"]),
          createQuestion("Kafka 的日志存储结构是什么？", "medium", ["日志", "存储", "Kafka"]),
        ],
      },
      {
        title: "生产与消费",
        questions: [
          createQuestion("Producer 的 ack、重试、幂等分别有什么作用？", "medium", ["Producer", "幂等", "ack"]),
          createQuestion("Consumer Group 和 Rebalance 是什么？", "medium", ["Consumer Group", "Rebalance", "高频"]),
          createQuestion("如何保证 Kafka 消息顺序？", "medium", ["顺序", "Kafka", "实践"]),
        ],
      },
      {
        title: "可靠性与治理",
        questions: [
          createQuestion("Kafka 如何避免消息丢失？", "hard", ["消息丢失", "可靠性", "高频"]),
          createQuestion("Kafka 积压问题应该如何排查？", "medium", ["积压", "排查", "Kafka"]),
          createQuestion("ISR 机制在 Kafka 中起什么作用？", "hard", ["ISR", "副本", "原理"]),
        ],
      },
    ],
  },
  "计算机网络": {
    subtitle: "计算机网络 高频面试题库",
    description: "覆盖 TCP、HTTP、HTTPS、DNS 和网络排障，是后端和前端都常考的网络题库。",
    tags: ["计算机网络", "TCP", "HTTP", "HTTPS", "DNS"],
    groups: [
      {
        title: "TCP / IP",
        questions: [
          createQuestion("TCP 三次握手和四次挥手分别做了什么？", "easy", ["TCP", "高频", "网络"]),
          createQuestion("TCP 和 UDP 有什么区别？", "easy", ["TCP", "UDP", "高频"]),
          createQuestion("为什么会出现 TIME_WAIT？", "medium", ["TIME_WAIT", "TCP", "高频"]),
        ],
      },
      {
        title: "HTTP / HTTPS",
        questions: [
          createQuestion("HTTP 和 HTTPS 有什么区别？", "easy", ["HTTP", "HTTPS", "高频"]),
          createQuestion("HTTPS 握手过程中发生了什么？", "medium", ["HTTPS", "TLS", "高频"]),
          createQuestion("HTTP 1.1、HTTP 2、HTTP 3 有什么区别？", "medium", ["HTTP2", "HTTP3", "性能"]),
        ],
      },
      {
        title: "网络实践",
        questions: [
          createQuestion("Cookie、Session、Token 有什么区别？", "easy", ["认证", "Session", "Token"]),
          createQuestion("DNS 解析过程是什么？", "medium", ["DNS", "网络", "高频"]),
          createQuestion("CDN 为什么能提升访问速度？", "medium", ["CDN", "缓存", "网络"]),
        ],
      },
    ],
  },
  "操作系统": {
    subtitle: "操作系统 高频面试题库",
    description: "覆盖进程线程、内存管理、IO 多路复用和同步机制，是系统基础常考题库。",
    tags: ["操作系统", "进程", "线程", "内存", "IO"],
    groups: [
      {
        title: "进程与线程",
        questions: [
          createQuestion("进程和线程有什么区别？", "easy", ["进程", "线程", "高频"]),
          createQuestion("线程上下文切换为什么成本高？", "medium", ["上下文切换", "线程", "高频"]),
          createQuestion("协程和线程有什么区别？", "medium", ["协程", "线程", "实践"]),
        ],
      },
      {
        title: "内存与 IO",
        questions: [
          createQuestion("虚拟内存解决了什么问题？", "medium", ["虚拟内存", "操作系统", "高频"]),
          createQuestion("Page Cache 在系统里起什么作用？", "medium", ["Page Cache", "缓存", "OS"]),
          createQuestion("什么是 IO 多路复用？", "medium", ["IO多路复用", "epoll", "高频"]),
        ],
      },
      {
        title: "同步与调度",
        questions: [
          createQuestion("什么是死锁，如何避免死锁？", "medium", ["死锁", "同步", "高频"]),
          createQuestion("互斥锁、读写锁、信号量有什么区别？", "medium", ["锁", "信号量", "同步"]),
          createQuestion("epoll 相比 select 和 poll 有什么优势？", "hard", ["epoll", "select", "poll"]),
        ],
      },
    ],
  },
  "消息队列": {
    subtitle: "消息队列 高频面试题库",
    description: "覆盖削峰、异步、解耦、顺序、可靠性和消费治理，是 MQ 通用题库。",
    tags: ["消息队列", "异步", "解耦", "可靠性", "MQ"],
    groups: [
      {
        title: "使用价值",
        questions: [
          createQuestion("为什么项目里要引入消息队列？", "easy", ["消息队列", "削峰", "解耦"]),
          createQuestion("消息队列适合哪些业务场景？", "easy", ["场景", "MQ", "实践"]),
          createQuestion("同步调用和异步消息如何取舍？", "medium", ["同步", "异步", "设计"]),
        ],
      },
      {
        title: "可靠性",
        questions: [
          createQuestion("如何避免消息丢失？", "hard", ["可靠性", "消息丢失", "高频"]),
          createQuestion("如何设计消费幂等？", "medium", ["幂等", "消费", "高频"]),
          createQuestion("如何保证消息顺序？", "medium", ["顺序", "消息队列", "高频"]),
        ],
      },
      {
        title: "业务治理",
        questions: [
          createQuestion("消息积压应该如何处理？", "medium", ["积压", "排查", "实践"]),
          createQuestion("重试队列和死信队列有什么作用？", "medium", ["重试", "死信", "治理"]),
          createQuestion("延迟消息和事务消息适合什么场景？", "medium", ["延迟消息", "事务消息", "实践"]),
        ],
      },
    ],
  },
  "后端系统设计": {
    subtitle: "后端系统设计 高频面试题库",
    description: "覆盖高并发、数据一致性、服务拆分和稳定性治理，是系统设计常见题库。",
    tags: ["系统设计", "后端", "高并发", "一致性", "架构"],
    groups: [
      {
        title: "高并发设计",
        questions: [
          createQuestion("高并发系统为什么要做限流、降级、熔断？", "medium", ["高并发", "限流", "熔断"]),
          createQuestion("秒杀系统的核心设计点有哪些？", "hard", ["秒杀", "高并发", "设计"]),
          createQuestion("缓存、异步、分库分表分别适合解决什么问题？", "medium", ["缓存", "异步", "分库分表"]),
        ],
      },
      {
        title: "数据一致性",
        questions: [
          createQuestion("分布式事务有哪些常见方案？", "hard", ["分布式事务", "一致性", "高频"]),
          createQuestion("最终一致性通常怎么落地？", "medium", ["最终一致性", "补偿", "实践"]),
          createQuestion("如何设计接口幂等？", "medium", ["幂等", "设计", "高频"]),
        ],
      },
      {
        title: "架构治理",
        questions: [
          createQuestion("服务拆分时应该关注哪些边界？", "medium", ["拆分", "领域边界", "设计"]),
          createQuestion("如何设计一个可观测的后端系统？", "medium", ["可观测性", "监控", "实践"]),
          createQuestion("线上故障复盘通常从哪几步开始？", "medium", ["复盘", "故障", "治理"]),
        ],
      },
    ],
  },
  "设计模式": {
    subtitle: "设计模式 高频面试题库",
    description: "覆盖 SOLID、创建型、结构型和行为型模式，是面向对象设计高频题库。",
    tags: ["设计模式", "SOLID", "策略模式", "代理模式", "面向对象"],
    groups: [
      {
        title: "设计原则",
        questions: [
          createQuestion("SOLID 五大原则分别是什么？", "easy", ["SOLID", "设计原则", "高频"]),
          createQuestion("组合优于继承是什么意思？", "medium", ["组合", "继承", "设计"]),
          createQuestion("接口隔离原则在实际项目中怎么体现？", "medium", ["接口隔离", "设计原则", "实践"]),
        ],
      },
      {
        title: "常见模式",
        questions: [
          createQuestion("单例模式有哪些写法和风险？", "easy", ["单例", "设计模式", "高频"]),
          createQuestion("工厂模式和建造者模式有什么区别？", "medium", ["工厂模式", "建造者", "高频"]),
          createQuestion("策略模式适合解决什么问题？", "medium", ["策略模式", "场景", "高频"]),
        ],
      },
      {
        title: "模式实践",
        questions: [
          createQuestion("代理模式和装饰器模式有什么区别？", "medium", ["代理模式", "装饰器", "高频"]),
          createQuestion("观察者模式在业务系统里有哪些应用？", "medium", ["观察者模式", "事件", "实践"]),
          createQuestion("模板方法模式和责任链模式分别适合什么场景？", "medium", ["模板方法", "责任链", "设计"]),
        ],
      },
    ],
  },
  JavaScript: {
    subtitle: "JavaScript 高频面试题库",
    description: "覆盖作用域、原型链、事件循环、Promise 和对象机制，是前端核心基础题库。",
    tags: ["JavaScript", "作用域", "事件循环", "Promise", "原型链"],
    groups: [
      {
        title: "语言基础",
        questions: [
          createQuestion("作用域链和闭包是什么？", "easy", ["作用域", "闭包", "高频"]),
          createQuestion("this 的指向规则是什么？", "medium", ["this", "JavaScript", "高频"]),
          createQuestion("原型和原型链是如何工作的？", "medium", ["原型链", "对象", "高频"]),
        ],
      },
      {
        title: "异步机制",
        questions: [
          createQuestion("JavaScript 事件循环机制是什么？", "hard", ["事件循环", "宏任务", "微任务"]),
          createQuestion("Promise 的状态流转和链式调用机制是什么？", "medium", ["Promise", "异步", "高频"]),
          createQuestion("async / await 本质上做了什么？", "medium", ["async", "await", "高频"]),
        ],
      },
      {
        title: "对象与工程实践",
        questions: [
          createQuestion("深拷贝和浅拷贝有什么区别？", "easy", ["深拷贝", "浅拷贝", "高频"]),
          createQuestion("new 一个对象时发生了什么？", "medium", ["new", "对象", "高频"]),
          createQuestion("防抖和节流的区别与场景是什么？", "easy", ["防抖", "节流", "实践"]),
        ],
      },
    ],
  },
  TypeScript: {
    subtitle: "TypeScript 高频面试题库",
    description: "覆盖类型系统、泛型、工具类型和工程实践，是 TypeScript 面试核心题库。",
    tags: ["TypeScript", "泛型", "工具类型", "类型系统", "工程化"],
    groups: [
      {
        title: "类型基础",
        questions: [
          createQuestion("any、unknown、never 有什么区别？", "easy", ["TypeScript", "类型", "高频"]),
          createQuestion("interface 和 type 有什么区别？", "medium", ["interface", "type", "高频"]),
          createQuestion("联合类型和交叉类型分别适合什么场景？", "medium", ["联合类型", "交叉类型", "高频"]),
        ],
      },
      {
        title: "泛型与推断",
        questions: [
          createQuestion("泛型为什么能提升代码复用性？", "easy", ["泛型", "TypeScript", "高频"]),
          createQuestion("泛型约束 extends 和 keyof 有什么作用？", "medium", ["泛型约束", "keyof", "高频"]),
          createQuestion("infer 在条件类型里通常怎么用？", "hard", ["infer", "条件类型", "进阶"]),
        ],
      },
      {
        title: "工程实践",
        questions: [
          createQuestion("常见工具类型 Partial、Pick、Omit 有什么作用？", "medium", ["工具类型", "高频", "TypeScript"]),
          createQuestion("strict 模式为什么很重要？", "easy", ["strict", "类型检查", "工程化"]),
          createQuestion("如何为第三方库补充类型声明？", "medium", ["声明文件", "d.ts", "实践"]),
        ],
      },
    ],
  },
  "前端工程化": {
    subtitle: "前端工程化 高频面试题库",
    description: "覆盖构建工具、代码分割、缓存、监控和发布流程，是前端工程化核心题库。",
    tags: ["前端工程化", "Webpack", "Vite", "性能优化", "部署"],
    groups: [
      {
        title: "构建工具",
        questions: [
          createQuestion("Webpack 和 Vite 有什么区别？", "medium", ["Webpack", "Vite", "高频"]),
          createQuestion("Tree Shaking 为什么能减少包体积？", "medium", ["Tree Shaking", "构建", "高频"]),
          createQuestion("Code Splitting 和按需加载通常怎么做？", "medium", ["代码分割", "按需加载", "高频"]),
        ],
      },
      {
        title: "质量与发布",
        questions: [
          createQuestion("前端为什么要接入 ESLint、Prettier 和 TypeScript？", "easy", ["ESLint", "Prettier", "质量"]),
          createQuestion("CI / CD 在前端发布里通常承担什么角色？", "medium", ["CI", "CD", "发布"]),
          createQuestion("Source Map 在线上排查问题时怎么用？", "medium", ["Source Map", "排查", "高频"]),
        ],
      },
      {
        title: "性能与监控",
        questions: [
          createQuestion("前端首屏性能优化通常从哪些方向入手？", "medium", ["首屏优化", "性能", "高频"]),
          createQuestion("浏览器缓存强缓存和协商缓存有什么区别？", "medium", ["缓存", "HTTP", "高频"]),
          createQuestion("前端监控通常采集哪些指标？", "medium", ["监控", "性能", "实践"]),
        ],
      },
    ],
  },
  "Vue 3": {
    subtitle: "Vue 3 高频面试题库",
    description: "覆盖响应式、组件通信、生命周期、路由和状态管理，是 Vue 3 核心题库。",
    tags: ["Vue 3", "响应式", "组件通信", "Pinia", "生命周期"],
    groups: [
      {
        title: "响应式系统",
        questions: [
          createQuestion("Vue 3 的响应式为什么改成 Proxy？", "hard", ["Vue3", "响应式", "高频"]),
          createQuestion("ref 和 reactive 有什么区别？", "easy", ["ref", "reactive", "高频"]),
          createQuestion("computed 和 watch 分别适合什么场景？", "medium", ["computed", "watch", "高频"]),
        ],
      },
      {
        title: "组件体系",
        questions: [
          createQuestion("Vue 组件通信有哪些常见方式？", "easy", ["组件通信", "props", "emit"]),
          createQuestion("provide / inject 通常解决什么问题？", "medium", ["provide", "inject", "场景"]),
          createQuestion("KeepAlive 在 Vue 中是如何工作的？", "medium", ["KeepAlive", "缓存", "Vue"]),
        ],
      },
      {
        title: "工程实践",
        questions: [
          createQuestion("Pinia 相比 Vuex 有什么变化？", "medium", ["Pinia", "状态管理", "高频"]),
          createQuestion("Vue Router 的导航守卫常见用法是什么？", "easy", ["Router", "导航守卫", "实践"]),
          createQuestion("Vue 项目性能优化通常怎么做？", "medium", ["Vue", "性能优化", "实践"]),
        ],
      },
    ],
  },
  React: {
    subtitle: "React 高频面试题库",
    description: "覆盖 Fiber、Hooks、状态管理和性能优化，是 React 面试的核心题库。",
    tags: ["React", "Fiber", "Hooks", "状态管理", "性能优化"],
    groups: [
      {
        title: "渲染原理",
        questions: [
          createQuestion("React Fiber 解决了什么问题？", "hard", ["Fiber", "React", "高频"]),
          createQuestion("React 的 setState 为什么看起来是异步的？", "medium", ["setState", "状态更新", "高频"]),
          createQuestion("key 在 React 列表渲染里为什么重要？", "easy", ["key", "diff", "高频"]),
        ],
      },
      {
        title: "Hooks 体系",
        questions: [
          createQuestion("useEffect 的依赖数组应该怎么理解？", "medium", ["useEffect", "Hooks", "高频"]),
          createQuestion("useMemo 和 useCallback 分别适合什么场景？", "medium", ["useMemo", "useCallback", "高频"]),
          createQuestion("为什么 Hooks 不能放在条件判断里？", "medium", ["Hooks", "规则", "原理"]),
        ],
      },
      {
        title: "工程实践",
        questions: [
          createQuestion("Context 为什么容易引发不必要渲染？", "medium", ["Context", "性能", "React"]),
          createQuestion("React 项目常见性能优化手段有哪些？", "medium", ["性能优化", "React", "实践"]),
          createQuestion("SSR 和 CSR 的优缺点分别是什么？", "medium", ["SSR", "CSR", "工程化"]),
        ],
      },
    ],
  },
};

/**
 * Returns a starter blueprint for a requested topic.
 * @param {string} topic Requested bank topic.
 * @returns {StarterBankBlueprint} Starter blueprint matched by topic name.
 */
export function getStarterBankBlueprint(topic: string): StarterBankBlueprint {
  const baseBlueprint =
    STARTER_BANK_BLUEPRINTS[topic] ?? {
      subtitle: `${topic} 高频面试题库`,
      description: `围绕 ${topic} 整理高频考点、常见追问和结构化答案。`,
      tags: [topic, "面试", "高频"],
      groups: [
        {
          title: "核心概念",
          questions: [
            createQuestion(`${topic} 的核心概念是什么？`, "easy", [topic, "概念", "高频"]),
            createQuestion(`${topic} 常见的核心机制是什么？`, "medium", [topic, "原理", "高频"]),
            createQuestion(`${topic} 在项目中通常怎么落地？`, "medium", [topic, "实践", "场景"]),
          ],
        },
        {
          title: "高频追问",
          questions: [
            createQuestion(`${topic} 的优缺点和边界是什么？`, "medium", [topic, "边界", "高频"]),
            createQuestion(`${topic} 和相近方案有什么区别？`, "medium", [topic, "对比", "高频"]),
            createQuestion(`${topic} 常见的面试坑点有哪些？`, "medium", [topic, "坑点", "实践"]),
          ],
        },
      ],
    };

  if (topic === "Java 基础" || topic === "Java 集合") {
    return baseBlueprint;
  }

  const expandedGroups = expandStarterGroups(topic, [
    ...baseBlueprint.groups,
    {
      title: "体系梳理与实战",
      questions: [
        createQuestion(`${topic} 在真实项目中最常见的使用场景有哪些？`, "medium", [topic, "场景", "实战"]),
        createQuestion(`${topic} 的核心原理如果串成一条主线，应该怎么理解？`, "medium", [topic, "主线", "原理"]),
        createQuestion(`${topic} 最容易忽略的边界条件和误区有哪些？`, "medium", [topic, "边界", "误区"]),
        createQuestion(`${topic} 在实际排障和性能治理中最常见的问题是什么？`, "medium", [topic, "排障", "性能"]),
      ],
    },
  ]);

  return {
    ...baseBlueprint,
    groups: expandedGroups,
  };
}

/**
 * 为 starter 题目构造更像真实面试回答的标准答案正文。
 * @param {string} questionTitle 当前题目标题。
 * @param {StarterInsight} insight 当前题目的知识洞察。
 * @returns {{ paragraphs: string[]; bullets: string[] }} 可直接渲染的标准答案与解析。
 */
function buildStarterReferenceAnswer(
  questionTitle: string,
  insight: StarterInsight
): { paragraphs: string[]; bullets: string[] } {
  const answerSummary = joinReadableSentence(insight.overview);
  const answerExplanation = joinReadableSentence(insight.highlights);
  const answerPath = joinReadableSentence(insight.answer);
  return {
    paragraphs: [
      `30 秒回答：面试官问到「${questionTitle}」时，先给出核心结论：${answerSummary}`,
      `1 分钟回答：然后按“定义和目标 -> 原理机制 -> 场景边界 -> 项目取舍”的顺序展开。${answerExplanation}`,
      `深入追问：如果面试官继续追问，可以沿着这条主线回答：${answerPath} 最后结合项目中的使用、排查或风险控制收口。`,
    ],
    bullets: [
      ...insight.answer,
      "项目表达时，要说明这个知识点解决了什么业务或工程问题，以及为什么选择这种方案。",
      "风险和误区要主动补充，例如性能影响、边界条件、线程安全、数据一致性或维护成本。",
    ],
  };
}

/**
 * 构造 Markdown 表格，供黄金样稿直接插入知识正文。
 * @param {string[]} headers 表头数组。
 * @param {string[][]} rows 行数据。
 * @returns {string} 可直接渲染的 Markdown 表格文本。
 */
function buildStarterMarkdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerLine, dividerLine, body].join("\n");
}

/**
 * 构造 Markdown 代码块，避免样稿里再出现纯文字假代码。
 * @param {string} language 代码语言。
 * @param {string} code 代码正文。
 * @returns {string} 可直接渲染的 Markdown 代码块。
 */
function buildStarterCodeBlock(language: string, code: string): string {
  return `\`\`\`${language}\n${code.trim()}\n\`\`\``;
}

/**
 * 为黄金样稿构造统一的题目摘要信息。
 * @param {StarterTopicBuildContext} context 当前题目构建上下文。
 * @param {string} keywords 当前题目的核心关键词。
 * @param {string} learningTrack 当前题目的学习主线。
 * @returns {QuickFact[]} 可直接落库的摘要信息。
 */
function buildStarterQuickFacts(
  context: StarterTopicBuildContext,
  keywords: string,
  learningTrack: string
): QuickFact[] {
  return [
    { k: "知识点", v: context.question.title },
    { k: "所属模块", v: context.groupTitle },
    { k: "题库主题", v: context.bankTopic },
    { k: "难度", v: context.difficultyText },
    { k: "面试频率", v: context.frequencyText },
    { k: "核心关键词", v: keywords },
    { k: "学习主线", v: learningTrack },
  ];
}

type GoldenRichSpec = {
  match: RegExp;
  keywords: string;
  track: string;
  conclusion: string;
  takeaways: string[];
  goals: string[];
  plainSummary: string;
  scenario: string;
  why: string[];
  diagram: string;
  comparison: {
    title: string;
    headers: string[];
    rows: string[][];
  };
  code: {
    title: string;
    language: string;
    code: string;
    explanation: string;
    output?: string;
    outputExplanation?: string;
  };
  mistake: {
    mistake: string;
    whyWrong: string;
    correct: string;
  };
  summary: string;
  retell: string;
  answer30s: string;
  answer2min: string;
  advancedAnswer: string;
  essentialPoints: string[];
  followUps: Array<{ question: string; keyAnswer: string; difficulty?: "easy" | "medium" | "hard" }>;
};

const GOLDEN_RICH_SPECS: GoldenRichSpec[] = [
  {
    match: /B\+\s*树|B\+Tree|索引为什么通常使用/,
    keywords: "B+Tree / 磁盘页 / 树高 / 范围查询 / 回表 / 覆盖索引",
    track: "从慢查询出发，先讲磁盘 IO，再比较 Hash、红黑树、B-Tree，最后落到 InnoDB 索引实现。",
    conclusion:
      "MySQL InnoDB 选择 B+Tree，不是因为它在理论复杂度上最漂亮，而是因为它最适合磁盘页模型：树高低、IO 少、叶子有序，范围查询和聚簇索引都好落地。",
    takeaways: [
      "数据库索引首先优化的是磁盘 IO 次数，不是单纯比较算法复杂度。",
      "B+Tree 的非叶子节点只存 key 和指针，一个 16KB 页可以容纳更多分支，树更矮。",
      "叶子节点有序相连，范围查询定位起点后可以顺序向后扫描。",
      "InnoDB 主键索引叶子存整行，二级索引叶子存主键值，查询完整行可能回表。",
    ],
    goals: [
      "为什么红黑树不适合做数据库索引？",
      "为什么 Hash 不适合作为 InnoDB 通用索引？",
      "B+Tree 为什么适合范围查询？",
      "聚簇索引、二级索引、回表、覆盖索引分别是什么？",
    ],
    plainSummary:
      "你可以把 B+Tree 理解成一本很厚的目录。它不是每个目录项只指向两个分支，而是一页目录能放很多 key，所以翻几页就能定位到数据；定位到叶子后，叶子之间还是按顺序连起来的，所以查一个范围不用重新从根上找很多次。",
    scenario:
      "假设用户表有 1000 万行，按用户 id 或时间范围查询订单。如果没有索引，数据库要从头扫到尾；如果索引用红黑树，每层节点太少，磁盘页利用率低；如果用 Hash，等值查找快，但范围查询和排序就断了。",
    why: [
      "数据库数据在磁盘页里，InnoDB 默认页大小是 16KB，一次 IO 读的是页，不是一个 Java 对象。",
      "二叉树或红黑树每个节点分支少，1000 万数据大约二十多层，如果节点分散在磁盘上，IO 次数会很高。",
      "B+Tree 是多路树，非叶子节点不放整行数据，单页能放更多 key 和指针，树高通常能控制在 2 到 4 层。",
      "范围查询时，B+Tree 只要先定位到起点叶子节点，再沿叶子链表向后扫，天然适合 order by、between 和分页边界查询。",
    ],
    diagram:
      "根页(16KB, 存很多 key)\n├─ 内部页 A\n│  ├─ 叶子页 A1 -> 叶子页 A2 -> 叶子页 A3\n└─ 内部页 B\n   ├─ 叶子页 B1 -> 叶子页 B2 -> 叶子页 B3",
    comparison: {
      title: "常见索引结构对比",
      headers: ["结构", "为什么不优先用它", "B+Tree 的优势"],
      rows: [
        ["红黑树", "二叉结构层数高，磁盘页利用率低", "多路分支让树更矮，IO 更少"],
        ["Hash", "破坏顺序，不适合范围查询、排序和最左前缀", "叶子节点有序且链表连接"],
        ["B-Tree", "非叶子节点也可能存数据，同样空间 key 更少", "非叶子节点只存索引，扇出更大"],
      ],
    },
    code: {
      title: "EXPLAIN 看全表扫描、二级索引和覆盖索引",
      language: "sql",
      code: "EXPLAIN SELECT * FROM users WHERE age = 18;\nCREATE INDEX idx_age_name ON users(age, name);\nEXPLAIN SELECT name FROM users WHERE age = 18;",
      explanation:
        "第一条如果没有合适索引，type 可能是 ALL；创建联合索引后，按 age 查询可以走索引；只查 name 时，如果查询列都在索引里，Extra 可能出现 Using index，说明覆盖索引减少了回表。",
      output: "type=ALL -> type=ref\nExtra=NULL 或 Using where -> Extra=Using index",
      outputExplanation: "重点不是背字段，而是能解释 type 和 Extra 如何反映访问路径。",
    },
    mistake: {
      mistake: "B+Tree 一定比 Hash 快，所以 MySQL 才用 B+Tree。",
      whyWrong: "Hash 在等值查询上可能很快，但通用索引要同时服务范围查询、排序、分页和磁盘页访问。",
      correct: "MySQL 选择 B+Tree，是因为它综合适配磁盘页、范围查询和 InnoDB 存储模型。",
    },
    summary:
      "这题的收束点是：B+Tree 不是万能最快，而是最适合数据库常见查询和磁盘页组织。回答时要把 IO、树高、范围查询、聚簇索引和回表连成一条线。",
    retell:
      "面试时我会先说结论：InnoDB 用 B+Tree 是为了减少磁盘 IO 并支持范围查询。然后解释数据库读的是页，B+Tree 一个页能放很多 key，树高低；叶子节点有序相连，范围扫描友好；最后补主键索引和二级索引的叶子内容不同，所以二级索引查完整行可能回表。",
    answer30s:
      "MySQL 使用 B+Tree，核心是它适合磁盘页：非叶子节点能放很多 key，树高低、IO 少；叶子节点有序相连，范围查询友好；InnoDB 还能基于它实现聚簇索引和二级索引。",
    answer2min:
      "我会从磁盘 IO 讲起。数据库数据按页读写，InnoDB 默认页是 16KB，所以索引结构要让一次 IO 尽量带回更多有效 key。红黑树虽然是 O(logN)，但分支少、层数高；Hash 等值快，但不支持范围查询和排序。B+Tree 是多路平衡树，非叶子节点只存 key 和指针，扇出大，树高通常 2 到 4 层；叶子节点有序并通过链表连接，所以 between、order by、范围扫描都比较自然。落到 InnoDB，主键索引叶子存整行，二级索引叶子存主键值，查完整行可能需要回表。",
    advancedAnswer:
      "进一步可以补页大小、扇出估算、覆盖索引和回表。比如非叶子页只存 key 和指针，一个页能承载大量分支，三层树就能覆盖很大数据量。二级索引如果查询列都在索引里，就是覆盖索引，可以避免回表；如果要查整行，就要先走二级索引拿主键，再回聚簇索引找行。",
    essentialPoints: ["磁盘页和 IO 是核心背景", "B+Tree 扇出大、树高低", "叶子节点有序相连适合范围查询", "InnoDB 聚簇索引和二级索引叶子内容不同"],
    followUps: [
      { question: "为什么红黑树也是 O(logN)，却不适合作为数据库索引？", keyAnswer: "分支少、层高高、磁盘页利用率低。", difficulty: "medium" },
      { question: "覆盖索引为什么能减少回表？", keyAnswer: "查询列都在二级索引叶子上，不需要再回聚簇索引取整行。", difficulty: "medium" },
      { question: "B+Tree 为什么适合范围查询？", keyAnswer: "叶子节点有序相连，定位起点后顺序扫描。", difficulty: "easy" },
    ],
  },
  {
    match: /事务.*ACID|ACID/,
    keywords: "ACID / redo log / undo log / 锁 / MVCC / 持久化",
    track: "先说明事务要保证什么，再把 A、C、I、D 分别落到 MySQL 的日志、锁和约束机制。",
    conclusion:
      "MySQL 事务 ACID 不是一个单点能力，而是由 undo log、redo log、锁、MVCC 和约束共同保证的工程组合。",
    takeaways: ["原子性依赖 undo log 回滚", "持久性依赖 redo log", "隔离性依赖锁和 MVCC", "一致性由前三者加约束共同支撑"],
    goals: ["ACID 四个字母分别是什么？", "undo log 和 redo log 分别负责什么？", "为什么一致性不是某一个单独组件保证的？"],
    plainSummary:
      "事务像一次转账合同：要么全做完，要么撤回；做完不能丢；别人不能看到中间态；最终账目必须符合规则。",
    scenario:
      "用户 A 给用户 B 转账，扣款成功后服务宕机。如果没有事务和日志机制，可能出现 A 扣了钱但 B 没收到，或者重启后已提交的数据丢失。",
    why: [
      "原子性要求一组操作要么全部成功，要么全部回滚，undo log 保存回滚需要的旧值。",
      "持久性要求提交后的修改崩溃后仍可恢复，redo log 记录物理页修改用于 crash recovery。",
      "隔离性要求并发事务互不随意干扰，普通读靠 MVCC，当前读和写冲突靠锁。",
      "一致性是业务约束、数据库约束、原子性、隔离性和持久性共同作用后的结果。",
    ],
    diagram:
      "事务提交链路\n├─ 执行前：undo log 记录旧值\n├─ 执行中：锁/MVCC 控制并发可见性\n├─ 提交时：redo log 保证崩溃恢复\n└─ 约束校验：主键/外键/唯一/业务规则保持一致",
    comparison: {
      title: "ACID 与 MySQL 机制对应",
      headers: ["特性", "含义", "主要机制", "面试提醒"],
      rows: [
        ["Atomicity", "要么全成要么全回滚", "undo log", "别把 undo 和 redo 混淆"],
        ["Consistency", "事务前后满足约束", "约束 + AID + 业务规则", "不是单一组件"],
        ["Isolation", "并发事务互相隔离", "锁 + MVCC", "要区分快照读和当前读"],
        ["Durability", "提交后不丢", "redo log + WAL", "重点讲崩溃恢复"],
      ],
    },
    code: {
      title: "转账事务示例",
      language: "sql",
      code: "START TRANSACTION;\nUPDATE account SET balance = balance - 100 WHERE id = 1;\nUPDATE account SET balance = balance + 100 WHERE id = 2;\nCOMMIT;",
      explanation:
        "如果第二条失败，事务可以回滚到执行前；如果 COMMIT 后宕机，redo log 负责恢复已提交修改。",
    },
    mistake: {
      mistake: "redo log 是用来回滚事务的。",
      whyWrong: "redo log 主要用于崩溃恢复，保证已提交修改可重放；回滚依赖的是 undo log。",
      correct: "回答时要明确：undo 管回滚和历史版本，redo 管提交后的持久化恢复。",
    },
    summary:
      "ACID 题要避免背概念，要把四个特性分别映射到 MySQL 的日志、锁、MVCC 和约束体系。",
    retell:
      "我会先说 ACID 是事务的四个目标，再逐个落地：A 靠 undo 回滚，D 靠 redo 恢复，I 靠锁和 MVCC，C 是约束和前三者共同保证。最后用转账场景说明为什么不能只成功一半。",
    answer30s:
      "MySQL 事务 ACID 由多套机制共同保证：原子性靠 undo log 回滚，持久性靠 redo log 崩溃恢复，隔离性靠锁和 MVCC，一致性则由数据库约束、业务规则以及 AID 共同支撑。",
    answer2min:
      "以转账为例，扣款和加款必须放在同一个事务里。执行前，undo log 会记录旧值，所以失败时可以回滚；提交后，redo log 能在宕机恢复时重放已提交修改；并发执行时，普通查询通过 MVCC 看到一致快照，写冲突和当前读由锁控制；再加上主键、唯一、外键、非空等约束，最终保证事务前后数据满足规则。",
    advancedAnswer:
      "高级回答可以补 WAL 思想和两阶段提交。InnoDB 先写日志再落盘，避免每次提交都同步刷完整数据页；如果涉及 binlog，还要通过 redo log 和 binlog 的两阶段提交保证恢复后两类日志一致。",
    essentialPoints: ["undo log 负责回滚", "redo log 负责持久化恢复", "锁和 MVCC 负责隔离", "一致性需要数据库约束和业务规则"],
    followUps: [
      { question: "undo log 和 redo log 最大区别是什么？", keyAnswer: "undo 记录逻辑旧值用于回滚和版本链，redo 记录页修改用于崩溃恢复。", difficulty: "medium" },
      { question: "一致性为什么不是单靠数据库自动保证？", keyAnswer: "数据库约束只能覆盖部分规则，复杂业务不变量还要靠正确事务边界和业务校验。", difficulty: "hard" },
    ],
  },
  {
    match: /隔离级别/,
    keywords: "读未提交 / 读已提交 / 可重复读 / 串行化 / 脏读 / 不可重复读 / 幻读",
    track: "先讲并发事务会出什么读异常，再用四种隔离级别逐层收紧约束。",
    conclusion:
      "MySQL 四种隔离级别的区别，本质是数据库在并发性能和一致性之间做的四档取舍：隔离越强，异常越少，但并发成本通常越高。",
    takeaways: [
      "读未提交可能读到别人未提交的数据，风险最大。",
      "读已提交避免脏读，但同一事务内两次读取可能不一致。",
      "可重复读保证同一事务内快照读一致，是 InnoDB 默认隔离级别。",
      "串行化最强，但会显著牺牲并发能力。",
    ],
    goals: ["脏读、不可重复读、幻读分别是什么？", "为什么 InnoDB 默认是可重复读？", "快照读和当前读有什么区别？"],
    plainSummary:
      "隔离级别可以理解成会议室的门禁规则。规则越宽松，大家进出越快，但容易互相影响；规则越严格，数据更稳定，但排队等待也更多。",
    scenario:
      "两个请求同时修改同一笔订单：一个事务还没提交，另一个事务就读到了中间状态；或者同一个事务里前后两次查余额结果不同。这些就是隔离级别要处理的问题。",
    why: [
      "事务隔离不是为了让所有操作完全排队，而是在可接受的一致性下尽量提升并发。",
      "读已提交每次语句读取已提交版本，因此避免脏读，但多次语句可能看到不同提交结果。",
      "可重复读通常基于事务级 Read View 做快照读，所以同一事务内普通 select 看到的版本稳定。",
      "串行化可以避免更多异常，但会让读写之间产生更强等待，吞吐下降明显。",
    ],
    diagram:
      "并发读异常\n├─ 脏读：读到未提交数据\n├─ 不可重复读：同一行前后读到不同值\n└─ 幻读：同一范围前后读到不同记录集合",
    comparison: {
      title: "四种隔离级别对比",
      headers: ["隔离级别", "能避免什么", "仍可能有什么问题", "工程使用感"],
      rows: [
        ["READ UNCOMMITTED", "几乎不避免", "脏读、不可重复读、幻读", "很少用于核心业务"],
        ["READ COMMITTED", "脏读", "不可重复读、幻读", "很多数据库常用默认值"],
        ["REPEATABLE READ", "脏读、不可重复读", "当前读下仍要关注幻读和锁", "InnoDB 默认"],
        ["SERIALIZABLE", "并发异常最少", "吞吐低、等待多", "只适合强一致小并发场景"],
      ],
    },
    code: {
      title: "查看和设置事务隔离级别",
      language: "sql",
      code: "SELECT @@transaction_isolation;\nSET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;\nSTART TRANSACTION;\nSELECT balance FROM account WHERE id = 1;\nCOMMIT;",
      explanation: "面试里不用背所有命令，但要知道隔离级别可以按会话或事务设置，并且会影响事务内 select 看到的数据版本。",
    },
    mistake: {
      mistake: "可重复读就一定完全没有幻读。",
      whyWrong: "InnoDB 的快照读在可重复读下通常看不到幻读，但当前读、范围更新和锁语义要单独分析。",
      correct: "回答时要区分快照读和当前读，再谈 next-key lock 如何处理范围写冲突。",
    },
    summary:
      "事务隔离题不要只背表格，要从并发读异常出发，再解释不同隔离级别如何用更强约束换取更稳定的读视图。",
    retell:
      "我会先定义三类问题：脏读、不可重复读、幻读。然后说四种隔离级别是逐步收紧这些问题的规则，最后补 InnoDB 默认可重复读依赖 Read View 做快照读，但当前读和范围锁要另看。",
    answer30s:
      "四种隔离级别是读未提交、读已提交、可重复读、串行化，隔离越强一致性越好，并发成本越高。InnoDB 默认可重复读，核心是让同一事务内快照读保持一致。",
    answer2min:
      "我会先讲并发事务的三个异常：脏读是读到未提交数据，不可重复读是同一行前后结果不同，幻读是同一范围前后记录集合不同。读未提交基本不防；读已提交防脏读；可重复读防脏读和普通快照读下的不可重复读；串行化最严格但并发差。InnoDB 默认可重复读，是因为它通过 MVCC 和 Read View 在一致性和性能之间取得了比较好的平衡。",
    advancedAnswer:
      "高级回答要补快照读和当前读。普通 select 通常走快照读，基于 Read View 看到稳定版本；select for update、update、delete 属于当前读，会读最新已提交版本并加锁，所以隔离级别和锁机制要一起讲。",
    essentialPoints: ["能定义三类读异常", "能按四种隔离级别对比", "能说明 InnoDB 默认可重复读", "能区分快照读和当前读"],
    followUps: [
      { question: "读已提交和可重复读的 Read View 生成时机有什么区别？", keyAnswer: "RC 通常每条语句生成，RR 通常事务第一次快照读生成。", difficulty: "hard" },
      { question: "当前读为什么不能只用 MVCC 解释？", keyAnswer: "当前读要读最新版本并参与写冲突控制，需要锁机制。", difficulty: "medium" },
    ],
  },
  {
    match: /MVCC/,
    keywords: "MVCC / undo log / Read View / 版本链 / 快照读 / 当前读",
    track: "先讲读写冲突，再讲版本链和 Read View 如何让读不阻塞写。",
    conclusion:
      "MVCC 的核心价值，是让普通读不用等待正在写的数据，通过版本链和 Read View 找到当前事务应该看到的历史版本。",
    takeaways: ["undo log 保存历史版本", "Read View 决定哪些事务版本可见", "快照读通常不加锁", "当前读仍然要配合锁机制"],
    goals: ["版本链里保存了什么？", "Read View 如何判断版本可见？", "为什么 MVCC 不能替代锁？"],
    plainSummary:
      "MVCC 像给数据拍了多张历史照片。写事务可以继续改最新照片，读事务按照自己的 Read View 找到应该看的那一张，因此普通查询不用跟写操作硬排队。",
    scenario:
      "订单系统里，一个事务正在修改订单状态，另一个事务同时查询订单列表。如果每次读都等写锁释放，列表查询会被拖慢；MVCC 就是为了让普通读尽量不被写阻塞。",
    why: [
      "每次更新都会形成新版本，旧版本通过 undo log 串起来。",
      "事务执行快照读时会生成 Read View，里面记录活跃事务范围。",
      "读取时沿版本链回溯，找到对当前 Read View 可见的版本。",
      "写写冲突、当前读、范围修改仍然需要锁，因此 MVCC 不是锁的替代品。",
    ],
    diagram:
      "记录 row\n├─ trx_id=90  value=A\n├─ undo -> trx_id=80 value=旧A\n└─ undo -> trx_id=70 value=更旧A\nRead View 决定当前事务能看到哪一版",
    comparison: {
      title: "MVCC 和锁的职责边界",
      headers: ["机制", "主要解决", "典型场景", "不能解决"],
      rows: [
        ["MVCC", "读写并发", "普通 select 快照读", "写写冲突"],
        ["行锁", "写冲突控制", "update/delete/select for update", "历史版本可见性"],
        ["next-key lock", "范围写冲突", "防止范围内插入影响当前读", "普通快照读展示"],
      ],
    },
    code: {
      title: "快照读和当前读的差异",
      language: "sql",
      code: "START TRANSACTION;\nSELECT * FROM orders WHERE id = 1;\nSELECT * FROM orders WHERE id = 1 FOR UPDATE;\nCOMMIT;",
      explanation:
        "普通 SELECT 通常是快照读，按照 Read View 找可见版本；FOR UPDATE 是当前读，会读取最新已提交版本并尝试加锁。",
    },
    mistake: {
      mistake: "MVCC 能解决所有事务并发问题，所以有 MVCC 就不需要锁。",
      whyWrong: "MVCC 主要优化普通读写并发，写写冲突和当前读仍需要锁来保证正确性。",
      correct: "MVCC 和锁是配合关系：快照读看版本，当前读和写操作看锁。",
    },
    summary:
      "MVCC 要讲成“版本链 + Read View + 可见性判断”，最后一定补一句它和锁的边界。",
    retell:
      "我会说 MVCC 通过 undo log 维护历史版本，通过 Read View 判断版本可见，让普通 select 可以读到一致快照而不阻塞写；但 update、delete、select for update 这种当前读还要靠锁处理冲突。",
    answer30s:
      "MVCC 通过版本链和 Read View 实现快照读，让普通读不用阻塞写。undo log 保存历史版本，Read View 判断当前事务能看哪一版，但当前读和写冲突仍然要靠锁。",
    answer2min:
      "每行记录会有事务 id，更新时旧版本进入 undo log 形成版本链。事务做快照读时生成 Read View，里面有活跃事务信息。读取时从最新版本开始判断，如果当前版本对这个 Read View 不可见，就沿 undo 版本链往回找，直到找到可见版本。这样普通查询可以看到一致快照，而不用等正在写的事务释放锁。",
    advancedAnswer:
      "可以补 RC 和 RR 下 Read View 生成时机不同：读已提交通常每条语句生成新的 Read View，可重复读通常事务内复用第一次快照读的 Read View。这解释了为什么同一事务内多次读取结果是否稳定。",
    essentialPoints: ["版本链", "undo log", "Read View", "快照读和当前读区别"],
    followUps: [
      { question: "RC 和 RR 的 Read View 有什么区别？", keyAnswer: "RC 每条语句生成，RR 事务级复用。", difficulty: "hard" },
      { question: "为什么长事务会影响 undo 清理？", keyAnswer: "老 Read View 还可能需要历史版本，purge 不能过早清理。", difficulty: "hard" },
    ],
  },
  {
    match: /缓存穿透|缓存击穿|缓存雪崩/,
    keywords: "缓存穿透 / 缓存击穿 / 缓存雪崩 / 布隆过滤器 / 互斥锁 / 过期时间抖动",
    track: "先区分三类缓存问题的流量形态，再按防空值、防热点、防大面积失效设计治理方案。",
    conclusion:
      "缓存穿透、击穿、雪崩的区别在于流量打到数据库的原因不同：穿透是查不存在，击穿是热点 key 失效，雪崩是大量 key 同时失效或缓存整体不可用。",
    takeaways: ["穿透防不存在数据", "击穿保护热点 key", "雪崩防大面积同时失效", "所有方案都要考虑降级和限流兜底"],
    goals: ["布隆过滤器解决什么问题？", "互斥锁如何防击穿？", "为什么过期时间要加随机抖动？"],
    plainSummary:
      "这三题不要混着背。穿透像查一个根本不存在的人，缓存和数据库都没有；击穿像明星档案刚好过期，所有人一起去查数据库；雪崩像整排缓存同时失效，大量请求一起压到数据库。",
    scenario:
      "商品详情页上线活动时，恶意请求不断查不存在的商品 id；某个爆款商品缓存刚好过期；凌晨批量缓存同一时间失效。这三种情况都会让数据库承压，但治理手段不同。",
    why: [
      "缓存穿透要在请求到数据库前识别不存在的数据，可以缓存空值或使用布隆过滤器。",
      "缓存击穿要保护热点 key 重建过程，常用互斥锁、逻辑过期或后台刷新。",
      "缓存雪崩要避免同一时间大面积失效，可以过期时间加随机抖动、多级缓存和限流降级。",
      "线上方案必须考虑失败兜底，因为 Redis 自身故障时只靠缓存策略不够。",
    ],
    diagram:
      "请求 -> 缓存\n├─ 不存在 key：布隆过滤器 / 空值缓存\n├─ 热点 key 过期：互斥锁 / 逻辑过期\n└─ 大量 key 同时过期：随机 TTL / 多级缓存 / 降级",
    comparison: {
      title: "三类缓存问题对比",
      headers: ["问题", "本质", "典型方案", "风险"],
      rows: [
        ["穿透", "查不存在的数据", "布隆过滤器、空值缓存、参数校验", "空值缓存要控制 TTL"],
        ["击穿", "热点 key 失效", "互斥锁、逻辑过期、预热", "锁粒度和超时要设计好"],
        ["雪崩", "大量 key 同时失效", "TTL 随机、分批预热、多级缓存", "Redis 故障还要限流降级"],
      ],
    },
    code: {
      title: "互斥锁防缓存击穿的伪代码",
      language: "ts",
      code: "const cached = await redis.get(key);\nif (cached) return cached;\nconst locked = await redis.set(`lock:${key}`, '1', { NX: true, EX: 5 });\nif (locked) {\n  const value = await db.query(id);\n  await redis.set(key, JSON.stringify(value), { EX: ttlWithJitter() });\n  return value;\n}\nawait sleep(50);\nreturn retryGet(key);",
      explanation:
        "只有拿到锁的请求回源数据库并重建缓存，其他请求短暂等待或降级，避免热点 key 过期瞬间把数据库打穿。",
    },
    mistake: {
      mistake: "缓存穿透、击穿、雪崩都用加缓存就能解决。",
      whyWrong: "三者成因不同，只说加缓存没有说明不存在数据、热点失效和大面积失效的治理差异。",
      correct: "先区分流量形态，再分别讲布隆过滤器、互斥锁、TTL 抖动和降级限流。",
    },
    summary:
      "缓存问题的高分答案一定要先分类，再给方案，并主动补上限流、降级、监控和重建失败兜底。",
    retell:
      "我会先说穿透是查不存在、击穿是热点 key 过期、雪崩是大量 key 同时过期。然后分别给布隆过滤器或空值缓存、互斥锁或逻辑过期、TTL 随机和多级缓存。最后补线上一定要有限流降级和监控。",
    answer30s:
      "穿透是查不存在的数据，常用布隆过滤器或空值缓存；击穿是热点 key 过期，常用互斥锁、逻辑过期；雪崩是大量 key 同时失效，常用随机 TTL、预热、多级缓存和降级限流。",
    answer2min:
      "我会先按成因区分。缓存穿透通常是请求的 key 根本不存在，缓存没有、数据库也没有，所以要参数校验、布隆过滤器或缓存空值。缓存击穿是某个热点 key 过期，大量请求同时回源，常用互斥锁、逻辑过期或后台刷新保护重建过程。缓存雪崩是大量 key 同时失效或 Redis 不可用，方案是过期时间加随机抖动、分批预热、多级缓存、限流和降级。",
    advancedAnswer:
      "高级回答可以补监控指标：缓存命中率、回源 QPS、热点 key、Redis 延迟、数据库连接池使用率。方案不要只讲正常路径，还要讲锁超时、重建失败、Redis 故障时的降级策略。",
    essentialPoints: ["能区分三者成因", "穿透方案", "击穿方案", "雪崩方案", "限流降级兜底"],
    followUps: [
      { question: "布隆过滤器为什么会有误判？", keyAnswer: "位图和多个哈希函数可能碰撞，只能说可能存在，不能证明一定存在。", difficulty: "medium" },
      { question: "互斥锁防击穿时锁超时怎么设？", keyAnswer: "要略大于回源和重建缓存耗时，并考虑异常释放和重试。", difficulty: "hard" },
    ],
  },
  {
    match: /RDB.*AOF|AOF.*RDB/,
    keywords: "RDB / AOF / 快照 / 追加日志 / 恢复速度 / 数据安全",
    track: "先讲两种持久化记录的东西不同，再比较恢复速度、数据丢失窗口和运行开销。",
    conclusion:
      "RDB 是某个时间点的数据快照，AOF 是写命令追加日志；前者恢复快、文件紧凑，后者数据更安全但文件和重写成本更高。",
    takeaways: ["RDB 适合备份和快速恢复", "AOF 适合降低数据丢失窗口", "生产常常二者结合", "重写和 fsync 策略影响性能"],
    goals: ["RDB 和 AOF 分别记录什么？", "AOF everysec 为什么常用？", "为什么 AOF 需要 rewrite？"],
    plainSummary:
      "RDB 像定期拍全量照片，恢复时直接看照片；AOF 像记操作流水，恢复时把命令重放一遍。照片恢复快，但两次拍照之间可能丢；流水更细，但文件会越来越长。",
    scenario:
      "Redis 承载登录态、排行榜或热点缓存时，宕机后你既关心恢复速度，也关心最多能丢多少秒数据。RDB 和 AOF 就是在这两个维度上做取舍。",
    why: [
      "RDB 保存的是内存数据快照，适合冷备和全量恢复。",
      "AOF 追加写命令，配合 everysec 通常最多丢一秒左右数据，但要承担 fsync 和日志增长成本。",
      "AOF rewrite 会把历史命令压缩成恢复当前数据所需的最小命令集。",
      "生产经常同时开启两者，兼顾恢复速度和数据安全。",
    ],
    diagram:
      "Redis 持久化\n├─ RDB：定期生成 dump 快照\n└─ AOF：追加写命令 -> rewrite 压缩 -> 重放恢复",
    comparison: {
      title: "RDB 与 AOF 对比",
      headers: ["维度", "RDB", "AOF", "工程结论"],
      rows: [
        ["记录内容", "某一刻完整数据", "写命令日志", "一个偏快照，一个偏流水"],
        ["恢复速度", "通常较快", "需要重放命令，可能更慢", "大数据量更关注恢复耗时"],
        ["数据安全", "两次快照间可能丢更多", "everysec 常见丢失窗口更小", "核心数据更偏向开启 AOF"],
        ["运行成本", "fork 和写快照有开销", "fsync 与 rewrite 有开销", "都要结合内存和磁盘监控"],
      ],
    },
    code: {
      title: "常见持久化配置片段",
      language: "conf",
      code: "save 900 1\nappendonly yes\nappendfsync everysec\nno-appendfsync-on-rewrite no",
      explanation:
        "save 控制 RDB 快照触发条件；appendonly 开启 AOF；appendfsync everysec 是性能和数据安全比较常见的折中。",
    },
    mistake: {
      mistake: "开启 AOF 就不会丢数据。",
      whyWrong: "appendfsync everysec 仍可能丢最近一秒左右数据，always 才更强但性能成本高。",
      correct: "要结合 fsync 策略说明数据丢失窗口，而不是只说开了 AOF 就安全。",
    },
    summary:
      "RDB/AOF 题要围绕恢复速度、数据丢失窗口、运行开销和生产组合策略回答。",
    retell:
      "我会说 RDB 是快照，恢复快但可能丢快照间数据；AOF 是命令日志，数据更安全但恢复和重写有成本。生产通常二者结合，再根据业务能接受的丢失窗口选择 fsync 策略。",
    answer30s:
      "RDB 是快照，文件紧凑、恢复快，但可能丢快照间数据；AOF 是追加写命令，数据安全性更好，但文件会增长，需要 rewrite，恢复可能更慢。生产常常两者结合。",
    answer2min:
      "RDB 保存某个时间点的内存快照，适合备份、迁移和快速恢复，但如果 Redis 在两次快照之间宕机，可能丢失这段时间的数据。AOF 会把写命令追加到日志里，配合 everysec 可以把丢失窗口压到较小范围，但 fsync、文件增长和 rewrite 都有成本。真正生产配置要看业务能接受的数据丢失窗口和恢复时间目标。",
    advancedAnswer:
      "高级回答可以补 fork、写时复制和 rewrite 风险。生成 RDB 或 AOF rewrite 时子进程会参与磁盘写入，如果实例内存大、磁盘慢，可能影响延迟，所以要监控 fork 耗时、aof_rewrite、磁盘 IO 和持久化失败告警。",
    essentialPoints: ["RDB 是快照", "AOF 是写命令日志", "恢复速度和数据安全取舍", "AOF rewrite 和 fsync 策略"],
    followUps: [
      { question: "AOF rewrite 为什么不会把历史命令原样保留？", keyAnswer: "只需要生成能恢复当前状态的最小命令集。", difficulty: "medium" },
      { question: "RDB fork 时为什么可能影响线上延迟？", keyAnswer: "大内存实例 fork 和写时复制会带来 CPU、内存和磁盘压力。", difficulty: "hard" },
    ],
  },
  {
    match: /滑动窗口/,
    keywords: "ZSet / 滑动窗口 / 限流 / 时间戳 / Lua / 原子性",
    track: "先讲固定窗口的问题，再讲滑动窗口如何用时间范围保留最近一段请求。",
    conclusion:
      "Redis 实现滑动窗口限流，常见做法是用 ZSet 按时间戳记录请求，先删除窗口外数据，再统计窗口内数量，超过阈值就拒绝。",
    takeaways: ["ZSet score 存时间戳", "每次请求清理窗口外记录", "ZCARD 统计当前窗口请求数", "Lua 脚本保证检查和写入原子性"],
    goals: ["滑动窗口比固定窗口好在哪里？", "ZSet 为什么适合做滑动窗口？", "为什么要用 Lua？"],
    plainSummary:
      "固定窗口像每分钟清零一次，边界处可能瞬间放过两倍流量；滑动窗口像一直盯着最近 60 秒，只要最近 60 秒请求超了，就不再放行。",
    scenario:
      "登录、短信验证码、下单接口都需要限制用户在一段时间内的请求次数。如果只用固定分钟窗口，用户可能在 12:00:59 和 12:01:00 连续打满两轮请求。",
    why: [
      "滑动窗口关注的是当前时间向前回看的一段真实时间范围，比固定窗口边界更平滑。",
      "ZSet 的 score 可以存毫秒时间戳，天然支持按时间范围删除和统计。",
      "一次限流判断包含删除旧记录、计数、写入新记录、设置过期时间，拆开执行会有并发竞态。",
      "Lua 脚本能让这些操作在 Redis 单线程执行上下文中原子完成。",
    ],
    diagram:
      "请求到达 now\n├─ ZREMRANGEBYSCORE key 0 now-window\n├─ ZCARD key 判断窗口内数量\n├─ 未超限：ZADD key now requestId\n└─ 超限：拒绝或降级",
    comparison: {
      title: "固定窗口与滑动窗口",
      headers: ["方案", "优点", "问题", "适用"],
      rows: [
        ["固定窗口", "实现简单，计数成本低", "边界突刺明显", "低风险后台接口"],
        ["滑动窗口", "限制更平滑，真实反映最近窗口", "ZSet 成本更高", "登录、短信、支付等敏感接口"],
        ["令牌桶", "允许一定突发，吞吐平滑", "参数设计更复杂", "网关流量整形"],
      ],
    },
    code: {
      title: "ZSet + Lua 滑动窗口示例",
      language: "lua",
      code: "local key = KEYS[1]\nlocal now = tonumber(ARGV[1])\nlocal window = tonumber(ARGV[2])\nlocal limit = tonumber(ARGV[3])\nredis.call('ZREMRANGEBYSCORE', key, 0, now - window)\nlocal count = redis.call('ZCARD', key)\nif count >= limit then return 0 end\nredis.call('ZADD', key, now, ARGV[4])\nredis.call('PEXPIRE', key, window)\nreturn 1",
      explanation:
        "脚本先清理窗口外请求，再判断窗口内数量，未超限才写入当前请求。用 Lua 是为了避免并发请求同时通过判断。",
      output: "1 表示放行，0 表示限流",
      outputExplanation: "线上还要记录限流原因、用户维度和接口维度，方便排查误伤。",
    },
    mistake: {
      mistake: "用 INCR 计数就等于滑动窗口限流。",
      whyWrong: "INCR + EXPIRE 通常是固定窗口，窗口边界可能出现流量突刺。",
      correct: "滑动窗口要按真实时间范围统计最近一段请求，通常需要时间戳集合或更精细的分桶。",
    },
    summary:
      "滑动窗口题要讲清窗口边界、ZSet 时间戳、Lua 原子性和线上成本，不能只说 Redis 计数。",
    retell:
      "我会先说固定窗口有边界突刺，再讲用 ZSet 存最近窗口内每次请求的时间戳。每次请求先删掉窗口外记录，再统计数量，没超过阈值就写入。因为这些操作要原子完成，所以通常用 Lua 脚本。",
    answer30s:
      "Redis 滑动窗口限流通常用 ZSet：score 存请求时间戳，每次请求清理窗口外数据，统计窗口内数量，未超过阈值才写入。为了避免并发竞态，检查和写入最好放到 Lua 脚本里。",
    answer2min:
      "固定窗口最大问题是边界突刺。比如每分钟限 100 次，用户在上一分钟最后一秒和下一分钟第一秒各打 100 次，瞬间就可能有 200 次。滑动窗口按当前时间回看最近 N 秒，更平滑。Redis 里可以用 ZSet，score 是时间戳，member 是请求 id。每次请求先 ZREMRANGEBYSCORE 清理过期记录，再 ZCARD 统计数量，没超限再 ZADD 写入，并设置过期时间。为了保证原子性，这几步通常用 Lua。",
    advancedAnswer:
      "高级回答要补成本和替代方案。ZSet 每次请求都有写入和清理，热点用户或热点接口下要关注内存、key 过期和脚本耗时。网关全局限流也可以考虑令牌桶或漏桶；滑动窗口更适合用户级、接口级精细限流。",
    essentialPoints: ["固定窗口边界问题", "ZSet 时间戳建模", "清理、统计、写入流程", "Lua 原子性"],
    followUps: [
      { question: "滑动窗口和令牌桶怎么选？", keyAnswer: "滑动窗口更严格看最近窗口，令牌桶更适合允许突发和流量整形。", difficulty: "medium" },
      { question: "ZSet 滑动窗口有什么性能风险？", keyAnswer: "高频写入、清理、内存增长和 Lua 脚本耗时。", difficulty: "hard" },
    ],
  },
  {
    match: /Java 内存模型|JMM|内存模型/,
    keywords: "JMM / 可见性 / 原子性 / 有序性 / happens-before / 内存屏障",
    track: "先讲多线程为什么会看见旧值和乱序，再用 JMM 的三类问题和 happens-before 规则收束。",
    conclusion:
      "Java 内存模型 JMM 解决的是多线程下可见性、原子性和有序性的规则问题，它规定线程之间什么时候必须看见彼此的写入。",
    takeaways: ["JMM 是规范不是具体内存区域", "核心问题是可见性、原子性、有序性", "happens-before 描述可见性保证", "volatile、锁、线程启动和 join 都会建立规则"],
    goals: ["JMM 和 JVM 运行时内存区域有什么区别？", "happens-before 解决什么问题？", "volatile 和 synchronized 在 JMM 里分别提供什么保证？"],
    plainSummary:
      "JMM 可以理解成多线程读写共享变量的交通规则。没有规则时，一个线程改了值，另一个线程可能看不到；代码顺序看着没变，底层执行也可能被重排。",
    scenario:
      "一个线程把 initialized 设为 true，另一个线程看到 true 后读取配置对象。如果没有正确的可见性和有序性保证，第二个线程可能看到半初始化的数据。",
    why: [
      "线程可能把共享变量缓存到本地，导致其他线程的写入不能立刻可见。",
      "编译器和 CPU 可能在不改变单线程语义的前提下重排指令，但多线程下会暴露风险。",
      "happens-before 规则定义了哪些操作的结果必须对后续操作可见。",
      "volatile 写读、锁释放获取、线程 start/join 等都会建立明确的可见性边界。",
    ],
    diagram:
      "共享变量写入\n├─ 没有同步：可能不可见/可能重排\n└─ 建立 happens-before\n   ├─ volatile 写 -> volatile 读\n   ├─ unlock -> lock\n   └─ thread.start/join",
    comparison: {
      title: "JMM 常见保证",
      headers: ["机制", "可见性", "有序性", "原子性", "适合场景"],
      rows: [
        ["volatile", "支持", "限制相关重排", "单次读写", "状态标记、DCL"],
        ["synchronized/Lock", "支持", "临界区边界", "临界区互斥", "复合状态更新"],
        ["Atomic 类", "支持", "依赖 volatile/CAS 语义", "单变量原子更新", "计数器、引用替换"],
      ],
    },
    code: {
      title: "用 volatile 建立发布可见性",
      language: "java",
      code: "class ConfigHolder {\n  private Config config;\n  private volatile boolean ready;\n\n  void init() {\n    config = loadConfig();\n    ready = true;\n  }\n\n  Config get() {\n    return ready ? config : null;\n  }\n}",
      explanation:
        "ready 的 volatile 写和读建立可见性关系，让读线程看到 ready=true 时，也能看到之前写入的 config 引用。",
    },
    mistake: {
      mistake: "JMM 就是 JVM 的堆、栈、方法区这些运行时内存区域。",
      whyWrong: "运行时内存区域描述 JVM 如何组织内存；JMM 描述多线程读写共享变量的可见性和重排规则。",
      correct: "两者要分开：JVM 内存区域偏存储结构，JMM 偏并发语义规范。",
    },
    summary:
      "JMM 题的关键是把它讲成并发语义规范，而不是 JVM 内存区域；再用 happens-before 解释可见性边界。",
    retell:
      "我会先说 JMM 解决多线程共享变量的可见性、原子性、有序性问题，然后解释 happens-before 是判断写入是否必须对后续读取可见的规则，最后对比 volatile、锁和 Atomic 类分别适合什么场景。",
    answer30s:
      "JMM 是 Java 对多线程读写共享变量的规范，核心解决可见性、原子性和有序性。它通过 happens-before 等规则说明哪些写入必须对后续读取可见，volatile、锁、start/join 都会建立这种关系。",
    answer2min:
      "JMM 不是堆栈方法区，而是并发语义规则。多线程下，线程可能缓存变量，CPU 和编译器也可能重排指令，所以一个线程写入的数据，另一个线程不一定按代码顺序看到。JMM 用 happens-before 规则定义可见性边界，比如 volatile 写 happens-before 后续 volatile 读，unlock happens-before 后续 lock，线程 start 之前的操作对子线程可见，join 之后能看到子线程结果。",
    advancedAnswer:
      "高级回答可以补 volatile 与锁的边界。volatile 适合发布状态和禁止特定重排，但不保证复合操作原子性；锁既保证可见性，也通过互斥保护临界区复合状态。Atomic 类则常用 CAS 完成单变量原子更新。",
    essentialPoints: ["JMM 是并发语义规范", "可见性、原子性、有序性", "happens-before", "volatile 与锁的边界"],
    followUps: [
      { question: "JMM 和 JVM 运行时内存区域有什么区别？", keyAnswer: "前者是并发读写规范，后者是内存组织结构。", difficulty: "medium" },
      { question: "volatile 为什么不能替代锁？", keyAnswer: "volatile 不保证复合操作互斥和原子性。", difficulty: "medium" },
    ],
  },
  {
    match: /volatile/,
    keywords: "volatile / 可见性 / 有序性 / 内存屏障 / 原子性 / JMM",
    track: "先讲线程工作内存和主内存，再讲 volatile 能保证什么、不能保证什么。",
    conclusion:
      "volatile 能保证变量修改对其他线程可见，并限制相关指令重排，但不能保证 i++ 这类复合操作的原子性。",
    takeaways: ["保证可见性", "保证一定有序性", "不保证复合操作原子性", "常用于状态标记和双重检查锁定"],
    goals: ["为什么 volatile 能保证可见性？", "为什么 volatile 不能保证 i++ 原子性？", "内存屏障解决什么问题？"],
    plainSummary:
      "volatile 像给变量加了一个广播规则：写完要尽快让别人看到，读的时候也别只看自己的旧缓存。但它不会把多步操作变成一步，所以 i++ 仍然可能丢更新。",
    scenario:
      "一个后台线程通过 running 标志控制另一个线程是否退出。如果 running 不是 volatile，工作线程可能一直读到旧值，导致停止信号不生效。",
    why: [
      "普通变量可能被线程缓存，另一个线程的修改不一定马上可见。",
      "volatile 写会把修改刷新出去，volatile 读会重新读取较新的值。",
      "volatile 前后会插入内存屏障，约束编译器和 CPU 的重排。",
      "i++ 包含读、加、写三步，volatile 只能保证每次读写可见，不能保证三步整体不可被打断。",
    ],
    diagram:
      "线程 A 写 volatile flag=true\n└─ 刷新到主内存\n线程 B 读 volatile flag\n└─ 从主内存读取最新值",
    comparison: {
      title: "volatile 与锁",
      headers: ["能力", "volatile", "synchronized/Lock", "结论"],
      rows: [
        ["可见性", "支持", "支持", "两者都能让修改被看见"],
        ["有序性", "限制相关重排", "临界区天然有边界", "volatile 更轻量"],
        ["原子性", "不支持复合操作", "支持临界区互斥", "计数更新不要只靠 volatile"],
      ],
    },
    code: {
      title: "volatile 停止标记示例",
      language: "java",
      code: "class Worker {\n  private volatile boolean running = true;\n  void stop() { running = false; }\n  void run() {\n    while (running) {\n      doWork();\n    }\n  }\n}",
      explanation:
        "running 作为状态标记很适合 volatile；但如果是 count++，需要 AtomicInteger 或锁。",
    },
    mistake: {
      mistake: "volatile 修饰 int 后，count++ 就线程安全了。",
      whyWrong: "count++ 是读、加、写三步，多个线程仍可能读到同一个旧值后覆盖写回。",
      correct: "计数累加用 AtomicInteger、LongAdder 或锁，volatile 更适合状态标记。",
    },
    summary:
      "volatile 题必须同时说能保证什么和不能保证什么，尤其不能把可见性和原子性混为一谈。",
    retell:
      "我会先说 volatile 保证可见性和一定有序性，然后解释它通过内存屏障影响读写和重排；最后强调它不保证复合操作原子性，适合状态标记，不适合并发计数。",
    answer30s:
      "volatile 保证可见性和一定的有序性，读写 volatile 变量会受到内存屏障约束。但它不保证复合操作的原子性，所以 count++ 这类操作仍然不安全。",
    answer2min:
      "从 JMM 角度看，线程可能把变量缓存到工作内存里，导致一个线程改了值，另一个线程不一定马上看到。volatile 写会把值刷新出去，volatile 读会重新读取较新的值，同时内存屏障会限制相关指令重排。所以它适合 running 这种状态标记。它不适合 count++，因为 i++ 包含读、加、写三步，多个线程还是会交叉执行。",
    advancedAnswer:
      "高级回答可以补 DCL 单例为什么要 volatile。对象创建可能发生分配内存、初始化对象、引用赋值的重排，如果没有 volatile，其他线程可能看到一个还没初始化完成的对象引用。",
    essentialPoints: ["可见性", "有序性", "不保证原子性", "内存屏障"],
    followUps: [
      { question: "DCL 单例为什么需要 volatile？", keyAnswer: "防止引用赋值和对象初始化重排。", difficulty: "hard" },
      { question: "volatile 和 AtomicInteger 的区别？", keyAnswer: "AtomicInteger 通过 CAS 保证更新原子性，volatile 不保证复合操作。", difficulty: "medium" },
    ],
  },
  {
    match: /CAS.*AQS|AQS/,
    keywords: "CAS / AQS / state / CLH 队列 / acquire / release",
    track: "先分清 CAS 是底层原子操作，AQS 是同步器框架，再讲 AQS 如何管理排队和唤醒。",
    conclusion:
      "CAS 和 AQS 不是同一层级：CAS 是原子比较交换手段，AQS 是基于 state 和等待队列构建锁、信号量等同步器的框架。",
    takeaways: ["CAS 适合局部原子更新", "AQS 用 state 表示同步状态", "AQS 用队列管理等待线程", "很多 AQS 组件内部也会用 CAS"],
    goals: ["CAS 解决什么问题？", "AQS 的 state 和队列分别做什么？", "为什么 ReentrantLock、Semaphore 都能基于 AQS？"],
    plainSummary:
      "CAS 像一次抢票动作：看座位还是不是旧状态，是就改成新状态；AQS 像排队大厅：谁没抢到，怎么排队、怎么阻塞、什么时候叫号唤醒。",
    scenario:
      "多个线程同时抢锁，如果每个线程都一直自旋，CPU 会被打满；如果抢不到就进入有序等待队列，再由释放锁的线程唤醒下一个，系统会更可控。",
    why: [
      "CAS 通过硬件原子指令完成比较和替换，低竞争下避免线程阻塞。",
      "AQS 抽象了同步状态 state，子类定义 state 如何表示锁、许可或计数。",
      "获取失败的线程会进入等待队列，避免无限自旋消耗 CPU。",
      "释放同步资源时，AQS 按规则唤醒队列中的后继节点。",
    ],
    diagram:
      "AQS\n├─ state：同步状态\n├─ CLH 队列：等待线程\n├─ acquire：尝试获取，失败入队\n└─ release：释放资源，唤醒后继",
    comparison: {
      title: "CAS 与 AQS 的层次差异",
      headers: ["维度", "CAS", "AQS", "面试表达"],
      rows: [
        ["定位", "原子操作", "同步器框架", "底层手段 vs 上层框架"],
        ["解决问题", "单次状态更新", "排队、阻塞、唤醒", "AQS 解决更完整同步语义"],
        ["风险", "ABA、自旋空转", "实现复杂、可能阻塞", "不要把两者说成替代关系"],
      ],
    },
    code: {
      title: "AQS 思路极简伪代码",
      language: "java",
      code: "if (compareAndSetState(0, 1)) {\n  owner = currentThread;\n  return;\n}\naddWaiter(currentThread);\nparkUntilPredecessorReleases();",
      explanation:
        "真实 AQS 复杂得多，但主线就是先 CAS 尝试改 state，失败后入队等待，释放时唤醒后继。",
    },
    mistake: {
      mistake: "CAS 和 AQS 都是锁，所以二选一。",
      whyWrong: "CAS 是原子更新方式，AQS 是同步器框架，AQS 内部也会用 CAS 修改 state。",
      correct: "先讲层次，再讲二者协作关系。",
    },
    summary:
      "AQS 题的关键是 state、队列、acquire/release；CAS 题的关键是原子更新和自旋风险。",
    retell:
      "我会先说 CAS 是底层原子比较交换，AQS 是同步器框架。AQS 用 state 表示资源状态，获取失败的线程进入队列，释放时唤醒后继。ReentrantLock、Semaphore、CountDownLatch 只是 state 语义不同。",
    answer30s:
      "CAS 是底层原子比较交换，适合做无锁状态更新；AQS 是 Java 并发包的同步器框架，用 state 和等待队列管理线程获取与释放同步资源。二者不是替代关系。",
    answer2min:
      "CAS 通过比较旧值和替换新值实现原子更新，低竞争下性能好，但有 ABA、自旋空转和单变量限制。AQS 则把同步器公共逻辑抽象出来：用 state 表示同步状态，用队列管理获取失败的线程。ReentrantLock 表示锁是否被占用，Semaphore 表示许可数量，CountDownLatch 表示计数，底层都可以复用 AQS 的排队和唤醒能力。",
    advancedAnswer:
      "高级回答可以补公平锁和非公平锁。非公平锁允许新线程先尝试抢 state，吞吐可能更高但可能插队；公平锁会更尊重队列顺序，等待更可预期但吞吐可能下降。",
    essentialPoints: ["CAS 定位", "AQS state", "等待队列", "acquire/release"],
    followUps: [
      { question: "AQS 为什么能同时支持锁和 Semaphore？", keyAnswer: "state 语义由子类定义，队列和唤醒逻辑复用。", difficulty: "hard" },
      { question: "CAS 高竞争时为什么可能变差？", keyAnswer: "大量线程自旋失败，CPU 空转严重。", difficulty: "medium" },
    ],
  },
  {
    match: /线程池的核心参数/,
    keywords: "corePoolSize / maximumPoolSize / workQueue / keepAliveTime / 拒绝策略",
    track: "先讲线程池解决什么问题，再讲任务提交后核心线程、队列、最大线程和拒绝策略如何联动。",
    conclusion:
      "线程池核心参数不是孤立背诵的，真正要讲清任务提交流程：先用核心线程，核心满了进队列，队列满了扩到最大线程，再不行触发拒绝策略。",
    takeaways: ["核心线程决定常驻处理能力", "队列决定削峰方式", "最大线程决定突发上限", "拒绝策略是过载保护"],
    goals: ["任务提交流程是什么？", "不同队列如何影响扩容？", "CPU 密集和 IO 密集线程数怎么估？"],
    plainSummary:
      "线程池像餐厅后厨。核心线程是固定厨师，队列是等餐单，最大线程是临时加人，拒绝策略是客流爆了以后如何止损。",
    scenario:
      "订单系统把发券、通知、积分异步化后，如果线程池参数随便设，流量峰值一来可能队列堆满、任务延迟飙升，甚至把数据库连接池一起打爆。",
    why: [
      "线程池复用线程，避免频繁创建销毁，同时控制并发上限。",
      "队列太大可能隐藏延迟，任务堆积很久才暴露；队列太小又会频繁扩线程或拒绝。",
      "最大线程不是越大越好，线程过多会带来上下文切换和下游资源争抢。",
      "拒绝策略不是异常处理小细节，而是系统过载时的保护边界。",
    ],
    diagram:
      "submit task\n├─ 核心线程未满：创建核心线程\n├─ 核心已满：进入队列\n├─ 队列已满：扩到 maximumPoolSize\n└─ 最大也满：执行拒绝策略",
    comparison: {
      title: "参数联动",
      headers: ["参数", "作用", "配置风险", "工程建议"],
      rows: [
        ["corePoolSize", "常驻并发能力", "过小处理慢，过大切换多", "结合任务类型和基线流量"],
        ["workQueue", "削峰缓冲", "无界队列可能 OOM 或延迟失控", "优先有界队列"],
        ["maximumPoolSize", "突发上限", "过大拖垮下游", "结合数据库、RPC、MQ 等下游容量"],
        ["RejectedExecutionHandler", "过载保护", "默认 Abort 可能丢业务感知", "明确降级、告警或回退策略"],
      ],
    },
    code: {
      title: "显式创建线程池",
      language: "java",
      code: "ExecutorService pool = new ThreadPoolExecutor(\n    8,\n    32,\n    60, TimeUnit.SECONDS,\n    new ArrayBlockingQueue<>(1000),\n    new ThreadPoolExecutor.CallerRunsPolicy()\n);",
      explanation:
        "不建议直接 Executors.newFixedThreadPool，因为默认队列容易隐藏风险。显式参数能让容量和拒绝策略可见。",
    },
    mistake: {
      mistake: "线程池参数越大，吞吐越高。",
      whyWrong: "线程过多会增加上下文切换，并且可能把数据库、Redis、RPC 下游一起压垮。",
      correct: "线程数要结合任务类型、下游容量、压测数据和拒绝策略一起定。",
    },
    summary:
      "线程池题要讲流程、参数联动、队列风险、拒绝策略和线上监控，不能只背七个参数名称。",
    retell:
      "我会按任务提交路径回答：核心线程、队列、最大线程、拒绝策略。然后补 CPU 密集看核心数，IO 密集看等待占比，但最终要通过压测和下游容量校准。",
    answer30s:
      "线程池核心参数要连起来讲：核心线程处理常规流量，队列做削峰，最大线程处理突发，keepAlive 回收非核心线程，拒绝策略负责过载保护。参数要结合任务类型和下游容量定。",
    answer2min:
      "任务提交后，如果核心线程没满就创建核心线程；核心满了进入队列；队列满了再扩到最大线程；最大也满了执行拒绝策略。所以队列类型会直接影响扩容行为。无界队列可能导致 maximumPoolSize 失效并隐藏 OOM 风险。生产里要用有界队列，明确拒绝策略，并监控活跃线程数、队列长度、任务耗时和拒绝次数。",
    advancedAnswer:
      "高级回答可以补隔离。不同业务不要共用一个大线程池，否则慢任务会拖垮快任务；核心链路、非核心链路、IO 密集任务和 CPU 密集任务要拆池，并结合熔断降级保护下游。",
    essentialPoints: ["任务提交流程", "队列类型影响扩容", "有界队列和拒绝策略", "结合下游容量和监控"],
    followUps: [
      { question: "为什么不推荐 Executors.newFixedThreadPool？", keyAnswer: "默认无界队列可能导致任务堆积和 OOM。", difficulty: "medium" },
      { question: "CPU 密集型和 IO 密集型线程数怎么估？", keyAnswer: "CPU 密集接近核数，IO 密集要考虑等待时间和下游容量。", difficulty: "medium" },
    ],
  },
  {
    match: /类加载过程|双亲委派/,
    keywords: "加载 / 验证 / 准备 / 解析 / 初始化 / 双亲委派 / ClassLoader",
    track: "先讲 class 文件如何变成 Class 对象，再讲双亲委派为什么保护核心类和避免重复加载。",
    conclusion:
      "类加载过程通常包括加载、验证、准备、解析、初始化；双亲委派则是类加载器先把加载请求交给父加载器，父加载不了才自己加载。",
    takeaways: ["加载得到二进制字节流并生成 Class 对象", "验证保证字节码安全", "准备给静态变量分配默认值", "初始化执行静态赋值和静态代码块"],
    goals: ["类加载五个阶段分别做什么？", "准备和初始化有什么区别？", "为什么需要双亲委派？"],
    plainSummary:
      "类加载可以理解成 JVM 把 .class 文件办成可执行身份。先找到字节码，再检查合法性，准备静态变量空间，解析符号引用，最后真正执行初始化逻辑。",
    scenario:
      "项目里遇到 ClassNotFoundException、NoClassDefFoundError、SPI 扩展不生效、热部署类冲突时，背后经常都和类加载器边界有关。",
    why: [
      "加载阶段通过类名找到字节码来源，可以来自文件、网络、jar 包或动态生成。",
      "验证阶段防止非法字节码破坏 JVM 安全。",
      "准备阶段给静态变量分配内存并设默认值，真正的显式赋值通常在初始化阶段。",
      "双亲委派避免核心类被应用自定义类替换，也减少同一个类被重复加载的风险。",
    ],
    diagram:
      "ClassLoader 加载流程\n├─ BootstrapClassLoader\n├─ PlatformClassLoader\n├─ AppClassLoader\n└─ CustomClassLoader\n请求先向上委派，父加载不了再向下尝试",
    comparison: {
      title: "类加载阶段",
      headers: ["阶段", "做什么", "容易混淆点", "面试关键词"],
      rows: [
        ["加载", "获取字节流并生成 Class 对象", "不是执行静态代码", "ClassLoader"],
        ["验证", "校验字节码安全", "不是业务校验", "安全性"],
        ["准备", "静态变量默认值", "不是显式赋值", "static 默认值"],
        ["初始化", "执行 clinit", "静态赋值和静态块", "主动使用触发"],
      ],
    },
    code: {
      title: "准备与初始化的区别",
      language: "java",
      code: "class Demo {\n  static int count = 10;\n  static {\n    count = 20;\n  }\n}",
      explanation:
        "准备阶段 count 先是默认值 0；初始化阶段才执行显式赋值和静态代码块，最终变成 20。",
    },
    mistake: {
      mistake: "准备阶段会把 static int count = 10 设置成 10。",
      whyWrong: "准备阶段通常只分配内存并设置默认零值，显式赋值在初始化阶段执行。",
      correct: "准备阶段 count 是 0，初始化阶段执行赋值和静态代码块。",
    },
    summary:
      "类加载题要把阶段顺序、准备/初始化区别、双亲委派原因和破坏委派的场景讲完整。",
    retell:
      "我会先讲加载、验证、准备、解析、初始化五阶段，再强调准备是默认值，初始化才执行静态赋值。双亲委派是先交给父加载器，保护核心类并避免重复加载。",
    answer30s:
      "类加载通常包括加载、验证、准备、解析、初始化。双亲委派是加载请求先交给父加载器，父加载不了再自己加载，主要为了保护核心类和避免重复加载。",
    answer2min:
      "加载阶段获取 class 字节流并生成 Class 对象；验证保证字节码合法；准备给静态变量分配内存并设默认值；解析把符号引用转成直接引用；初始化执行静态赋值和静态代码块。双亲委派让请求先向父加载器传递，比如核心 JDK 类优先由 Bootstrap 加载，避免应用自己写一个 java.lang.String 替换核心类。",
    advancedAnswer:
      "高级回答可以补破坏双亲委派的场景，如 SPI、Tomcat 多应用隔离、热部署和插件化。破坏不是随便破坏，而是为了隔离或反向加载扩展实现。",
    essentialPoints: ["五阶段", "准备与初始化区别", "双亲委派流程", "双亲委派原因"],
    followUps: [
      { question: "为什么 Tomcat 要打破双亲委派？", keyAnswer: "为了不同 Web 应用之间类隔离，同名类可以各自加载。", difficulty: "hard" },
      { question: "ClassNotFoundException 和 NoClassDefFoundError 有什么区别？", keyAnswer: "前者是加载时找不到，后者常见于曾经能找到但运行期解析或初始化失败。", difficulty: "medium" },
    ],
  },
  {
    match: /GC|垃圾收集器/,
    keywords: "GC Roots / 标记清除 / 复制算法 / 标记整理 / CMS / G1 / ZGC",
    track: "先讲对象如何判活，再讲不同算法和收集器如何在吞吐、停顿、内存碎片之间取舍。",
    conclusion:
      "GC 的本质是自动回收不可达对象，但不同算法和收集器的目标不同：有的追求吞吐，有的追求低停顿，有的适合大堆。",
    takeaways: ["可达性分析决定对象是否存活", "复制算法适合新生代", "标记整理减少碎片", "G1/ZGC 更关注可控停顿和大堆"],
    goals: ["GC Roots 有哪些？", "复制算法为什么适合新生代？", "CMS、G1、ZGC 的目标差异是什么？"],
    plainSummary:
      "GC 像定期清理仓库。先找哪些物品还被入口引用，找不到的就是垃圾。不同清理方式有的快但浪费空间，有的不浪费但停顿更久，所以收集器是在不同目标之间取舍。",
    scenario:
      "线上接口突然抖动，GC 日志显示频繁 Young GC 或 Full GC。此时不能只背收集器名称，要能从对象分配速率、老年代增长、停顿时间和内存碎片判断问题。",
    why: [
      "JVM 通过 GC Roots 做可达性分析，能从根对象访问到的对象才被认为存活。",
      "新生代对象朝生夕死，复制算法只复制少量存活对象，效率高。",
      "老年代对象存活率高，复制成本大，因此常见标记清除或标记整理。",
      "不同收集器围绕吞吐、停顿、碎片和大堆支持做不同取舍。",
    ],
    diagram:
      "GC 流程\n├─ 找 GC Roots\n├─ 可达性标记\n├─ 清理不可达对象\n└─ 根据算法处理复制、清除或整理",
    comparison: {
      title: "常见 GC 思路对比",
      headers: ["机制", "优点", "问题", "适合场景"],
      rows: [
        ["复制算法", "回收快、无碎片", "需要额外空间", "新生代"],
        ["标记清除", "不移动对象", "会产生碎片", "部分老年代场景"],
        ["标记整理", "减少碎片", "移动对象成本高", "老年代整理"],
        ["G1/ZGC", "更关注停顿控制", "复杂度高", "大堆和低延迟需求"],
      ],
    },
    code: {
      title: "开启 GC 日志示例",
      language: "bash",
      code: "java -Xms2g -Xmx2g -Xlog:gc*:file=gc.log:time,uptime,level,tags -jar app.jar",
      explanation:
        "面试讲调优时不要只说改参数，要先拿 GC 日志看停顿时间、频率、回收前后容量和触发原因。",
    },
    mistake: {
      mistake: "GC 调优就是把堆调大。",
      whyWrong: "堆变大可能降低 GC 频率，也可能让单次回收停顿更长，并不能解决对象分配过快或内存泄漏。",
      correct: "先看 GC 日志和对象分配，再决定堆大小、收集器、代码分配模式和缓存策略。",
    },
    summary:
      "GC 题的高分点是把判活、算法、收集器和线上排查连起来，而不是背一串名词。",
    retell:
      "我会先讲 GC Roots 和可达性分析，再讲复制、标记清除、标记整理的取舍。最后落到收集器选择和线上调优：看日志、看停顿、看对象分配和老年代增长。",
    answer30s:
      "GC 先通过 GC Roots 做可达性分析判断对象是否存活，再用不同算法回收。复制算法适合新生代，标记清除和标记整理常见于老年代；收集器选择要在吞吐、停顿和大堆支持之间取舍。",
    answer2min:
      "JVM 不靠引用计数作为主流判活方式，而是通过 GC Roots 做可达性分析。新生代对象大多很快死亡，所以复制算法只复制少量存活对象，效率高；老年代存活对象多，复制成本大，常用标记清除或标记整理。CMS 关注低停顿但有碎片问题，G1 把堆切成 region，目标是更可控停顿，ZGC 更面向大堆低延迟。",
    advancedAnswer:
      "高级回答要能看 GC 日志。比如 Young GC 频繁可能是分配速率高或 Eden 太小；Full GC 频繁可能是老年代增长、元空间、晋升失败或显式 System.gc。调优前先定位触发原因。",
    essentialPoints: ["GC Roots", "可达性分析", "算法取舍", "收集器目标", "GC 日志排查"],
    followUps: [
      { question: "哪些对象可以作为 GC Roots？", keyAnswer: "栈帧局部变量、静态变量、常量、JNI 引用等。", difficulty: "medium" },
      { question: "频繁 Full GC 怎么排查？", keyAnswer: "看触发原因、老年代增长、晋升失败、元空间和对象分配。", difficulty: "hard" },
    ],
  },
  {
    match: /运行时内存区域|栈和堆/,
    keywords: "程序计数器 / 虚拟机栈 / 本地方法栈 / 堆 / 方法区 / 元空间",
    track: "先按线程私有和线程共享分类，再讲每个区域存什么、会出现什么错误。",
    conclusion:
      "JVM 运行时内存可以按线程私有和线程共享理解：程序计数器、虚拟机栈、本地方法栈偏线程私有，堆和方法区偏线程共享。",
    takeaways: ["栈存方法调用帧和局部变量", "堆存对象实例，是 GC 主战场", "方法区/元空间存类元数据", "程序计数器记录线程执行位置"],
    goals: ["栈和堆分别存什么？", "哪些区域线程私有？", "StackOverflowError 和 OOM 常见原因是什么？"],
    plainSummary:
      "可以把 JVM 内存想成运行车间：每个线程有自己的工作台和执行位置，大家共享对象仓库和类信息仓库。栈是调用过程，堆是对象，方法区是类元数据。",
    scenario:
      "线上出现 OOM 或 StackOverflowError 时，如果分不清堆、栈、元空间，就很难判断是对象太多、递归太深，还是动态生成类过多。",
    why: [
      "程序计数器记录当前线程执行到哪条字节码，线程切换后能恢复执行位置。",
      "虚拟机栈由一个个栈帧组成，方法调用会入栈，返回会出栈。",
      "堆存放大多数对象实例，是 GC 重点管理区域。",
      "方法区在 HotSpot 中常以元空间体现，主要保存类元数据、方法信息等。",
    ],
    diagram:
      "JVM 运行时内存\n├─ 线程私有\n│  ├─ 程序计数器\n│  ├─ 虚拟机栈\n│  └─ 本地方法栈\n└─ 线程共享\n   ├─ 堆\n   └─ 方法区/元空间",
    comparison: {
      title: "运行时内存区域",
      headers: ["区域", "线程关系", "主要存放", "常见问题"],
      rows: [
        ["程序计数器", "线程私有", "当前执行位置", "通常不会 OOM"],
        ["虚拟机栈", "线程私有", "栈帧、局部变量、操作数栈", "StackOverflowError"],
        ["堆", "线程共享", "对象实例", "Heap OOM、GC 压力"],
        ["方法区/元空间", "线程共享", "类元数据", "Metaspace OOM"],
      ],
    },
    code: {
      title: "递归导致栈溢出示例",
      language: "java",
      code: "public class StackDemo {\n  static void call() { call(); }\n  public static void main(String[] args) { call(); }\n}",
      explanation:
        "每次递归都会创建新的栈帧，深度过大时虚拟机栈空间耗尽，可能抛 StackOverflowError。",
    },
    mistake: {
      mistake: "Java 里所有东西都在堆上。",
      whyWrong: "对象大多在堆上，但方法调用栈帧、程序计数器、类元数据等属于不同运行时区域。",
      correct: "按线程私有和线程共享分类，再说明各区域职责。",
    },
    summary:
      "JVM 内存区域题要用分类法回答：线程私有、线程共享、各自存什么、对应错误是什么。",
    retell:
      "我会先分线程私有和共享。私有区域有程序计数器、虚拟机栈、本地方法栈；共享区域有堆和方法区。栈管方法调用，堆管对象，方法区管类元数据，排查 OOM 时要先判断是哪块区域出问题。",
    answer30s:
      "JVM 运行时内存主要包括程序计数器、虚拟机栈、本地方法栈、堆和方法区。前三个偏线程私有，堆和方法区线程共享。栈存方法调用帧，堆存对象，方法区存类元数据。",
    answer2min:
      "程序计数器记录线程执行位置，线程切换后能恢复；虚拟机栈由栈帧组成，保存局部变量表、操作数栈、返回地址等；本地方法栈服务 native 方法；堆存放大多数对象实例，是 GC 的重点；方法区或元空间存类元数据、方法信息等。栈太深会 StackOverflowError，堆对象太多会 Heap OOM，动态类过多可能 Metaspace OOM。",
    advancedAnswer:
      "高级回答可以补逃逸分析和栈上分配。规范上对象主要在堆，但 JIT 优化可能通过逃逸分析做标量替换，这不影响面试主线，主线仍然按运行时区域职责回答。",
    essentialPoints: ["线程私有/共享分类", "栈帧", "堆与 GC", "方法区/元空间", "典型错误"],
    followUps: [
      { question: "StackOverflowError 和 OutOfMemoryError 有什么区别？", keyAnswer: "前者常见于栈深度过大，后者是某块内存区域无法分配。", difficulty: "medium" },
      { question: "元空间 OOM 常见原因是什么？", keyAnswer: "动态生成类过多、类加载器泄漏或元空间限制过小。", difficulty: "hard" },
    ],
  },
];

/**
 * Builds rich v3-style starter content for golden validation topics.
 * @param {StarterTopicBuildContext} context Current starter build context.
 * @returns {TopicContent | null} Rich topic content or null when the topic is not a golden sample.
 */
function buildGoldenRichTopicContent(context: StarterTopicBuildContext): TopicContent | null {
  const spec = GOLDEN_RICH_SPECS.find((item) => item.match.test(context.question.title));
  if (!spec) {
    return null;
  }
  const source =
    context.bankTopic === "MySQL"
      ? {
          title: "MySQL 8.4 Reference Manual",
          url: "https://dev.mysql.com/doc/refman/8.4/en/",
          type: "官方文档",
          trustLevel: "S" as const,
        }
      : context.bankTopic === "Redis"
        ? {
            title: "Redis Documentation",
            url: "https://redis.io/docs/latest/",
            type: "官方文档",
            trustLevel: "S" as const,
          }
        : context.bankTopic === "JVM"
          ? {
              title: "The Java Virtual Machine Specification",
              url: "https://docs.oracle.com/javase/specs/",
              type: "官方规范",
              trustLevel: "S" as const,
            }
          : {
              title: "Java Platform API Specification",
              url: "https://docs.oracle.com/en/java/javase/",
              type: "官方文档",
              trustLevel: "S" as const,
            };

  return {
    title: context.question.title,
    breadcrumb: [context.bankName, context.groupTitle, context.question.title],
    examPoint: spec.track,
    summary: spec.conclusion,
    scenario: spec.scenario,
    quickFacts: buildStarterQuickFacts(context, spec.keywords, spec.track),
    article: {
      conclusion: spec.conclusion,
      keyTakeaways: spec.takeaways,
      learningGoals: spec.goals,
      plainSummary: spec.plainSummary,
      plainRetell: spec.retell,
      strongSummary: spec.summary,
      sections: [
        {
          id: "scenario",
          h2: "一、先从真实场景开始",
          type: "text",
          paragraphs: [spec.scenario],
          highlight: "先建立问题动机，再进入原理推导。",
        },
        {
          id: "why",
          h2: "二、核心原理为什么成立",
          type: "text",
          paragraphs: spec.why,
          highlight: "每个结论都要解释为什么，不能停在概念层面。",
        },
        {
          id: "diagram",
          h2: "三、结构图解",
          type: "diagram",
          diagramType: "ascii-tree",
          diagramCode: spec.diagram,
          fallbackDescription: spec.diagram,
          highlight: "图解只承担辅助理解，不用为了有图而强行 Mermaid。",
        },
        {
          id: "comparison",
          h2: "四、对比分析",
          type: "comparison",
          comparison: spec.comparison,
          highlight: "对比题必须让用户知道为什么不用另一个方案。",
        },
        {
          id: "code",
          h2: "五、代码或命令示例",
          type: "code",
          codeExample: spec.code,
          highlight: "代码示例要能解释观察点，而不是只展示语法。",
        },
        {
          id: "mistake",
          h2: "六、常见误区",
          type: "mistake",
          mistake: spec.mistake,
          highlight: "误区要指出为什么错，以及正确边界是什么。",
        },
      ],
    },
    selfTests: [
      {
        level: "基础",
        question: spec.goals[0] ?? `请用一句话说明「${context.question.title}」的核心结论。`,
        hint: "先说问题本质，再说关键机制。",
        answer: spec.answer30s,
        gradingCriteria: [
          { criterion: "核心结论准确", points: 40, description: "能说出问题本质和关键机制。" },
          { criterion: "能解释为什么", points: 40, description: "不是只背名词，而是能解释设计原因。" },
          { criterion: "表达清晰", points: 20, description: "回答有结论和层次。" },
        ],
      },
      {
        level: "应用",
        question: "如果放到真实项目里，你会怎么判断该方案是否合适？",
        hint: "从场景、风险、监控和兜底四个角度想。",
        answer: spec.retell,
        gradingCriteria: [
          { criterion: "场景匹配", points: 35, description: "能说明适用条件。" },
          { criterion: "风险意识", points: 35, description: "能指出边界和误区。" },
          { criterion: "工程表达", points: 30, description: "能落到项目验证或排查。" },
        ],
      },
    ],
    sources: [source],
    interviewContent: {
      question: context.question.title,
      questionVariants: [
        `你能讲一下${stripQuestionMark(context.question.title)}吗？`,
        `如果面试官继续追问这个问题，你会从哪些维度展开？`,
      ],
      answer30s: spec.answer30s,
      answer2min: spec.answer2min,
      advancedAnswer: spec.advancedAnswer,
      essentialPoints: spec.essentialPoints.map((point) => ({ point })),
      bonusPoints: spec.followUps.slice(0, 2).map((item) => ({ point: item.keyAnswer, why: item.question })),
      advancedPoints: spec.followUps.slice(2).map((item) => ({ point: item.keyAnswer, why: item.question })),
      deductPoints: [{ point: spec.mistake.mistake, why: spec.mistake.whyWrong }],
      followUps: spec.followUps,
    },
    sections: [
      {
        id: "knowledge-summary",
        h2: "知识点总结",
        paragraphs: [spec.conclusion, spec.plainSummary],
        bullets: spec.takeaways,
      },
      {
        id: "interview-highlights",
        h2: "面试常问",
        bullets: spec.followUps.map((item) => item.question),
      },
      {
        id: "reference-answer",
        h2: "参考答案和解析",
        paragraphs: [spec.answer30s, spec.answer2min, spec.advancedAnswer],
        bullets: spec.essentialPoints,
      },
    ],
  };
}

/**
 * 为首批黄金题目返回更高质量的富内容文档，避免继续依赖通用模板扩写。
 * @param {StarterTopicBuildContext} context 当前题目构建上下文。
 * @returns {TopicContent | null} 命中黄金题目时返回富内容文档，否则返回 null。
 */
function buildGoldenStarterTopicContent(context: StarterTopicBuildContext): TopicContent | null {
  const richContent = buildGoldenRichTopicContent(context);
  if (richContent) {
    return richContent;
  }

  const normalizedTitle = stripQuestionMark(context.question.title).replace(/\s+/g, "");

  if (normalizedTitle === "ArrayList和LinkedList有什么区别") {
    const comparisonTable = buildStarterMarkdownTable(
      ["维度", "ArrayList", "LinkedList", "面试该怎么讲"],
      [
        ["底层结构", "动态数组", "双向链表", "先讲结构，再讲结构决定的访问成本"],
        ["随机访问", "O(1)，下标直达", "O(n)，需要顺着链表找节点", "读多写少场景优先 ArrayList"],
        ["中间插入/删除", "O(n)，需要搬移元素", "找到节点后改指针更轻，但先找节点通常也要 O(n)", "不要脱离前提直接说 LinkedList 增删快"],
        ["内存占用", "连续数组，更紧凑", "每个节点额外保存前驱/后继指针", "大数据量下 LinkedList 更吃内存"],
        ["工程建议", "默认首选", "只在确实需要双端队列或频繁头尾操作时考虑", "真实项目里绝大多数 List 场景都先看 ArrayList"],
      ]
    );

    return {
      title: context.question.title,
      breadcrumb: [context.bankName, context.groupTitle, context.question.title],
      quickFacts: buildStarterQuickFacts(
        context,
        "动态数组 / 双向链表 / 随机访问 / 内存占用 / 选型",
        "先讲底层结构，再讲复杂度，最后落到真实访问模式和容器选型。"
      ),
      sections: [
        {
          id: "knowledge-summary",
          h2: "知识点总结",
          paragraphs: [
            "先给结论：`ArrayList` 底层是动态数组，优势是随机访问快、内存更紧凑；`LinkedList` 底层是双向链表，优势是头尾插入删除自然，但并不代表它在真实项目里就更快。真正决定性能的，是你的访问模式，而不是只看数据结构名字。",
            comparisonTable,
            "### 为什么很多人会把 LinkedList 想得过强\n很多八股会直接说“LinkedList 增删快”。这句话有一个经常被省略的前提：**你已经拿到了待操作节点**。如果你是按下标插入、删除，`LinkedList` 先得一路遍历到目标位置，整体并不一定比 `ArrayList` 更划算。",
            "### 工程里怎么选\n- 如果核心诉求是随机访问、分页读取、遍历展示，优先 `ArrayList`\n- 如果核心诉求是队列、双端操作、头尾频繁增删，可以考虑 `LinkedList` 或更明确的 `ArrayDeque`\n- 如果你只是因为“增删快”就把 `ArrayList` 换成 `LinkedList`，大概率会得到更差的 CPU Cache 命中率和更高的内存开销",
            buildStarterCodeBlock(
              "java",
              `
List<String> arrayList = new ArrayList<>();
arrayList.add("A");
arrayList.add("B");
arrayList.add(1, "X"); // 需要搬移后续元素

LinkedList<String> linkedList = new LinkedList<>();
linkedList.addFirst("A");
linkedList.addLast("B");
linkedList.add(1, "X"); // 如果按下标插入，底层仍要先找到目标节点
              `
            ),
          ],
          bullets: [
            "比较容器时，不要只背 O(1) 和 O(n)，要把底层结构、内存形态和访问模式一起讲。",
            "ArrayList 扩容会复制数组，但现代业务里它仍然是最常见、最稳妥的 List 首选。",
            "LinkedList 的强项更多是双端操作和链式重连，不是“全场景增删更快”。",
          ],
          callout: "这道题的高分点不是背复杂度，而是能明确指出 LinkedList 的“增删快”有前提。",
        },
        {
          id: "interview-highlights",
          h2: "面试常问",
          bullets: [
            "为什么大多数业务代码里默认优先使用 ArrayList？",
            "LinkedList 理论上插入删除更轻，为什么真实项目里反而经常更慢？",
            "ArrayList 扩容会带来什么成本，什么时候需要提前指定初始容量？",
            "如果只是想要队列语义，为什么很多时候更推荐 ArrayDeque 而不是 LinkedList？",
          ],
        },
        {
          id: "reference-answer",
          h2: "参考答案和解析",
          paragraphs: [
            "30 秒回答：`ArrayList` 和 `LinkedList` 最大区别在底层结构。前者是动态数组，随机访问快、内存更紧凑；后者是双向链表，头尾插入删除自然，但随机访问慢。真实项目里大多数 `List` 场景默认优先 `ArrayList`。",
            "1 分钟回答：如果继续展开，我会按“底层结构 -> 复杂度 -> 真实场景”来讲。`ArrayList` 适合读多写少和按下标访问；`LinkedList` 只有在确实需要双端操作、并且经常在已知节点附近调整链路时才更有意义。很多人说 `LinkedList` 增删快，这句话脱离前提就容易答偏。",
            "深入追问：如果面试官继续问工程选型，我会补充 CPU Cache 命中率、内存占用、扩容复制成本，以及为什么现代 Java 业务里 `ArrayList` 往往仍是默认选择。",
          ],
          bullets: [
            "先定性：动态数组 vs 双向链表。",
            "再定量：随机访问、插入删除、内存占用分别有什么代价。",
            "最后定场景：读多写少优先 ArrayList，双端操作再考虑 LinkedList 或 ArrayDeque。",
          ],
        },
      ],
    };
  }

  if (normalizedTitle === "ArrayList和Vector有什么区别") {
    const comparisonTable = buildStarterMarkdownTable(
      ["维度", "ArrayList", "Vector", "工程结论"],
      [
        ["线程安全", "不保证线程安全", "大量方法直接 `synchronized`", "Vector 的安全是靠粗粒度同步换来的"],
        ["扩容策略", "通常扩到原来的 1.5 倍", "默认接近扩到 2 倍", "两者扩容都要复制数组"],
        ["历史定位", "现代业务默认 List 选项", "早期遗留容器", "新项目一般不主动选 Vector"],
        ["并发场景", "外部同步或换并发容器", "线程安全但竞争重", "更常见替代是 `CopyOnWriteArrayList` 或显式锁"],
      ]
    );

    return {
      title: context.question.title,
      breadcrumb: [context.bankName, context.groupTitle, context.question.title],
      quickFacts: buildStarterQuickFacts(
        context,
        "动态数组 / 线程安全 / synchronized / 扩容 / 历史容器",
        "先讲共同点，再讲线程安全实现差异，最后给出现代项目选型结论。"
      ),
      sections: [
        {
          id: "knowledge-summary",
          h2: "知识点总结",
          paragraphs: [
            "先给结论：`ArrayList` 和 `Vector` 底层都基于动态数组，随机访问都快；真正拉开差距的是线程安全语义和历史定位。`Vector` 的大部分方法用 `synchronized` 直接加锁，所以线程安全，但锁粒度粗，现代项目里通常不再优先使用。",
            comparisonTable,
            "### 为什么现在很少主动选 Vector\n`Vector` 代表的是“容器自己全包线程安全”这套早期设计思路，优点是简单，缺点是所有方法都可能竞争同一把锁。现代并发编程更强调按场景选型：读多写少用 `CopyOnWriteArrayList`，需要复合操作时自己控制锁边界，或者干脆换更合适的数据结构。",
            buildStarterCodeBlock(
              "java",
              `
List<Integer> list = new ArrayList<>();
list.add(1);

Vector<Integer> vector = new Vector<>();
vector.add(1); // 方法级同步，线程安全但并发竞争成本更高
              `
            ),
          ],
          bullets: [
            "ArrayList 和 Vector 不是“新旧两个数组容器”这么简单，而是现代并发设计思路和早期同步容器思路的差异。",
            "线程安全不是免费的，Vector 用更粗的锁语义换来了更低的并发伸缩性。",
            "回答这题时，最好主动补一句：并发场景通常优先考虑更现代的并发容器，而不是 Vector。",
          ],
          callout: "这道题不要只回答“Vector 线程安全”，还要顺手说清为什么现在仍然不推荐它。",
        },
        {
          id: "interview-highlights",
          h2: "面试常问",
          bullets: [
            "既然 Vector 线程安全，为什么现代业务里还是不推荐它？",
            "ArrayList 和 Vector 的扩容策略有什么区别，扩容时的成本是什么？",
            "如果需要线程安全的 List，为什么很多时候会优先考虑 CopyOnWriteArrayList？",
            "方法级 synchronized 为什么在高并发下容易成为瓶颈？",
          ],
        },
        {
          id: "reference-answer",
          h2: "参考答案和解析",
          paragraphs: [
            "30 秒回答：`ArrayList` 和 `Vector` 底层都是动态数组，但 `ArrayList` 不保证线程安全，`Vector` 通过 `synchronized` 保证线程安全。问题不在于它能不能并发用，而在于它的锁粒度太粗，所以现代项目里通常不再优先选它。",
            "1 分钟回答：继续讲时，我会先说明两者共同点都是数组容器，然后补线程安全实现、扩容策略和历史定位。`Vector` 的线程安全来自方法级同步，这在低并发下能工作，但竞争一上来吞吐就会掉得很明显，因此并发 List 更常见的方案是 `CopyOnWriteArrayList` 或外部显式同步。",
            "深入追问：如果面试官问现代替代方案，我会继续补读多写少、复合操作、锁边界控制这些选型维度，而不是简单一句“Vector 老了不用”。",
          ],
          bullets: [
            "先讲共同点：都是动态数组。",
            "再讲差异：线程安全实现、扩容策略、历史定位。",
            "最后给结论：现代项目通常选 ArrayList 或更具体的并发容器，而不是 Vector。",
          ],
        },
      ],
    };
  }

  if (/Iterator.*fail-fast/.test(context.question.title)) {
    const comparisonTable = buildStarterMarkdownTable(
      ["维度", "fail-fast", "fail-safe / 弱一致性遍历", "怎么理解"],
      [
        ["目的", "尽早发现结构性并发修改", "避免遍历期直接炸掉", "一个偏错误检测，一个偏容忍并发"],
        ["典型容器", "ArrayList / HashMap 的普通迭代器", "CopyOnWriteArrayList、部分并发容器", "不要把它们混成同一种线程安全语义"],
        ["实现思路", "比较 `modCount` 和 `expectedModCount`", "快照遍历或弱一致性遍历", "看到的是旧数据或部分新数据也可能被接受"],
        ["结果", "可能抛 `ConcurrentModificationException`", "通常不抛该异常，但代价是读到的视图不一定实时", "行为差异来自容器设计目标不同"],
      ]
    );

    return {
      title: context.question.title,
      breadcrumb: [context.bankName, context.groupTitle, context.question.title],
      quickFacts: buildStarterQuickFacts(
        context,
        "Iterator / modCount / ConcurrentModificationException / fail-safe",
        "先讲 fail-fast 是什么，再讲它和线程安全的边界，最后补 fail-safe 对比。"
      ),
      sections: [
        {
          id: "knowledge-summary",
          h2: "知识点总结",
          paragraphs: [
            "先给结论：`fail-fast` 不是线程安全机制，而是一种**快速失败的错误检测机制**。当集合在遍历过程中发生结构性修改时，迭代器会尽早抛出 `ConcurrentModificationException`，目的是避免你继续基于一份可能已经失真的遍历状态工作。",
            comparisonTable,
            "### 典型触发原理\n很多集合内部维护 `modCount`，迭代器创建时会记录 `expectedModCount`。当你在遍历过程中直接 `remove/add` 集合元素，集合的实际修改次数变了，但迭代器里的预期值没变，于是下一次 `next()` 或相关检查时就会抛异常。",
            buildStarterCodeBlock(
              "java",
              `
List<String> names = new ArrayList<>();
names.add("Hollis");
names.add("Solo");

for (String name : names) {
    if ("Hollis".equals(name)) {
        names.remove(name); // 触发 fail-fast
    }
}
              `
            ),
            "### 工程里真正该记住的事\n- `fail-fast` 解决的是“尽快报错”，不是“保证并发安全”\n- 如果确实要边遍历边删除，优先用 `Iterator.remove()` 这样的受控方式\n- 如果是并发读写场景，要重新选择容器，例如 `CopyOnWriteArrayList` 或并发 Map，而不是指望 `fail-fast` 帮你兜底",
          ],
          bullets: [
            "增强 for 本质上还是依赖迭代器，因此它和普通 Iterator 一样会触发 fail-fast。",
            "结构性修改和单纯改元素值不是一回事，面试时最好主动把两者区分开。",
            "高分点在于明确说出：fail-fast 是 best-effort 检测，不等于严格线程安全。",
          ],
          callout: "这道题最容易答错的地方，是把 fail-fast 说成“为了线程安全才抛异常”。",
        },
        {
          id: "interview-highlights",
          h2: "面试常问",
          bullets: [
            "为什么增强 for 删除元素也会触发 ConcurrentModificationException？",
            "fail-fast 和 fail-safe / 弱一致性遍历到底有什么区别？",
            "Iterator.remove() 为什么通常是安全的，而直接操作集合 remove 不行？",
            "CopyOnWriteArrayList 为什么一般不会触发 fail-fast，它付出的代价是什么？",
          ],
        },
        {
          id: "reference-answer",
          h2: "参考答案和解析",
          paragraphs: [
            "30 秒回答：`fail-fast` 是 Java 集合迭代器里的快速失败机制。遍历过程中如果集合发生结构性修改，迭代器会尽早抛出 `ConcurrentModificationException`，避免继续基于错误状态遍历。它是错误检测，不是线程安全方案。",
            "1 分钟回答：继续展开时，我会讲很多集合内部会维护 `modCount`，迭代器创建时记录 `expectedModCount`。如果遍历时外部直接改集合，这两个值不一致，就可能在下一次访问时抛异常。真正的并发场景应该换并发容器或快照遍历，而不是依赖 fail-fast。",
            "深入追问：如果面试官继续问 fail-safe，我会补充它通常通过快照或弱一致性遍历避免直接抛异常，但代价是读到的数据不一定是实时视图。",
          ],
          bullets: [
            "先定性：快速失败是错误检测机制。",
            "再讲原理：`modCount` 与 `expectedModCount`。",
            "最后落工程：边遍历边改要么用受控 API，要么换并发容器。",
          ],
        },
      ],
    };
  }

  if (/CAS/.test(context.question.title)) {
    const comparisonTable = buildStarterMarkdownTable(
      ["能力", "CAS", "AQS", "面试怎么区分"],
      [
        ["定位", "原子比较交换原语", "同步器框架", "一个是底层更新手段，一个是上层同步抽象"],
        ["典型用途", "无锁计数、自旋更新、原子类", "Lock、Semaphore、CountDownLatch", "CAS 常做局部原子更新，AQS 管理线程排队和唤醒"],
        ["优势", "非阻塞，低竞争时性能好", "能表达更复杂的同步语义", "它们不是互斥关系，很多 AQS 组件内部也会用 CAS"],
        ["风险", "ABA、自旋空转、只能天然处理单变量原子性", "实现更复杂，错误使用会导致阻塞与公平性问题", "被问到 CAS 时最好顺手补 AQS 的层次关系"],
      ]
    );

    return {
      title: context.question.title,
      breadcrumb: [context.bankName, context.groupTitle, context.question.title],
      quickFacts: buildStarterQuickFacts(
        context,
        "CAS / ABA / 自旋 / AtomicStampedReference / AQS",
        "先分清 CAS 和 AQS 的层次，再重点讲 CAS 的优势、ABA 和忙等待。"
      ),
      sections: [
        {
          id: "knowledge-summary",
          h2: "知识点总结",
          paragraphs: [
            "先给结论：`CAS` 是 Compare-And-Swap 的简称，本质是“先比较旧值，再决定是否替换新值”的原子操作；`AQS` 则是 Java 并发包里构建锁和同步器的基础框架。面试问到这题时，应该先把两者的层次分清：**CAS 更底层，AQS 更偏框架**。",
            comparisonTable,
            "### CAS 为什么快\n相对 `synchronized` 这类阻塞式方案，CAS 在低竞争场景下可以避免线程挂起和唤醒，线程失败后通常直接重试，因此很多原子类和并发容器都依赖它。",
            "### CAS 的三大风险\n- **ABA 问题**：值看起来没变，不代表过程没变，中间可能发生过对业务有意义的修改\n- **忙等待**：竞争激烈时线程会不断自旋重试，CPU 空转严重\n- **单变量原子性**：天然更适合单个共享变量的原子更新，复杂状态往往要引入版本号、额外字段或更高层同步手段",
            buildStarterCodeBlock(
              "java",
              `
AtomicStampedReference<Integer> balance = new AtomicStampedReference<>(100, 0);
int[] stampHolder = new int[1];
Integer current = balance.get(stampHolder);
boolean updated = balance.compareAndSet(current, 200, stampHolder[0], stampHolder[0] + 1);
System.out.println(updated);
              `
            ),
            "### 版本号为什么能解决 ABA\n如果只比较值，`100 -> 50 -> 100` 会让你误以为“没有变化”；但如果每次修改都让版本号递增，那么即使值又回到 100，版本号也不会回去，于是就能识别出中间过程。",
          ],
          bullets: [
            "回答 CAS 时不要只背缩写，一定要解释它为什么属于乐观锁思路。",
            "被问到 AQS 时要说明它依赖 state 和队列管理线程获取同步资源，而不是只做单次值替换。",
            "真实项目里如果并发冲突高，CAS 未必比阻塞锁更划算，因为自旋会吃 CPU。",
          ],
          callout: "这道题的高分点，是能说出 CAS 和 AQS 不是一个层级的东西，并把 ABA 讲成真实业务问题。",
        },
        {
          id: "interview-highlights",
          h2: "面试常问",
          bullets: [
            "CAS 为什么常被称为乐观锁，它和 synchronized 的差别到底是什么？",
            "ABA 到底会带来什么真实业务问题，为什么不是“值变回来就没事”？",
            "为什么高竞争场景下 CAS 可能会把 CPU 打满？",
            "AQS 为什么既能实现锁，也能实现 CountDownLatch、Semaphore 这类同步器？",
          ],
        },
        {
          id: "reference-answer",
          h2: "参考答案和解析",
          paragraphs: [
            "30 秒回答：`CAS` 是一种原子比较交换机制，常用来做无锁更新；`AQS` 是 Java 并发包里的同步器框架，负责管理同步状态和线程排队。两者不是同一个层级，CAS 更底层，AQS 更偏上层抽象。",
            "1 分钟回答：继续展开时，我会重点讲 CAS 的优势和问题。它在低竞争下避免线程阻塞，性能通常不错，但也有 ABA、忙等待和单变量原子性限制。AQS 则通过 `state` 加等待队列，把锁、信号量、闭锁这类同步语义统一起来，很多组件内部也会用 CAS 更新状态。",
            "深入追问：如果面试官继续问怎么解决 ABA，我会补版本号方案，以及 `AtomicStampedReference` 为什么能识别“值虽然回来了，但过程已经变了”。",
          ],
          bullets: [
            "先定层次：CAS 是原子原语，AQS 是同步器框架。",
            "再讲风险：ABA、自旋、单变量限制。",
            "最后补场景：低竞争下偏 CAS，高层同步语义看 AQS 组件。",
          ],
        },
      ],
    };
  }

  if (/线程上下文切换为什么成本高/.test(context.question.title)) {
    const contextTable = buildStarterMarkdownTable(
      ["切换时要做什么", "为什么有成本", "真实影响"],
      [
        ["保存当前线程状态", "程序计数器、寄存器、栈指针等都要落下来", "CPU 不能继续直接跑业务代码"],
        ["恢复下一个线程状态", "把目标线程的上下文重新装回 CPU", "恢复期间没有产出业务价值"],
        ["调度与缓存扰动", "线程切走后，CPU Cache、分支预测等热数据会失效", "切得越频繁，浪费越明显"],
      ]
    );

    return {
      title: context.question.title,
      breadcrumb: [context.bankName, context.groupTitle, context.question.title],
      quickFacts: buildStarterQuickFacts(
        context,
        "寄存器 / 程序计数器 / 时间片 / CPU Cache / 线程池",
        "先解释切换时保存和恢复了什么，再讲为什么频繁切换会拖垮吞吐。"
      ),
      sections: [
        {
          id: "knowledge-summary",
          h2: "知识点总结",
          paragraphs: [
            "上下文切换指的是 CPU 从当前线程切到另一个线程执行时，需要先保存当前线程的执行现场，再恢复目标线程的执行现场。它贵，不是因为“切换动作看起来复杂”，而是因为**切换期间 CPU 没有在直接干业务活**，同时还会破坏缓存局部性。",
            contextTable,
            "### 为什么多线程不一定更快\n线程一多，调度器就要频繁在它们之间分时间片；如果这些线程还伴随着锁竞争、阻塞唤醒、频繁抢占，那么系统花在“切线程”上的时间就会越来越多，真正干活的比例反而下降。",
            "### 工程里怎么减少上下文切换\n- 线程数不要拍脑袋放大，优先结合 CPU 核数、任务类型和线程池参数设定\n- 缩小锁粒度，减少线程长时间阻塞后再被唤醒\n- 低竞争计数或状态更新可以考虑 CAS，避免无意义阻塞\n- IO 密集场景可以用更轻的协作模型，例如异步、协程或虚拟线程，但要明确它们只是降低切换成本，不是零成本",
          ],
          bullets: [
            "上下文切换不只保存寄存器，还会带来调度和缓存命中率损失。",
            "线程不是越多越快，线程过多会把系统拖进调度开销泥潭。",
            "高分点在于把“切换动作”和“缓存局部性破坏”一起讲出来。",
          ],
          callout: "这道题不要只答“保存寄存器很耗时”，更关键的是切换会让 CPU 的热数据和时间片都浪费掉。",
        },
        {
          id: "interview-highlights",
          h2: "面试常问",
          bullets: [
            "为什么线程数开得越大，吞吐不一定越高？",
            "锁竞争和上下文切换之间是什么关系？",
            "CAS、无锁编程、虚拟线程为什么有机会降低上下文切换成本？",
            "CPU 密集型任务和 IO 密集型任务在线程池参数上为什么要区别对待？",
          ],
        },
        {
          id: "reference-answer",
          h2: "参考答案和解析",
          paragraphs: [
            "30 秒回答：线程上下文切换就是 CPU 从一个线程切到另一个线程时，保存当前线程状态并恢复目标线程状态的过程。它贵在两点：一是切换期间 CPU 不在直接执行业务逻辑，二是会破坏 CPU Cache 和调度局部性。",
            "1 分钟回答：继续展开时，我会补程序计数器、寄存器、栈指针这些上下文都要保存和恢复；如果线程很多、时间片很短、锁竞争又重，系统会把大量时间耗在切换和唤醒上，吞吐反而下降。所以线程池参数和锁设计都要围绕减少无效切换来做。",
            "深入追问：如果面试官问优化，我会继续讲合理线程数、缩小锁边界、减少阻塞、按任务类型区分线程池，以及在合适场景下用 CAS 或更轻量的并发模型。",
          ],
          bullets: [
            "先讲定义：保存和恢复执行现场。",
            "再讲成本：调度开销和缓存局部性破坏。",
            "最后讲治理：线程池、锁粒度、并发模型一起优化。",
          ],
        },
      ],
    };
  }

  return null;
}

/**
 * Builds a tree from a starter blueprint.
 * @param {string} kbId Knowledge bank id.
 * @param {string} bankName Knowledge bank display name.
 * @param {StarterBankBlueprint} blueprint Starter blueprint.
 * @returns {TreeData} Tree data built from the blueprint.
 */
export function buildStarterTree(kbId: string, bankName: string, blueprint: StarterBankBlueprint): TreeData {
  return {
    id: kbId,
    title: bankName,
    groups: blueprint.groups.map((group, groupIndex) => ({
      id: `${groupIndex + 1}-${toStableId(group.title)}`,
      title: group.title,
      children: group.questions.map((question) => ({
        id: toStableId(question.title),
        title: question.title,
      })),
    })),
  };
}

/**
 * Resolves a more concrete starter insight from the current question title.
 * @param {string} bankTopic Current bank topic.
 * @param {string} questionTitle Current question title.
 * @returns {StarterInsight} Question-specific learning insight.
 */
function resolveStarterInsight(bankTopic: string, questionTitle: string): StarterInsight {
  const normalizedTitle = normalizeInsightTopicTitle(questionTitle);
  const topicPattern = escapeRegExp(bankTopic);

  if (new RegExp(`^${topicPattern} 在真实项目中最常见的使用场景有哪些$`).test(normalizedTitle)) {
    return {
      overview: [
        `${bankTopic} 不是单一知识点，而是一组会贯穿需求开发、性能治理、线上排障和代码设计的基础能力。`,
        `落到真实项目里，真正重要的是知道 ${bankTopic} 会在什么问题里出现、为什么会出现，以及你该如何做选型与取舍。`,
      ],
      highlights: [
        "先看它在日常 CRUD、性能优化、系统设计和排障场景里分别承担什么角色。",
        "再看哪些能力属于高频必备，哪些属于进阶原理和边界知识。",
        "然后补充常见误区，例如只背概念、不懂取舍、上线后不会排障。",
        "最后把业务场景、底层机制和工程实践串成完整理解。",
      ],
      answer: [
        "先从最常见的业务场景切入，说明这套知识到底在哪些问题里会被频繁用到。",
        "再按原理、场景、边界和风险拆开说明。",
        "然后补充真实项目里的选型和排障思路。",
        "最后总结为什么这些知识属于面试和工程都绕不开的基础能力。",
      ],
      hint: "这类总览题不要泛泛而谈，要把“业务场景 + 技术主线 + 工程取舍”连起来。",
    };
  }

  if (new RegExp(`^${topicPattern} 的核心原理如果串成一条主线，应该怎么理解$`).test(normalizedTitle)) {
    return {
      overview: [
        `理解 ${bankTopic} 时，不能把知识点拆成一堆孤立结论，而要把它们串成“核心概念 -> 关键机制 -> 典型场景 -> 风险边界”的主线。`,
        "只有把主线讲清楚，用户才能真正形成体系化认知，而不是只记碎片化题目。 ",
      ],
      highlights: [
        "先找出这一专题最核心的概念和设计目标。",
        "再把底层机制、关键流程和重要数据结构串起来。",
        "然后把常见场景、性能影响和限制条件补全。",
        "最后再回看常见误区、对比项和实践取舍。",
      ],
      answer: [
        "先给出这条知识主线的总览框架。",
        "再从核心机制往外展开典型场景和边界条件。",
        "然后说明这些知识点之间是如何衔接的。",
        "最后把它落到实际开发、调优或排障场景里。",
      ],
      hint: "总览题的关键不是罗列知识点，而是帮用户建立完整主线。",
    };
  }

  if (new RegExp(`^${topicPattern} 最容易忽略的边界条件和误区有哪些$`).test(normalizedTitle)) {
    return {
      overview: [
        `${bankTopic} 最容易让人丢分的地方，往往不是主结论，而是边界条件、默认前提和那些平时不容易暴露的误区。`,
        "真正理解一个专题，必须同时知道它什么时候成立、什么时候不成立，以及哪些经验结论不能机械套用。 ",
      ],
      highlights: [
        "先找出最容易被误解的默认前提。",
        "再看不同实现、不同场景下结论为什么会失效。",
        "然后补充线上最常见的误用方式和排查入口。",
        "最后总结如何通过代码设计和测试规避这些问题。",
      ],
      answer: [
        "先列出几类高频误区。",
        "再解释这些误区为什么会出现。",
        "然后说明边界条件变化时结论如何变化。",
        "最后补充实际规避和排查方法。",
      ],
      hint: "边界题要重点说明“前提变化后，结论为什么变了”。",
    };
  }

  if (new RegExp(`^${topicPattern} 在实际排障和性能治理中最常见的问题是什么$`).test(normalizedTitle)) {
    return {
      overview: [
        `${bankTopic} 一旦进入真实项目，价值不只体现在写代码，更体现在性能治理、稳定性保障和线上排障能力。`,
        "这类题的关键，是把常见故障表现、底层根因和定位思路建立对应关系。 ",
      ],
      highlights: [
        "先看最常见的性能瓶颈和异常现象是什么。",
        "再把这些现象和底层机制、实现细节对应起来。",
        "然后补充日志、监控、指标和代码层面的定位入口。",
        "最后说明如何做预防、治理和回归验证。",
      ],
      answer: [
        "先按问题现象分组，例如延迟、内存、并发冲突或数据异常。",
        "再分析每类问题背后的技术根因。",
        "然后说明常用排查路径和治理方式。",
        "最后补充如何建立长期防线，避免同类问题重复出现。",
      ],
      hint: "排障题一定要把“现象 -> 根因 -> 定位 -> 治理”讲成闭环。",
    };
  }

  const patterns: Array<{ test: RegExp; insight: StarterInsight }> = [
    {
      test: /线程和进程|进程和线程/i,
      insight: {
        overview: [
          "进程是操作系统分配资源的基本单位，线程是 CPU 调度执行的基本单位；面试里要先把资源隔离和执行调度这条主线讲清楚。",
          "Java 并发重点关注线程，因为 JVM 中的业务代码通常运行在线程上，线程之间共享进程内存，所以才会引出线程安全、锁、可见性和上下文切换等问题。",
        ],
        highlights: [
          "进程拥有相对独立的地址空间，进程间通信成本更高，但隔离性更好。",
          "同一进程内的多个线程共享堆和方法区等资源，通信更方便，但也更容易出现并发安全问题。",
          "线程切换通常比进程切换轻量，但仍然需要保存和恢复程序计数器、寄存器、栈等上下文。",
          "项目里线程数量不是越多越好，线程过多会带来调度开销、内存占用和上下文切换问题。",
        ],
        answer: [
          "先说进程是资源分配单位，线程是调度执行单位。",
          "再说明进程隔离性更强，线程共享数据更方便但更容易有并发问题。",
          "然后补充上下文切换、线程数量和线程池治理。",
          "最后结合 Java 项目说明为什么要关注线程安全和线程池参数。",
        ],
        hint: "这道题不要泛泛讲操作系统，关键是把“资源隔离、共享内存、调度开销、Java 并发风险”串起来。",
      },
    },
    {
      test: /Iterator.*fail-fast|fail-fast/i,
      insight: {
        overview: [
          "Iterator 的 fail-fast 机制，本质上是一种快速失败保护：当集合在遍历过程中被结构性修改时，迭代器会尽早抛出异常，而不是继续返回不可靠结果。",
          "它并不保证绝对实时和绝对线程安全，而是尽量帮助开发者尽早发现并发修改问题。 ",
        ],
        highlights: [
          "很多集合内部维护 modCount，迭代器创建时会记录 expectedModCount。",
          "遍历过程中如果检测到 modCount 和 expectedModCount 不一致，就可能抛出 ConcurrentModificationException。",
          "fail-fast 更多是 best-effort 检测，不等同于严格并发控制机制。",
          "如果需要在并发场景下安全遍历，要结合并发容器、快照读或显式同步方案。",
        ],
        answer: [
          "先讲 fail-fast 是什么，要解决什么问题。",
          "再讲 modCount 和 expectedModCount 的检测机制。",
          "然后补充为什么它不是绝对可靠的线程安全方案。",
          "最后说明业务里该如何正确处理并发遍历场景。",
        ],
        hint: "这道题的关键，是把“快速失败”和“线程安全”明确区分开。",
      },
    },
    {
      test: /ConcurrentHashMap.*Hashtable|Hashtable.*ConcurrentHashMap/i,
      insight: {
        overview: [
          "ConcurrentHashMap 和 Hashtable 都能提供线程安全，但设计目标完全不同：前者强调高并发下尽量减少锁竞争，后者则是早期通过整表同步保证安全的传统实现。",
          "真正要讲清的是它们在线程安全实现、读写性能、锁粒度和现代项目选型上的差异。",
        ],
        highlights: [
          "Hashtable 大量方法直接使用 synchronized，锁粒度更粗，竞争一上来吞吐就会明显下降。",
          "ConcurrentHashMap 在 JDK 1.8 里通过 CAS 加局部 synchronized 控制桶位写入，读操作大多不需要全局加锁。",
          "两者都不允许 key 为 null，但 ConcurrentHashMap 更适合现代高并发读写场景。",
          "真实项目里如果只是想要线程安全 Map，通常优先考虑 ConcurrentHashMap，而不是继续使用 Hashtable。",
        ],
        answer: [
          "先讲两者共同点，都是线程安全 Map。",
          "再讲锁粒度和并发实现差异。",
          "然后补读写性能和适用场景。",
          "最后给出现代项目中的容器选型结论。",
        ],
        hint: "不要只说“ConcurrentHashMap 性能更好”，要把它为什么更好讲出来。",
      },
    },
    {
      test: /HashMap.*Hashtable|Hashtable.*HashMap/i,
      insight: {
        overview: [
          "HashMap 和 Hashtable 都是基于哈希表的键值容器，但一个面向单线程或外部协同控制场景，一个是早期自带同步的旧实现。",
          "这道题不能只停留在线程安全差异，还要补 null、性能和历史定位。",
        ],
        highlights: [
          "HashMap 不是线程安全容器，允许一个 null key 和多个 null value。",
          "Hashtable 线程安全但锁粒度粗，不允许 key 或 value 为 null。",
          "现代 Java 项目里，单线程优先用 HashMap，并发场景通常直接用 ConcurrentHashMap。",
          "Hashtable 更多是历史兼容知识点，不是现在推荐的首选容器。",
        ],
        answer: [
          "先讲两者的共同点和历史背景。",
          "再讲线程安全与 null 语义差异。",
          "然后补性能和使用边界。",
          "最后说明为什么现在更常见的是 HashMap 加 ConcurrentHashMap 这组搭配。",
        ],
        hint: "HashMap 和 Hashtable 的对比，最好顺手补一句为什么 ConcurrentHashMap 会取代 Hashtable。",
      },
    },
    {
      test: /Collections\.synchronizedList|并发容器有什么区别/i,
      insight: {
        overview: [
          "Collections.synchronizedList 本质上是给普通 List 套一层同步包装，而并发容器通常会针对读写模型做更细粒度或更专门化的并发设计。",
          "继续展开时，要把同步包装、锁粒度、遍历语义和适用场景讲清楚。",
        ],
        highlights: [
          "synchronizedList 通过统一对象锁保护方法调用，使用方式简单，但并发下锁竞争会比较明显。",
          "像 CopyOnWriteArrayList 这类并发容器，会针对读多写少等特定场景做更合适的实现取舍。",
          "遍历 synchronizedList 时通常仍需要开发者在外部额外同步，否则复合操作和遍历过程仍可能出现并发问题。",
          "真实项目里应该先看读写比例和一致性要求，再决定是同步包装还是直接使用并发容器。",
        ],
        answer: [
          "先讲 synchronizedList 是什么。",
          "再讲它和并发容器在线程安全实现上的差异。",
          "然后补遍历和复合操作的注意点。",
          "最后说明怎么按业务特征做选型。",
        ],
        hint: "这道题不能把“线程安全”说成单一结论，要讲清不同实现是怎么换来的。",
      },
    },
    {
      test: /值传递.*引用传递/i,
      insight: {
        overview: [
          "Java 只有值传递，不存在真正意义上的引用传递；之所以经常产生误解，是因为引用类型变量里保存的是对象地址值。",
          "调用方法时，传递的是这个地址值的副本，所以你可以通过它修改对象内部状态，但无法让实参变量本身指向一个新对象。",
        ],
        highlights: [
          "基本类型传递的是数值副本，方法内部修改不会影响外部变量。",
          "引用类型传递的是地址值副本，因此可以通过同一个对象引用修改对象内容。",
          "在方法内部重新给形参赋新对象，只会改变形参自己的指向，不会影响调用方变量。",
          "性能上，参数传递本身复制的是值或地址值，真正的性能差异常常来自对象创建、对象修改和逃逸影响，而不是“引用传递”本身。",
        ],
        answer: [
          "先明确 Java 只有值传递。",
          "再解释为什么引用类型容易让人误以为是引用传递。",
          "然后用修改对象属性与重新赋值两个例子说明差异。",
          "最后补充这类题在代码可读性和参数设计上的实际意义。",
        ],
        hint: "这道题最容易答错的点，是把“引用类型参数”误说成“引用传递”。",
      },
    },
    {
      test: /重载.*重写|重写.*重载/i,
      insight: {
        overview: [
          "重载发生在同一个类中，关注的是同名方法参数列表不同；重写发生在继承体系中，关注的是子类对父类方法行为的重新实现。",
          "这道题背后真正考察的是编译期多态和运行期多态，以及方法分派规则。",
        ],
        highlights: [
          "重载看参数列表，和返回值无关，属于编译期静态绑定。",
          "重写要求方法签名兼容、访问权限不能收窄，属于运行期动态绑定。",
          "调用重载方法时，编译器在编译期决定匹配哪个签名；调用重写方法时，运行时根据实际对象类型分派。",
          "实际项目里，重载更偏 API 易用性，重写更偏扩展与多态能力。",
        ],
        answer: [
          "先讲两者定义和发生位置。",
          "再讲编译期与运行期分派差异。",
          "然后补语法约束和常见误区。",
          "最后结合多态举一个代码层面的例子。",
        ],
        hint: "重载和重写不要只背表格，要把“静态分派”和“动态分派”讲出来。",
      },
    },
    {
      test: /equals.*hashCode|hashCode.*equals/i,
      insight: {
        overview: [
          "equals 用来判断逻辑相等，hashCode 用来支持基于哈希的数据结构快速定位，两者必须保持约定一致。",
          "如果两个对象逻辑相等但 hashCode 不一致，会直接破坏 HashMap、HashSet 这类容器的行为。",
        ],
        highlights: [
          "equals 相等的两个对象必须返回相同的 hashCode。",
          "hashCode 相同不代表 equals 一定相等，因为哈希冲突是允许存在的。",
          "重写 equals 却不重写 hashCode，会导致对象在哈希容器中查找、去重异常。",
          "业务里常把参与唯一性的字段同时纳入 equals 和 hashCode 计算。",
        ],
        answer: [
          "先说明两者分别解决什么问题。",
          "再讲为什么哈希容器要求两者约定一致。",
          "然后举出 HashSet 去重异常的经典反例。",
          "最后补充实际建模时应选择哪些字段参与计算。",
        ],
        hint: "这道题最重要的不是背规范，而是讲清哈希容器为什么依赖这个规范。",
      },
    },
    {
      test: /String.*StringBuilder.*StringBuffer/i,
      insight: {
        overview: [
          "String 不可变，StringBuilder 和 StringBuffer 可变，这是三者最根本的语义差异。",
          "继续往下要讲线程安全、拼接性能、内存分配方式，以及为什么大量字符串拼接通常不建议直接用 String。",
        ],
        highlights: [
          "String 每次拼接都可能创建新对象，频繁拼接会产生额外对象和 GC 压力。",
          "StringBuilder 适合单线程下的高频字符串拼接，性能通常最好。",
          "StringBuffer 在方法上加了同步控制，线程安全但有额外锁开销。",
          "不可变字符串在缓存、共享和安全性上更有优势。",
        ],
        answer: [
          "先讲可变与不可变的差异。",
          "再讲线程安全和性能差异。",
          "然后补字符串拼接时编译器和运行时的行为。",
          "最后说明项目中如何选型。",
        ],
        hint: "这道题的高分点，是把“语义差异 + 线程安全 + 性能差异”一起讲清楚。",
      },
    },
    {
      test: /Exception.*Error|Error.*Exception/i,
      insight: {
        overview: [
          "Exception 和 Error 都继承自 Throwable，但语义完全不同：前者更多表示程序可处理的问题，后者更多表示系统级严重错误。",
          "真正要讲清的是可恢复性、捕获处理策略，以及 checked exception 和 unchecked exception 的差异。",
        ],
        highlights: [
          "Exception 分为受检异常和运行时异常，很多业务异常属于这一类。",
          "Error 往往表示 JVM 或系统层面的严重问题，例如 OOM、StackOverflowError。",
          "受检异常要求调用方显式处理，运行时异常通常表示编程错误或非法状态。",
          "工程里不应滥用 try-catch 吞掉所有 Throwable。",
        ],
        answer: [
          "先讲两者语义差异。",
          "再讲可恢复性和处理方式。",
          "然后补 checked / unchecked exception 的区别。",
          "最后结合统一异常处理说明项目实践。",
        ],
        hint: "不要把 Error 说成普通业务异常，它通常不属于正常恢复路径。",
      },
    },
    {
      test: /泛型.*类型擦除|类型擦除.*泛型/i,
      insight: {
        overview: [
          "Java 泛型在编译后会经历类型擦除，大部分泛型信息不会完整保留到运行时，这既提升了向后兼容性，也带来了运行期能力限制。",
          "理解这块知识时，重点要把桥接方法、泛型边界、反射读取泛型信息，以及为什么不能直接 new T 串成一条完整主线。",
        ],
        highlights: [
          "编译器会在编译期做类型检查，并在必要时插入强制类型转换。",
          "类型擦除后，未指定上界的泛型通常会被替换成 Object。",
          "为保持多态与重写关系，编译器可能生成桥接方法。",
          "运行时拿到的泛型信息往往依赖方法签名、字段签名或父类泛型声明，而不是普通对象实例。",
        ],
        answer: [
          "先讲泛型为什么存在。",
          "再讲类型擦除在编译阶段是怎么发生的。",
          "然后补桥接方法和运行期限制。",
          "最后说明这对框架设计和反射有什么影响。",
        ],
        hint: "类型擦除题不能只说“编译后变成 Object”，还要说明兼容性和限制。",
      },
    },
    {
      test: /反射/i,
      insight: {
        overview: [
          "反射的本质，是程序在运行时读取类的结构信息，并动态创建对象、访问字段、调用方法。",
          "它的价值在于提升框架扩展能力，但代价是类型约束变弱、调用链更隐式、性能和安全性也需要额外关注。",
        ],
        highlights: [
          "反射能力主要建立在 Class、Constructor、Method、Field 等核心类型之上。",
          "运行时通过类元数据完成对象创建、方法调用和字段访问，因此灵活性很强。",
          "相比直接调用，反射通常有额外开销，也更依赖访问控制、缓存和封装边界。",
          "Spring、MyBatis、序列化框架大量使用反射，但往往会配合缓存和字节码增强来降低损耗。",
        ],
        answer: [
          "先讲反射是什么，以及它为什么存在。",
          "再讲 Class 对象、成员元数据和动态调用链路。",
          "然后补性能、安全性和封装性的代价。",
          "最后结合框架场景说明为什么离不开反射。",
        ],
        hint: "反射题不能只说“运行时动态调用”，还要说明元数据、灵活性和成本。",
      },
    },
    {
      test: /注解/i,
      insight: {
        overview: [
          "注解本质上是附着在代码元素上的结构化元数据，本身不直接改变业务逻辑，而是为编译器、框架或运行时处理器提供额外信息。",
          "它的关键不在“写个 @ 符号”，而在保留策略、目标范围，以及谁在什么时候读取并消费这份元数据。",
        ],
        highlights: [
          "常见元注解包括 @Target、@Retention、@Documented、@Inherited，它们决定注解的作用范围和生命周期。",
          "RetentionPolicy.SOURCE、CLASS、RUNTIME 分别对应编译前、字节码期、运行期可见性差异。",
          "框架往往会结合反射、代理和扫描机制读取运行时注解，再完成自动装配或行为增强。",
          "自定义注解时，要先明确是给编译器看、给框架看，还是给运行时逻辑看。",
        ],
        answer: [
          "先讲注解是什么，本质上承载什么信息。",
          "再讲元注解和保留策略。",
          "然后补框架如何读取和消费注解。",
          "最后说明自定义注解时的设计要点。",
        ],
        hint: "注解题最重要的是把“元数据 + 生命周期 + 消费方”这三件事讲清楚。",
      },
    },
    {
      test: /Lambda|Stream/i,
      insight: {
        overview: [
          "Lambda 让函数式写法进入 Java，Stream 则把集合处理从命令式循环提升为声明式流水线，两者共同改变了 Java 8 之后的编码方式。",
          "真正要讲清的是函数式接口、惰性求值、流水线操作，以及这种写法带来的可读性、并行能力和调试成本变化。",
        ],
        highlights: [
          "Lambda 依赖函数式接口，本质上是在传递行为而不是只传递数据。",
          "Stream 把数据源、处理中间操作和终止操作串成流水线，中间操作通常是惰性执行的。",
          "map、filter、flatMap、sorted、collect 是最常见的 Stream 操作组合。",
          "Stream 代码更简洁，但如果链路过长、嵌套复杂或误用并行流，也会带来可读性和性能问题。",
        ],
        answer: [
          "先讲 Lambda 和 Stream 分别解决什么问题。",
          "再讲函数式接口和惰性流水线机制。",
          "然后补常见操作、优势和限制。",
          "最后说明项目里什么时候适合用，什么时候不适合滥用。",
        ],
        hint: "这类题不要只说“代码更简洁”，要把函数式接口和流水线机制讲明白。",
      },
    },
    {
      test: /List、Set、Map|List\/Set\/Map/i,
      insight: {
        overview: [
          "List 关注有序可重复，Set 关注去重，Map 关注键值映射，这是集合框架最基础的分类方式。",
          "继续展开时，必须把底层实现、复杂度和典型使用场景一起讲清楚，而不是只停留在概念层面。",
        ],
        highlights: [
          "List 常见实现有 ArrayList、LinkedList，核心差异是底层结构和随机访问性能。",
          "Set 常见实现有 HashSet、LinkedHashSet、TreeSet，重点在无序、有序、排序。",
          "Map 常见实现有 HashMap、LinkedHashMap、TreeMap，重点在查找、顺序和排序。",
          "理解这类题时，最好顺手补一个业务选择场景，例如去重、顺序遍历或按 key 快速查找。",
        ],
        answer: [
          "先说明三者解决的问题分别是什么。",
          "再说明典型实现类和底层结构差异。",
          "然后补充时间复杂度和常见使用场景。",
          "最后补一句如何在项目里做容器选型。",
        ],
        hint: "这类题属于集合入门高频题，关键是把“用途 + 实现 + 场景”一次说完整。",
      },
    },
    {
      test: /Collection.*Collections|Collections.*Collection/i,
      insight: {
        overview: [
          "Collection 是集合框架里的顶层接口之一，用来抽象一组元素的通用行为；Collections 则是操作集合的工具类，提供排序、查找、同步包装等静态方法。",
          "这道题最容易混淆的地方，是很多人把接口和工具类当成同一层概念，所以一定要先把角色分工讲清楚。",
        ],
        highlights: [
          "Collection 属于抽象接口，List、Set、Queue 等都建立在它之上。",
          "Collections 是工具类，本身不存数据，主要提供排序、反转、二分查找和同步包装等静态能力。",
          "一个负责定义“集合该怎么用”，一个负责提供“现有集合怎么被加工和操作”。",
          "如果顺手补上 Arrays、Stream 的定位，对集合体系的理解会更完整。",
        ],
        answer: [
          "先讲接口和工具类不是同一层概念。",
          "再讲 Collection 在集合框架中的位置。",
          "然后讲 Collections 提供了哪些典型能力。",
          "最后补一句真实开发里它们分别怎么出现。",
        ],
        hint: "关键不是背名字，而是分清“定义规范”和“操作工具”两个角色。",
      },
    },
    {
      test: /ArrayList.*LinkedList|LinkedList.*ArrayList/i,
      insight: {
        overview: [
          "ArrayList 底层是动态数组，LinkedList 底层是双向链表，两者的随机访问和插入删除复杂度差异非常明显。",
          "继续展开时，需要把扩容机制、遍历方式和真实项目选型一起说清楚。",
        ],
        highlights: [
          "ArrayList 随机访问快，尾部追加性能稳定，但中间插入需要搬移元素。",
          "LinkedList 适合频繁在已知节点附近插入删除，但随机访问慢且更占内存。",
          "ArrayList 扩容一般是按 1.5 倍增长，扩容会触发数组复制。",
          "真实项目里大多数读多写少场景优先选择 ArrayList。",
        ],
        answer: [
          "先讲底层结构差异。",
          "再讲随机访问、插入删除、内存占用的差异。",
          "然后给出不同业务场景的容器选型建议。",
          "最后补扩容和遍历的实现细节。",
        ],
        hint: "别只背 O(1) 和 O(n)，面试官更想听你什么时候选 ArrayList、什么时候选 LinkedList。",
      },
    },
    {
      test: /ArrayList.*Vector|Vector.*ArrayList/i,
      insight: {
        overview: [
          "ArrayList 和 Vector 底层都基于动态数组，但前者面向现代单线程或外部并发控制场景，后者则是早期自带同步的历史容器。",
          "真正要讲清的是线程安全语义、扩容策略和为什么今天大多数场景都不再优先使用 Vector。",
        ],
        highlights: [
          "ArrayList 默认不保证线程安全，Vector 的大部分方法带有同步控制。",
          "Vector 因为锁粒度较粗，在并发场景下性能和可扩展性通常不如更现代的并发容器。",
          "两者都基于数组，因此随机访问快，但扩容时都需要复制旧数组。",
          "现代项目里单线程一般选 ArrayList，并发场景更常见的是 CopyOnWriteArrayList 或外部同步方案。",
        ],
        answer: [
          "先讲共同点，都是基于数组的 List。",
          "再讲线程安全和扩容策略差异。",
          "然后补性能和历史定位。",
          "最后说明现在为什么很少主动选 Vector。",
        ],
        hint: "回答这题时，历史背景和现代替代方案最好一起讲。",
      },
    },
    {
      test: /Queue、Deque、BlockingQueue|Queue.*Deque.*BlockingQueue/i,
      insight: {
        overview: [
          "Queue 强调先进先出，适合普通排队和任务调度；Deque 支持两端进出，适合实现栈、双端队列和滑动窗口；BlockingQueue 则在队列基础上加入阻塞语义，适合线程间生产消费协作。",
          "这道题的核心不是背接口名字，而是要讲清它们分别解决什么场景问题。",
        ],
        highlights: [
          "Queue 通常用于普通 FIFO 场景，比如消息排队、任务缓冲。",
          "Deque 可以从头尾两端插入和删除，因此既能当队列，也能当栈。",
          "BlockingQueue 提供阻塞等待能力，当队列空或满时可以挂起线程，天然适合生产者消费者模型。",
          "真实业务里要先看是否需要双端操作、是否涉及线程协作，再决定容器选型。",
        ],
        answer: [
          "先分别给出三个接口解决的问题。",
          "再讲它们的操作特征和典型实现。",
          "然后补真实业务里的选型依据。",
          "最后说明 BlockingQueue 为什么不只是“线程安全队列”。",
        ],
        hint: "如果能顺手带上 ArrayDeque、LinkedList、LinkedBlockingQueue，会更像真实面试表达。",
      },
    },
    {
      test: /HashSet|LinkedHashSet|TreeSet/i,
      insight: {
        overview: [
          "HashSet、LinkedHashSet、TreeSet 本质都属于 Set，但底层依赖的结构不同，因此顺序性和性能特征不同。",
          "理解它们的关键在于：是否有序、是否排序、底层依赖什么结构、适合什么场景。",
        ],
        highlights: [
          "HashSet 底层依赖 HashMap，强调去重和查找效率。",
          "LinkedHashSet 在 HashSet 基础上维护插入顺序。",
          "TreeSet 基于红黑树实现，天然有序但性能特征不同于哈希结构。",
          "业务里如果只关心去重通常优先 HashSet，如果还关心顺序或排序再选其他实现。",
        ],
        answer: [
          "先讲三者共同点和目标。",
          "再讲底层结构与顺序特征差异。",
          "然后补复杂度和使用场景。",
          "最后说明为什么 TreeSet 需要比较器。",
        ],
        hint: "这类题的重点是“去重、有序、排序”三个关键词的清晰对比。",
      },
    },
    {
      test: /LinkedHashMap/i,
      insight: {
        overview: [
          "LinkedHashMap 能保证顺序，是因为它在 HashMap 的哈希结构之外，又通过双向链表把节点串联起来。",
          "因此它既保留了哈希查找的效率，又额外记录了插入顺序或访问顺序。",
        ],
        highlights: [
          "底层仍然基于哈希表定位桶位，顺序能力不是替代哈希，而是在节点层额外维护链表指针。",
          "默认情况下 LinkedHashMap 维护插入顺序，也可以通过 accessOrder 配置成访问顺序。",
          "访问顺序模式常被用来实现 LRU 这类淘汰策略。",
          "它比 HashMap 多了一层顺序维护成本，所以只有在确实需要顺序语义时才值得使用。",
        ],
        answer: [
          "先讲 HashMap 和双向链表这两个底层组成。",
          "再讲插入顺序和访问顺序的区别。",
          "然后补典型场景，例如 LRU。",
          "最后说明它和普通 HashMap 的成本差异。",
        ],
        hint: "别只说“因为有链表”，要补清楚链表维护的是哪种顺序。",
      },
    },
    {
      test: /TreeMap/i,
      insight: {
        overview: [
          "TreeMap 之所以能排序，是因为它底层不是哈希表，而是按 key 组织的红黑树。",
          "元素每次插入都会按照比较规则落到树的正确位置，所以遍历时天然就是有序结果。",
        ],
        highlights: [
          "排序依据来自 key 的自然顺序，或者创建 TreeMap 时传入的 Comparator。",
          "底层红黑树保证了查找、插入、删除能在对数复杂度内完成。",
          "如果 key 不可比较，或者比较规则不稳定，就会直接影响 TreeMap 的正确行为。",
          "它适合需要范围查询、按序遍历和有序 key 管理的场景，不适合只追求极致查找性能的哈希场景。",
        ],
        answer: [
          "先讲底层是红黑树，不是哈希表。",
          "再讲排序依据来自 Comparable 或 Comparator。",
          "然后补复杂度和典型场景。",
          "最后说明它和 HashMap 的取舍差异。",
        ],
        hint: "TreeMap 的关键词应该是“红黑树 + 比较规则 + 有序遍历”。",
      },
    },
    {
      test: /ConcurrentHashMap/i,
      insight: {
        overview: [
          "ConcurrentHashMap 的目标是在保证并发安全的同时尽量减少锁竞争，因此它比 Hashtable 和 synchronizedMap 更适合高并发场景。",
          "继续展开时，JDK 1.7 和 1.8 的实现差异是必须讲清楚的主线。",
        ],
        highlights: [
          "JDK 1.7 主要依赖 Segment 分段锁。",
          "JDK 1.8 改成数组加链表加红黑树，并结合 CAS 与 synchronized。",
          "读操作尽量无锁，写操作只锁定局部桶位，减少锁粒度。",
          "进一步分析时，还可以补充 size 统计和扩容迁移的并发细节。",
        ],
        answer: [
          "先讲它为什么存在。",
          "再讲 1.7 和 1.8 的实现差异。",
          "然后讲线程安全是如何保证的。",
          "最后补充适用场景和与 HashMap 的区别。",
        ],
        hint: "回答 ConcurrentHashMap 时，最好带上“Segment -> CAS + synchronized”的版本演进。",
      },
    },
    {
      test: /HashMap/i,
      insight: {
        overview: [
          "HashMap 底层是数组加链表加红黑树，核心目标是尽量把 key 均匀打散，从而提高查找和插入效率。",
          "继续展开时，重点要把 put 流程、扩容、树化阈值以及线程安全问题串起来理解。",
        ],
        highlights: [
          "put 时先计算 hash，再定位桶位，冲突时走链表或红黑树。",
          "当链表过长且桶数组容量达到阈值时，链表会树化为红黑树。",
          "扩容会触发 rehash，旧元素会重新分布到新数组中。",
          "HashMap 不是线程安全容器，多线程场景需要考虑 ConcurrentHashMap。",
        ],
        answer: [
          "先讲底层结构和设计目标。",
          "再按 put、get、resize 三个流程展开。",
          "然后说明树化和扩容分别解决什么问题。",
          "最后补充线程安全和 equals/hashCode 的注意点。",
        ],
        hint: "回答 HashMap 时一定要把“数组 + 链表 + 红黑树 + 扩容”这条主线讲清楚。",
      },
    },
    {
      test: /CopyOnWriteArrayList/i,
      insight: {
        overview: [
          "CopyOnWriteArrayList 的核心思想是写时复制，读写分离，因此适合读多写少且对实时一致性要求不高的场景。",
          "理解它时，要顺手把线程安全原因以及它为什么不适合写多场景讲清楚。",
        ],
        highlights: [
          "读操作直接基于旧数组，不需要加锁。",
          "写操作会复制一份新数组再修改，写放大明显。",
          "遍历时不会出现 ConcurrentModificationException，但读到的可能是旧数据。",
          "典型场景是配置快照、订阅者列表、白名单等读多写少集合。",
        ],
        answer: [
          "先讲写时复制的核心思想。",
          "再讲线程安全和一致性特征。",
          "然后说明适用与不适用的业务场景。",
          "最后补充和普通 List 的性能差异。",
        ],
        hint: "这类题的关键是明确它的适用前提：读多写少。",
      },
    },
    {
      test: /BlockingQueue.*生产者消费者|生产者消费者.*BlockingQueue/i,
      insight: {
        overview: [
          "BlockingQueue 在生产者消费者模型里的价值，不只是“线程安全”，更重要的是它把排队、阻塞等待和容量控制三件事封装到了一起。",
          "这让生产者和消费者之间不需要自己手写 wait/notify，也能自然形成解耦。",
        ],
        highlights: [
          "当队列为空时，消费者可以阻塞等待；当队列已满时，生产者也可以阻塞或按策略失败。",
          "它天然起到缓冲区作用，能平滑削峰，避免生产和消费速度完全耦合。",
          "不同实现如 ArrayBlockingQueue、LinkedBlockingQueue、SynchronousQueue 适合的吞吐和内存场景并不一样。",
          "真实项目里线程池、消息投递、异步解耦等场景都大量依赖 BlockingQueue。",
        ],
        answer: [
          "先讲它在模型里解决了什么同步问题。",
          "再讲阻塞等待和容量控制的价值。",
          "然后补典型实现和使用场景。",
          "最后说明为什么它能替代手写 wait/notify 协作。",
        ],
        hint: "这题最容易漏掉“容量控制”和“削峰缓冲”两个价值点。",
      },
    },
    {
      test: /遍历集合时直接增删元素|不建议在遍历集合时直接增删元素/i,
      insight: {
        overview: [
          "遍历集合时直接增删元素容易出问题，本质上是因为遍历过程和结构修改过程共享同一份状态，而很多集合实现并不会允许这种不受控的并发修改。",
          "在 Java 集合里，这通常会触发 fail-fast 机制，抛出 ConcurrentModificationException。",
        ],
        highlights: [
          "增强 for 和普通 Iterator 背后都依赖迭代器状态，结构性修改会破坏它原本的遍历预期。",
          "很多集合通过 modCount 这类修改计数检测“遍历期间结构是否被外部改过”。",
          "如果确实需要边遍历边删，应该优先使用 Iterator.remove 这类受控方式。",
          "并发场景下还要区分 fail-fast、弱一致性迭代器和写时复制容器，不是所有集合行为都一样。",
        ],
        answer: [
          "先讲为什么遍历和结构修改会冲突。",
          "再讲 fail-fast 的检测机制。",
          "然后补正确删除方式和并发场景差异。",
          "最后说明这类问题在真实业务里为什么经常引发线上 bug。",
        ],
        hint: "回答时最好把“结构性修改”和“元素值修改”区分开。",
      },
    },
    {
      test: /大数据量场景下如何做选型|集合类在大数据量场景下如何做选型/i,
      insight: {
        overview: [
          "大数据量场景下做集合选型，核心不是死背容器特点，而是围绕访问模式、内存占用、并发要求和顺序语义来做取舍。",
          "同样是存一批数据，查找频繁、顺序遍历、范围查询和并发更新，对应的最佳容器往往完全不同。",
        ],
        highlights: [
          "如果核心诉求是按 key 快速查找，通常优先考虑 HashMap 或其并发版本。",
          "如果需要顺序遍历或范围查询，TreeMap、LinkedHashMap 之类的有序容器更合适。",
          "如果写少读多，要关注 CopyOnWrite；如果生产消费解耦，要优先考虑 BlockingQueue。",
          "真正线上选型还要结合对象数量、GC 压力、扩容成本和热点访问模式一起判断。",
        ],
        answer: [
          "先给选型维度，不要一上来报容器名字。",
          "再按查找、顺序、并发、内存四类需求拆开讲。",
          "然后补典型错误选型带来的后果。",
          "最后说明线上怎么通过监控和压测验证结论。",
        ],
        hint: "这题最加分的地方，是能从“业务访问模式”倒推容器选择。",
      },
    },
    {
      test: /排查集合使用导致的内存和性能问题|集合使用导致的内存和性能问题/i,
      insight: {
        overview: [
          "排查集合导致的内存和性能问题，不能只盯着某个 API，而是要从对象规模、容器选择、扩容复制、热点 key 和生命周期管理几条线同时入手。",
          "很多线上问题看起来像 JVM 或 GC 抖动，根因其实是集合使用方式不当。",
        ],
        highlights: [
          "先看集合是不是被无限增长、长生命周期对象引用住，导致内存持续膨胀。",
          "再看容器选型是否合理，例如用 LinkedList 承担随机访问、用 HashMap 装可变 key，都会带来性能异常。",
          "还要关注扩容复制、装箱拆箱、重复对象和不必要的大对象缓存，这些都会放大 GC 压力。",
          "真实排查通常要结合 dump、GC 日志、热点方法分析和业务访问路径一起定位。",
        ],
        answer: [
          "先给排查框架：规模、生命周期、选型、访问模式。",
          "再讲常见问题来源和对应现象。",
          "然后补常用诊断手段。",
          "最后说明如何通过容量预估和数据结构替换做治理。",
        ],
        hint: "最重要的是给出一套可执行的排查路径，而不是泛泛说“看日志、看监控”。",
      },
    },
    {
      test: /synchronized/i,
      insight: {
        overview: [
          "synchronized 是 Java 提供的内置同步机制，核心是通过对象监视器保证互斥和内存可见性。",
          "高频追问点在于锁升级、可重入性和底层实现。",
        ],
        highlights: [
          "synchronized 可以修饰实例方法、静态方法和代码块。",
          "进入同步块会触发 monitorenter，退出同步块会触发 monitorexit。",
          "锁状态可能经历偏向锁、轻量级锁和重量级锁。",
          "它不仅解决互斥，也提供 happens-before 语义。",
        ],
        answer: [
          "先说明 synchronized 解决了什么问题。",
          "再讲监视器和字节码层面的原理。",
          "然后补锁升级和可重入性。",
          "最后说明和 Lock 的差异。",
        ],
        hint: "回答 synchronized 时，不要只说“加锁”，要说明 monitor 和内存语义。",
      },
    },
    {
      test: /volatile/i,
      insight: {
        overview: [
          "volatile 保证的是可见性和有序性，但不保证复合操作的原子性，这是面试里最容易混淆的点。",
          "它通常结合 JMM、内存屏障和 happens-before 一起考察。",
        ],
        highlights: [
          "写 volatile 变量会把工作内存中的值刷新到主内存。",
          "读 volatile 变量会强制从主内存重新读取。",
          "编译器和 CPU 会在 volatile 前后插入内存屏障，约束指令重排。",
          "像 i++ 这样的复合操作仍然需要锁或 CAS 保证原子性。",
        ],
        answer: [
          "先说明 volatile 能保证什么、不能保证什么。",
          "再讲它与 JMM 和内存屏障的关系。",
          "然后举出双重检查单例等经典场景。",
          "最后补充它和 synchronized 的边界差异。",
        ],
        hint: "volatile 最容易丢分的地方，是把可见性和原子性混为一谈。",
      },
    },
    {
      test: /CAS|AQS/i,
      insight: {
        overview: [
          "CAS 通过硬件原子指令实现无锁更新，AQS 则是 Java 并发包中构建锁和同步器的基础框架。",
          "两者经常一起考，因为很多并发容器和锁都依赖它们。",
        ],
        highlights: [
          "CAS 通过 compare-and-swap 比较旧值并尝试更新新值。",
          "CAS 常见问题包括 ABA、自旋开销和只能保证单变量原子性。",
          "AQS 用 state 表示同步状态，并通过队列管理线程获取锁的顺序。",
          "ReentrantLock、Semaphore、CountDownLatch 都基于 AQS 扩展。",
        ],
        answer: [
          "先讲 CAS 的原理和局限。",
          "再讲 AQS 为什么需要队列和 state。",
          "然后补充典型基于 AQS 的组件。",
          "最后说明为什么它们能支撑高并发同步。",
        ],
        hint: "如果被追问到 AQS，最好带上 CLH 队列、state 和 acquire/release 这几个关键词。",
      },
    },
    {
      test: /线程池|Executor/i,
      insight: {
        overview: [
          "线程池的核心价值是复用线程、控制并发度和统一管理任务，而不是简单地“少创建线程”。",
          "高频追问点通常集中在核心参数、拒绝策略和任务排队模型。",
        ],
        highlights: [
          "核心参数包括 corePoolSize、maximumPoolSize、keepAliveTime 和 workQueue。",
          "任务提交流程和队列类型决定了线程池的扩容行为。",
          "常见拒绝策略有 Abort、CallerRuns、Discard 和 DiscardOldest。",
          "线程池参数要结合业务流量峰值和任务特征做压测后设定。",
        ],
        answer: [
          "先讲线程池为什么存在。",
          "再讲任务提交和扩容流程。",
          "然后说明不同队列和拒绝策略的适用场景。",
          "最后补线上排查线程池问题的办法。",
        ],
        hint: "线程池题最怕只背参数名称，关键是讲清参数之间的联动关系。",
      },
    },
    {
      test: /类加载|双亲委派/i,
      insight: {
        overview: [
          "类加载机制的核心是把 class 字节码变成 JVM 可执行的 Class 对象，而双亲委派是为了避免类重复加载和核心类被篡改。",
          "高频追问点在于加载流程、委派模型和打破双亲委派的场景。",
        ],
        highlights: [
          "类加载通常包括加载、验证、准备、解析、初始化几个阶段。",
          "双亲委派的基本规则是先委派父加载器，父加载器无法完成时再由当前加载器尝试。",
          "SPI、Tomcat、热部署等场景可能会打破传统双亲委派。",
          "面试里最好补一个 ClassLoader 层级结构：Bootstrap、Extension、App。",
        ],
        answer: [
          "先讲类加载的完整流程。",
          "再讲双亲委派为什么存在。",
          "然后举出打破双亲委派的场景。",
          "最后说明它对安全性和隔离性的意义。",
        ],
        hint: "类加载机制题的关键是流程完整、委派原因清楚、场景举例到位。",
      },
    },
    {
      test: /GC|Full GC|垃圾收集器/i,
      insight: {
        overview: [
          "GC 的目标是自动回收不再使用的对象，同时尽量减少停顿时间和吞吐损耗。",
          "面试会追问分代思想、收集器差异以及 Full GC 触发条件。",
        ],
        highlights: [
          "常见算法有标记清除、复制、标记整理、分代回收。",
          "Young GC 主要回收新生代，Full GC 往往代价更高。",
          "CMS、G1、ZGC 的设计目标各不相同，重点是延迟、吞吐和大堆支持。",
          "线上调优通常结合 GC 日志、对象分配速率和停顿时间分析。",
        ],
        answer: [
          "先讲 GC 为什么存在和常见算法。",
          "再讲分代回收和常见收集器差异。",
          "然后说明 Full GC 触发条件。",
          "最后补充线上调优方法。",
        ],
        hint: "GC 题不要只背收集器名称，要能讲清“为什么设计成这样”。",
      },
    },
    {
      test: /IOC|Bean 的生命周期|循环依赖/i,
      insight: {
        overview: [
          "IOC 的核心是把对象创建和依赖管理交给容器，这让应用的组装方式更加解耦和可配置。",
          "面试高频点通常是 Bean 生命周期、三级缓存和循环依赖。",
        ],
        highlights: [
          "Bean 生命周期涉及实例化、属性填充、初始化、销毁等阶段。",
          "Spring 通过三级缓存解决单例 Bean 的部分循环依赖问题。",
          "构造器循环依赖通常无法直接解决，需要调整设计。",
          "IOC 不只是依赖注入，还包括生命周期和扩展点管理。",
        ],
        answer: [
          "先讲 IOC 解决的问题。",
          "再讲 Bean 生命周期和常见扩展点。",
          "然后说明三级缓存与循环依赖。",
          "最后结合项目说明 IOC 带来的解耦价值。",
        ],
        hint: "Spring IOC 题最容易拿高分的地方，是把三级缓存和循环依赖说顺。",
      },
    },
    {
      test: /AOP|Transactional|事务传播|隔离级别/i,
      insight: {
        overview: [
          "AOP 的价值在于把日志、事务、鉴权等横切逻辑从业务代码中抽离出来，而事务则是它最经典的落地场景。",
          "面试高频点通常是代理原理、事务失效和传播行为。",
        ],
        highlights: [
          "Spring AOP 常用 JDK 动态代理和 CGLIB 代理。",
          "事务失效常见原因包括自调用、异常未抛出、非 public 方法等。",
          "传播行为决定了多个事务方法嵌套调用时的边界。",
          "隔离级别主要解决脏读、不可重复读和幻读问题。",
        ],
        answer: [
          "先讲 AOP 为什么存在。",
          "再讲动态代理和事务切面的关系。",
          "然后说明事务失效常见原因。",
          "最后补传播行为和隔离级别的业务含义。",
        ],
        hint: "事务题不要只背定义，要结合一个调用链场景去解释传播行为。",
      },
    },
    {
      test: /自动配置|SpringBootApplication|Starter|配置文件/i,
      insight: {
        overview: [
          "Spring Boot 的核心价值是约定优于配置，而自动配置是这种理念的最主要实现手段。",
          "高频追问点集中在条件装配、配置优先级和 Starter 机制。",
        ],
        highlights: [
          "自动配置通过条件注解按需装配 Bean。",
          "@SpringBootApplication 通常组合了启动配置、自动配置和组件扫描。",
          "Starter 的本质是把一组依赖和自动配置打包成开箱即用能力。",
          "配置优先级决定了多环境下参数覆盖的最终结果。",
        ],
        answer: [
          "先讲 Spring Boot 解决了什么痛点。",
          "再讲自动配置是如何生效的。",
          "然后说明 Starter 和配置优先级。",
          "最后补生产环境常见实践。",
        ],
        hint: "Spring Boot 题最重要的是把“约定优于配置”和“条件装配”讲透。",
      },
    },
    {
      test: /B\+ 树|聚簇索引|二级索引|最左前缀/i,
      insight: {
        overview: [
          "MySQL 索引题的核心不是背概念，而是理解为什么 B+ 树适合磁盘场景，以及索引结构如何影响 SQL 执行路径。",
          "高频追问点集中在页结构、回表、覆盖索引和最左前缀原则。",
        ],
        highlights: [
          "B+ 树非叶子节点只存键，叶子节点存数据或主键，更适合范围查询和磁盘分页读取。",
          "聚簇索引的数据和主键在一起，二级索引叶子节点通常存主键值。",
          "联合索引要遵守最左前缀原则，否则优化器可能无法有效利用索引。",
          "覆盖索引可以减少回表，提高查询性能。",
        ],
        answer: [
          "先讲 B+ 树为什么适合做索引。",
          "再讲聚簇索引和二级索引的差异。",
          "然后说明最左前缀和覆盖索引。",
          "最后结合 SQL 优化场景说明索引设计。",
        ],
        hint: "索引题最容易得分的点，是把“数据结构 -> SQL 执行 -> 性能影响”串起来。",
      },
    },
    {
      test: /MVCC|隔离级别|间隙锁|next-key/i,
      insight: {
        overview: [
          "事务并发控制题的核心是：如何在一致性和性能之间平衡，而 MVCC 和锁机制就是 MySQL 的两类核心手段。",
          "高频追问点通常是可重复读为什么能实现、间隙锁为什么会阻塞、幻读为什么出现。",
        ],
        highlights: [
          "MVCC 通过版本链和 Read View 提供非阻塞读。",
          "隔离级别越高，读写并发能力通常越受影响。",
          "间隙锁和 next-key lock 主要用于防止幻读。",
          "当前读和快照读的行为不同，是面试里容易被追问的点。",
        ],
        answer: [
          "先讲事务要解决什么问题。",
          "再讲 MVCC 的实现思路。",
          "然后说明锁机制和隔离级别的关系。",
          "最后结合业务说明为什么会出现阻塞或死锁。",
        ],
        hint: "MySQL 事务题别怕抽象，抓住 Read View、版本链、当前读 这几个关键词就行。",
      },
    },
    {
      test: /Redis.*数据结构|ZSet|Redis 性能|RDB|AOF|主从|哨兵|Cluster|缓存穿透|击穿|雪崩|大 key|热 key|一致性/i,
      insight: {
        overview: [
          "Redis 题的主线通常是“为什么快、怎么存、怎么持久化、怎么做高可用、怎么处理缓存问题”。",
          "面试官常常会把数据结构、高可用和缓存一致性串起来连续追问。",
        ],
        highlights: [
          "Redis 单线程处理命令配合高效 IO 模型，是高性能的重要基础。",
          "不同数据结构适合不同业务模型，例如 String 做缓存、ZSet 做排行榜。",
          "RDB 和 AOF 的取舍本质是性能、恢复速度和数据丢失窗口的取舍。",
          "缓存穿透、击穿、雪崩、一致性是 Redis 最典型的业务落地题。",
        ],
        answer: [
          "先围绕当前题目说明 Redis 的核心机制。",
          "再讲业务场景、性能收益和风险点。",
          "然后说明高可用或一致性治理方法。",
          "最后补实际项目里的监控与排障策略。",
        ],
        hint: "Redis 题想拿高分，必须把“机制 + 场景 + 风险控制”一起讲出来。",
      },
    },
    {
      test: /Kafka|Consumer Group|Rebalance|ISR|消息丢失|积压|顺序/i,
      insight: {
        overview: [
          "Kafka 题的主线通常是分区、副本、消费组和可靠性，这几块构成了它的核心设计。",
          "高频追问点是顺序、丢消息、重复消息、积压和 rebalance 对业务的影响。",
        ],
        highlights: [
          "分区提升吞吐，但也带来顺序只在分区内保证的问题。",
          "ISR 机制是 Kafka 副本一致性和容错能力的关键。",
          "Consumer Group 让同一 Topic 可以被多实例并行消费。",
          "生产端 ack、重试、幂等与消费端提交 offset 共同决定消息可靠性。",
        ],
        answer: [
          "先讲 Kafka 的核心结构。",
          "再讲生产消费流程。",
          "然后说明顺序和可靠性是如何保证的。",
          "最后补积压治理和线上监控。",
        ],
        hint: "Kafka 题的高频重点是：分区、ISR、offset、rebalance、顺序与可靠性。",
      },
    },
    {
      test: /TCP|UDP|TIME_WAIT|HTTPS|HTTP|DNS|CDN|Cookie|Session|Token/i,
      insight: {
        overview: [
          "网络题最容易丢分的地方，是只背结论不讲流程；真正的答题关键是把协议交互过程讲清楚。",
          "高频追问往往会把 TCP、HTTP、认证和缓存机制串联起来。",
        ],
        highlights: [
          "TCP 关注可靠传输，UDP 关注低延迟和简单通信。",
          "HTTPS 的本质是在 HTTP 之下增加 TLS 握手和加密能力。",
          "DNS 负责把域名解析成 IP，CDN 则通过边缘缓存降低访问延迟。",
          "Cookie、Session、Token 关注的是认证态的保存位置和传递方式。",
        ],
        answer: [
          "先把核心流程讲出来，例如握手、挥手、TLS 协商。",
          "再讲协议设计背后的目的。",
          "然后说明实际业务中的使用方式。",
          "最后补常见问题和优化手段。",
        ],
        hint: "网络题不要急着背答案，先在脑子里把时序图跑一遍。",
      },
    },
    {
      test: /进程|线程|协程|虚拟内存|Page Cache|IO 多路复用|epoll|死锁|信号量/i,
      insight: {
        overview: [
          "操作系统题的主线通常是资源管理：CPU、内存、IO 和同步控制分别怎么分配和调度。",
          "高频追问点集中在上下文切换、虚拟内存、epoll 和死锁条件。",
        ],
        highlights: [
          "线程比进程轻量，但线程切换仍然需要保存和恢复上下文。",
          "虚拟内存让进程拥有独立地址空间，也配合页表提升内存利用率。",
          "epoll 通过事件驱动提升大量连接下的 IO 处理效率。",
          "死锁通常围绕互斥、占有且等待、不可抢占、循环等待四个条件展开。",
        ],
        answer: [
          "先讲操作系统想解决什么问题。",
          "再围绕当前题目讲资源管理机制。",
          "然后补系统调用或内核实现思路。",
          "最后讲业务或服务端框架中的典型应用。",
        ],
        hint: "OS 题拿分的关键是把抽象概念和真实系统表现联系起来。",
      },
    },
    {
      test: /消息队列|消息丢失|幂等|顺序|积压|死信|重试|事务消息|延迟消息/i,
      insight: {
        overview: [
          "MQ 题本质上是在问：为什么要引入异步链路，以及如何让异步链路在复杂业务里依然可靠可控。",
          "高频追问点集中在丢消息、重复消费、顺序、积压和补偿策略。",
        ],
        highlights: [
          "消息队列常见价值是解耦、削峰填谷和异步化。",
          "幂等、重试、死信和监控是业务可用性的关键。",
          "顺序消息往往要牺牲吞吐，需要明确业务是否真的要求强顺序。",
          "延迟消息和事务消息都属于业务能力增强，而不是所有系统都必须用。",
        ],
        answer: [
          "先讲 MQ 存在的价值。",
          "再讲可靠性设计。",
          "然后结合当前业务场景解释取舍。",
          "最后补监控、报警和故障恢复方案。",
        ],
        hint: "MQ 题要拿高分，必须把“技术机制”和“业务治理”一起讲。",
      },
    },
    {
      test: /系统设计|限流|熔断|降级|分布式事务|最终一致性|幂等|可观测|复盘|拆分/i,
      insight: {
        overview: [
          "系统设计题关注的不是某个中间件，而是系统在高并发、复杂链路和故障场景下如何保持稳定和可演进。",
          "高频追问点是流量治理、一致性、服务边界和故障恢复。",
        ],
        highlights: [
          "限流、熔断、降级主要解决的是系统在异常流量和依赖故障下的自我保护。",
          "分布式事务和最终一致性是性能与强一致性之间的平衡题。",
          "服务拆分不是越细越好，核心在领域边界和团队协作方式。",
          "可观测性和复盘能力决定了系统出问题后能否快速恢复。",
        ],
        answer: [
          "先讲问题背景和核心目标。",
          "再讲整体方案与关键链路。",
          "然后说明风险点、取舍和兜底方案。",
          "最后补线上治理和复盘机制。",
        ],
        hint: "系统设计题不要只讲方案名词，最好把“为什么这样设计”讲清楚。",
      },
    },
    {
      test: /SOLID|单例|工厂|建造者|策略模式|代理模式|装饰器|观察者|模板方法|责任链/i,
      insight: {
        overview: [
          "设计模式题的核心不是背定义，而是理解模式解决了什么变化点和扩展问题。",
          "高频追问点往往是模式之间的对比和实际业务场景中的应用。",
        ],
        highlights: [
          "SOLID 关注的是高内聚、低耦合和可扩展设计。",
          "创建型模式关注对象怎么创建，结构型模式关注对象怎么组合，行为型模式关注职责怎么协作。",
          "代理和装饰器经常被一起考，重点在目标是否一致以及增强方式是否透明。",
          "策略、模板方法、责任链都在解决行为变化，但抽象层次不同。",
        ],
        answer: [
          "先讲模式要解决的问题。",
          "再讲结构角色与核心协作关系。",
          "然后说明和相近模式的差异。",
          "最后补一个项目里的真实使用场景。",
        ],
        hint: "设计模式题最怕空谈，要尽量落到真实业务场景中解释。",
      },
    },
    {
      test: /作用域|闭包|this|原型|原型链|new|Promise|async|await|事件循环|防抖|节流/i,
      insight: {
        overview: [
          "JavaScript 基础题的主线通常是运行时机制：作用域、对象模型、异步模型和浏览器事件循环。",
          "高频追问点是闭包、this、Promise 链式调用和微任务宏任务执行顺序。",
        ],
        highlights: [
          "闭包本质上是函数和其词法环境的组合。",
          "this 取决于调用方式，而不是定义位置。",
          "事件循环会先执行同步任务，再处理微任务，再进入下一轮宏任务。",
          "Promise、async/await 都是组织异步流程的语法和抽象。",
        ],
        answer: [
          "先讲当前概念的定义。",
          "再讲底层执行机制。",
          "然后说明常见易错点。",
          "最后结合业务写法说明实践建议。",
        ],
        hint: "JS 基础题要把“语言机制”和“运行时顺序”讲清楚，不能只背 API。",
      },
    },
    {
      test: /any|unknown|never|interface|type|联合类型|交叉类型|泛型|keyof|infer|Partial|Pick|Omit|strict|声明/i,
      insight: {
        overview: [
          "TypeScript 题的主线是如何用类型系统提前暴露风险并提升代码可维护性。",
          "高频追问点是类型差异、泛型约束、工具类型和严格模式的价值。",
        ],
        highlights: [
          "any 会绕过类型系统，unknown 更安全，never 表示不应出现的值。",
          "interface 更偏对象结构描述，type 表达能力更灵活。",
          "泛型让函数和组件在保持约束的同时获得复用能力。",
          "工具类型本质上是对已有类型的再次组合和裁剪。",
        ],
        answer: [
          "先讲当前类型能力要解决什么问题。",
          "再讲语法和约束机制。",
          "然后结合工程场景说明价值。",
          "最后补常见滥用方式和边界。",
        ],
        hint: "TypeScript 题最好结合一个真实函数或组件类型设计来解释。",
      },
    },
    {
      test: /Webpack|Vite|Tree Shaking|Code Splitting|ESLint|Prettier|CI|CD|Source Map|缓存|监控|首屏性能/i,
      insight: {
        overview: [
          "前端工程化题的主线是提升开发效率、构建效率、上线质量和线上性能观测能力。",
          "高频追问点是构建提速、包体优化、发布流程和性能治理。",
        ],
        highlights: [
          "Webpack 偏重强大配置与生态，Vite 偏重开发阶段启动和热更新速度。",
          "Tree Shaking 和 Code Splitting 都是在控制包体和加载成本。",
          "ESLint、Prettier、TS 和测试工具共同提升代码质量基线。",
          "监控和 Source Map 是线上排障闭环的重要部分。",
        ],
        answer: [
          "先讲工程化在团队里的核心目标。",
          "再讲当前题目的关键机制。",
          "然后说明它给性能或效率带来的收益。",
          "最后补项目实践和常见坑点。",
        ],
        hint: "工程化题要多讲“为什么团队需要它”，少讲纯工具名词罗列。",
      },
    },
    {
      test: /Vue 3|Proxy|ref|reactive|computed|watch|provide|inject|KeepAlive|Pinia|Router/i,
      insight: {
        overview: [
          "Vue 3 题的主线是响应式系统、组件通信和工程化生态，其中响应式改造是最大的版本差异点。",
          "高频追问点通常是 Proxy、ref/reactive 差异、watch/computed 和状态管理。",
        ],
        highlights: [
          "Vue 3 用 Proxy 替代 defineProperty，提升了对对象和数组变化的拦截能力。",
          "ref 适合基本类型和单值引用，reactive 更适合对象响应式。",
          "computed 侧重派生值缓存，watch 侧重副作用监听。",
          "Pinia 更轻量，心智模型比 Vuex 更简单。",
        ],
        answer: [
          "先讲当前能力解决了什么问题。",
          "再讲底层机制或响应式实现。",
          "然后说明开发场景和适用边界。",
          "最后补性能与维护方面的建议。",
        ],
        hint: "Vue 题最好从“响应式 -> 组件 -> 工程实践”三层去讲。",
      },
    },
    {
      test: /React|Fiber|setState|key|useEffect|useMemo|useCallback|Hooks|Context|SSR|CSR/i,
      insight: {
        overview: [
          "React 题的主线是渲染流程、状态更新和 Hooks 机制，而 Fiber 是很多原理题的入口。",
          "高频追问点是状态更新时机、Hooks 依赖、Context 性能和 SSR 取舍。",
        ],
        highlights: [
          "Fiber 把渲染拆成可中断的工作单元，改善了长任务阻塞。",
          "setState 看起来异步，本质和批量更新、调度策略有关。",
          "Hooks 依赖数组影响副作用执行时机，是最容易出 bug 的地方。",
          "Context 使用不当会导致大范围无意义渲染。",
        ],
        answer: [
          "先讲当前机制解决了什么问题。",
          "再讲渲染或调度原理。",
          "然后说明开发中的典型坑点。",
          "最后补性能优化和工程实践。",
        ],
        hint: "React 题要尽量把“渲染流程”和“开发体验”联系起来讲。",
      },
    },
  ];

  const matched = patterns.find((item) => item.test.test(normalizedTitle));
  if (matched) {
    return matched.insight;
  }

  return {
    overview: [
      `「${normalizedTitle}」是 ${bankTopic} 题库中的核心知识点，学习时要先明确它的定义、设计目标和它真正解决了什么问题。`,
      `继续展开时，要围绕「${normalizedTitle}」的关键原理、典型场景、边界条件以及与相近概念的差异建立完整理解。`,
    ],
    highlights: [
      `围绕「${normalizedTitle}」，第一层重点是理解它的核心概念、设计目标以及它要解决的问题。`,
      `围绕「${normalizedTitle}」，关键原理、执行过程或底层结构决定了它为什么会这样工作。`,
      `围绕「${normalizedTitle}」，适用场景、限制条件和常见误区决定了它在真实项目中的边界。`,
      `把 ${normalizedTitle} 和相近方案放在一起比较，才能真正看清它的取舍与价值。`,
    ],
    answer: [
      "先给出核心结论。",
      "再解释背后的原理和机制。",
      "然后补典型场景、边界和误区。",
      "最后说明实际项目中的取舍与落地方式。",
    ],
    hint: "先把知识点本身学明白，再整理面试表达，不要把知识总结写成答题提纲。",
  };
}

/**
 * Builds natural interview follow-up questions from the current starter topic title.
 * @param {string} questionTitle Current question title.
 * @returns {string[]} Follow-up questions shown in the interview section.
 */
function buildStarterInterviewQuestions(questionTitle: string): string[] {
  const plainTitle = normalizeInsightTopicTitle(questionTitle);

  if (/有什么区别|有何区别|区别是什么/.test(plainTitle)) {
    const comparisonSubject = extractComparisonSubject(plainTitle);
    return [
      `${comparisonSubject}最核心的区别到底体现在哪些地方？`,
      "它们各自的底层实现、复杂度和性能差异是什么？",
      "如果放到真实业务场景里，分别适合什么场景？",
      "这一类对比题最容易答错的边界和误区有哪些？",
    ];
  }

  if (/为什么/.test(plainTitle)) {
    return [
      `${plainTitle}？`,
      "背后的设计目标和底层机制是什么？",
      "这样设计带来了哪些收益和代价？",
      "如果放到项目里，应该如何使用和避坑？",
    ];
  }

  if (/原理|机制|流程/.test(plainTitle)) {
    return [
      `${plainTitle}？`,
      "关键流程和核心数据结构是什么？",
      "它和相近方案相比，最大的差异和取舍是什么？",
      "真实项目里怎么落地，最容易踩什么坑？",
    ];
  }

  return [
    `面试官问「${plainTitle}」时，30 秒内应该先给出什么核心结论？`,
    `${plainTitle}背后的关键机制是什么，为什么要这样设计？`,
    `${plainTitle}在真实项目里通常怎么用，如何说明场景和取舍？`,
    `${plainTitle}最容易踩的坑、风险和边界是什么？`,
  ];
}

/**
 * Builds one starter topic content record.
 * @param {string} bankName Current bank name.
 * @param {string} bankTopic Current starter bank topic.
 * @param {string} groupTitle Current category title.
 * @param {StarterQuestionBlueprint} question Current question blueprint.
 * @returns {TopicContent} Structured starter topic content.
 */
export function buildStarterTopicContent(
  bankName: string,
  bankTopic: string,
  groupTitle: string,
  question: StarterQuestionBlueprint
): TopicContent {
  const difficultyText =
    question.difficulty === "easy" ? "简单" : question.difficulty === "hard" ? "困难" : "中等";
  const frequencyText =
    question.interviewFrequency === "high"
      ? "高频"
      : question.interviewFrequency === "medium"
        ? "中频"
        : "低频";
  const buildContext: StarterTopicBuildContext = {
    bankName,
    bankTopic,
    groupTitle,
    question,
    difficultyText,
    frequencyText,
  };
  const goldenContent = buildGoldenStarterTopicContent(buildContext);
  if (goldenContent) {
    return goldenContent;
  }

  const insight = resolveStarterInsight(bankTopic, question.title);
  const interviewQuestions = buildStarterInterviewQuestions(question.title);
  const referenceAnswer = buildStarterReferenceAnswer(question.title, insight);

  return {
    title: question.title,
    breadcrumb: [bankName, groupTitle, question.title],
    quickFacts: [
      { k: "知识点", v: question.title },
      { k: "所属模块", v: groupTitle },
      { k: "题库主题", v: bankTopic },
      { k: "难度", v: difficultyText },
      { k: "面试频率", v: frequencyText },
      { k: "学习主线", v: insight.hint },
    ],
    sections: [
      {
        id: "knowledge-summary",
        h2: "知识点总结",
        paragraphs: insight.overview,
        bullets: insight.highlights,
      },
      {
        id: "interview-highlights",
        h2: "面试常问",
        bullets: interviewQuestions,
      },
      {
        id: "reference-answer",
        h2: "参考答案和解析",
        paragraphs: referenceAnswer.paragraphs,
        bullets: referenceAnswer.bullets,
      },
    ],
  };
}

/**
 * Builds starter bank metadata from a blueprint.
 * @param {string} kbId Current bank id.
 * @param {string} topic Requested bank topic.
 * @param {StarterBankBlueprint} blueprint Starter blueprint.
 * @returns {KbInfo} Bank metadata ready for persistence.
 */
export function buildStarterBankMeta(kbId: string, topic: string, blueprint: StarterBankBlueprint): KbInfo {
  return {
    id: kbId,
    name: `${topic}题库`,
    subtitle: blueprint.subtitle,
    tags: blueprint.tags,
    updatedAt: new Date().toISOString().slice(0, 10),
    stats: { topics: 0, paths: 0 },
    description: blueprint.description,
    visibility: "public",
    cover: topic.slice(0, 1).toUpperCase(),
  };
}
