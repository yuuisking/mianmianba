import {
  resolveLearningContentTemplateType,
  type ComparisonTable,
  type InterviewContent,
  type LearningContent,
  type LearningSource,
  type SelfTest,
} from "@/lib/learning/content-contract";

type BenchmarkDocumentSeed = {
  slug: string;
  title: string;
  summary: string;
  difficulty: "easy" | "medium" | "hard";
  frequency: "high" | "medium" | "low";
  tags: string[];
  questionVariants: string[];
  keyTakeaways: string[];
  learningGoals: string[];
  plainSummary: string;
  plainRetell: string;
  strongSummary: string;
  sections: Array<{
    heading: string;
    highlight: string;
    body: string;
  }>;
  comparison?: ComparisonTable;
  codeExample?: {
    title: string;
    language: string;
    code: string;
    explanation: string;
  };
  selfTests: SelfTest[];
  essentialPoints: Array<{ point: string; why: string }>;
  bonusPoints: Array<{ point: string; why: string }>;
  advancedPoints: Array<{ point: string; why: string }>;
  deductPoints: Array<{ point: string; why: string }>;
  followUps: string[];
  answer30s: string;
  answer2min: string;
  advancedAnswer: string;
  sources: LearningSource[];
};

type BenchmarkChapterSeed = {
  slug: string;
  name: string;
  documents: BenchmarkDocumentSeed[];
};

export type BenchmarkBankSeed = {
  categorySlug: string;
  categoryName: string;
  categoryDescription: string;
  bankSlug: string;
  bankName: string;
  description: string;
  targetRole: string;
  difficulty: string;
  coverUrl?: string;
  chapters: BenchmarkChapterSeed[];
};

/**
 * 为文档补齐至少两道自测题，避免 15 分钟深读退化成只有一道展示题。
 * @param {BenchmarkDocumentSeed} doc 当前文档种子。
 * @returns {SelfTest[]} 至少两道自测题。
 */
function ensureMinimumSelfTests(doc: BenchmarkDocumentSeed): SelfTest[] {
  if (doc.selfTests.length >= 2) {
    return doc.selfTests;
  }

  if (/AQS/.test(doc.title)) {
    return [
      ...doc.selfTests,
      {
        label: "应用题",
        question:
          "你在项目里使用 ReentrantLock 时，发现很多线程处于 WAITING 状态。请结合 AQS 解释：这些线程为什么会排队？什么时候会被唤醒？被唤醒后是否一定能拿到锁？",
        hint: "从获取失败、入队、park/unpark、重新竞争四个角度回答。",
        answer:
          "ReentrantLock 基于 AQS。线程 tryAcquire 失败后，会被包装成 Node 加入 AQS 同步队列并通过 LockSupport.park 挂起；持锁线程 release 后，会唤醒后继节点，但被唤醒的线程只是重新获得竞争 state 的机会，不代表一定立刻拿到锁，竞争失败仍可能继续等待。",
        gradingCriteria: [
          { criterion: "提到获取失败后进入等待队列", points: 3, description: "说明 WAITING 的来源不是凭空发生的。" },
          { criterion: "提到 park/unpark", points: 3, description: "说明线程阻塞与唤醒机制。" },
          { criterion: "提到唤醒后仍要重新竞争", points: 2, description: "说明唤醒不等于直接拿锁。" },
          { criterion: "能联系 ReentrantLock 基于 AQS", points: 2, description: "说明不是孤立背概念。" },
        ],
      },
    ];
  }

  return [
    ...doc.selfTests,
    {
      label: "应用题",
      question: `如果把「${doc.title.replace(/[？?]+$/g, "")}」放到真实项目里，你会如何判断该方案是否合适？`,
      hint: "从适用场景、风险、监控和兜底四个角度组织回答。",
      answer: `${doc.answer2min} 如果放到线上，还要补充适用场景、风险信号、验证方式和兜底策略。`,
      gradingCriteria: [
        { criterion: "提到适用场景", points: 3, description: "说明这个知识点在什么业务条件下成立。" },
        { criterion: "提到风险或边界", points: 3, description: "说明不适合什么场景，或者会踩什么坑。" },
        { criterion: "提到监控或验证", points: 2, description: "说明如何验证方案是否有效。" },
        { criterion: "提到兜底策略", points: 2, description: "说明异常时如何降级或回退。" },
      ],
    },
  ];
}

/**
 * 为文档补一段统一的真实场景说明，帮助用户把概念迁移到业务语境中。
 * @param {BenchmarkDocumentSeed} doc 当前文档种子。
 * @returns {{ id: string; type: "text"; heading: string; body: string; highlight: string }} 场景章节。
 */
function buildScenarioSection(doc: BenchmarkDocumentSeed): {
  id: string;
  type: "text";
  heading: string;
  body: string;
  highlight: string;
} {
  if (/AQS/.test(doc.title)) {
    return {
      id: "scenario-1",
      type: "text",
      heading: "真实场景",
      body: "真实项目里你通常不会直接 new 一个 AQS 出来写业务，而是通过 ReentrantLock、Semaphore、CountDownLatch 这些 JUC 工具间接使用它。面试官问 AQS，也不是要听你背源码类名，而是想确认你能不能把 ReentrantLock 的排队、Semaphore 的许可数、CountDownLatch 的计数归零，统一映射到同一套 state + 队列 + park/unpark 骨架上。只有把这些具体同步器和 AQS 对上，你才算真正理解它为什么能成为同步器基础。",
      highlight: "AQS 的真实场景不是“直接用于业务”，而是“解释 JUC 工具为什么能那样工作”。",
    };
  }

  return {
    id: "scenario-1",
    type: "text",
    heading: "真实场景",
    body: `如果把「${doc.title.replace(/[？?]+$/g, "")}」放到真实项目里，面试官通常不是只想听定义，而是想确认你能不能把它放进具体业务链路里：它解决什么问题、在哪些场景收益最大、什么时候反而会带来风险。回答时建议至少补一段线上例子，再说明监控、验证方式和兜底思路。`,
    highlight: "先把知识点放到真实业务链路里，再谈原理和取舍，训练感会更强。",
  };
}

/**
 * 为文档生成标准图解块，优先使用人工可控的固定模板，而不是自由生成 Mermaid。
 * @param {BenchmarkDocumentSeed} doc 当前文档种子。
 * @returns {{ id: string; type: "diagram"; heading: string; highlight: string; diagramCode: string; fallbackDescription: string } | null} 图解章节。
 */
function buildDiagramSection(doc: BenchmarkDocumentSeed):
  | {
      id: string;
      type: "diagram";
      heading: string;
      highlight: string;
      diagramCode: string;
      fallbackDescription: string;
      diagramSpec?: LearningContent["article"]["sections"][number]["diagramSpec"];
    }
  | null {
  if (/B\+Tree/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "结构图解",
      highlight: "重点不是记图，而是看懂“分支度高、树更矮、叶子有序”三件事怎么同时成立。",
      diagramCode: [
        "flowchart TD",
        "  Root[根页: 存更多键与子指针]",
        "  Root --> InternalA[内部页 A]",
        "  Root --> InternalB[内部页 B]",
        "  InternalA --> LeafA1[叶子页 A1]",
        "  InternalA --> LeafA2[叶子页 A2]",
        "  InternalB --> LeafB1[叶子页 B1]",
        "  InternalB --> LeafB2[叶子页 B2]",
        "  LeafA1 --> LeafA2",
        "  LeafA2 --> LeafB1",
        "  LeafB1 --> LeafB2",
      ].join("\n"),
      fallbackDescription: "根页和内部页负责导航，叶子页负责顺序存储数据范围；叶子页之间有顺序链表，所以范围查询可以连续扫描。",
    };
  }

  if (/事务/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "流程图解",
      highlight: "事务提交不是“直接把数据页全刷盘”，而是先确保日志可恢复，再异步落盘。",
      diagramCode: [
        "flowchart LR",
        "  SQL[执行 SQL] --> Undo[写 undo log]",
        "  Undo --> Modify[修改缓冲页]",
        "  Modify --> Redo[写 redo log]",
        "  Redo --> Commit[事务提交]",
        "  Commit --> Flush[后台刷脏页]",
      ].join("\n"),
      fallbackDescription: "undo log 保证能回滚，redo log 保证提交后崩溃可恢复，真正的数据页刷盘可以稍后再做。",
    };
  }

  if (/MVCC/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "版本链图解",
      highlight: "MVCC 的本质是“历史版本 + 可见性规则”。",
      diagramCode: [
        "flowchart TD",
        "  Current[当前记录版本]",
        "  Current --> Undo2[undo 版本 2]",
        "  Undo2 --> Undo1[undo 版本 1]",
        "  ReadView[Read View 可见性规则] --> Current",
        "  ReadView --> Undo2",
        "  ReadView --> Undo1",
      ].join("\n"),
      fallbackDescription: "当前版本不可见时，事务会沿着 undo 版本链往前找，直到找到符合 Read View 规则的版本。",
    };
  }

  if (/缓存穿透/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "请求流图解",
      highlight: "缓存穿透真正危险的地方，是请求每次都能绕过缓存把数据库打穿。",
      diagramCode: [
        "flowchart LR",
        "  User[请求] --> Filter[布隆过滤器/参数校验]",
        "  Filter --> Cache[Redis 缓存]",
        "  Cache -->|miss| DB[(数据库)]",
        "  DB --> Empty[空值缓存]",
        "  Empty --> Cache",
      ].join("\n"),
      fallbackDescription: "治理通常是前置拦截 + 空值缓存 + 限流降级组合，而不是只靠一个布隆过滤器。",
    };
  }

  if (/线程池/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "任务流转图解",
      highlight: "线程池参数必须放在同一个任务流转过程里理解。",
      diagramCode: [
        "flowchart LR",
        "  Submit[提交任务] --> Core{核心线程未满?}",
        "  Core -->|是| CoreThread[创建核心线程]",
        "  Core -->|否| Queue{队列未满?}",
        "  Queue -->|是| WorkQueue[进入阻塞队列]",
        "  Queue -->|否| Max{最大线程未满?}",
        "  Max -->|是| ExtraThread[创建非核心线程]",
        "  Max -->|否| Reject[触发拒绝策略]",
      ].join("\n"),
      fallbackDescription: "先核心线程、再队列、再最大线程、最后拒绝策略，这才是线程池参数真正的理解顺序。",
    };
  }

  if (/AQS/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "AQS 获取资源流程图解",
      highlight: "AQS 的重点不是记类名，而是看懂 tryAcquire 失败后线程如何入队、挂起、被唤醒、再竞争。",
      diagramCode: [
        "flowchart TD",
        "  Acquire[线程调用 acquire] --> TryAcquire[tryAcquire 或 tryAcquireShared]",
        "  TryAcquire --> Success{获取成功?}",
        "  Success -->|是| Run[继续执行业务逻辑]",
        "  Success -->|否| Node[封装成 Node 节点]",
        "  Node --> Queue[加入 AQS 等待队列尾部]",
        "  Queue --> Park[LockSupport.park 挂起线程]",
        "  Park --> Release[前驱节点释放资源]",
        "  Release --> Unpark[unpark 后继节点]",
        "  Unpark --> Retry[再次竞争 state]",
        "  Retry --> Success",
      ].join("\n"),
      fallbackDescription: "AQS 的模板价值在于：子类只定义 state 获取/释放规则，排队、阻塞、唤醒、重新竞争都由它统一处理。",
      diagramSpec: {
        type: "flow",
        title: "AQS 获取资源流程",
        nodes: [
          { id: "acquire", label: "线程进入 AQS 获取资源流程。", shortLabel: "acquire()" },
          { id: "try", label: "调用 tryAcquire 或 tryAcquireShared 执行子类定义的资源获取逻辑。", shortLabel: "tryAcquire" },
          { id: "success", label: "判断本轮获取是否成功。", shortLabel: "获取成功?" },
          { id: "run", label: "获取成功后继续执行业务逻辑。", shortLabel: "继续执行" },
          { id: "node", label: "获取失败后把当前线程封装成 Node 节点。", shortLabel: "Node 入队" },
          { id: "queue", label: "Node 节点加入 AQS 等待队列尾部。", shortLabel: "等待队列" },
          { id: "park", label: "线程通过 LockSupport.park 挂起，避免一直忙等。", shortLabel: "park 挂起" },
          { id: "release", label: "前驱节点释放资源，后继节点获得被唤醒机会。", shortLabel: "前驱释放" },
          { id: "unpark", label: "AQS 通过 unpark 唤醒后继节点。", shortLabel: "unpark 唤醒" },
          { id: "retry", label: "被唤醒后仍要重新竞争 state，而不是直接拿到锁。", shortLabel: "重新竞争" },
        ],
        edges: [
          { from: "acquire", to: "try" },
          { from: "try", to: "success" },
          { from: "success", to: "run", label: "是" },
          { from: "success", to: "node", label: "否" },
          { from: "node", to: "queue" },
          { from: "queue", to: "park" },
          { from: "park", to: "release" },
          { from: "release", to: "unpark" },
          { from: "unpark", to: "retry" },
          { from: "retry", to: "success" },
        ],
        notes: [
          "图里只保留流程主线，长解释放到图中节点说明，避免节点文字截断。",
          "被 unpark 只是重新获得竞争机会，不代表一定已经拿到锁。",
        ],
      },
    };
  }

  if (/volatile/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "可见性图解",
      highlight: "volatile 解决的是可见性和有序性边界，不是复合操作原子性。",
      diagramCode: [
        "flowchart LR",
        "  ThreadA[线程 A 写入 volatile 变量] --> MainMemory[主内存刷新]",
        "  MainMemory --> ThreadB[线程 B 读取最新值]",
        "  ThreadA --> BarrierA[写屏障]",
        "  BarrierA --> MainMemory",
        "  MainMemory --> BarrierB[读屏障]",
        "  BarrierB --> ThreadB",
      ].join("\n"),
      fallbackDescription: "volatile 保证一个线程写入后，别的线程能及时看到最新值，但像 i++ 这样的复合操作仍可能丢失更新。",
    };
  }

  if (/类加载/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "类加载流程图",
      highlight: "类加载要和双亲委派一起看，才能说清为什么核心类边界稳定。",
      diagramCode: [
        "flowchart TD",
        "  Request[加载请求] --> Parent[先委托父加载器]",
        "  Parent --> Loaded{父加载器能否加载?}",
        "  Loaded -->|能| Done[返回 Class]",
        "  Loaded -->|不能| Child[当前加载器自己加载]",
        "  Child --> Verify[验证/准备/解析/初始化]",
      ].join("\n"),
      fallbackDescription: "默认先向上委托，父加载器加载不了再自己处理，这样核心类不会被业务侧重复定义。",
    };
  }

  if (/垃圾回收|GC/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "GC 流程图解",
      highlight: "GC 不能只背分代，要看对象如何被标记、回收、整理以及停顿控制。",
      diagramCode: [
        "flowchart LR",
        "  Roots[GC Roots] --> Mark[标记可达对象]",
        "  Mark --> Sweep[清除不可达对象]",
        "  Sweep --> Compact[整理或复制存活对象]",
        "  Compact --> Resume[恢复业务线程]",
      ].join("\n"),
      fallbackDescription: "不同收集器差别不只是分代，而是标记、清除、整理和停顿控制策略不同。",
    };
  }

  if (/内存模型|JMM/.test(doc.title)) {
    return {
      id: "diagram-1",
      type: "diagram",
      heading: "JMM 关系图解",
      highlight: "JMM 是并发语义模型，不是堆栈方法区的内存分区图。",
      diagramCode: [
        "flowchart LR",
        "  Main[主内存] <--> WorkA[线程 A 工作内存]",
        "  Main <--> WorkB[线程 B 工作内存]",
        "  WorkA --> HB[happens-before 规则]",
        "  HB --> WorkB",
      ].join("\n"),
      fallbackDescription: "JMM 规定共享变量如何在主内存与工作内存之间交互，以及哪些操作之间具备可见性顺序保证。",
    };
  }

  return null;
}

/**
 * 为没有专门代码示例的文档补一个工程化示例块。
 * @param {BenchmarkDocumentSeed} doc 当前文档种子。
 * @returns {{ title: string; language: string; code: string; explanation: string }} 代码或配置示例。
 */
function buildCodeExample(doc: BenchmarkDocumentSeed): {
  title: string;
  language: string;
  code: string;
  explanation: string;
} {
  if (doc.codeExample) {
    return doc.codeExample;
  }

  if (/缓存穿透/.test(doc.title)) {
    return {
      title: "布隆过滤器 + 空值缓存伪代码",
      language: "ts",
      code: [
        "async function queryUser(id: string) {",
        "  if (!bloomFilter.mightContain(id)) return null;",
        "  const cached = await redis.get(`user:${id}`);",
        "  if (cached !== null) return JSON.parse(cached);",
        "  const user = await db.user.findUnique({ where: { id } });",
        "  await redis.set(`user:${id}`, JSON.stringify(user), { EX: user ? 300 : 60 });",
        "  return user;",
        "}",
      ].join("\n"),
      explanation: "前置过滤 + 空值缓存的组合能显著降低不存在请求直接打库的概率。",
    };
  }

  if (/持久化/.test(doc.title)) {
    return {
      title: "AOF 刷盘策略示例",
      language: "conf",
      code: ["appendonly yes", "appendfsync everysec", "auto-aof-rewrite-percentage 100", "auto-aof-rewrite-min-size 64mb"].join("\n"),
      explanation: "线上不会只背 RDB/AOF 定义，还要说明具体刷盘策略和重写阈值如何影响丢数窗口与性能。",
    };
  }

  if (/滑动窗口/.test(doc.title)) {
    return {
      title: "Redis 滑动窗口 Lua 思路",
      language: "lua",
      code: [
        "redis.call('ZREMRANGEBYSCORE', key, 0, now - window)",
        "local count = redis.call('ZCARD', key)",
        "if count >= limit then return 0 end",
        "redis.call('ZADD', key, now, requestId)",
        "redis.call('EXPIRE', key, ttl)",
        "return 1",
      ].join("\n"),
      explanation: "把清理、计数和写入放进同一个脚本，才能保证限流判断的原子性。",
    };
  }

  if (/AQS/.test(doc.title)) {
    return {
      title: "AQS 模板方法骨架",
      language: "java",
      code: [
        "public final void acquire(int arg) {",
        "    if (!tryAcquire(arg) &&",
        "        acquireQueued(addWaiter(Node.EXCLUSIVE), arg)) {",
        "        selfInterrupt();",
        "    }",
        "}",
        "",
        "protected boolean tryAcquire(int arg) {",
        "    int state = getState();",
        "    if (state == 0 && compareAndSetState(0, arg)) {",
        "        setExclusiveOwnerThread(Thread.currentThread());",
        "        return true;",
        "    }",
        "    return false;",
        "}",
      ].join("\n"),
      explanation: "这段伪代码体现了 AQS 的模板方法思想：`acquire()` 是通用骨架，`tryAcquire()` 是子类扩展点，而 `compareAndSetState()` 则说明 state 修改依赖 CAS，而不是只靠 volatile。",
    };
  }

  if (/线程池/.test(doc.title)) {
    return {
      title: "ThreadPoolExecutor 显式配置示例",
      language: "java",
      code: [
        "new ThreadPoolExecutor(",
        "  8,",
        "  16,",
        "  60L, TimeUnit.SECONDS,",
        "  new ArrayBlockingQueue<>(200),",
        "  new ThreadPoolExecutor.CallerRunsPolicy()",
        ");",
      ].join("\n"),
      explanation: "核心线程、队列、最大线程和拒绝策略必须一起看，才知道线程池真正会怎么扩张。",
    };
  }

  if (/volatile/.test(doc.title)) {
    return {
      title: "volatile 不能保证 i++ 原子性",
      language: "java",
      code: ["private volatile int counter = 0;", "", "public void increment() {", "  counter++;", "}"].join("\n"),
      explanation: "虽然 `counter` 可见，但 `counter++` 仍包含读、改、写三个步骤，会发生竞争覆盖。",
    };
  }

  if (/类加载/.test(doc.title)) {
    return {
      title: "获取类加载器链路示例",
      language: "java",
      code: [
        "ClassLoader loader = String.class.getClassLoader();",
        "System.out.println(loader); // Bootstrap -> null",
        "System.out.println(App.class.getClassLoader());",
      ].join("\n"),
      explanation: "通过实际打印类加载器链路，更容易理解为什么核心类不能被应用侧随便覆盖。",
    };
  }

  if (/垃圾回收|GC/.test(doc.title)) {
    return {
      title: "JVM GC 日志参数示例",
      language: "bash",
      code: "java -Xms2g -Xmx2g -Xlog:gc*:file=gc.log:time,level,tags -jar app.jar",
      explanation: "GC 回答最好能顺手补一个线上怎么观察和验证的参数例子，而不只是背概念。",
    };
  }

  if (/内存模型|JMM/.test(doc.title)) {
    return {
      title: "双重检查单例中的 volatile",
      language: "java",
      code: [
        "private static volatile Instance instance;",
        "",
        "public static Instance getInstance() {",
        "  if (instance == null) {",
        "    synchronized (Instance.class) {",
        "      if (instance == null) instance = new Instance();",
        "    }",
        "  }",
        "  return instance;",
        "}",
      ].join("\n"),
      explanation: "这个例子最能解释 JMM、指令重排和 happens-before 为什么不是抽象口号。",
    };
  }

  return {
    title: "工程落地示例",
    language: "text",
    code: `围绕「${doc.title.replace(/[？?]+$/g, "")}」补一个真实项目例子，说明输入条件、关键机制、监控指标和异常兜底。`,
    explanation: "如果一篇深读没有任何代码、命令或配置示例，用户很难把知识点迁移到真实环境里。",
  };
}

/**
 * 为文档补一段工程落地说明，避免正文停留在定义和原理层。
 * @param {BenchmarkDocumentSeed} doc 当前文档种子。
 * @returns {{ id: string; type: "text"; heading: string; body: string; highlight: string }} 工程章节。
 */
function buildEngineeringSection(doc: BenchmarkDocumentSeed): {
  id: string;
  type: "text";
  heading: string;
  body: string;
  highlight: string;
} {
  if (/AQS/.test(doc.title)) {
    return {
      id: "engineering-1",
      type: "text",
      heading: "工程落地",
      body: "在真实项目里，AQS 更像“理解 JUC 工具行为的底层地图”，而不是让你日常直接继承后写业务同步器。你需要理解它，是为了看懂 ReentrantLock 为什么会让线程排队、Semaphore 为什么能限制并发许可、CountDownLatch 为什么要等 state 归零后一起放行，以及排查线程 dump 时 WAITING、TIMED_WAITING、parking 这些状态背后到底卡在了哪一段同步链路。只有在非常特殊的框架型场景下，才会考虑自己基于 AQS 实现同步器。",
      highlight: "AQS 的工程价值主要体现在“理解和排查 JUC 工具”，而不是“业务里直接采用 AQS 方案”。",
    };
  }

  return {
    id: "engineering-1",
    type: "text",
    heading: "工程落地",
    body: `真正上线时，围绕「${doc.title.replace(/[？?]+$/g, "")}」至少要补三个问题：第一，什么业务指标会推动你采用这个方案；第二，采用后要监控什么风险信号；第三，异常情况下如何降级、回滚或排查。这样回答才能从“知道概念”升级到“真的会用”。`,
    highlight: "面试里的高分点，往往来自“指标、风险、监控、兜底”这四个工程关键词。",
  };
}

/**
 * 为文档补一个常见误区块，让用户知道这道题最容易答歪在哪里。
 * @param {BenchmarkDocumentSeed} doc 当前文档种子。
 * @returns {{ id: string; type: "mistake"; heading: string; highlight: string; mistake: { mistake: string; whyWrong: string; correct: string } }} 误区章节。
 */
function buildMistakeSection(doc: BenchmarkDocumentSeed): {
  id: string;
  type: "mistake";
  heading: string;
  highlight: string;
  mistake: {
    mistake: string;
    whyWrong: string;
    correct: string;
  };
} {
  if (/AQS/.test(doc.title)) {
    return {
      id: "mistake-1",
      type: "mistake",
      heading: "常见误区",
      highlight: "AQS 这题最容易丢分的，不是没听过，而是把框架、锁、队列和唤醒关系答混了。",
      mistake: {
        mistake: "把 AQS 直接说成“就是可重入锁”或“线程被唤醒就一定拿到锁”。",
        whyWrong:
          "这样会把抽象层级答乱。AQS 是同步器基础框架，不是某个具体锁；而且线程被 unpark 后只是重新获得竞争 state 的机会，依然可能再次失败并继续排队。",
        correct:
          "更好的答法是：先说 AQS 提供 `state + CLH 风格等待队列 + park/unpark + 模板方法`，再分别举 ReentrantLock、Semaphore、CountDownLatch 映射到不同 state 语义，最后补一句被唤醒后仍要重新 tryAcquire。",
      },
    };
  }

  const firstDeductPoint = doc.deductPoints[0];
  return {
    id: "mistake-1",
    type: "mistake",
    heading: "常见误区",
    highlight: "这类题最容易失分的，不是完全不会，而是只说了一半。",
    mistake: {
      mistake: firstDeductPoint?.point ?? "只背定义，不讲边界和工程取舍。",
      whyWrong: firstDeductPoint?.why ?? "如果只停留在定义层，面试官无法判断你是否真的理解它在真实系统中的作用和限制。",
      correct: `更好的回答方式是：先给结论，再补原理、场景、边界、风险和真实项目表达，把「${doc.title.replace(/[？?]+$/g, "")}」讲完整。`,
    },
  };
}

/**
 * 根据题目和内容类型生成更贴题的对比模块提示文案，避免残留模板话术。
 * @param {BenchmarkDocumentSeed} doc 当前文档种子。
 * @returns {string} 对比模块的高亮提示。
 */
function buildComparisonHighlight(doc: BenchmarkDocumentSeed): string {
  if (/AQS/.test(doc.title)) {
    return "本节重点：AQS 的复用能力来自 state 语义可定制，而同一套队列和唤醒骨架可以支撑不同同步器。";
  }
  if (/区别|对比|差异|vs|和.+有什么区别/.test(doc.title)) {
    return "本节重点：对比不是罗列名词，而是帮你说清“核心差异、适用场景和取舍边界”。";
  }
  return "本节重点：把关键机制放到一张表里，用户才能快速看懂定义、原理和落地差异。";
}

/**
 * 将基准文档种子定义转换为学习内容。
 * @param {BenchmarkDocumentSeed} doc 文档种子定义。
 * @returns {LearningContent} 标准化学习内容。
 */
function buildLearningContent(doc: BenchmarkDocumentSeed): LearningContent {
  const ensuredSelfTests = ensureMinimumSelfTests(doc);
  const diagramSection = buildDiagramSection(doc);
  const codeExample = buildCodeExample(doc);
  const hasExplicitMistakeSection = doc.sections.some((section) => /误区|常见坑|坑点/.test(section.heading));

  return {
    templateType: resolveLearningContentTemplateType(doc.title),
    examPoint: doc.title,
    summary: doc.summary,
    quickCard: {
      keyPoints: doc.keyTakeaways.slice(0, 4).map((item, index) => ({
        number: index + 1,
        title: `核心点 ${index + 1}`,
        summary: item,
      })),
      interviewAnswer: doc.answer30s,
    },
    selfTests: ensuredSelfTests,
    sources: doc.sources,
    article: {
      conclusion: doc.summary,
      keyTakeaways: doc.keyTakeaways,
      learningGoals: doc.learningGoals,
      plainSummary: doc.plainSummary,
      plainRetell: doc.plainRetell,
      strongSummary: doc.strongSummary,
      sections: [
        buildScenarioSection(doc),
        ...doc.sections.map((section, index) => ({
          id: `text-${index + 1}`,
          type: "text" as const,
          heading: section.heading,
          body: section.body,
          highlight: section.highlight,
        })),
        ...(doc.comparison
          ? [
              {
                id: "comparison-1",
                type: "comparison" as const,
                heading: doc.comparison.title,
                highlight: buildComparisonHighlight(doc),
                comparison: doc.comparison,
              },
            ]
          : []),
        ...(diagramSection ? [diagramSection] : []),
        {
          id: "code-1",
          type: "code" as const,
          heading: codeExample.title,
          highlight: "代码、命令或配置示例用于把抽象概念和运行结果对齐。",
          codeExample,
        },
        buildEngineeringSection(doc),
        ...(hasExplicitMistakeSection ? [] : [buildMistakeSection(doc)]),
      ],
    },
  };
}

/**
 * 将基准文档种子定义转换为训练内容。
 * @param {BenchmarkDocumentSeed} doc 文档种子定义。
 * @returns {InterviewContent} 标准化训练内容。
 */
function buildInterviewContent(doc: BenchmarkDocumentSeed): InterviewContent {
  return {
    question: doc.title,
    questionVariants: doc.questionVariants,
    answer30s: doc.answer30s,
    answer2min: doc.answer2min,
    advancedAnswer: doc.advancedAnswer,
    essentialPoints: doc.essentialPoints,
    bonusPoints: doc.bonusPoints,
    advancedPoints: doc.advancedPoints,
    deductPoints: doc.deductPoints,
    followUps: doc.followUps.map((item) => ({ question: item })),
  };
}

export type PreparedBenchmarkDocument = BenchmarkDocumentSeed & {
  learningContent: LearningContent;
  interviewContent: InterviewContent;
};

/**
 * 获取首批标杆题库种子数据。
 * @returns {Array<BenchmarkBankSeed & { chapters: Array<BenchmarkChapterSeed & { documents: PreparedBenchmarkDocument[] }> }>} 完整标杆数据。
 */
export function getBenchmarkBanks(): Array<
  BenchmarkBankSeed & { chapters: Array<BenchmarkChapterSeed & { documents: PreparedBenchmarkDocument[] }> }
> {
  const banks: BenchmarkBankSeed[] = [
    {
      categorySlug: "database",
      categoryName: "数据库",
      categoryDescription: "数据库与存储引擎专题。",
      bankSlug: "mysql-core",
      bankName: "MySQL 核心专题",
      description: "围绕索引、事务与 MVCC 的系统化学习文档。",
      targetRole: "Java 后端",
      difficulty: "intermediate",
      chapters: [
        {
          slug: "mysql-index",
          name: "索引与存储",
          documents: [
            {
              slug: "mysql-b-plus-tree",
              title: "MySQL 为什么选择 B+Tree 作为索引底层结构？",
              summary: "MySQL 选择 B+Tree 的关键，不只是查找复杂度，而是它同时兼顾了磁盘 IO、范围查询和叶子节点顺序访问。",
              difficulty: "hard",
              frequency: "high",
              tags: ["MySQL", "索引", "B+Tree"],
              questionVariants: ["为什么 MySQL 索引底层用 B+Tree 而不是红黑树？", "B+Tree 为什么比 BTree 更适合数据库索引？"],
              keyTakeaways: [
                "数据库索引首先是外存数据结构，单次磁盘 IO 成本远高于内存比较。",
                "B+Tree 非叶子节点只存键，单页能容纳更多分支，因此树高更低。",
                "叶子节点天然有序，范围查询和排序扫描非常友好。",
                "理解 B+Tree 必须同时讲随机查找、范围查询和页读取。 ",
              ],
              learningGoals: [
                "理解 B+Tree 的页组织方式和树高优势。",
                "能解释它相比红黑树、哈希索引的适用边界。",
                "能把范围查询、排序和回表场景讲顺。 ",
              ],
              plainSummary: "一句话说，MySQL 选 B+Tree 不是因为它看起来高级，而是因为数据库的数据在磁盘里，B+Tree 能更少地读盘，还方便做范围查询。",
              plainRetell: "如果让我复述，我会先说数据库索引是磁盘结构，然后讲 B+Tree 非叶子节点更瘦、树更矮，最后补范围查询和顺序扫描为什么需要叶子链表。",
              strongSummary: "B+Tree 的本质优势是“更低的树高 + 更强的范围访问能力”，这两个能力才让它适合数据库索引。",
              sections: [
                {
                  heading: "一、先从磁盘 IO 出发，而不是只盯时间复杂度",
                  highlight: "索引底层结构首先要解决“少读盘”，不是单纯的比较次数。",
                  body: "数据库索引和算法课里的平衡树最大差别在于：前者的数据页在磁盘，后者通常默认在内存。如果一次磁盘随机读取就要付出远高于内存访问的代价，那么“树高”会直接决定查询要读多少次页。B+Tree 的设计核心，就是尽量让一页装下更多分支，把树高压低。 ",
                },
                {
                  heading: "二、为什么不是红黑树",
                  highlight: "红黑树适合内存查找，但分支度低，树高会随数据量明显增长。",
                  body: "红黑树每个节点通常只容纳一个键和有限指针，面对百万级数据时树会非常高。数据库如果用它做磁盘索引，就意味着一次查询要经历更多页访问。相比之下，B+Tree 每个节点能放大量键和子指针，分支度高得多，同样数据量下树高通常只有 2 到 4 层。 ",
                },
                {
                  heading: "三、为什么不是哈希索引",
                  highlight: "哈希擅长等值查找，但天然不适合范围查询和排序。",
                  body: "哈希索引能快速命中某个键，但它打散了顺序，无法高效支持 `>、<、between、order by` 这类操作。而数据库业务里，范围查询、排序、前缀匹配都非常常见，所以数据库默认索引必须支持“按顺序读”，这正是 B+Tree 的优势。 ",
                },
              ],
              comparison: {
                title: "B+Tree 与常见候选结构对比",
                headers: ["结构", "优势", "短板", "适用判断"],
                rows: [
                  ["B+Tree", "树高低、范围查询强、叶子顺序访问好", "实现复杂度高于普通平衡树", "数据库默认首选"],
                  ["红黑树", "内存操作简单、旋转成本可控", "树高更高，磁盘 IO 次数更多", "更适合内存容器"],
                  ["哈希索引", "等值查找快", "不支持顺序与范围", "只适合特定等值场景"],
                ],
              },
              codeExample: {
                title: "典型范围查询示例",
                language: "sql",
                code: "EXPLAIN SELECT * FROM orders WHERE created_at BETWEEN '2026-05-01' AND '2026-05-07' ORDER BY created_at;",
                explanation: "如果 `created_at` 上存在 B+Tree 索引，优化器可以沿着叶子节点顺序扫描范围，避免额外排序。",
              },
              selfTests: [
                {
                  question: "为什么数据库索引更在意树高，而不是单次比较常数？",
                  hint: "从磁盘页读取成本去想。",
                  gradingCriteria: [
                    { criterion: "提到磁盘 IO", points: 4, description: "说明页读取是主要成本。" },
                    { criterion: "提到树高", points: 3, description: "说明树高决定访问层数。" },
                    { criterion: "提到分支度", points: 3, description: "说明 B+Tree 节点能容纳更多键。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "数据库索引是外存结构，核心目标是减少磁盘 IO。", why: "这是选择 B+Tree 的前提。" },
                { point: "B+Tree 非叶子节点不存完整记录，分支度更高、树更矮。", why: "这是它比红黑树更适合磁盘索引的关键。" },
                { point: "叶子节点有序链表让范围查询和排序扫描更高效。", why: "这是哈希索引做不到的。" },
              ],
              bonusPoints: [
                { point: "补充聚簇索引和二级索引都基于 B+Tree，但叶子内容不同。", why: "说明对 InnoDB 落地有认知。" },
              ],
              advancedPoints: [
                { point: "能把页大小、扇出、树高和回表成本一起讲清楚。", why: "这是高阶理解的体现。" },
              ],
              deductPoints: [
                { point: "只背“时间复杂度更低”", why: "忽略了数据库最关键的磁盘场景。" },
                { point: "说哈希索引可以替代所有场景", why: "没有理解范围查询和排序需求。" },
              ],
              followUps: ["聚簇索引和二级索引的叶子节点分别存什么？", "为什么联合索引还涉及最左前缀原则？"],
              answer30s: "MySQL 默认选 B+Tree，是因为数据库索引首先要解决磁盘 IO 成本。B+Tree 分支度高、树高低，查询时读盘次数少，而且叶子节点有序，范围查询和排序都很友好。",
              answer2min: "如果展开讲，我会先强调数据库索引是磁盘结构，核心不是比较次数而是页访问次数。B+Tree 非叶子节点只存键和值域信息，所以一页能放更多分支，树高更低。其次，叶子节点天然有序并通过链表相连，支持范围查询、排序扫描和顺序访问。相比之下，红黑树树高更高，哈希索引不支持范围查询，所以 MySQL 默认索引更适合用 B+Tree。",
              advancedAnswer: "更深入一点，还可以补充 InnoDB 的页大小、扇出和树高之间的关系，以及聚簇索引和二级索引在 B+Tree 叶子节点存储内容上的差异，这些才是面试里真正拉开差距的地方。",
              sources: [
                { title: "MySQL 8.0 Reference Manual - InnoDB Indexes", url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-index-types.html", type: "official" },
              ],
            },
            {
              slug: "mysql-covering-index",
              title: "MySQL 覆盖索引和回表到底该怎么讲？",
              summary: "覆盖索引的本质不是一个新索引类型，而是查询字段刚好都能从索引里拿到，从而避免二次回表读取主键记录。",
              difficulty: "medium",
              frequency: "high",
              tags: ["MySQL", "覆盖索引", "回表"],
              questionVariants: ["什么是覆盖索引，为什么它通常更快？", "回表为什么会拖慢查询？"],
              keyTakeaways: [
                "覆盖索引说的是查询能否只依赖索引本身返回结果，而不是一种独立索引结构。",
                "回表意味着先走二级索引，再根据主键回到聚簇索引取完整记录。",
                "覆盖索引的收益来自减少随机 IO 和减少主键记录访问次数。",
              ],
              learningGoals: ["理解覆盖索引与回表的关系。", "能把二级索引、聚簇索引和回表链路讲清楚。", "能判断什么时候值得为覆盖索引调整字段设计。"],
              plainSummary: "覆盖索引快，不是因为它更神秘，而是因为查一次索引就够了，不用再跑回主表翻第二遍。",
              plainRetell: "我会先解释二级索引叶子节点存的是什么，再讲为什么查不到全部字段时要回表，最后补覆盖索引为什么能省一次随机访问。",
              strongSummary: "覆盖索引的高分回答，核心是“查询路径变短了”，而不是只背一句“避免回表”。",
              sections: [
                {
                  heading: "一、为什么会有回表",
                  highlight: "二级索引叶子节点通常只保存索引列和主键，不会天然带上整行记录。",
                  body: "在 InnoDB 里，如果查询先走二级索引，叶子节点里往往只能拿到索引列和主键值。如果 SQL 还需要别的列，就得再根据主键回到聚簇索引查一次完整记录，这个动作就是回表。真正拖慢查询的，不只是“多一步”，而是这一步常常意味着额外随机访问。",
                },
                {
                  heading: "二、覆盖索引到底覆盖了什么",
                  highlight: "覆盖的不是表，而是当前 SQL 需要返回、过滤、排序的那些列。",
                  body: "如果一条 SQL 的过滤列、排序列和查询返回列都能在同一个索引里拿到，那么执行器就不必再回到聚簇索引拿整行记录，这就是覆盖索引。它不是新结构，只是当前查询恰好能被某个索引完整支撑。",
                },
                {
                  heading: "三、为什么覆盖索引通常更快",
                  highlight: "它减少了主键回查次数，所以在大量随机读场景里收益会非常明显。",
                  body: "对于命中很多行的数据查询来说，如果每命中一条二级索引记录都要再回主键索引取一次整行，随机 IO 和 Buffer Pool 压力都会上来。覆盖索引把结果直接从索引里拿出来，路径更短、页访问更少，因此在分页、列表查询、只查少数字段时特别常见。",
                },
              ],
              selfTests: [
                {
                  question: "为什么说覆盖索引快的关键不只是“用了索引”，而是“少了一次回表”？",
                  hint: "从二级索引叶子节点存储内容和额外主键回查去想。",
                  gradingCriteria: [
                    { criterion: "提到二级索引叶子节点不存整行", points: 4, description: "说明回表为什么会出现。" },
                    { criterion: "提到需要按主键再查聚簇索引", points: 3, description: "说明额外读取链路。" },
                    { criterion: "提到覆盖索引可减少随机 IO", points: 3, description: "说明性能收益来源。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "覆盖索引不是新结构，而是当前 SQL 所需列都能从索引直接拿到。", why: "这是概念核心。" },
                { point: "回表发生在二级索引无法提供完整字段时。", why: "这是执行路径关键。" },
                { point: "覆盖索引的收益来自减少主键回查和随机 IO。", why: "这是性能本质。" },
              ],
              bonusPoints: [{ point: "能补 select * 为什么更容易破坏覆盖索引。", why: "体现 SQL 习惯和索引命中关系。" }],
              advancedPoints: [{ point: "能结合索引下推、分页列表和联合索引讲覆盖收益。", why: "体现执行计划视角。" }],
              deductPoints: [{ point: "把覆盖索引说成一种特殊索引类型", why: "概念层级答错。" }],
              followUps: ["为什么很多查询一写成 `select *` 就不容易走覆盖索引？", "联合索引如何同时兼顾过滤、排序和覆盖？"],
              answer30s: "覆盖索引的意思是当前 SQL 需要的列都能从索引本身拿到，所以执行器不用再根据主键回表查整行记录。它快的关键不是“用了索引”这么简单，而是少了一次主键回查和额外随机 IO。",
              answer2min: "如果展开讲，我会先说 InnoDB 二级索引叶子节点通常只存索引列和主键值，所以当 SQL 需要别的字段时，就必须根据主键再回聚簇索引查一次整行，这就是回表。覆盖索引不是新结构，而是某个现有索引刚好把这条 SQL 需要的字段都覆盖了，于是结果可以直接从索引返回。这样查询路径更短，尤其命中很多行时，能明显减少随机 IO 和 Buffer Pool 压力。",
              advancedAnswer: "更深入时，我会补为什么列表页、分页页、只查少数字段的 SQL 特别适合优化成覆盖索引，以及 `select *`、索引列顺序、排序字段这些因素为什么会破坏覆盖效果。",
              sources: [{ title: "MySQL 8.0 Reference Manual - Optimizer Access Methods", url: "https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html", type: "official" }],
            },
          ],
        },
        {
          slug: "mysql-transaction",
          name: "事务与并发控制",
          documents: [
            {
              slug: "mysql-transaction",
              title: "MySQL 事务的四大特性是怎么落地的？",
              summary: "ACID 不是四个口号，InnoDB 通过 redo log、undo log、锁和崩溃恢复机制把它们真正实现出来。",
              difficulty: "medium",
              frequency: "high",
              tags: ["MySQL", "事务", "ACID"],
              questionVariants: ["事务 ACID 分别怎么在 InnoDB 里实现？"],
              keyTakeaways: [
                "原子性依赖 undo log 回滚未完成修改。",
                "持久性依赖 redo log 和刷盘策略。",
                "隔离性依赖锁、MVCC 和隔离级别控制。",
                "一致性是前几项机制共同作用的结果，而不是单独一层技术。 ",
              ],
              learningGoals: ["能把 ACID 对应到真实底层机制。", "能区分 redo/undo 的职责。", "能解释隔离性为何与锁和 MVCC 一起出现。 "],
              plainSummary: "事务不是背 ACID 缩写，而是要知道每个字母靠什么机制兜住。",
              plainRetell: "复述时我会把 ACID 逐个翻译成底层机制：undo 管回滚，redo 管恢复，锁和 MVCC 管隔离，一致性是最终结果。",
              strongSummary: "事务真正的高分回答，不是定义，而是 ACID 和底层日志、锁、恢复机制的一一映射。",
              sections: [
                {
                  heading: "一、原子性为什么要靠 undo log",
                  highlight: "原子性解决的是“要么全成，要么全回滚”。",
                  body: "事务执行中如果中途失败，数据库需要把已经改过的数据恢复到事务开始前的状态。InnoDB 通过 undo log 记录修改前镜像，回滚时就能按链条把数据撤回去，因此事务不会留下“只执行了一半”的脏状态。 ",
                },
                {
                  heading: "二、持久性为什么离不开 redo log",
                  highlight: "持久性并不是“提交后立刻所有数据页都写盘”，而是先保证崩溃后能恢复。",
                  body: "如果每次提交都同步把所有脏页刷回磁盘，事务吞吐会非常差。InnoDB 的做法是先顺序写 redo log，保证提交结果可恢复，之后再异步刷脏页。系统崩溃后可以通过 redo log 重做已提交事务的修改。 ",
                },
                {
                  heading: "三、隔离性为什么既要锁也要 MVCC",
                  highlight: "锁和 MVCC 分别解决不同读写冲突，不是二选一关系。",
                  body: "只靠锁会让并发性能非常差，只靠 MVCC 又无法处理所有写写冲突。InnoDB 通常用 MVCC 优化读，减少读写互斥；再用行锁、间隙锁等机制处理修改冲突和幻读问题。隔离级别本质上就是在一致性和并发度之间做权衡。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么说一致性不是一项单独的底层实现？",
                  hint: "想想它和原子性、持久性、隔离性的关系。",
                  gradingCriteria: [
                    { criterion: "提到一致性是结果", points: 4, description: "不是单一组件独立负责。" },
                    { criterion: "提到日志/锁/MVCC 协同", points: 3, description: "说明多机制共同作用。" },
                    { criterion: "提到业务约束", points: 3, description: "可补充约束和逻辑也会影响一致性。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "undo log 保障回滚，支撑原子性。", why: "这是事务回撤基础。" },
                { point: "redo log 保证崩溃恢复，支撑持久性。", why: "提交不等于所有数据页立即刷盘。" },
                { point: "隔离性依赖锁、MVCC 和隔离级别共同实现。", why: "说明不是单一机制。" },
              ],
              bonusPoints: [{ point: "能补充两阶段提交与 binlog 的关系。", why: "说明理解 MySQL 事务提交过程。" }],
              advancedPoints: [{ point: "能解释刷盘策略和性能取舍。", why: "体现工程视角。" }],
              deductPoints: [{ point: "把一致性说成只靠锁保证", why: "理解不完整。" }],
              followUps: ["redo log 和 binlog 有什么关系？", "为什么 `innodb_flush_log_at_trx_commit` 会影响性能和可靠性？"],
              answer30s: "MySQL 的 ACID 不是空概念。原子性靠 undo log 回滚，持久性靠 redo log 做崩溃恢复，隔离性靠锁和 MVCC 配合隔离级别实现，一致性则是这些机制一起保证事务前后数据处于合法状态。",
              answer2min: "展开讲时，我会先说原子性解决的是失败后怎么撤销，所以依赖 undo log；持久性解决的是提交后宕机怎么办，所以依赖 redo log 和刷盘策略；隔离性解决并发事务互相影响，因此既要锁，也要 MVCC 和隔离级别；一致性不是单独一项技术，而是前面这些机制和业务约束共同生效后的最终结果。",
              advancedAnswer: "如果面试官继续追，我会补两阶段提交、redo 与 binlog 的协作，以及刷盘时机、崩溃恢复和性能权衡，这样事务回答才算真正完整。",
              sources: [{ title: "MySQL 8.0 Reference Manual - InnoDB and ACID", url: "https://dev.mysql.com/doc/refman/8.0/en/mysql-acid.html", type: "official" }],
            },
            {
              slug: "mysql-mvcc",
              title: "MySQL 的 MVCC 是怎么工作的？",
              summary: "MVCC 通过 undo log、隐藏字段和 Read View 让读操作看到合适的版本，从而减少读写互斥。",
              difficulty: "hard",
              frequency: "high",
              tags: ["MySQL", "MVCC", "Read View"],
              questionVariants: ["MVCC 的 Read View 里到底放了什么？"],
              keyTakeaways: [
                "MVCC 解决的是并发读如何在不加锁的情况下看到合适版本。",
                "undo log 形成版本链，Read View 决定当前事务能看到哪个版本。",
                "快照读和当前读要分开说，MVCC 主要服务快照读。",
              ],
              learningGoals: ["理解版本链和 Read View。", "区分快照读与当前读。", "能解释 RC 与 RR 的 MVCC 差异。"],
              plainSummary: "MVCC 的核心就是：一份数据不只看当前值，还要看当前事务到底“应该看到哪个历史版本”。",
              plainRetell: "复述时我会按“隐藏字段 -> undo 版本链 -> Read View 可见性规则 -> 快照读/当前读”这条线讲。",
              strongSummary: "MVCC 不是魔法，它本质上是“多版本数据 + 可见性规则”的组合。",
              sections: [
                {
                  heading: "一、为什么需要 MVCC",
                  highlight: "没有 MVCC，读和写容易因为锁而互相阻塞。",
                  body: "如果每次查询都必须等待写事务释放锁，数据库在高并发下会很快卡住。MVCC 的目标，是让查询尽可能读取一个合法的历史版本，而不是总盯着最新值，从而减少读写冲突。 ",
                },
                {
                  heading: "二、版本链和隐藏字段怎么配合",
                  highlight: "版本链负责保存历史，Read View 负责判断哪个历史可见。",
                  body: "InnoDB 行记录里有事务 ID 等隐藏字段，更新时会把旧值写进 undo log，形成版本链。查询时，如果当前版本对当前事务不可见，就顺着版本链往前找，直到找到符合 Read View 规则的版本。 ",
                },
                {
                  heading: "三、为什么快照读和当前读必须分清",
                  highlight: "快照读主要走 MVCC；当前读要看最新数据，因此会结合锁。",
                  body: "`select` 普通查询通常是快照读，可以利用 MVCC 读取历史版本；`select ... for update`、`update`、`delete` 属于当前读，目标是读到最新可修改的数据，所以会涉及锁。很多面试回答混乱，就是把这两类读混成一类了。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么说 MVCC 主要服务于快照读？",
                  hint: "对比普通 select 和 for update。",
                  gradingCriteria: [
                    { criterion: "提到快照读读历史版本", points: 4, description: "说明 MVCC 的目标。" },
                    { criterion: "提到当前读读最新值", points: 3, description: "说明当前读通常要加锁。" },
                    { criterion: "提到冲突减少", points: 3, description: "说明并发收益。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "undo log 形成版本链。", why: "没有版本链就无历史版本可读。" },
                { point: "Read View 决定当前事务能看见哪些事务版本。", why: "这是可见性规则核心。" },
                { point: "MVCC 主要优化快照读，不等于所有读都不加锁。", why: "这是常见误区。" },
              ],
              bonusPoints: [{ point: "补充 RC 和 RR 创建 Read View 的时机不同。", why: "这是深度差异。" }],
              advancedPoints: [{ point: "能解释为什么 MVCC 不能完全解决幻读，需要间隙锁补充。", why: "说明隔离级别理解完整。" }],
              deductPoints: [{ point: "说 MVCC 完全不需要锁", why: "忽略了当前读和幻读处理。" }],
              followUps: ["Read View 里通常有哪些关键事务 ID？", "为什么 RR 下同一事务内多次快照读结果通常一致？"],
              answer30s: "MVCC 的核心是多版本并发控制。InnoDB 通过 undo log 保存旧版本，通过隐藏字段记录事务信息，再用 Read View 判断当前事务能看到哪个版本，这样普通查询就不必总和写操作抢锁。",
              answer2min: "展开讲时，我会先说更新会把旧值写进 undo log，形成版本链；行记录里还带事务 ID 等隐藏字段。事务做快照读时会生成或复用 Read View，根据事务 ID 判断当前版本是否可见，不可见就沿着 undo 链往前找合适版本。这样读写冲突大幅减少。但如果是当前读，比如 for update，就还是要看最新版本并配合锁。",
              advancedAnswer: "更深入时，还要补 RC 和 RR 的 Read View 创建时机差异，以及为什么 MVCC 不能单独解决幻读，需要间隙锁等机制协同。",
              sources: [{ title: "MySQL 8.0 Reference Manual - InnoDB Multi-Versioning", url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-multi-versioning.html", type: "official" }],
            },
            {
              slug: "mysql-gap-lock",
              title: "MySQL 为什么在 RR 下还要用间隙锁防幻读？",
              summary: "MVCC 解决了大部分快照读一致性，但当前读和范围更新场景仍可能出现幻读，所以 RR 还需要间隙锁和 Next-Key Lock 补位。",
              difficulty: "hard",
              frequency: "high",
              tags: ["MySQL", "间隙锁", "RR", "幻读"],
              questionVariants: ["MVCC 不是已经解决并发读了吗，为什么还要间隙锁？", "Next-Key Lock 到底锁住了什么？"],
              keyTakeaways: [
                "MVCC 主要服务快照读，不等于所有读写冲突都自动消失。",
                "幻读常出现在范围查询配合插入、更新、删除的当前读场景。",
                "间隙锁和 Next-Key Lock 的目标，是防止满足范围条件的新记录插进来。",
              ],
              learningGoals: ["理解幻读与不可重复读的区别。", "理解 MVCC 和间隙锁为什么要协同。", "能讲清 Next-Key Lock 的基本含义。"],
              plainSummary: "RR 下还有间隙锁，不是因为 MVCC 没用，而是因为有人可能趁你处理中间那段范围时，又插进来一条新记录。",
              plainRetell: "我会先区分快照读和当前读，再讲幻读为什么主要出现在范围当前读里，最后补间隙锁和 Next-Key Lock 的作用。",
              strongSummary: "间隙锁的高分回答，要把“MVCC 解决什么”和“锁还要补什么”分层讲清楚。",
              sections: [
                {
                  heading: "一、为什么 RR 不能只靠 MVCC",
                  highlight: "MVCC 让快照读更稳定，但它不负责拦住所有新插入。",
                  body: "在 RR 隔离级别下，普通快照读通常能通过一致性视图看到稳定结果，但如果当前事务执行的是 `select ... for update`、`update`、`delete` 这种当前读，目标是读取并锁定最新可修改的数据，这时就不能只靠历史版本链。否则别的事务仍可能往这个范围里插入新记录，导致你再次读取时出现幻读。",
                },
                {
                  heading: "二、间隙锁到底锁的是什么",
                  highlight: "它锁的不是现有行本身，而是索引记录之间的空档。",
                  body: "如果当前事务对某个索引范围做当前读，为了防止别的事务往这个范围里插新值，InnoDB 会对索引间隙加锁。很多人误以为间隙锁只锁已有记录，其实它真正要防的是“还不存在但可能插进来的那条记录”。",
                },
                {
                  heading: "三、Next-Key Lock 为什么经常一起出现",
                  highlight: "它本质上是“记录锁 + 间隙锁”的组合。",
                  body: "在范围条件下，InnoDB 常用 Next-Key Lock 把命中的索引记录和前后间隙一起纳入保护范围。这样既能锁住当前读到的记录，又能阻止别的事务在中间插入满足条件的新记录，从而把幻读风险压下去。",
                },
              ],
              selfTests: [
                {
                  question: "为什么说间隙锁主要是在补 MVCC 覆盖不到的当前读场景？",
                  hint: "先分清快照读和当前读，再说幻读出现在哪类操作里。",
                  gradingCriteria: [
                    { criterion: "提到 MVCC 主要服务快照读", points: 4, description: "说明两者不是互斥关系。" },
                    { criterion: "提到当前读或 for update/update/delete", points: 3, description: "说明间隙锁主要生效场景。" },
                    { criterion: "提到防止范围内插入新记录", points: 3, description: "说明幻读来源。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "MVCC 主要解决快照读一致性，不等于幻读自动消失。", why: "这是分层前提。" },
                { point: "间隙锁防的是范围内新记录插入。", why: "这是它的直接目标。" },
                { point: "Next-Key Lock 常是记录锁和间隙锁的组合。", why: "这是面试常追问点。" },
              ],
              bonusPoints: [{ point: "能补唯一索引等值命中时为什么锁范围可能缩小。", why: "体现锁粒度理解。" }],
              advancedPoints: [{ point: "能结合索引条件、无索引扫描和死锁风险谈间隙锁副作用。", why: "体现工程视角。" }],
              deductPoints: [{ point: "把间隙锁说成 MVCC 的一部分", why: "把多版本和锁机制混层。" }],
              followUps: ["Next-Key Lock 和记录锁有什么区别？", "为什么很多死锁分析都会看到间隙锁？"],
              answer30s: "RR 下还要间隙锁，是因为 MVCC 主要保证快照读一致性，但当前读和范围更新时，别的事务仍可能往范围内插新记录，导致幻读。间隙锁和 Next-Key Lock 就是用来把这段索引空档也保护起来。",
              answer2min: "如果展开讲，我会先说普通快照读主要靠 MVCC 和 Read View 保证一致性，但像 `select ... for update`、`update`、`delete` 这种当前读要操作最新数据，不能只看历史版本。此时如果事务读取了一个范围，别的事务又在这个范围里插入新记录，就会出现幻读。所以 InnoDB 会通过间隙锁锁住索引空档，再用 Next-Key Lock 把记录本身和相邻间隙一起保护起来。",
              advancedAnswer: "更深入时，我会继续补唯一索引命中时锁范围的变化、没有合适索引时锁会变粗，以及间隙锁为什么容易带来并发下降和死锁分析复杂度。",
              sources: [{ title: "MySQL 8.0 Reference Manual - InnoDB Locking", url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html", type: "official" }],
            },
          ],
        },
      ],
    },
    {
      categorySlug: "middleware",
      categoryName: "中间件",
      categoryDescription: "缓存与中间件专题。",
      bankSlug: "redis-core",
      bankName: "Redis 核心专题",
      description: "围绕缓存防护、持久化和限流的系统化学习文档。",
      targetRole: "Java 后端",
      difficulty: "intermediate",
      chapters: [
        {
          slug: "cache-defense",
          name: "缓存防护",
          documents: [
            {
              slug: "redis-cache-penetration",
              title: "Redis 缓存穿透为什么会压垮数据库，应该怎么治理？",
              summary: "缓存穿透的本质是大量查询打在“本来就不存在的数据”上，缓存无法命中，数据库却被持续穿透。",
              difficulty: "medium",
              frequency: "high",
              tags: ["Redis", "缓存穿透", "布隆过滤器"],
              questionVariants: ["缓存穿透、击穿、雪崩有什么区别？"],
              keyTakeaways: [
                "缓存穿透针对的是不存在的数据，而不是热点 Key 失效。",
                "空值缓存和布隆过滤器是最常见的两层防线。",
                "治理方案必须结合误判率、内存成本和一致性策略。",
              ],
              learningGoals: ["理解穿透场景成因。", "区分穿透、击穿、雪崩。", "掌握布隆过滤器和空值缓存的组合策略。"],
              plainSummary: "缓存穿透最麻烦的点不在缓存，而在请求总能穿过缓存直打数据库，因为查询的是根本不存在的数据。",
              plainRetell: "如果让我回答，我会先区分穿透、击穿、雪崩，再讲空值缓存和布隆过滤器是怎么挡住不存在请求的。",
              strongSummary: "缓存穿透治理的关键，不是“加个 Redis 就好”，而是尽量在数据库前面识别并拦住无效请求。",
              sections: [
                {
                  heading: "一、缓存穿透为什么危险",
                  highlight: "不存在的数据天然不会命中缓存，但数据库却得次次兜底。",
                  body: "如果攻击者或异常流量持续请求根本不存在的 userId、orderId，缓存每次都 miss，数据库每次都要查一次。短时间内大量此类请求会让数据库连接数、CPU、磁盘命中都被无意义消耗。 ",
                },
                {
                  heading: "二、最常见的两层防线",
                  highlight: "第一层是空值缓存，第二层是布隆过滤器。",
                  body: "空值缓存适合把“不存在”也缓存一小段时间，避免相同请求反复打库；布隆过滤器则更靠前，它提前判断某个 Key 大概率是否存在，不存在的请求直接拦住。二者并不冲突，经常一起使用。 ",
                },
                {
                  heading: "三、治理时为什么不能只说布隆过滤器",
                  highlight: "任何治理方案都要回答误判、一致性和运维复杂度。",
                  body: "布隆过滤器会有误判率，数据新增后也要同步更新；空值缓存虽然简单，但会引入短时脏窗口。因此真正治理时，要根据业务读写特征、数据增长速度和可接受误判率综合选型，而不是把某个技术当银弹。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么布隆过滤器能挡穿透，但不能完全替代缓存？",
                  hint: "想想它能做什么，不能做什么。",
                  gradingCriteria: [
                    { criterion: "提到只判断存在概率", points: 4, description: "说明它不是值缓存。" },
                    { criterion: "提到有误判率", points: 3, description: "说明不能绝对依赖。" },
                    { criterion: "提到还要配合缓存/数据库", points: 3, description: "说明完整治理链路。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "缓存穿透查询的是本来就不存在的数据。", why: "这是和击穿、雪崩的根本区别。" },
                { point: "空值缓存和布隆过滤器是常见治理组合。", why: "这是最常见工程解法。" },
                { point: "方案选择要讲误判率、一致性和内存成本。", why: "体现工程思维。" },
              ],
              bonusPoints: [{ point: "补充网关参数校验、限流也能减少恶意穿透。", why: "说明治理链路完整。" }],
              advancedPoints: [{ point: "能讲清布隆过滤器更新策略和误判影响。", why: "体现落地深度。" }],
              deductPoints: [{ point: "把缓存穿透和缓存击穿混为一谈", why: "基础概念不清。" }],
              followUps: ["布隆过滤器为什么会误判？", "空值缓存 TTL 应该怎么定？"],
              answer30s: "缓存穿透是大量请求查询根本不存在的数据，缓存永远 miss，数据库却会持续被打。常见治理是空值缓存加布隆过滤器：前者缓存“不存在”，后者在更前面拦截大概率不存在的 Key。",
              answer2min: "如果展开讲，我会先区分缓存穿透、击穿和雪崩。穿透针对的是不存在数据，所以 Redis 没法自然命中，数据库每次都要兜底。治理通常用两层防线：空值缓存减少重复查询，布隆过滤器前移拦截无效请求。同时还要考虑误判率、数据更新同步和内存成本，不能只机械地说“加布隆过滤器”。",
              advancedAnswer: "再深入一点，我会补网关参数校验、限流、降级，以及热点恶意穿透场景下如何做多层防护，这样回答才更像线上治理经验。",
              sources: [{ title: "Redis 官方文档", url: "https://redis.io/docs/latest/", type: "official" }],
            },
            {
              slug: "redis-breakdown-snowball",
              title: "Redis 缓存击穿和雪崩为什么不能混着答？",
              summary: "缓存击穿针对的是热点 Key 在失效瞬间被并发打穿，雪崩针对的是大量 Key 同时失效或 Redis 整体不可用，两者的风险范围和治理思路完全不同。",
              difficulty: "medium",
              frequency: "high",
              tags: ["Redis", "缓存击穿", "缓存雪崩"],
              questionVariants: ["缓存击穿、雪崩和穿透到底怎么区分？", "热点 Key 失效时为什么数据库会被瞬间打爆？"],
              keyTakeaways: [
                "击穿是单个热点 Key 失效后的并发回源问题。",
                "雪崩是大面积 Key 同时失效或缓存层整体故障导致的系统性问题。",
                "击穿治理偏向单 Key 保护，雪崩治理偏向分散风险和系统兜底。",
              ],
              learningGoals: ["能区分击穿、雪崩和穿透。", "理解热点回源为什么危险。", "能给出对应治理链路。"],
              plainSummary: "击穿像一扇热门门突然坏了，所有人都挤向后面的数据库；雪崩则像整排门一起坏了，整个缓存层都挡不住流量。",
              plainRetell: "我会先把击穿、雪崩、穿透三件事拆开，再讲热点 Key 保护和大面积失效治理为什么不是同一套方案。",
              strongSummary: "缓存问题能不能答高分，关键不是背词，而是把问题范围和治理粒度讲对。",
              sections: [
                {
                  heading: "一、击穿和雪崩的问题范围完全不同",
                  highlight: "击穿看单个热点，雪崩看大面积缓存层失守。",
                  body: "缓存击穿通常发生在某个访问量极高的热点 Key 刚好过期时，大量并发请求同时回源，数据库瞬间被一类查询打爆。缓存雪崩则是大量 Key 在同一时间失效，或者 Redis 整体故障，导致大量请求一起冲向后端，它影响的是系统层级而不是单一热点。",
                },
                {
                  heading: "二、为什么治理方案不能照抄",
                  highlight: "击穿强调热点保护，雪崩强调错峰、降级和多级兜底。",
                  body: "击穿常见做法是热点永不过期、互斥重建、单飞请求或本地缓存兜底，目标是把某个热点 Key 的重建过程串行化。雪崩则要考虑 TTL 打散、多级缓存、熔断限流、降级返回和 Redis 高可用，因为你面对的是大量 Key 同时失效或者缓存层整体不可用。",
                },
                {
                  heading: "三、为什么很多回答会失分",
                  highlight: "因为把“范围”和“治理粒度”答混了。",
                  body: "如果把击穿、雪崩都回答成“加锁、加布隆过滤器、加 Redis”，面试官会马上发现你没有理解问题边界。真正高分的回答，必须能明确指出：穿透针对不存在数据，击穿针对单热点失效，雪崩针对大面积缓存失守。",
                },
              ],
              selfTests: [
                {
                  question: "为什么说缓存击穿和雪崩的治理重点不是一个层级？",
                  hint: "一个偏单 Key，一个偏系统层。",
                  gradingCriteria: [
                    { criterion: "提到击穿是单热点失效", points: 4, description: "说明问题粒度。" },
                    { criterion: "提到雪崩是大面积失效或缓存层不可用", points: 3, description: "说明问题范围。" },
                    { criterion: "提到治理策略不同", points: 3, description: "说明不能混答。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "击穿针对单热点 Key 失效后的并发回源。", why: "这是问题定义。" },
                { point: "雪崩针对大量 Key 同时失效或缓存层整体不可用。", why: "这是问题范围。" },
                { point: "击穿偏热点保护，雪崩偏错峰、限流、降级和高可用。", why: "这是治理分层。" },
              ],
              bonusPoints: [{ point: "能把穿透一起带上并说明它查的是不存在数据。", why: "体现体系感。" }],
              advancedPoints: [{ point: "能补本地缓存、单飞、熔断限流和 Redis 高可用链路。", why: "体现工程闭环。" }],
              deductPoints: [{ point: "把击穿和雪崩都回答成“就是缓存失效”", why: "没有边界意识。" }],
              followUps: ["热点 Key 为什么常配互斥重建？", "为什么雪崩治理要刻意打散 TTL？"],
              answer30s: "缓存击穿和雪崩不能混着答，因为击穿是单个热点 Key 失效后的并发回源，雪崩则是大量 Key 同时失效或缓存层整体不可用。前者重点是保护热点重建，后者重点是错峰、限流、降级和高可用。",
              answer2min: "如果展开讲，我会先把三件事分开：穿透查不存在数据，击穿是热点 Key 失效，雪崩是大面积失效或缓存层故障。击穿危险在于大量并发同时打同一个热点回源，所以常用互斥重建、热点永不过期、本地缓存等手段；雪崩则要考虑 TTL 打散、多级缓存、熔断限流、降级返回和 Redis 高可用，因为它影响的是系统整体承压能力。",
              advancedAnswer: "更深入时，我会继续补热点预热、单飞请求、哨兵或集群高可用，以及故障演练如何验证雪崩治理链路是否真的有效。",
              sources: [{ title: "Redis 官方文档", url: "https://redis.io/docs/latest/", type: "official" }],
            },
          ],
        },
        {
          slug: "redis-persistence-and-rate-limit",
          name: "持久化与限流",
          documents: [
            {
              slug: "redis-persistence",
              title: "Redis 持久化为什么要同时理解 RDB 和 AOF？",
              summary: "RDB 和 AOF 不是替代关系，而是恢复速度、数据完整性和运行开销之间的取舍。",
              difficulty: "medium",
              frequency: "high",
              tags: ["Redis", "持久化", "RDB", "AOF"],
              questionVariants: ["RDB 和 AOF 有什么区别，线上怎么选？"],
              keyTakeaways: [
                "RDB 是快照型持久化，恢复快，但可能丢最后一段数据。",
                "AOF 是命令追加型持久化，可控制更小的数据丢失窗口，但文件更大。",
                "线上通常不是二选一，而是结合恢复目标和性能预算。 ",
              ],
              learningGoals: ["理解 RDB/AOF 各自原理。", "能回答线上怎么配。", "能说明 rewrite 与刷盘策略影响。"],
              plainSummary: "Redis 持久化不是只记两个缩写，而是要知道你到底更在意恢复速度，还是更在意少丢数据。",
              plainRetell: "我会先讲 RDB 快照、AOF 追加，再说线上通常会组合使用，而不是只背哪个更好。",
              strongSummary: "Redis 持久化的高分回答，核心是“恢复速度、数据完整性、系统开销”的三角取舍。",
              sections: [
                {
                  heading: "一、RDB 的优点和代价",
                  highlight: "RDB 更像定期拍快照，恢复速度快。",
                  body: "RDB 会在某个时间点把内存数据整体快照到磁盘，文件紧凑、恢复快，适合做冷备和快速恢复。但它是时间点快照，因此最后一次快照之后的写入如果还没落盘，宕机时就会丢。 ",
                },
                {
                  heading: "二、AOF 的优点和代价",
                  highlight: "AOF 记录写命令，数据丢失窗口更可控。",
                  body: "AOF 会把写命令追加到日志中，重启时通过重放命令恢复数据。它通常比 RDB 更能减少数据丢失窗口，但文件会更大，重放恢复也更慢，因此需要结合 rewrite 和刷盘策略控制膨胀与性能开销。 ",
                },
                {
                  heading: "三、线上为什么经常两者并用",
                  highlight: "两者组合，是为了同时兼顾恢复速度和可靠性。",
                  body: "只靠 RDB，可能丢的数据更多；只靠 AOF，恢复时间和文件膨胀压力更大。很多线上场景会同时开启 RDB 和 AOF，优先用更完整的 AOF 恢复，再用 RDB 兜底冷备或加快某些恢复流程。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么说 AOF 数据更完整，但不代表一定优于 RDB？",
                  gradingCriteria: [
                    { criterion: "提到恢复慢", points: 3, description: "说明重放命令成本。" },
                    { criterion: "提到文件膨胀", points: 3, description: "说明需要 rewrite。" },
                    { criterion: "提到系统开销", points: 4, description: "说明要结合刷盘策略权衡。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "RDB 是快照，恢复快但数据窗口更大。", why: "这是基本差异。" },
                { point: "AOF 是追加写命令，数据更完整但恢复与体积代价更高。", why: "这是选型核心。" },
                { point: "线上经常组合使用，而不是教条二选一。", why: "体现真实工程实践。" },
              ],
              bonusPoints: [{ point: "能补 `appendfsync` 策略差异。", why: "体现落地细节。" }],
              advancedPoints: [{ point: "能讲 AOF rewrite 为什么不等于重放所有历史命令。", why: "体现深入理解。" }],
              deductPoints: [{ point: "说 AOF 一定不丢数据", why: "忽略刷盘策略。" }],
              followUps: ["`appendfsync everysec` 为什么常被认为是折中方案？", "AOF rewrite 为什么能减小文件体积？"],
              answer30s: "Redis 持久化要同时理解 RDB 和 AOF。RDB 是快照，恢复快但可能丢最后一段数据；AOF 记录写命令，数据更完整但文件更大、恢复更慢。线上常常结合使用，而不是简单二选一。",
              answer2min: "如果展开讲，我会先说明 RDB 是定期快照，适合快速恢复和冷备，但最后一次快照之后的数据可能丢失；AOF 通过追加写命令把数据变化记录下来，通常能把丢失窗口控制得更小，不过会带来日志膨胀和重放恢复成本。线上配置要看业务容忍的数据丢失窗口和恢复目标，很多系统会把 RDB 和 AOF 配合起来使用。",
              advancedAnswer: "更深入时，我会补 `appendfsync always/everysec/no` 的差异，AOF rewrite 如何压缩历史命令，以及高写入业务下磁盘 IO 与恢复时间的权衡。",
              sources: [{ title: "Redis Persistence", url: "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/", type: "official" }],
            },
            {
              slug: "redis-sliding-window",
              title: "Redis 滑动窗口限流为什么比固定窗口更平滑？",
              summary: "滑动窗口限流通过更细粒度地统计时间窗口内的请求分布，避免固定窗口在边界时刻出现突刺。",
              difficulty: "medium",
              frequency: "medium",
              tags: ["Redis", "限流", "滑动窗口"],
              questionVariants: ["滑动窗口和固定窗口限流有什么区别？"],
              keyTakeaways: [
                "固定窗口容易在窗口边界前后放过两波请求。",
                "滑动窗口更关注最近一段时间的真实流量分布。",
                "Redis 常用 ZSet 或 Lua 保证窗口统计与清理原子性。 ",
              ],
              learningGoals: ["理解固定窗口缺陷。", "理解滑动窗口原理。", "知道 Redis 里常见实现方式。"],
              plainSummary: "滑动窗口比固定窗口更平滑，因为它不是死盯自然时间段，而是盯住“最近这段时间到底来了多少请求”。",
              plainRetell: "回答时我会先举固定窗口边界放量的例子，再讲滑动窗口如何更真实地统计最近 N 秒请求。",
              strongSummary: "限流算法的价值不只是挡请求，更在于让流量控制更接近真实业务节奏。",
              sections: [
                {
                  heading: "一、固定窗口为什么会有突刺",
                  highlight: "窗口边界是固定窗口最大的漏洞。",
                  body: "假设每分钟最多 100 次请求，如果某个客户端在 00:59 打满 100 次，在 01:00 又立刻打满 100 次，虽然看起来没超过规则，但短短几秒内实际已经冲进了 200 次请求。这就是固定窗口的边界突刺问题。 ",
                },
                {
                  heading: "二、滑动窗口怎么解决这个问题",
                  highlight: "它统计的是“最近一段时间”，不是自然切分段。",
                  body: "滑动窗口会持续检查最近 60 秒内的请求数量，而不是只看当前自然分钟。所以即使请求跨过分钟边界，只要仍在最近 60 秒内，它们就会一起被统计，从而让限流更加平滑。 ",
                },
                {
                  heading: "三、Redis 里怎么做",
                  highlight: "ZSet + 时间戳是很常见的工程落地方式。",
                  body: "常见做法是把请求时间戳作为 score 写进 ZSet，每次先清理窗口外的旧请求，再统计窗口内数量，最后决定是否放行。为了避免并发竞争和多步操作不一致，通常会配合 Lua 脚本把清理、计数、写入做成原子流程。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么滑动窗口限流比固定窗口更平滑？",
                  gradingCriteria: [
                    { criterion: "提到边界突刺", points: 4, description: "说明固定窗口缺陷。" },
                    { criterion: "提到最近时间段统计", points: 3, description: "说明滑动窗口原理。" },
                    { criterion: "提到 Redis 实现", points: 3, description: "说明工程落地。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "固定窗口在边界时刻容易放过两波突刺请求。", why: "这是对比起点。" },
                { point: "滑动窗口统计的是最近一段时间的真实请求数量。", why: "这是它更平滑的根本原因。" },
                { point: "Redis 常用 ZSet + Lua 做原子限流。", why: "这是常见工程解法。" },
              ],
              bonusPoints: [{ point: "能补令牌桶/漏桶适用场景差异。", why: "说明限流算法视野更完整。" }],
              advancedPoints: [{ point: "能讲 Redis 单点与热点 key 的扩展治理。", why: "体现线上视角。" }],
              deductPoints: [{ point: "只讲理论，不提 Redis 原子实现", why: "缺乏工程落地。" }],
              followUps: ["为什么限流实现里经常会用 Lua？", "滑动窗口和令牌桶在用户体验上有什么差异？"],
              answer30s: "固定窗口的问题是边界突刺，同一批请求可能在两个自然窗口里都被放过。滑动窗口统计的是最近 N 秒内真实请求数，所以限流更平滑。Redis 里通常会用 ZSet 记录时间戳，再用 Lua 脚本做清理、计数和写入。",
              answer2min: "展开讲时，我会先举固定窗口的边界突刺问题，再说明滑动窗口不是按自然分钟统计，而是动态看最近 60 秒。这样跨边界的请求也会被一起统计，更接近真实流量情况。工程上常用 Redis ZSet 存时间戳，请求到来时先清理窗口外数据，再统计窗口内数量，最后决定是否放行，通常再用 Lua 保证操作原子性。",
              advancedAnswer: "如果继续追问，我会补为什么有些高并发场景会改用令牌桶，以及 Redis 热点 key、分布式限流一致性和脚本执行成本这些落地点。",
              sources: [{ title: "Redis Sorted Sets", url: "https://redis.io/docs/latest/develop/data-types/sorted-sets/", type: "official" }],
            },
            {
              slug: "redis-distributed-lock",
              title: "Redis 分布式锁为什么经常翻车？",
              summary: "Redis 分布式锁的风险不在于 setnx 这个命令本身，而在于过期时间、误删、续期、主从切换和业务执行时长这些边界条件经常被忽略。",
              difficulty: "hard",
              frequency: "high",
              tags: ["Redis", "分布式锁", "Redisson"],
              questionVariants: ["Redis 分布式锁怎么做才算相对可靠？", "为什么 setnx + expire 很容易出问题？"],
              keyTakeaways: [
                "分布式锁不是只要抢到了就结束，释放和续期同样关键。",
                "锁值必须唯一，释放时要校验 owner，避免误删别人的锁。",
                "单 Redis 实现和高可用、主从切换之间存在天然边界。",
              ],
              learningGoals: ["理解 Redis 锁的基本实现链路。", "理解误删、锁过期和主从切换风险。", "能说明 Redisson 这类方案解决了什么，没解决什么。"],
              plainSummary: "Redis 分布式锁最容易翻车的点，不是抢不到锁，而是你以为自己还持有锁，结果它早过期了，或者你把别人的锁删了。",
              plainRetell: "我会先讲 `set nx px` 和唯一 value，再讲误删、自动过期、续期和主从切换这些坑，最后补为什么线上常直接用 Redisson。",
              strongSummary: "分布式锁的高分回答，不是写出命令，而是把边界条件和失效模式说清楚。",
              sections: [
                {
                  heading: "一、最基础的正确姿势是什么",
                  highlight: "获取锁要原子，释放锁要验身份。",
                  body: "Redis 分布式锁最常见的基础写法是 `SET key value NX PX ttl`，其中 `value` 不能是固定字符串，而应是当前请求唯一标识。这样释放锁时，必须先判断当前 value 还是不是自己，再决定删除，否则就可能误删别人后来加上的锁。",
                },
                {
                  heading: "二、为什么它经常翻车",
                  highlight: "业务执行时间、锁过期和误删是最常见事故源。",
                  body: "如果业务执行时间超过 TTL，锁可能已经自动过期，别的线程拿到新锁后，你这边还在继续执行；如果释放锁时没有校验 owner，又会把别人新拿到的锁删掉。很多事故不是加锁失败，而是“锁已经不属于你，你却还以为它属于你”。",
                },
                {
                  heading: "三、为什么高可用场景还要更谨慎",
                  highlight: "主从切换和异步复制会让单点锁语义变得更复杂。",
                  body: "即使单机 Redis 上逻辑正确，放到主从架构里，如果主节点刚写入锁还没同步到从节点就挂了，新的主节点上可能根本没有这把锁，从而出现多个客户端都以为自己加锁成功的情况。所以面试里要明确：Redis 锁能做很多业务互斥，但它不是没有边界的强一致分布式锁。",
                },
              ],
              selfTests: [
                {
                  question: "为什么释放 Redis 分布式锁时一定要校验 value，而不是直接 del？",
                  hint: "想想锁过期后被别人重新拿走的场景。",
                  gradingCriteria: [
                    { criterion: "提到 value 要唯一", points: 3, description: "说明锁 owner 识别。" },
                    { criterion: "提到锁可能过期后被别人拿走", points: 4, description: "说明误删来源。" },
                    { criterion: "提到释放要原子校验并删除", points: 3, description: "说明 Lua 或原子脚本必要性。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "获取锁要用原子 `SET NX PX`，并带唯一 value。", why: "这是基础前提。" },
                { point: "释放锁前必须校验 owner，避免误删。", why: "这是最常见事故点。" },
                { point: "Redis 分布式锁有 TTL、续期和主从切换边界。", why: "这是高分分水岭。" },
              ],
              bonusPoints: [{ point: "能补 watchdog 自动续期或 Redisson 的价值。", why: "体现工程经验。" }],
              advancedPoints: [{ point: "能讨论单 Redis 锁、RedLock 和业务幂等等替代策略的取舍。", why: "体现边界意识。" }],
              deductPoints: [{ point: "把 Redis 锁说成绝对可靠的强一致锁", why: "忽略分布式系统前提。" }],
              followUps: ["为什么很多实现都用 Lua 脚本释放锁？", "Redisson 的 watchdog 解决了什么问题？"],
              answer30s: "Redis 分布式锁经常翻车，不是因为 setnx 不能用，而是很多实现忽略了唯一 value、锁过期、误删和主从切换这些边界。正确做法至少要用 `SET NX PX` 原子加锁，释放时校验 owner，再考虑续期和高可用风险。",
              answer2min: "如果展开讲，我会先说基础做法是 `SET key uniqueValue NX PX ttl`，其中 value 要唯一，释放锁时要通过 Lua 等原子方式校验 value 再删除，避免误删别人的锁。其次要考虑业务执行时间可能超过 TTL，需要自动续期或合理超时设计。再往上就是主从复制和故障切换带来的语义风险，所以 Redis 锁适合很多业务互斥场景，但不能把它神化成无边界的强一致分布式锁。",
              advancedAnswer: "更深入时，我会补 Redisson watchdog、主从切换导致的双持锁风险，以及为什么很多核心业务最终会把幂等、状态机和数据库约束一起作为互斥兜底。",
              sources: [{ title: "Redis Distributed Locks", url: "https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/", type: "official" }],
            },
          ],
        },
      ],
    },
    {
      categorySlug: "java-concurrency",
      categoryName: "Java 并发",
      categoryDescription: "并发与线程调度专题。",
      bankSlug: "java-concurrency-core",
      bankName: "Java 并发核心专题",
      description: "围绕 AQS、线程池与 volatile 的系统化学习文档。",
      targetRole: "Java 后端",
      difficulty: "advanced",
      chapters: [
        {
          slug: "sync-framework",
          name: "同步原语",
          documents: [
            {
              slug: "java-aqs",
              title: "AQS 为什么能成为 Java 并发包的同步器基础？",
              summary: "AQS 的关键不在于它实现了某一种锁，而在于它把同步器共有的 state、等待队列、阻塞唤醒和模板方法抽成了统一骨架。",
              difficulty: "hard",
              frequency: "high",
              tags: ["Java 并发", "AQS", "ReentrantLock"],
              questionVariants: [
                "AQS 的核心思想是什么？",
                "AQS 为什么能同时支撑 ReentrantLock、Semaphore 和 CountDownLatch？",
              ],
              keyTakeaways: [
                "AQS 的核心不是“某把锁”，而是一个 `volatile state` 加上一条 CLH 风格等待队列。",
                "state 的具体含义由子类定义，而修改 state 往往依赖 CAS 保证并发安全。",
                "获取失败的线程会被封装成 Node 节点入队，并通过 park/unpark 完成阻塞与唤醒。",
                "ReentrantLock、Semaphore、CountDownLatch 都是在复用这套模板骨架，只是 state 语义不同。",
              ],
              learningGoals: [
                "理解 state、CAS 和等待队列为什么能抽成同步器公共骨架。",
                "能区分独占模式和共享模式，并映射到 ReentrantLock、Semaphore、CountDownLatch。",
                "能解释 park/unpark、模板方法和“唤醒后重新竞争”这条完整流程。",
              ],
              plainSummary: "AQS 不是一把锁，而是一套让很多并发工具都能共用的底层模板。",
              plainRetell:
                "如果让我复述，我会先说 AQS 统一抽出了 state、排队、阻塞和唤醒，再举 ReentrantLock、Semaphore、CountDownLatch 说明它为什么能被很多同步器复用。",
              strongSummary:
                "AQS 真正厉害的地方，不是把“锁”写出来，而是把同步器最难复用的 state 语义、排队、阻塞、唤醒和模板方法沉淀成了一套标准骨架。",
              sections: [
                {
                  heading: "一、AQS 到底在解决什么重复问题",
                  highlight: "很多同步器业务语义不同，但底层都逃不开“竞争失败后排队、阻塞、唤醒、再竞争”这条公共链路。",
                  body:
                    "ReentrantLock、Semaphore、CountDownLatch 看起来像三类完全不同的工具，但它们底层都会遇到类似问题：线程先尝试获取同步资源，失败后不能空转自旋太久，需要进入等待队列；等前驱线程释放资源后，再被唤醒重新竞争。AQS 把这条重复链路抽出来，让上层同步器不必每次都从零实现队列、阻塞和唤醒流程。",
                },
                {
                  heading: "二、为什么说 state 是同步语义的载体",
                  highlight: "AQS 不关心你是不是锁，它只关心 state 到底表示什么，以及什么时候允许线程修改它。",
                  body:
                    "在 ReentrantLock 里，state 可以表示锁是否被持有以及重入次数；在 Semaphore 里，state 表示剩余许可数；在 CountDownLatch 里，state 表示还剩多少次 countDown 才能放行。AQS 之所以能支撑不同同步器，关键就在于它把“同步语义”统一映射成 state 的变化规则。AQS 自己不规定 state 的业务含义，而是把它当成所有同步器都能复用的载体。",
                },
                {
                  heading: "三、为什么讲 AQS 一定要补 CAS",
                  highlight: "只有 volatile 还不够，因为多个线程会并发争抢 state，真正改 state 时通常靠 CAS。",
                  body:
                    "AQS 内部的 state 是 `volatile int`，它先解决可见性问题，让线程能看到最新状态；但只靠 volatile 还不能保证并发修改安全，因为多个线程可能同时尝试把 state 从 0 改成 1。AQS 提供 `compareAndSetState()` 这类 CAS 能力，让线程用原子方式修改同步状态。比如 ReentrantLock 抢锁，本质上就是多个线程竞争把 state 从 0 CAS 成 1，谁改成功谁拿到锁。",
                },
                {
                  heading: "四、获取失败后，线程在 AQS 里经历了什么",
                  highlight: "AQS 队列不是普通 List，而是一条双向等待队列，线程会被包装成 Node 入队并 park 挂起。",
                  body:
                    "线程调用 `acquire` 后，会先执行 `tryAcquire` 或 `tryAcquireShared`。如果失败，AQS 会把线程封装成 Node 节点加入同步队列尾部，再通过 `LockSupport.park` 挂起，避免线程一直忙等。当前驱节点释放资源后，AQS 会 `unpark` 后继节点，让它重新尝试获取 state。这里最容易答错的一点是：线程被唤醒不代表一定拿到锁，它只是再次获得竞争机会，失败了仍可能继续排队。",
                },
                {
                  heading: "五、独占模式和共享模式为什么都能复用 AQS",
                  highlight: "AQS 复用的不是“锁语义”，而是“获取资源失败后的控制骨架”。",
                  body:
                    "独占模式下一次只允许一个线程成功获取资源，典型代表是 ReentrantLock；共享模式则允许多个线程按规则同时获取资源，典型代表是 Semaphore 和 CountDownLatch。对 Semaphore 来说，只要 state 还大于 0，就可能有多个线程陆续获取许可；对 CountDownLatch 来说，等待线程并不是去占有资源，而是等 state 递减到 0 后一起放行。正因为 AQS 把“state + 队列 + park/unpark”做成了骨架，所以独占和共享两种模式都能在这套模板上生长出来。",
                },
                {
                  heading: "六、为什么说 AQS 是框架而不是锁",
                  highlight: "AQS 提供的是模板方法，上层同步器只需要定义 tryAcquire、tryRelease 这类扩展点。",
                  body:
                    "AQS 自己不直接规定“锁应该怎么抢”，它提供的是 `acquire`、`release`、`acquireShared` 这类模板方法。上层同步器通过重写 `tryAcquire`、`tryRelease`、`tryAcquireShared` 等方法，定义自己的 state 语义和获取释放规则；而队列管理、阻塞唤醒、中断处理、重试逻辑由 AQS 统一兜住。这就是它为什么是同步器基础框架，而不是某一个具体锁实现。",
                },
                {
                  heading: "七、进阶补充：Condition 和 AQS 队列是什么关系",
                  highlight: "Condition 不是另一套完全独立的并发系统，它和 AQS 同步队列之间是可以转移节点的。",
                  body:
                    "以 ReentrantLock 为例，`ConditionObject` 也是基于 AQS 扩展出来的。线程调用 `await()` 后会先进入 Condition 队列；当别的线程 `signal()` 时，节点会从 Condition 队列转移回 AQS 同步队列，之后再参与锁竞争。面试里如果能补这一句，通常就能说明你不是只停留在“state + 队列”的表层，而是知道 AQS 还支撑了更完整的等待/通知语义。",
                },
                {
                  heading: "八、AQS 这题最常见的误区",
                  highlight: "真正容易失分的不是不会背术语，而是把层级、语义和竞争过程答混。",
                  body:
                    "第一，AQS 不是一把锁，ReentrantLock 才是基于 AQS 的具体锁；第二，state 不是固定表示“锁有没有被占用”，它的语义由子类定义；第三，AQS 队列不是普通队列，而是配合 Node、waitStatus、park/unpark 一起工作的等待队列；第四，被唤醒的线程并不等于已经拿到锁，它仍然要重新 tryAcquire。把这几个误区讲清楚，面试官会明显感觉你真的读懂过 AQS。",
                },
              ],
              comparison: {
                title: "AQS state 在不同同步器里的含义",
                headers: ["同步器", "state 表示什么", "获取成功条件", "你该怎么回答"],
                rows: [
                  ["ReentrantLock", "锁状态 / 重入次数", "state = 0 或当前线程重入", "强调独占模式和重入语义"],
                  ["Semaphore", "剩余许可数", "state > 0 且 CAS 扣减成功", "强调共享模式和并发许可"],
                  ["CountDownLatch", "剩余计数", "state 减到 0 后等待线程放行", "强调等待计数归零，不是抢占资源"],
                ],
              },
              codeExample: {
                title: "AQS acquire 模板与 CAS 修改 state 伪代码",
                language: "java",
                code: [
                  "public final void acquire(int arg) {",
                  "    if (!tryAcquire(arg) &&",
                  "        acquireQueued(addWaiter(Node.EXCLUSIVE), arg)) {",
                  "        selfInterrupt();",
                  "    }",
                  "}",
                  "",
                  "protected boolean tryAcquire(int arg) {",
                  "    int state = getState();",
                  "    if (state == 0 && compareAndSetState(0, arg)) {",
                  "        setExclusiveOwnerThread(Thread.currentThread());",
                  "        return true;",
                  "    }",
                  "    return false;",
                  "}",
                ].join("\n"),
                explanation:
                  "`acquire()` 是 AQS 提供的模板骨架，`tryAcquire()` 是子类扩展点，而 `compareAndSetState()` 说明 state 修改依赖 CAS 保证并发安全。",
              },
              selfTests: [
                {
                  question: "为什么说 AQS 适合做同步器框架，而不是单一的一把锁？",
                  hint: "至少讲 state 可映射不同语义、模板方法和排队唤醒骨架。",
                  gradingCriteria: [
                    { criterion: "提到 state 可表达不同同步语义", points: 3, description: "说明它不是固定只服务某一种锁。" },
                    { criterion: "提到模板方法或 tryAcquire/tryRelease", points: 3, description: "说明上层同步器只定义扩展点。" },
                    { criterion: "提到队列与 park/unpark 骨架", points: 2, description: "说明排队和唤醒逻辑由 AQS 统一处理。" },
                    { criterion: "举出 ReentrantLock、Semaphore、CountDownLatch 中至少两个例子", points: 2, description: "说明真的理解复用关系。" },
                  ],
                },
                {
                  label: "应用题",
                  question:
                    "Semaphore 为什么能限制最多 N 个线程同时访问资源？请结合 AQS 的 state 和共享模式解释。",
                  hint: "从 state 表示许可数、共享模式、CAS 扣减和失败入队四个角度回答。",
                  gradingCriteria: [
                    { criterion: "提到 state 表示剩余许可数", points: 3, description: "说明同步语义映射。" },
                    { criterion: "提到共享模式", points: 3, description: "说明不是独占锁场景。" },
                    { criterion: "提到 CAS 扣减许可", points: 2, description: "说明并发安全修改 state。" },
                    { criterion: "提到失败线程仍会排队等待", points: 2, description: "说明 AQS 队列骨架仍然复用。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "AQS 核心是 `volatile state`、等待队列和模板方法骨架。", why: "这是同步器复用的基础。" },
                { point: "state 的具体语义由子类定义，修改通常依赖 CAS。", why: "这是它能支撑不同同步器的关键。" },
                { point: "获取失败后会入队、park，释放资源后再 unpark 后继节点重新竞争。", why: "这是 AQS 真正统一抽象出的公共流程。" },
                { point: "ReentrantLock、Semaphore、CountDownLatch 只是 state 语义不同，不是底层机制完全不同。", why: "这句能把抽象层级讲对。" },
              ],
              bonusPoints: [
                { point: "能补独占模式和共享模式差异。", why: "说明不只是会背 ReentrantLock 一个例子。" },
                { point: "能解释被唤醒后还要重新竞争，而不是直接拿到锁。", why: "这是很关键的面试加分点。" },
              ],
              advancedPoints: [
                { point: "能讲 Node、waitStatus、CLH 风格队列和 park/unpark。", why: "体现源码层深度。" },
                { point: "能补公平锁/非公平锁、Condition 队列和中断响应。", why: "体现真正读过并发包实现。" },
              ],
              deductPoints: [
                { point: "把 AQS 说成“就是可重入锁”", why: "把框架和具体锁混成一层。" },
                { point: "说线程被唤醒后一定立刻拿到锁", why: "忽略了醒来后仍要重新竞争 state。" },
              ],
              followUps: [
                "公平锁和非公平锁在 AQS 上怎么体现？",
                "Semaphore 和 CountDownLatch 为什么也能复用 AQS？",
                "Condition 队列和 AQS 同步队列是什么关系？",
              ],
              answer30s:
                "AQS 不是一把锁，而是 Java 并发包里构建同步器的基础框架。它把 state 状态、等待队列、线程阻塞和唤醒这些共通逻辑抽了出来，所以像 ReentrantLock、Semaphore、CountDownLatch 只需要定义自己的 state 语义，就能复用这套骨架。",
              answer2min:
                "如果展开讲，我会先说很多同步器虽然语义不同，但底层都要处理资源竞争失败后的排队与唤醒。AQS 用 `volatile state` 表示同步状态，用 CAS 保证并发修改安全，再用一条 CLH 风格等待队列管理获取失败的线程。线程先执行 `tryAcquire` 或 `tryAcquireShared`，失败后会被包装成 Node 入队并 `park` 挂起；前驱节点释放资源后，后继节点会被 `unpark`，然后再次尝试竞争 state。上层同步器只需要通过 `tryAcquire`、`tryRelease` 这些模板方法定义自己的语义，所以 AQS 能同时支撑 ReentrantLock、Semaphore、CountDownLatch。",
              advancedAnswer:
                "更深入时，我会继续讲独占模式和共享模式的差别，说明 ReentrantLock、Semaphore、CountDownLatch 如何把不同同步语义映射到同一个 state 上；再补公平锁和非公平锁、Condition 队列与同步队列的关系，以及为什么线程被唤醒后仍要重新竞争而不是直接拿到锁。",
              sources: [
                {
                  title: "Java SE API - AbstractQueuedSynchronizer",
                  url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/locks/AbstractQueuedSynchronizer.html",
                  type: "official",
                  applicableVersion: "Java 8+",
                  facts: ["state", "独占/共享模式", "ConditionObject", "队列等待机制", "park/unpark"],
                  reviewedAt: "2026-05-08",
                },
              ],
            },
            {
              slug: "java-synchronized-vs-reentrantlock",
              title: "synchronized 和 ReentrantLock 该怎么讲取舍？",
              summary: "两者都能做互斥，但差异不在“一个老一个新”，而在于可中断、超时、公平性、Condition 和监控排查体验这些能力边界。",
              difficulty: "medium",
              frequency: "high",
              tags: ["Java 并发", "synchronized", "ReentrantLock"],
              questionVariants: ["为什么很多场景仍然用 synchronized，而不是统一换 ReentrantLock？", "ReentrantLock 比 synchronized 多了什么能力？"],
              keyTakeaways: [
                "synchronized 语义简单，JVM 原生支持，适合大多数普通互斥场景。",
                "ReentrantLock 更灵活，支持可中断、超时尝试、公平锁和多个 Condition。",
                "取舍核心不是“谁更高级”，而是谁更匹配当前并发控制需求。",
              ],
              learningGoals: ["理解两者共同点和差异点。", "理解什么时候需要 lockInterruptibly/tryLock/Condition。", "能给出工程选型判断。"],
              plainSummary: "synchronized 像默认档位，够用时最省心；ReentrantLock 像手动挡，能做更多控制，但也要求你更小心释放和组织流程。",
              plainRetell: "我会先讲两者都能做互斥，再讲 ReentrantLock 多出来的能力，最后给出什么场景下值得换的判断。",
              strongSummary: "这道题真正考的不是 API 背诵，而是并发控制能力边界和工程取舍。",
              sections: [
                {
                  heading: "一、共同点先讲清楚",
                  highlight: "两者都能提供互斥和可重入，不是完全不同阵营。",
                  body: "很多回答一上来就把 synchronized 和 ReentrantLock 讲成对立选项，其实它们都能完成线程互斥，也都支持可重入。真正要拉开差距的，不是基础互斥能力，而是控制粒度、扩展能力和使用成本。",
                },
                {
                  heading: "二、ReentrantLock 多出来的是什么",
                  highlight: "它多的不是性能神话，而是控制能力。",
                  body: "ReentrantLock 支持 `lockInterruptibly`、`tryLock`、公平锁以及多个 Condition，这些能力在等待可中断、超时控制、复杂等待队列和业务编排里很有价值。synchronized 语义更固定，优点是简单稳定，缺点是很多控制手段做不到或不直观。",
                },
                {
                  heading: "三、工程上到底怎么取舍",
                  highlight: "默认简单场景用 synchronized，确有控制诉求再上 ReentrantLock。",
                  body: "如果只是普通临界区保护，synchronized 代码更短、出错面更小，也更适合团队统一维护；如果你需要可中断等待、定时抢锁、公平策略、多个条件队列，ReentrantLock 更合适。但它要求你自己在 finally 里释放锁，使用不当反而更容易出事故。",
                },
              ],
              selfTests: [
                {
                  question: "为什么说 ReentrantLock 的优势主要是控制能力，而不是简单一句“性能更好”？",
                  hint: "从可中断、超时、公平性和 Condition 去答。",
                  gradingCriteria: [
                    { criterion: "提到可中断或 tryLock", points: 3, description: "说明等待控制能力。" },
                    { criterion: "提到公平锁或 Condition", points: 3, description: "说明扩展能力。" },
                    { criterion: "提到 synchronized 简单稳定", points: 4, description: "说明选型不是单向替换。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "两者都能做互斥和可重入。", why: "这是共同基线。" },
                { point: "ReentrantLock 多了可中断、超时、公平锁和 Condition 等能力。", why: "这是差异核心。" },
                { point: "选型要看控制诉求和维护成本，不是简单谁替代谁。", why: "这是工程判断。" },
              ],
              bonusPoints: [{ point: "能补 AQS 是 ReentrantLock 的底层骨架。", why: "体现体系串联能力。" }],
              advancedPoints: [{ point: "能结合锁释放风险、排查体验和监控指标给选型建议。", why: "体现线上视角。" }],
              deductPoints: [{ point: "直接说 ReentrantLock 一定比 synchronized 高级", why: "答案太机械。" }],
              followUps: ["什么时候你会优先用 `tryLock`？", "Condition 和 `wait/notify` 的差异怎么讲？"],
              answer30s: "synchronized 和 ReentrantLock 都能做互斥和可重入。默认简单场景我会优先用 synchronized，因为语义简单、出错面小；如果需要可中断等待、超时尝试、公平锁或多个 Condition，才会换 ReentrantLock。",
              answer2min: "如果展开讲，我会先说两者都能保护临界区，所以不是一个能加锁一个不能。真正差异在于 ReentrantLock 提供了更多控制能力，比如 `lockInterruptibly`、`tryLock`、公平锁和多个 Condition，这些在复杂并发编排里很有价值。synchronized 的优势是写法更简单、释放由 JVM 兜底；ReentrantLock 更灵活，但也要求你自己在 finally 里正确释放，所以工程上通常是默认简单场景用 synchronized，有明确控制诉求再用 ReentrantLock。",
              advancedAnswer: "更深入时，我会补 ReentrantLock 基于 AQS、Condition 如何支持多等待队列，以及为什么很多线上问题最后不是锁性能，而是锁设计和释放习惯的问题。",
              sources: [{ title: "Java SE API - ReentrantLock", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html", type: "official" }],
            },
          ],
        },
        {
          slug: "thread-model",
          name: "线程调度",
          documents: [
            {
              slug: "java-thread-pool",
              title: "线程池参数为什么不能只背 corePoolSize 和 maxPoolSize？",
              summary: "线程池参数真正要回答的是任务类型、队列策略、拒绝策略和线程增长时机之间的协作关系。",
              difficulty: "medium",
              frequency: "high",
              tags: ["Java 并发", "线程池", "ThreadPoolExecutor"],
              questionVariants: ["线程池参数怎么配，为什么不建议直接用 Executors？"],
              keyTakeaways: [
                "线程池不是几个参数孤立存在，而是一套任务分发策略。",
                "核心线程数、最大线程数、队列容量和拒绝策略必须一起讲。",
                "不建议直接用 Executors，是因为默认配置容易隐藏队列膨胀或线程数失控问题。 ",
              ],
              learningGoals: ["理解线程池提交流程。", "掌握参数联动关系。", "知道为何线上常手动 new ThreadPoolExecutor。"],
              plainSummary: "线程池问题的关键不是背参数名，而是知道任务来了以后，线程池到底先扩线程、还是先进队列、还是直接拒绝。",
              plainRetell: "回答时我会按“来任务 -> 核心线程 -> 队列 -> 最大线程 -> 拒绝策略”这条顺序讲。",
              strongSummary: "线程池配置的高分点，是把参数讲成一个完整决策链，而不是四五个独立名词。",
              sections: [
                {
                  heading: "一、线程池的任务处理顺序",
                  highlight: "核心线程、队列、最大线程、拒绝策略是串起来的。",
                  body: "任务提交进来后，如果当前线程数还没到 corePoolSize，优先创建核心线程；否则先尝试入队；队列满了再尝试扩到 maxPoolSize；如果还不行，最后才走拒绝策略。理解这条顺序，才知道参数该怎么配。 ",
                },
                {
                  heading: "二、为什么不建议直接用 Executors",
                  highlight: "默认工厂隐藏了很多危险配置。",
                  body: "`Executors.newFixedThreadPool` 默认用无界队列，任务堆积时容易把内存顶爆；`newCachedThreadPool` 又可能无限扩线程。线上更稳妥的做法是自己 new `ThreadPoolExecutor`，把队列容量、线程上限和拒绝策略都显式写出来。 ",
                },
                {
                  heading: "三、参数到底怎么和任务类型关联",
                  highlight: "线程池参数永远要结合 CPU 密集型和 IO 密集型任务来配。",
                  body: "CPU 密集型任务线程数不宜过多，否则上下文切换会吞噬收益；IO 密集型任务可以适度放大线程数，但必须配合队列和拒绝策略避免雪崩。线程池配置没有万能值，只有和业务负载匹配的值。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么说线程池参数必须一起讲，而不能只讲 core/max？",
                  gradingCriteria: [
                    { criterion: "提到任务处理顺序", points: 4, description: "说明参数协作关系。" },
                    { criterion: "提到队列", points: 3, description: "说明队列决定扩容时机。" },
                    { criterion: "提到拒绝策略", points: 3, description: "说明极限场景兜底。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "线程池参数要按任务提交流程整体理解。", why: "不是单独几个数字。" },
                { point: "队列容量决定了线程扩张与堆积行为。", why: "这是参数联动的关键。" },
                { point: "不建议直接用 Executors，因为默认配置可能隐藏风险。", why: "这是工程经验点。" },
              ],
              bonusPoints: [{ point: "能补 CallerRunsPolicy 等拒绝策略差异。", why: "体现对降压策略的理解。" }],
              advancedPoints: [{ point: "能讲线程池监控指标和动态调参思路。", why: "体现线上实践。" }],
              deductPoints: [{ point: "说线程池就是为了复用线程、没别的了", why: "回答过浅。" }],
              followUps: ["为什么无界队列会让 maxPoolSize 形同虚设？", "CPU 密集和 IO 密集任务的线程池参数为什么不同？"],
              answer30s: "线程池参数不能只背 corePoolSize 和 maxPoolSize，因为任务处理流程是先核心线程、再队列、再最大线程、最后拒绝策略。队列容量和拒绝策略会直接影响线程扩张和风险兜底，所以必须一起讲。",
              answer2min: "展开讲时，我会先说 ThreadPoolExecutor 的任务提交流程：没到核心线程先建核心线程，到核心后先入队，队列满了才扩到最大线程，再满才拒绝。也正因为如此，队列和拒绝策略决定了线程池到底是平滑削峰还是无声堆积风险。线上通常自己 new 线程池，而不是直接用 Executors，就是为了显式控制这些参数。",
              advancedAnswer: "更深入时，我会补 CPU/IO 任务的参数差异、监控指标、拒绝策略选型，以及为什么无界队列会让 maxPoolSize 基本失效。",
              sources: [{ title: "Java SE API - ThreadPoolExecutor", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html", type: "official" }],
            },
            {
              slug: "java-volatile",
              title: "volatile 为什么能保证可见性，却不能直接保证复合操作原子性？",
              summary: "volatile 通过内存屏障和禁止指令重排保证可见性与有序性，但像 i++ 这样的复合操作仍然包含多个步骤。",
              difficulty: "medium",
              frequency: "high",
              tags: ["Java 并发", "volatile", "JMM"],
              questionVariants: ["volatile 的底层原理是什么？"],
              keyTakeaways: [
                "volatile 保证的是可见性和有序性，不是所有场景下的原子性。",
                "复合操作往往包含读、改、写多个步骤，中间可能被其他线程打断。",
                "volatile 更适合状态标记、单次写多次读等场景。 ",
              ],
              learningGoals: ["理解可见性、有序性、原子性的区别。", "理解为什么 i++ 不是原子操作。", "知道 volatile 的典型使用场景。"],
              plainSummary: "volatile 最容易答错的点，就是把“别人看得见我的改动”误说成“所有并发操作都安全”。",
              plainRetell: "我会先分清可见性、有序性、原子性，再举 i++ 说明为什么 volatile 不够。",
              strongSummary: "volatile 的高分回答，不在于背内存屏障，而在于能把它的能力边界说清楚。",
              sections: [
                {
                  heading: "一、volatile 先解决了什么问题",
                  highlight: "它先解决的是线程间看不见彼此修改的问题。",
                  body: "普通共享变量可能被线程缓存，另一个线程修改后，当前线程不一定立刻看见。volatile 会通过内存语义保证写入后尽快刷新到主内存，读取时也会从主内存重新获取，从而提升可见性。 ",
                },
                {
                  heading: "二、为什么 i++ 还是不安全",
                  highlight: "复合操作不是一次 CPU 指令，而是多个步骤。",
                  body: "`i++` 至少包含读取当前值、加一、写回三个步骤。即使变量是 volatile，两个线程仍可能同时读取到相同旧值，各自加一后再写回，导致更新丢失。volatile 没法把这三步自动变成不可分割的原子操作。 ",
                },
                {
                  heading: "三、volatile 真正适合什么场景",
                  highlight: "适合状态标记和单次写、多次读，不适合复杂竞争更新。",
                  body: "像停止标志、配置刷新标志、双重检查单例中的实例引用，都能从 volatile 的可见性和禁止重排中受益。但如果多个线程要频繁竞争更新同一共享值，还是要考虑 CAS、Atomic 类或锁。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么 volatile 不能让 i++ 线程安全？",
                  gradingCriteria: [
                    { criterion: "提到读改写三个步骤", points: 5, description: "说明复合操作本质。" },
                    { criterion: "提到可见性与原子性区别", points: 5, description: "说明 volatile 能力边界。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "volatile 保证可见性和有序性。", why: "这是核心能力。" },
                { point: "i++ 是复合操作，不具备天然原子性。", why: "这是常见考点。" },
                { point: "复杂并发更新需要 CAS、Atomic 或锁。", why: "体现正确选型。" },
              ],
              bonusPoints: [{ point: "能补双重检查单例为什么需要 volatile。", why: "体现对指令重排的理解。" }],
              advancedPoints: [{ point: "能解释内存屏障和 happens-before。", why: "体现 JMM 深度。" }],
              deductPoints: [{ point: "把 volatile 说成轻量锁", why: "概念错误。" }],
              followUps: ["双重检查单例为什么没有 volatile 会有问题？", "AtomicInteger 和 volatile int 的本质差异是什么？"],
              answer30s: "volatile 能保证共享变量的可见性和一定的有序性，但不能保证像 i++ 这种复合操作的原子性，因为 i++ 至少包含读、改、写三个步骤，线程之间还是可能互相覆盖结果。",
              answer2min: "如果展开讲，我会先区分可见性、有序性和原子性。volatile 通过内存语义让一个线程的修改能被别的线程及时看到，并限制部分指令重排。但如果多个线程同时对同一个变量做复合操作，比如 i++，它仍然会先读旧值、再修改、再写回，所以更新可能丢失。这种场景要用 CAS、Atomic 类或者锁。",
              advancedAnswer: "更深入时，我会补 happens-before、内存屏障以及双重检查单例为什么必须配 volatile，这样能把 volatile 的能力和边界讲得更完整。",
              sources: [{ title: "Java Language Specification - Memory Model", url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html", type: "official" }],
            },
            {
              slug: "java-threadlocal-leak",
              title: "ThreadLocal 为什么容易引发内存泄漏？",
              summary: "ThreadLocal 真正危险的点不是 API 本身，而是线程池线程长生命周期配合未清理 value，容易让业务对象长期挂在线程上无法释放。",
              difficulty: "medium",
              frequency: "high",
              tags: ["Java 并发", "ThreadLocal", "内存泄漏"],
              questionVariants: ["ThreadLocalMap 为什么会残留脏数据？", "为什么在线程池里用 ThreadLocal 更危险？"],
              keyTakeaways: [
                "ThreadLocalMap 的 key 是弱引用，但 value 不是自动跟着立即清掉。",
                "线程池线程生命周期很长，未 remove 的 value 容易长期残留。",
                "真正治理关键是使用边界清晰和 finally 清理，而不是把 ThreadLocal 一刀切禁掉。",
              ],
              learningGoals: ["理解 ThreadLocalMap 的基本存储关系。", "理解弱引用 key 和残留 value 的泄漏链路。", "能给出正确使用规范。"],
              plainSummary: "ThreadLocal 泄漏不是因为它神秘，而是线程一直活着，你挂在线程上的值又没及时摘下来。",
              plainRetell: "我会先讲 key 弱引用、value 残留，再讲为什么线程池比短命线程更容易把问题放大，最后补正确清理方式。",
              strongSummary: "这题的高分关键，是把 ThreadLocalMap 结构和线程生命周期一起讲，而不是只背“弱引用会泄漏”。",
              sections: [
                {
                  heading: "一、为什么 key 是弱引用还会泄漏",
                  highlight: "弱引用只让 key 更容易消失，不代表 value 会同步安全释放。",
                  body: "ThreadLocalMap 里，ThreadLocal 作为 key 是弱引用，这意味着外部没有强引用时，key 可能被 GC 回收。但如果线程本身还活着，而 map 中的 value 仍然挂在那个 entry 上，就会形成“key 没了、value 还在”的残留状态，直到后续 map 操作触发清理。",
                },
                {
                  heading: "二、为什么线程池里风险更大",
                  highlight: "因为线程池线程不会像请求线程那样很快结束。",
                  body: "如果是短生命周期线程，就算 ThreadLocal 用完没清理，线程结束后整条线程对象也会被回收，问题不一定长期积累。但在线程池里，工作线程会反复复用，很可能一个请求留下的 ThreadLocal value 被后续请求持续带着，既可能造成内存残留，也可能造成脏数据串请求。",
                },
                {
                  heading: "三、正确姿势到底是什么",
                  highlight: "关键不是“能不能用”，而是“有没有在边界处 remove”。",
                  body: "ThreadLocal 在用户上下文、链路追踪、格式化工具缓存等场景仍然有价值，但必须在使用边界结束后及时 `remove`，通常放在 `try/finally` 里。很多线上规范不是禁止 ThreadLocal，而是强制清理和封装统一使用入口。",
                },
              ],
              selfTests: [
                {
                  question: "为什么 ThreadLocal 在线程池里更容易把内存泄漏和脏数据问题放大？",
                  hint: "把线程生命周期和未 remove 的 value 联系起来。",
                  gradingCriteria: [
                    { criterion: "提到线程池线程生命周期长", points: 4, description: "说明风险放大前提。" },
                    { criterion: "提到 value 残留", points: 3, description: "说明为什么不是 key 被回收就结束。" },
                    { criterion: "提到 finally remove", points: 3, description: "说明治理动作。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "ThreadLocalMap 的 key 是弱引用，但 value 可能残留。", why: "这是泄漏起点。" },
                { point: "线程池线程长生命周期会放大残留问题。", why: "这是线上风险来源。" },
                { point: "规范做法是在 finally 中 remove。", why: "这是治理关键。" },
              ],
              bonusPoints: [{ point: "能补脏数据串请求不只是内存问题。", why: "体现业务影响意识。" }],
              advancedPoints: [{ point: "能讲框架统一封装、拦截器清理和异步线程上下文传播边界。", why: "体现工程实践。" }],
              deductPoints: [{ point: "说 key 是弱引用所以肯定不会泄漏", why: "忽略了 value 和线程生命周期。" }],
              followUps: ["为什么很多框架会在拦截器或过滤器里统一清理 ThreadLocal？", "异步线程池里 ThreadLocal 上下文为什么更要谨慎？"],
              answer30s: "ThreadLocal 容易引发内存泄漏，是因为 ThreadLocalMap 里 key 是弱引用，但 value 不会自动立刻清掉。在线程池里线程长期存活，如果业务没有及时 remove，value 就可能长期挂在线程上，既占内存又可能串请求。",
              answer2min: "如果展开讲，我会先说 ThreadLocalMap 的 key 是弱引用，所以外部不再引用 ThreadLocal 时 key 可能被回收，但 value 仍可能残留在线程对象里。短生命周期线程问题没那么明显，可在线程池里工作线程长期复用，未清理的 value 会不断积累，甚至让后续请求读到前一个请求的上下文。正确做法不是一刀切禁用，而是把 set/use/remove 放在清晰边界里，通常通过 `try/finally` 保证及时 remove。",
              advancedAnswer: "更深入时，我会继续补为什么 ThreadLocal 不只是内存泄漏问题，还会引发用户上下文串脏，以及为什么很多框架都会用过滤器、拦截器或包装器统一清理和传递上下文。",
              sources: [{ title: "Java SE API - ThreadLocal", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ThreadLocal.html", type: "official" }],
            },
          ],
        },
      ],
    },
    {
      categorySlug: "jvm",
      categoryName: "JVM",
      categoryDescription: "JVM 运行时专题。",
      bankSlug: "jvm-core",
      bankName: "JVM 核心专题",
      description: "围绕类加载、GC 和内存模型的系统化学习文档。",
      targetRole: "Java 后端",
      difficulty: "advanced",
      chapters: [
        {
          slug: "class-loading",
          name: "类加载与执行",
          documents: [
            {
              slug: "jvm-class-loading",
              title: "JVM 类加载机制为什么强调双亲委派？",
              summary: "双亲委派的核心价值不是“代码优雅”，而是避免核心类被重复或恶意篡改，保证类加载边界清晰稳定。",
              difficulty: "medium",
              frequency: "high",
              tags: ["JVM", "类加载", "双亲委派"],
              questionVariants: ["双亲委派解决了什么问题？"],
              keyTakeaways: [
                "类加载机制涉及加载、链接、初始化多个阶段。",
                "双亲委派通过向上委托防止核心类被重复定义。",
                "打破双亲委派通常是为了插件化、容器隔离等特殊场景。 ",
              ],
              learningGoals: ["理解类加载流程。", "理解双亲委派价值。", "理解为什么有时要打破它。"],
              plainSummary: "双亲委派的关键不是“父类加载器更高级”，而是先问上层有没有加载过，避免大家各自造一份核心类。",
              plainRetell: "我会先讲类加载流程，再讲双亲委派如何防止核心类重复定义，最后补 Tomcat、SPI 这类打破委派的场景。",
              strongSummary: "类加载的高分回答，要同时说清安全边界、类型隔离和打破委派的例外场景。",
              sections: [
                {
                  heading: "一、类加载不只是把字节码读进来",
                  highlight: "加载后还有验证、准备、解析、初始化等阶段。",
                  body: "很多人把类加载理解成“ClassLoader 读 class 文件”，但 JVM 真正执行类之前，还要验证字节码安全、为静态变量分配内存、解析符号引用并执行初始化逻辑。理解这些阶段，才能看懂双亲委派作用在哪一层。 ",
                },
                {
                  heading: "二、双亲委派到底在保护什么",
                  highlight: "它保护的是核心类不被任意覆盖，类型边界不被随意破坏。",
                  body: "当一个类加载器收到加载请求时，它会先向父加载器委托，层层向上，直到顶层加载器尝试加载。这样像 `java.lang.String` 这类核心类不会被应用自己偷偷定义一份，从而避免安全问题和类型混乱。 ",
                },
                {
                  heading: "三、为什么有时又要打破双亲委派",
                  highlight: "因为某些场景更在意隔离和扩展性。",
                  body: "像 Tomcat 多应用隔离、JDBC SPI、OSGi 插件系统等场景，需要下层加载器优先加载业务类或插件类，否则无法实现应用隔离或动态扩展。所以打破双亲委派不是否定它，而是特殊边界下的策略调整。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么说双亲委派首先解决的是安全和边界问题？",
                  gradingCriteria: [
                    { criterion: "提到核心类保护", points: 4, description: "说明防止被篡改。" },
                    { criterion: "提到重复定义问题", points: 3, description: "说明类型边界。" },
                    { criterion: "提到特殊打破场景", points: 3, description: "说明不是绝对规则。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "双亲委派会先向上委托，防止核心类被重复或恶意加载。", why: "这是核心价值。" },
                { point: "类加载不仅有加载，还有链接和初始化等阶段。", why: "说明理解更完整。" },
                { point: "Tomcat、SPI 等场景会按需求打破双亲委派。", why: "体现工程例外情况。" },
              ],
              bonusPoints: [{ point: "能补 Bootstrap / Extension / AppClassLoader 层次。", why: "体现体系感。" }],
              advancedPoints: [{ point: "能解释类的唯一性由“类加载器 + 类全名”共同决定。", why: "体现深入理解。" }],
              deductPoints: [{ point: "把双亲委派说成绝对不能打破", why: "理解过死。" }],
              followUps: ["Tomcat 为什么要打破双亲委派？", "同名类被不同加载器加载后为什么互不相等？"],
              answer30s: "JVM 强调双亲委派，是因为类加载请求会先向上委托，这样核心类能由更高层统一加载，避免被应用重复定义或恶意篡改，也让类边界更稳定。",
              answer2min: "展开讲时，我会先说类加载不只是读字节码，还包含验证、准备、解析和初始化。双亲委派的核心价值是保证像 `java.lang.String` 这类核心类不会被业务侧随便覆盖，并且类的类型边界更稳定。但这不是绝对规则，像 Tomcat、SPI 等场景会为了隔离和扩展性打破它。",
              advancedAnswer: "如果继续追，我会补类唯一性由类加载器和类全名共同决定，以及容器和插件系统为什么必须在某些方向上逆向委派。",
              sources: [{ title: "Java SE API - ClassLoader", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ClassLoader.html", type: "official" }],
            },
            {
              slug: "jvm-class-identity",
              title: "同一个类为什么被不同 ClassLoader 加载后就不相等？",
              summary: "JVM 判断类身份时不只看全类名，还要看加载它的 ClassLoader，所以同名类只要来自不同加载器，就会被视为不同类型。",
              difficulty: "hard",
              frequency: "medium",
              tags: ["JVM", "ClassLoader", "类唯一性"],
              questionVariants: ["为什么同名类会出现 `ClassCastException`？", "类的唯一性到底由什么决定？"],
              keyTakeaways: [
                "类的唯一性由“类加载器 + 全类名”共同决定。",
                "不同加载器加载的同名类，在 JVM 看来是不同类型。",
                "插件隔离、容器隔离和热加载场景都依赖这个规则。",
              ],
              learningGoals: ["理解类唯一性规则。", "理解为什么同名类仍可能互转失败。", "理解隔离和插件机制为什么依赖不同加载器。"],
              plainSummary: "类名一样不代表就是同一个类，JVM 还会看是谁把它加载进来的。",
              plainRetell: "我会先讲类身份规则，再讲为什么不同加载器下的同名类不能互转，最后补这条规则对插件和容器隔离的价值。",
              strongSummary: "这题真正考的是类型边界，不是类加载器名字背诵。",
              sections: [
                {
                  heading: "一、JVM 到底怎么认一个类",
                  highlight: "不是只看 `com.foo.User` 这种全类名，还要带上加载器身份。",
                  body: "在 JVM 里，一个类的身份不是单独由全类名决定，而是由“定义它的类加载器 + 全类名”共同决定。也就是说，即使字节码内容完全一样，只要来自不同的 ClassLoader，JVM 就会把它们视为两个不同类型。",
                },
                {
                  heading: "二、为什么这会导致强转失败",
                  highlight: "因为 JVM 看到的是两个不同类型，不是同一个类的两个实例。",
                  body: "很多线上 `ClassCastException` 看起来很奇怪，明明报错里显示的类名都一样，其实是因为对象实例来自不同加载器。对业务代码来说名字没变，但对 JVM 来说它们并不属于同一个类型系统，所以不能互相强转。",
                },
                {
                  heading: "三、为什么这条规则反而很重要",
                  highlight: "没有这条规则，就很难做应用隔离和插件化。",
                  body: "Tomcat 多应用隔离、OSGi 插件系统、热部署框架都依赖不同加载器隔离各自类空间。正因为相同类名在不同加载器下能被当成不同类型，不同应用才能在同一个 JVM 里带着各自版本的依赖共存。",
                },
              ],
              selfTests: [
                {
                  question: "为什么两个全类名相同的类仍可能互相强转失败？",
                  hint: "答案里一定要出现“类加载器 + 全类名”这套身份规则。",
                  gradingCriteria: [
                    { criterion: "提到类唯一性由加载器和全类名共同决定", points: 5, description: "说明身份规则。" },
                    { criterion: "提到 JVM 会视为不同类型", points: 3, description: "说明为什么不能互转。" },
                    { criterion: "提到隔离或插件场景", points: 2, description: "说明这不是 bug，而是机制。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "类唯一性由类加载器和全类名共同决定。", why: "这是最核心结论。" },
                { point: "不同加载器加载的同名类会被 JVM 视为不同类型。", why: "这是强转失败根因。" },
                { point: "这种机制支撑了容器隔离和插件化。", why: "这是工程价值。" },
              ],
              bonusPoints: [{ point: "能补父子加载器可见性和逆向委派场景。", why: "体现体系理解。" }],
              advancedPoints: [{ point: "能结合 Tomcat、OSGi 或 SPI 解释真实隔离效果。", why: "体现实践联想。" }],
              deductPoints: [{ point: "说同名类一定是同一个类型", why: "类加载基础不清。" }],
              followUps: ["为什么 Tomcat 多个 Web 应用能带不同版本的同名依赖？", "父加载器加载的类为什么对子加载器通常可见？"],
              answer30s: "同一个类被不同 ClassLoader 加载后不相等，是因为 JVM 判断类身份时不只看全类名，还看加载它的 ClassLoader。所以两个名字相同的类，只要加载器不同，就会被视为不同类型。",
              answer2min: "如果展开讲，我会先说明类的唯一性规则是“类加载器 + 全类名”。这意味着即使两个类字节码完全一样，只要分别由不同加载器定义，它们在 JVM 看来也是两套不同类型系统，所以实例之间可能发生看起来很诡异的 `ClassCastException`。但这并不是缺陷，Tomcat 应用隔离、插件系统和热加载正是靠这个机制让不同模块携带不同版本依赖共存。",
              advancedAnswer: "更深入时，我会继续补父子加载器可见性、双亲委派和逆向委派如何一起影响类空间边界，以及为什么很多容器问题最终都落到类加载器隔离上。",
              sources: [{ title: "Java SE API - ClassLoader", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ClassLoader.html", type: "official" }],
            },
          ],
        },
        {
          slug: "memory-and-gc",
          name: "内存与回收",
          documents: [
            {
              slug: "jvm-gc",
              title: "JVM 垃圾回收为什么不能只背分代回收？",
              summary: "分代只是 GC 思想的一部分，真正高质量回答还要说对象存活特征、回收算法、停顿目标和垃圾收集器权衡。",
              difficulty: "medium",
              frequency: "high",
              tags: ["JVM", "GC", "分代回收"],
              questionVariants: ["GC 的常见算法和收集器怎么选？"],
              keyTakeaways: [
                "GC 的目标不是“删垃圾”这么简单，而是平衡吞吐、停顿和内存开销。",
                "分代思想建立在对象朝生夕灭假设之上，但并不是所有收集器都严格分代。",
                "复制、标记清除、标记整理各自服务不同区域和目标。 ",
              ],
              learningGoals: ["理解 GC 核心目标。", "理解分代思想和算法关系。", "能解释常见收集器选型。"],
              plainSummary: "GC 不是只要背一句“新生代复制、老年代标记整理”就够了，真正要讲的是为什么要这么做，以及不同目标下选什么收集器。",
              plainRetell: "我会先讲 GC 目标，再讲分代和算法，最后补 G1/ZGC 这些收集器的停顿取舍。",
              strongSummary: "GC 的高分回答，不在于术语数量，而在于你能把对象特征、算法和收集器目标串起来。",
              sections: [
                {
                  heading: "一、GC 首先是在做什么权衡",
                  highlight: "GC 要在吞吐、停顿和空间成本之间找平衡。",
                  body: "垃圾回收不是越勤快越好。回收得太频繁，会占用大量 CPU；回收得太少，内存又可能被顶爆。不同业务更在意的目标不同：有的追求吞吐，有的追求低停顿，所以 GC 设计一定是权衡题。 ",
                },
                {
                  heading: "二、分代思想为什么成立",
                  highlight: "分代建立在大多数对象朝生夕灭的经验事实上。",
                  body: "很多业务对象生命周期很短，比如请求上下文、临时集合，因此新生代可以用复制算法高效回收；长期存活对象进入老年代，再用更适合稳定对象的算法处理。分代不是凭空来的，而是基于对象存活特征。 ",
                },
                {
                  heading: "三、为什么不能只背分代",
                  highlight: "现代收集器的真正差异在停顿模型和回收区域设计。",
                  body: "如果只背分代，就讲不出 G1 为什么分 Region、ZGC 为什么追求更低停顿，也讲不出 CMS 为什么会有碎片问题。面试里真正拉开差距的，是能把回收算法、对象分布和收集器目标一起讲出来。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么说 GC 回答不能只停留在分代回收？",
                  gradingCriteria: [
                    { criterion: "提到目标权衡", points: 4, description: "说明吞吐/停顿/空间取舍。" },
                    { criterion: "提到算法差异", points: 3, description: "说明复制/标记清除/整理。" },
                    { criterion: "提到收集器差异", points: 3, description: "说明现代收集器目标不同。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "GC 是吞吐、停顿、空间的权衡问题。", why: "这是底层目标。" },
                { point: "分代思想建立在对象生命周期分布上。", why: "不是死记的规则。" },
                { point: "现代收集器差异还体现在回收区域和停顿模型。", why: "体现理解深度。" },
              ],
              bonusPoints: [{ point: "能补 CMS/G1/ZGC 的适用场景。", why: "体现收集器视角。" }],
              advancedPoints: [{ point: "能解释 Stop-The-World 与并发标记的取舍。", why: "体现性能视角。" }],
              deductPoints: [{ point: "把 GC 说成单纯释放无用对象", why: "没有任何调优视角。" }],
              followUps: ["G1 为什么要分 Region？", "CMS 为什么会有内存碎片？"],
              answer30s: "JVM 垃圾回收不能只背分代回收，因为 GC 真正要解决的是吞吐、停顿和空间成本的权衡。分代只是基于对象生命周期分布的一种设计，真正回答还要讲回收算法和不同收集器目标。",
              answer2min: "如果展开讲，我会先说 GC 的目标不是只删垃圾，而是在性能和内存之间做权衡。分代思想成立，是因为很多对象生命周期很短，新生代适合复制回收，老年代则更关注整理和碎片问题。但现代 GC 的差异不只在分代，还在于 Region 划分、并发标记、停顿控制这些设计，所以回答不能停留在“新生代、老年代”两个词上。",
              advancedAnswer: "更深入时，我会补 CMS、G1、ZGC 在停顿模型和适用场景上的差别，以及 Stop-The-World 为何难以完全消除。",
              sources: [{ title: "Java HotSpot Garbage Collection Tuning Guide", url: "https://docs.oracle.com/en/java/javase/21/gctuning/", type: "official" }],
            },
            {
              slug: "jvm-memory-model",
              title: "JVM 内存模型到底解决了什么问题？",
              summary: "JMM 解决的是多线程下读写共享变量时的可见性、有序性和原子性边界，让开发者和编译器/CPU 之间有统一并发语义。",
              difficulty: "hard",
              frequency: "high",
              tags: ["JVM", "JMM", "happens-before"],
              questionVariants: ["happens-before 规则是做什么的？"],
              keyTakeaways: [
                "JMM 不是 JVM 内存区域划分，而是并发读写语义模型。",
                "它主要处理可见性、有序性和原子性边界。",
                "happens-before 是判断操作结果是否对另一线程可见的规则。 ",
              ],
              learningGoals: ["区分 JMM 与运行时内存区域。", "理解可见性/有序性/原子性。", "理解 happens-before。"],
              plainSummary: "JMM 最容易被答错的点，是把它说成堆、栈、方法区；其实它真正管的是并发读写规则。",
              plainRetell: "我会先澄清 JMM 不是内存区域图，再讲它如何约束线程间共享变量可见性和重排序。",
              strongSummary: "JMM 的核心价值，是让并发程序在编译器、CPU 和线程之间有统一可推导的可见性规则。",
              sections: [
                {
                  heading: "一、JMM 不是堆栈方法区",
                  highlight: "JMM 讲的是并发语义，不是运行时内存区域布局。",
                  body: "很多人一听“内存模型”就开始讲堆、栈、方法区，那其实是 JVM 运行时数据区。JMM 真正解决的是多线程共享变量读写时，什么情况下一个线程的修改对另一个线程可见，以及哪些指令重排是允许的。 ",
                },
                {
                  heading: "二、为什么需要 JMM",
                  highlight: "因为编译器优化、CPU 缓存和指令重排会让线程看到的顺序与源码不一致。",
                  body: "如果没有统一规则，不同硬件、编译器和 JVM 优化都可能让多线程程序表现不一致。JMM 通过定义主内存、工作内存和 happens-before 规则，让开发者可以基于一套语义去推导并发结果，而不是猜底层实现。 ",
                },
                {
                  heading: "三、happens-before 到底有什么用",
                  highlight: "它是判断“前一个操作结果是否对后一个操作可见”的规则。",
                  body: "比如解锁先行于后续加锁、volatile 写先行于后续读、线程启动先行于线程内操作等，这些规则帮助我们证明某个写入是否一定能被另一个线程看到。它让并发程序的可见性分析从经验判断变成规则推导。 ",
                },
              ],
              selfTests: [
                {
                  question: "为什么 JMM 不能和 JVM 运行时内存区域混为一谈？",
                  gradingCriteria: [
                    { criterion: "提到语义模型 vs 内存区域", points: 5, description: "说明两者层次不同。" },
                    { criterion: "提到可见性/有序性", points: 5, description: "说明 JMM 真正目标。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "JMM 是并发读写语义模型，不是内存区域划分。", why: "这是最关键澄清。" },
                { point: "JMM 关注可见性、有序性和原子性边界。", why: "这是核心问题域。" },
                { point: "happens-before 用来推导线程间可见性。", why: "这是面试高频点。" },
              ],
              bonusPoints: [{ point: "能补 volatile、锁与 JMM 规则的关系。", why: "体现规则落地能力。" }],
              advancedPoints: [{ point: "能解释编译器重排、CPU 重排与内存屏障。", why: "体现更深层理解。" }],
              deductPoints: [{ point: "把 JMM 回答成堆、栈、方法区", why: "完全答偏。" }],
              followUps: ["volatile 写为什么先行于后续读？", "为什么单线程内看起来正确的代码并发下不一定成立？"],
              answer30s: "JVM 内存模型解决的是多线程共享变量读写时的可见性、有序性和原子性边界。它不是堆栈方法区的划分，而是让开发者和编译器、CPU 之间有统一的并发语义，happens-before 就是这套语义里的可见性规则。",
              answer2min: "如果展开讲，我会先澄清 JMM 不是 JVM 内存区域，而是并发语义模型。因为编译器优化、CPU 缓存和指令重排会让线程看到的执行顺序和源码不一致，所以需要 JMM 规定共享变量如何从主内存与工作内存交互，以及哪些操作之间天然具备 happens-before 关系。这样我们才能证明某个写入为什么对另一个线程可见。",
              advancedAnswer: "更深入时，我会把 happens-before、volatile、锁、内存屏障和重排序一起串起来，这样 JMM 才不是抽象名词，而是可推导的并发规则体系。",
              sources: [{ title: "Java Language Specification - Threads and Locks", url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html", type: "official" }],
            },
            {
              slug: "jvm-full-gc-troubleshooting",
              title: "线上 Full GC 频繁到底该怎么排查？",
              summary: "Full GC 排查不是先背收集器参数，而是先确认触发类型、观察对象增长路径，再判断是内存泄漏、分配压力、晋升失败还是元空间/大对象问题。",
              difficulty: "hard",
              frequency: "high",
              tags: ["JVM", "Full GC", "排障"],
              questionVariants: ["系统频繁 Full GC 时第一步看什么？", "Full GC 问题怎么区分是泄漏还是分配压力？"],
              keyTakeaways: [
                "Full GC 排查先看触发原因和时间序列，不要直接改参数。",
                "要区分内存泄漏、对象分配过快、晋升失败和元空间等不同问题类型。",
                "日志、监控、堆转储和线程/流量上下文需要一起看。",
              ],
              learningGoals: ["建立 Full GC 排障顺序。", "理解不同触发原因的典型信号。", "能给出线上排查闭环。"],
              plainSummary: "Full GC 频繁时最怕上来就乱调参数，真正该先做的是弄清楚：到底是谁把内存顶上去的。",
              plainRetell: "我会按“先看日志和曲线 -> 再分类型判断 -> 最后定向抓堆和改参数”这条顺序回答。",
              strongSummary: "这题考的不是 JVM 术语，而是你有没有真正的线上排障方法论。",
              sections: [
                {
                  heading: "一、第一步为什么不是改参数",
                  highlight: "因为你连 Full GC 是谁触发的都还不知道。",
                  body: "线上 Full GC 频繁时，第一步应该先看 GC 日志和监控曲线，确认触发时间、触发原因、回收前后堆占用、停顿时长和回收效果。如果连是老年代打满、元空间不足、晋升失败还是显式 `System.gc()` 都没分清，就直接调参数，往往只会把问题藏起来。",
                },
                {
                  heading: "二、为什么一定要先分类型",
                  highlight: "因为“频繁 Full GC”只是症状，根因可能完全不同。",
                  body: "如果 GC 后老年代仍然降不下来，更像内存泄漏或强引用链未释放；如果回收后能降下来但很快又冲高，可能是对象分配压力过大；如果伴随 Survivor/Old 区晋升异常，要怀疑晋升失败；如果主要是元空间上涨，则要看类加载和动态代理。不同类型，排查入口完全不同。",
                },
                {
                  heading: "三、真正的排查闭环是什么",
                  highlight: "监控、日志、堆 dump 和业务变更必须串起来看。",
                  body: "比较稳的做法是：先从监控和 GC 日志确认问题窗口，再结合发布记录、流量变化和接口热点定位异常时期；然后抓堆 dump 看大对象、引用链和 Top 实例，再结合线程栈、缓存命中率、消息堆积等业务信号判断是谁把对象留住了。最后才是针对性改代码、改缓存、改队列或调 JVM 参数。",
                },
              ],
              selfTests: [
                {
                  question: "为什么线上 Full GC 频繁时不能直接上来改 JVM 参数？",
                  hint: "先说症状和根因不是一回事，再说不同触发类型排查入口不同。",
                  gradingCriteria: [
                    { criterion: "提到先看 GC 日志和监控", points: 4, description: "说明排查起点。" },
                    { criterion: "提到要区分不同触发原因", points: 3, description: "说明不能一把梭参数。" },
                    { criterion: "提到堆 dump 或业务上下文", points: 3, description: "说明完整闭环。" },
                  ],
                },
              ],
              essentialPoints: [
                { point: "先确认 Full GC 触发原因和回收效果。", why: "这是排障第一步。" },
                { point: "要区分泄漏、分配压力、晋升失败、元空间问题。", why: "这是分类关键。" },
                { point: "日志、监控、堆 dump 和业务变更要结合看。", why: "这是线上闭环。" },
              ],
              bonusPoints: [{ point: "能补 GC 后占用是否回落是判断泄漏的重要信号。", why: "体现排障经验。" }],
              advancedPoints: [{ point: "能结合 G1/ZGC/元空间、缓存、线程池、消息堆积讨论排查路径。", why: "体现系统视角。" }],
              deductPoints: [{ point: "一上来只说把堆调大", why: "没有排障方法论。" }],
              followUps: ["为什么 GC 后老年代不回落通常更像泄漏？", "元空间打满时该怀疑什么类型问题？"],
              answer30s: "线上 Full GC 频繁时，第一步不是改参数，而是先看 GC 日志和监控，确认是谁触发了 Full GC、回收后占用有没有明显回落。因为这可能是内存泄漏、分配压力、晋升失败或元空间问题，不同类型排查入口完全不同。",
              answer2min: "如果展开讲，我会先说 Full GC 频繁只是症状，先看日志和曲线确认触发原因、停顿时间和回收效果。如果 GC 后老年代仍降不下来，更像泄漏；如果能降下来但很快又涨满，可能是分配压力或缓存/消息堆积；如果伴随晋升问题，要看新生代和 Survivor 区；如果是元空间上涨，就要看类加载和动态代理。接着再结合发布时间、接口流量、堆 dump 和线程栈，确认到底是哪类对象或哪条业务链路把内存顶上去，最后才去改代码或 JVM 参数。",
              advancedAnswer: "更深入时，我会继续补 G1 日志里的 mixed/full 周期、堆 dump 看引用链的方法，以及为什么很多 Full GC 问题最后落到缓存设计、队列堆积、线程池背压而不只是 JVM 参数。",
              sources: [{ title: "Java HotSpot Garbage Collection Tuning Guide", url: "https://docs.oracle.com/en/java/javase/21/gctuning/", type: "official" }],
            },
          ],
        },
      ],
    },
  ];

  return banks.map((bank) => ({
    ...bank,
    chapters: bank.chapters.map((chapter) => ({
      ...chapter,
      documents: chapter.documents.map((doc) => ({
        ...doc,
        learningContent: buildLearningContent(doc),
        interviewContent: buildInterviewContent(doc),
      })),
    })),
  }));
}
