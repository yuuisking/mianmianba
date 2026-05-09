# 学习中心内容质量体系设计

> 目标：把学习中心从“题库内容生成”升级为“能帮助用户真正学会、能说清、能通过面试”的内容生产系统。

## 1. 核心判断

当前 `doc/agent-study.md` 的多 Agent 架构方向是正确的，但内容质量问题的根源不在于 Agent 数量，而在于缺少三层约束：

1. **事实底座**：内容生成前没有先沉淀可验证的事实卡片，Answerer 容易凭模型记忆写出看似正确但不稳定的内容。
2. **结构标准**：学习讲解、面试回答、追问链路、项目表达混在一起，导致内容有时像文章，有时像八股答案，难以稳定复用。
3. **发布闸门**：Reviewer 主要依赖模型打分和少量格式检查，缺少能够阻断发布的硬规则。

因此，学习中心不应该直接从“知识点”生成“题目答案”，而应该变成：

```text
资料/样本
-> 事实卡片
-> 知识图谱
-> 题目规划
-> 学习文档
-> 面试表达
-> 多维质检
-> 自动发布门禁
-> 异常内容进入人工队列
-> 用户表现反哺
```

产品目标不是让人每天审核内容，而是让系统默认自动生产、自动质检、自动返工、自动发布。人工只处理系统无法高置信判断的异常内容。

建议长期目标：

```text
95% 内容自动发布
4% 内容自动返工后发布
1% 高风险内容进入人工队列
```

## 2. 内容定位

面面吧的学习中心不是普通八股文，也不是单纯课程文章，而是“学习 + 模拟面试”的入口。

每一道题必须同时完成三件事：

1. **让用户懂**：能解释概念、机制、背景、边界。
2. **让用户会答**：能在面试中组织出 30 秒、1 分钟、深入追问三个层次的回答。
3. **让用户能迁移**：能把知识点放进真实项目、性能问题、故障排查或工程取舍里表达。

内容风格应该融合三类资料的优点：

- 面试题库：问题直接、命中高频、回答可背可说。
- 体系课程：前置知识清晰、机制讲透、上下游关系明确。
- 真实面试：追问自然、有深度递进、有项目场景。

## 3. 黄金样稿标准

`reference/yuque/` 下的 5 篇 PDF 可以作为第一批参考样本：

- `什么是CAS？存在什么问题？`
- `什么是fail-fast？什么是fail-safe？`
- `为什么Java不支持多继承？`
- `什么是多线程中的上下文切换？`
- `什么是Stop The World？`

这些样本适合作为“表达风格和知识覆盖参考”，但不能直接复制到产品中。平台最终内容必须重新组织为自己的结构。

### 3.1 黄金样稿必须包含的字段

```ts
type GoldenQuestionDocument = {
  id: string;
  title: string;
  audience: Array<"campus" | "social">;
  difficulty: "easy" | "medium" | "hard";
  topicPath: string[];
  prerequisites: string[];
  coreConclusion: string;
  learningNote: LearningNote;
  interviewAnswer: InterviewAnswer;
  followUpChain: FollowUpQuestion[];
  projectTransfer: ProjectTransfer;
  commonMistakes: string[];
  relatedQuestions: RelatedQuestion[];
  factCards: FactCard[];
  qualityReport: QualityReport;
};
```

### 3.2 标准内容结构

每一道题统一拆成以下模块：

#### 题目元信息

- 题目标题：真实面试官会问的自然问题。
- 适用人群：校招、社招或都适合。
- 难度：简单、中等、困难。
- 所属路径：如 `Java -> 并发编程 -> CAS`。
- 前置知识：用户理解本题前最好先掌握的概念。

#### 核心结论

用 2-4 句话给出最关键答案。要求用户只看这一段，也能知道面试时该往哪个方向答。

#### 学习讲解

用于“学懂”，不是背答案。必须包含：

- 概念定义。
- 出现背景：为什么需要这个机制。
- 核心机制：它到底怎么工作。
- 边界条件：什么情况下有效，什么情况下不适合。
- 对比关系：和相关概念有什么区别。
- 易错点：面试和学习中最容易混淆的地方。

#### 面试回答

用于“会说”，必须分层：

- **30 秒版**：适合校招、快速问答、暖场题。
- **1 分钟版**：适合大多数正式面试。
- **深入版**：适合社招、追问、二面技术深挖。

#### 面试官追问链路

追问必须递进，不允许只是列相关题。

示例链路：

```text
CAS 是什么？
-> CAS 为什么是乐观锁？
-> CAS 有什么问题？
-> ABA 怎么解决？
-> AtomicStampedReference 为什么能解决？
-> CAS 和 synchronized 怎么选？
-> 高并发下自旋会不会有性能问题？
```

#### 项目表达

帮助用户把知识点放到项目里说。尤其面向社招用户。

必须包含：

- 可落地场景。
- 可以怎么在简历或项目中表达。
- 面试官可能继续追问什么。
- 什么表达会显得空泛或危险。

#### 常见误区

每题至少 3 个误区。误区要具体，不能写“不要概念混淆”这种空话。

#### 关联题目

关联题必须标注关系：

- 前置。
- 延伸。
- 对比。
- 同场景。
- 高频追问。

## 4. 事实卡片体系

事实卡片是整个质量系统的地基。Answerer 不应该直接从题目写答案，而应该从事实卡片组装内容。

```ts
type FactCard = {
  id: string;
  topic: string;
  claim: string;
  explanation: string;
  evidenceType: "official" | "book" | "article" | "source-code" | "sample" | "human-review";
  sourceTitle?: string;
  sourceUrl?: string;
  sourceNote?: string;
  confidence: "high" | "medium" | "low";
  appliesTo?: string[];
  caveats?: string[];
  interviewValue: "must-know" | "useful" | "advanced";
};
```

### 4.1 事实卡片示例

以 CAS 为例：

```json
{
  "topic": "CAS",
  "claim": "CAS 包含内存位置、预期值和新值三个核心操作数。",
  "explanation": "线程更新变量时，会先比较当前值是否等于预期值；相等才写入新值，不相等则更新失败。",
  "evidenceType": "sample",
  "confidence": "high",
  "interviewValue": "must-know"
}
```

事实卡片的重点不是保存长文，而是保存“可复用、可验证、可组合”的知识原子。

## 5. 题目规划规则

题目不能靠模板批量扩写，必须先确定题型。

### 5.1 题型分类

| 题型 | 目标 | 示例 |
| --- | --- | --- |
| 概念定义 | 判断基础认知 | CAS 是什么？ |
| 机制原理 | 判断是否理解底层过程 | fail-fast 是怎么触发的？ |
| 对比辨析 | 判断边界和差异 | fail-fast 和 fail-safe 有什么区别？ |
| 问题缺陷 | 判断工程意识 | CAS 存在哪些问题？ |
| 解决方案 | 判断扩展知识 | ABA 问题怎么解决？ |
| 场景选择 | 判断应用能力 | CAS 和 synchronized 怎么选？ |
| 项目表达 | 判断实战经验 | 你项目里哪里用过 CAS 思想？ |
| 故障排查 | 判断定位能力 | 为什么线程很多但吞吐下降？ |

### 5.2 禁止生成的题目

以下题目应直接判定为不合格：

- 标题明显模板化：`xxx 的核心执行步骤能否按顺序拆开讲清楚？`
- 标题语病：`xxx 是什么 的核心执行步骤...`
- 问题过泛：`在高并发或大数据量场景下最关键的风险点是什么？`
- 与知识点关系弱：集合基础题里硬套高并发、大数据量。
- 一个题目问多个方向，导致答案无法聚焦。
- 只是同义改写，没有新的考察点。

## 6. 难度标准

难度不是按字数决定，而是按认知深度决定。

### 简单

用户需要能说清：

- 是什么。
- 有什么用。
- 常见例子。
- 和一个相邻概念的基本区别。

### 中等

用户需要能说清：

- 工作机制。
- 常见问题。
- 使用边界。
- 面试追问。
- 简单项目场景。

### 困难

用户需要能说清：

- 底层原理。
- 边界条件。
- 性能取舍。
- 失败案例。
- 项目落地。
- 和多个方案的选择依据。

### 硬规则

- `difficulty` 元数据必须和正文中的难度一致。
- 困难题不能只有定义和优缺点。
- 简单题不应该强塞源码和复杂系统设计。
- 社招题必须出现项目表达或工程取舍。

## 7. 校招和社招分层

同一道题可以同时服务校招和社招，但回答深度必须不同。

### 校招版本

重点：

- 概念准确。
- 机制说清。
- 常见误区不犯。
- 能接住 1-2 个追问。

表达方式：

```text
先说结论，再解释机制，最后补一个常见问题。
```

### 社招版本

重点：

- 机制背后的取舍。
- 项目中如何使用。
- 性能和稳定性风险。
- 遇到问题如何定位。

表达方式：

```text
先说结论，再说项目场景，然后讲取舍和风险，最后说明如何验证。
```

## 8. 多 Agent 升级方案

建议把现有流程升级为 9 个阶段。

```text
Topic Scout
-> Source Scout
-> Evidence Extractor
-> Concept Architect
-> Question Planner
-> Content Composer
-> Interview Drill Designer
-> Quality Reviewers
-> Publisher
```

### 8.1 Topic Scout

负责确定知识域和候选主题。

输出：

- 知识域。
- 高频主题。
- 主题优先级。
- 校招/社招覆盖建议。

### 8.2 Source Scout

负责收集参考资料。

资料优先级：

1. 官方文档。
2. JDK/JVM/框架源码或规范。
3. 经典书籍。
4. 高质量技术文章。
5. 用户提供的购买资料样本。
6. 平台历史内容和用户反馈。

### 8.3 Evidence Extractor

负责抽取事实卡片。

要求：

- 每个主题至少 5 张事实卡。
- hard 题至少 10 张事实卡。
- 每张事实卡必须有置信度。
- 不确定内容必须标记 caveat。

### 8.4 Concept Architect

负责构建知识图谱。

输出：

- 前置概念。
- 同级概念。
- 延伸概念。
- 高频追问。
- 易混概念。

### 8.5 Question Planner

负责规划题目，不负责写答案。

要求：

- 每题必须绑定题型。
- 每题必须绑定知识点。
- 每题必须说明考察目标。
- 不允许纯同义扩写。

### 8.6 Content Composer

负责根据事实卡片生成学习文档和面试回答。

约束：

- 不能引入事实卡片之外的关键技术结论。
- 如果需要补充新事实，必须回到 Evidence Extractor。
- 输出必须符合黄金样稿结构。

### 8.7 Interview Drill Designer

负责生成追问链路和模拟面试脚本。

输出：

- 追问链。
- 每个追问的考察点。
- 候选人优秀回答标准。
- 候选人危险回答。
- 面试官继续追问策略。

### 8.8 Quality Reviewers

拆成 4 个 Reviewer：

- **Fact Reviewer**：事实正确性。
- **Teacher Reviewer**：学习可理解性。
- **Interviewer Reviewer**：真实面试价值。
- **Product Reviewer**：是否符合面面吧内容结构和商业目标。

### 8.9 Publisher

负责自动发布状态流转。

```text
draft
-> generated
-> auto_reviewed
-> auto_rewrite_needed
-> auto_reviewed
-> auto_publishable
-> published
```

异常状态：

```text
blocked -> discarded
risky -> manual_queue
copyright_risk -> manual_queue
fact_conflict -> manual_queue
```

Publisher 的原则：

- 通过硬规则且分数足够高的内容自动发布。
- 分数不够但没有严重风险的内容自动返工。
- 返工超过次数仍不合格的内容废弃或进入人工队列。
- 出现事实冲突、版权风险、来源不足、质量分极低时，禁止自动发布。

## 9. 质量评分 Rubric

每篇内容总分 100 分，低于 85 分不能直接发布，低于 75 分必须废弃重写。自动发布建议使用更高阈值，避免低置信内容污染题库。

| 维度 | 分值 | 标准 |
| --- | ---: | --- |
| 事实准确性 | 25 | 技术结论正确，无明显误导，重要边界有说明 |
| 面试真实性 | 15 | 题目像真实面试会问，追问自然，有考察目标 |
| 学习完整性 | 15 | 背景、机制、例子、边界、误区完整 |
| 表达可复述性 | 15 | 用户能照着组织口头回答，不是散文式长文 |
| 分层适配 | 10 | 校招/社招、简单/中等/困难深度匹配 |
| 工程迁移 | 10 | 有项目场景、性能取舍或故障排查价值 |
| 结构规范 | 5 | 字段完整、格式一致 |
| 关联质量 | 5 | 前置、延伸、追问关系准确 |

### 9.1 一票否决项

出现以下任一问题，直接不能发布：

- 技术事实错误。
- 难度元数据和正文冲突。
- 标题语病或模板化严重。
- 内容疑似大段复制外部资料。
- hard 题没有原理或工程取舍。
- 社招题没有项目表达。
- 追问链路只是相关题堆砌，没有递进关系。

### 9.2 自动发布阈值

系统默认走自动发布，不默认进入人工审核。

| 条件 | 动作 |
| --- | --- |
| `score >= 92` 且无 blocker 且事实置信度足够 | 自动发布 |
| `88 <= score < 92` 且无 blocker | 自动返工 1 次，复评后如果 `score >= 92` 自动发布 |
| `80 <= score < 88` | 自动返工，最多 2 次；仍不达标则进入低优先级人工队列 |
| `score < 80` | 自动废弃并重新生成 |
| 存在 blocker | 禁止发布，按风险类型进入返工、废弃或人工队列 |
| 存在版权风险 | 禁止自动发布，进入人工队列 |
| 存在事实冲突 | 禁止自动发布，进入人工队列 |

### 9.3 自动返工机制

返工不是重新随机生成，而是带着错误报告定向修复。

```text
Quality Report
-> Rewrite Instruction
-> Targeted Rewrite
-> Re-score
-> Publish / Retry / Queue / Discard
```

每次返工必须保留：

- 原始分数。
- blocker 列表。
- reviewer 诊断。
- 修改目标。
- 修改后分数。
- 是否引入新风险。

建议最多返工 2 次。超过 2 次还不合格，说明题目规划、事实卡片或资料源存在问题，不应该继续浪费模型成本。

### 9.4 风险分级

| 风险等级 | 定义 | 处理方式 |
| --- | --- | --- |
| R0 | 高分、无阻断、来源稳定 | 自动发布 |
| R1 | 小问题，如表达不顺、结构轻微缺失 | 自动返工 |
| R2 | 深度不足、追问链弱、项目表达空泛 | 自动返工，失败后进人工队列 |
| R3 | 事实冲突、难度错配、疑似误导 | 禁止发布，进入人工队列 |
| R4 | 版权风险、严重事实错误、大段疑似复制 | 禁止发布，废弃或人工确认 |

## 10. 自动发布与后台审核设计

学习后台的核心不是让人逐篇审核，而是让系统自动发布，并把异常内容、风险趋势、生成质量暴露出来。

### 10.1 自动发布流水线

```text
Generate
-> Normalize
-> Hard Rule Check
-> Fact Review
-> Teacher Review
-> Interviewer Review
-> Product Review
-> Similarity Check
-> Score Merge
-> Auto Publish / Auto Rewrite / Manual Queue / Discard
```

自动发布必须同时满足：

- 质量分达到阈值。
- 没有一票否决项。
- 关键事实卡片置信度为 high 或 medium。
- 没有明显版权相似风险。
- 没有元数据冲突。
- 没有题目模板化问题。

### 10.2 人工只处理异常

人工队列只接收这些内容：

- 多次返工仍无法达标。
- 多个 Reviewer 判断冲突。
- 事实卡片来源不足。
- 出现技术事实冲突。
- 疑似版权风险。
- 准备标记为黄金样稿的内容。
- 高价值核心题，如 Java 并发、JVM、MySQL 索引、Redis 缓存一致性。

### 10.3 后台应展示

- 基础信息：题目、知识路径、难度、人群、题型。
- 事实卡片：关键结论、来源、置信度。
- 生成正文：学习讲解、面试回答、追问链、项目表达。
- 质量报告：总分、各维度分、阻断项。
- 风险提示：标题、事实、结构、难度、版权、表达。
- 自动决策：自动发布、自动返工、进入人工队列、废弃。
- 返工历史：每次返工原因、修改目标、复评分数。
- 人工操作：强制发布、退回修改、标记黄金样稿、禁止发布。

### 10.4 质量看板

后台需要一个质量看板，而不是只看单篇内容。

关键指标：

- 自动发布率。
- 自动返工成功率。
- 人工队列占比。
- 平均质量分。
- blocker 类型分布。
- 各题库质量分布。
- 各 Agent 失败率。
- 用户反馈问题分布。

目标值：

```text
自动发布率 >= 90%
自动返工成功率 >= 70%
人工队列占比 <= 5%
严重事实错误发布率 = 0
版权风险发布率 = 0
```

### 10.5 人工异常 Checklist

审核人只需要回答这些问题：

- 这个题真实面试会问吗？
- 用户看完能学懂吗？
- 用户能在 1 分钟内答出来吗？
- 有没有明显事实错误？
- 有没有容易误导用户的表述？
- 社招用户能不能迁移到项目里？
- 追问链路是不是自然递进？
- 有没有外部资料复制风险？

人工审核的目标不是改文章，而是判断系统为什么没能自动处理，并反向补规则、补事实卡片、补黄金样稿。

## 11. 样本使用规范

用户购买的语雀资料可以作为内部参考，但必须遵守以下原则：

1. 不直接复制原文到产品内容。
2. 不做逐段改写式搬运。
3. 只抽取知识点、结构特征、题目价值、表达风格。
4. 平台内容必须重组为自己的结构。
5. 事实卡片中可以记录“sample”类型来源，但发布内容不暴露付费资料原文。

## 12. 第一批黄金样稿建议

建议先把 5 篇样本变成平台内部黄金样稿。

### CAS

适合作为高质量标杆。

应扩展：

- CAS 三个操作数。
- 乐观锁和非阻塞。
- ABA 问题。
- AtomicStampedReference。
- 自旋开销。
- CAS 与 synchronized 的选择。
- JUC 中的应用场景。

### fail-fast / fail-safe

适合作为集合题标杆。

应扩展：

- fail-fast 作为系统设计理念。
- Java 集合中的 fail-fast。
- `modCount` 与 `expectedModCount`。
- `ConcurrentModificationException`。
- fail-safe 集合的快照或弱一致性语义。
- Iterator 使用误区。

### Java 不支持多继承

适合作为基础题标杆。

应扩展：

- 菱形继承。
- C++ 虚继承。
- Java 类单继承。
- 接口多实现。
- Java 8 default method 冲突解决。
- 设计取舍：简单性、可维护性、低歧义。

### 上下文切换

适合作为“短文升级样本”。

应补充：

- 保存和恢复哪些上下文。
- 用户态/内核态切换。
- 阻塞、锁竞争、线程过多和上下文切换的关系。
- 如何观测和优化。
- 线程池参数为什么不是越大越好。

### Stop The World

适合作为 JVM 题标杆。

应补充：

- STW 定义。
- 为什么标记阶段需要暂停或配合屏障。
- 漏标和多标。
- 浮动垃圾。
- 不同 GC 对 STW 的优化方向。
- 线上如何观察 STW。

## 13. 落地路线

### P0：先止血

目标：让当前 Java 基础、Java 集合不再出现明显质量问题。

任务：

- 加标题质量检查。
- 加难度一致性检查。
- 加模板化题目拦截。
- 加 hard 题深度检查。
- 加社招题项目表达检查。

### P1：建立黄金样稿

目标：完成 5 篇样本的内部标准化。

任务：

- 每篇拆成标准结构。
- 每篇抽取事实卡片。
- 每篇设计追问链路。
- 每篇产出 30 秒、1 分钟、深入版回答。
- 每篇打质量分。

### P2：升级 Agent 流程

目标：让生成从“模型写答案”变成“事实卡片驱动生成”。

任务：

- 新增 Source Scout。
- 新增 Evidence Extractor。
- 新增 Question Planner。
- 改造 Answerer 为 Content Composer。
- 改造 Reviewer 为多 Reviewer。

### P3：自动发布闭环

目标：默认自动发布，人工只处理异常。

任务：

- 展示质量分。
- 展示阻断项。
- 展示事实卡片。
- 加自动发布阈值。
- 加自动返工队列。
- 加人工异常队列。
- 加返工历史。
- 支持一键标记黄金样稿。
- 支持退回并带修改建议。

### P4：用户反馈反哺

目标：让真实用户数据提升内容质量。

任务：

- 记录用户看完后的练习正确率。
- 记录模拟面试中本题相关回答得分。
- 收集“看不懂/不准确/太浅/太长”反馈。
- Content Updater 定期根据反馈生成修订建议。

## 14. 最小可行数据结构

为了快速落地，可以先不大改数据库，先在文件存储中增加以下结构：

```ts
type LearningQuestionQuality = {
  score: number;
  riskLevel: "R0" | "R1" | "R2" | "R3" | "R4";
  decision: "auto_publish" | "auto_rewrite" | "manual_queue" | "discard";
  blockers: string[];
  warnings: string[];
  rewriteCount: number;
  reviewerDisagreements: string[];
  dimensions: {
    factualAccuracy: number;
    interviewAuthenticity: number;
    learningCompleteness: number;
    answerRepeatability: number;
    audienceFit: number;
    engineeringTransfer: number;
    structure: number;
    relationQuality: number;
  };
};

type LearningAutoPublishPolicy = {
  minAutoPublishScore: number;
  minRewriteScore: number;
  maxRewriteCount: number;
  requireNoBlockers: boolean;
  requireFactConfidence: Array<"high" | "medium">;
  blockOnCopyrightRisk: boolean;
  blockOnFactConflict: boolean;
};

type LearningQuestionContentV2 = {
  title: string;
  audience: Array<"campus" | "social">;
  difficulty: "easy" | "medium" | "hard";
  questionType: string;
  prerequisites: string[];
  coreConclusion: string;
  learningNote: string;
  interviewAnswer30s: string;
  interviewAnswer1m: string;
  interviewAnswerDeep: string;
  followUps: Array<{
    question: string;
    intent: string;
    expectedAnswer: string;
    nextIfStrong?: string;
    nextIfWeak?: string;
  }>;
  projectTransfer: string;
  commonMistakes: string[];
  relatedQuestions: Array<{
    title: string;
    relation: "prerequisite" | "extension" | "contrast" | "scenario" | "follow-up";
  }>;
  factCards: FactCard[];
  quality: LearningQuestionQuality;
  publishPolicy: LearningAutoPublishPolicy;
  rewriteHistory: Array<{
    scoreBefore: number;
    scoreAfter: number;
    blockersBefore: string[];
    rewriteInstruction: string;
    changedSections: string[];
  }>;
};
```

### 14.1 富内容块结构

当前 `TopicContent` 只有 `paragraphs / bullets / callout`，只能产出文字摘要，很难达到语雀八股文那种“图文 + 表格 + 代码 + 讲解”的质量。V2 必须引入富内容块。

```ts
type RichContentBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "heading";
      level: 2 | 3;
      text: string;
    }
  | {
      type: "list";
      items: string[];
    }
  | {
      type: "table";
      columns: string[];
      rows: string[][];
    }
  | {
      type: "code";
      language: string;
      title?: string;
      code: string;
      explanation?: string;
    }
  | {
      type: "diagram";
      diagramType: "ascii-tree" | "structure" | "image" | "mermaid";
      title?: string;
      code: string;
      explanation?: string;
    }
  | {
      type: "callout";
      tone: "tip" | "warning" | "interview" | "mistake";
      text: string;
    };

type LearningQuestionContentV2 = {
  title: string;
  audience: Array<"campus" | "social">;
  difficulty: "easy" | "medium" | "hard";
  questionType: string;
  prerequisites: string[];
  coreConclusion: string;
  learningBlocks: RichContentBlock[];
  interviewAnswer30s: string;
  interviewAnswer1m: string;
  interviewAnswerDeep: string;
  followUps: Array<{
    question: string;
    intent: string;
    expectedAnswer: string;
  }>;
  projectTransfer: RichContentBlock[];
  commonMistakes: string[];
  factCards: FactCard[];
  quality: LearningQuestionQuality;
};
```

### 14.2 富内容最低标准

普通题最低要求：

- 至少 1 个概念解释段落。
- 至少 1 个对比表、结构图或代码例子。
- 至少 1 个面试回答分层。
- 至少 3 个追问。
- 至少 3 个常见误区。

实现/源码/集合/并发类题最低要求：

- 必须有代码示例。
- 必须有对比表、类结构图或关键结构示意。
- 必须解释代码输出或行为原因。
- 必须给出项目使用场景或踩坑场景。

### 14.3 图示风格策略

Mermaid 不作为默认图示方案。基础八股题如果大量使用 Mermaid 流程图，很容易产生 AI 味儿，像“自动总结”而不是技术文章。

图示优先级：

1. **Markdown 表格**：最适合对比题，例如 `List / Set / Map`、`ArrayList / LinkedList`。
2. **ASCII 结构图**：最适合类层级、数据结构、继承关系，例如集合体系结构。
3. **代码 + 输出**：最适合行为差异题，例如 List 保留重复、Set 去重、Map 覆盖 key。
4. **手写/图片类结构图**：后续如果有图片资产或自动绘图能力，可以用于复杂源码结构。
5. **Mermaid**：只用于复杂流程、状态机、链路流转，不用于简单基础题的默认解释。

Mermaid 适合：

- JVM 类加载流程。
- Spring Bean 生命周期。
- 事务传播链路。
- MQ 消息可靠性流程。
- 系统设计链路。

Mermaid 不适合：

- `List、Set、Map 有什么区别？`
- `HashMap 和 Hashtable 有什么区别？`
- `String、StringBuilder、StringBuffer 有什么区别？`
- 这类基础对比题更应该使用表格、结构图和代码。

以 `List、Set、Map 有什么区别？` 为例，合格内容不应该只有几句话总结，而应该至少包含：

- 三者定位对比表。
- 常用实现类对比表。
- 集合体系 ASCII 结构图。
- 一段去重、保持顺序、按 key 查询的 Java 代码。
- 代码输出与行为解释。
- 30 秒回答、1 分钟回答、深入追问回答。
- 常见误区，例如“Set 一定无序”“Map 是 Collection 子接口”“LinkedList 查询快”等。

## 15. 判断标准

一篇内容能不能成为面面吧的高质量内容，看三个问题就够了：

1. 用户看完以后，能不能真的理解这个知识点？
2. 用户进入模拟面试后，能不能用自己的话答出来？
3. 面试官继续追问时，用户有没有继续往下说的材料？

如果答案都是“是”，这篇内容才值得发布。

## 16. 现有代码改造方案

本节说明如何把上面的质量体系落到当前项目代码中。改造原则是小步推进：先兼容现有 `TopicContent`，再逐步引入 V2 内容结构，避免一次性重构学习中心。

### 16.1 当前相关模块

| 模块 | 当前职责 | 改造方向 |
| --- | --- | --- |
| `src/lib/learning/contentQuality.ts` | 结构规整、基础质量评分 | 升级为硬规则 + 风险分级 + 自动发布决策 |
| `src/lib/learning/agentBankBuilder.ts` | Architect/Questioner/Answerer/Reviewer/Linker 流程 | 插入 Evidence Extractor、Question Planner、Auto Publisher |
| `src/lib/learning/starterBankBlueprints.ts` | 内置题库蓝图和扩题逻辑 | 去掉模板化扩写，改成题型驱动扩展 |
| `src/lib/db/learningDb.ts` | 文件型学习中心数据读写 | 增加 V2 富内容块与质量元数据的兼容读写 |
| `src/lib/learning/questionDetail.ts` | 前台题目详情聚合 | 兼容展示 30 秒答案、追问链、项目表达、代码块和图示 |
| `src/app/api/admin/learning/studio/route.ts` | 后台生成入口 | 返回自动发布、返工、人工队列统计 |
| `src/app/api/admin/learning/questions/*` | 后台题目管理 | 支持质量报告和发布决策查看 |
| `src/app/api/learning/questions/[questionId]/route.ts` | 前台题目详情 API | 透出必要的 V2 富内容字段 |
| `src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/QuestionDetailClient.tsx` | 题目详情页渲染 | 渲染富内容块、表格、代码、Mermaid 图 |

### 16.2 第一阶段：先升级质量门禁

目标：不改变前台 UI，不大改数据结构，先让低质量内容进不了发布结果。

改动文件：

- `src/lib/learning/contentQuality.ts`
- `src/lib/learning/agentBankBuilder.ts`

新增类型：

```ts
type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4";
type PublishDecision = "auto_publish" | "auto_rewrite" | "manual_queue" | "discard";

type AutoPublishDecision = {
  riskLevel: RiskLevel;
  decision: PublishDecision;
  reason: string;
  blockers: string[];
  warnings: string[];
};
```

`contentQuality.ts` 增加这些能力：

- `detectTitleQuality(title)`：检查标题语病、模板化、过泛问题。
- `detectDifficultyMismatch(content, metadata)`：检查正文难度和元数据是否冲突。
- `detectTemplateScaffold(content)`：拦截答题模板残留。
- `detectDepthRisk(content, difficulty, audience)`：检查 hard/社招题是否有原理、边界、工程取舍。
- `detectCopyrightSimilarityRisk(content, sources)`：先做本地轻量相似度风险提示，后续再接更严格算法。
- `decideAutoPublish(report)`：根据分数、blocker、风险等级给出发布决策。

建议先把现有 `evaluateContentQuality` 扩展，而不是重写：

```ts
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
```

`agentBankBuilder.ts` 的 `runReviewerStage` 改造：

```text
model review
-> local hard rule check
-> merge quality report
-> decide auto publish
-> accepted / rewrite / manual_queue / discard
```

第一阶段不一定真的实现人工队列，可以先把 `manual_queue` 写入 warnings，并禁止自动发布。

### 16.3 第二阶段：加入自动返工循环

目标：不合格内容先自动修，不直接丢给人。

改动文件：

- `src/lib/learning/agentBankBuilder.ts`
- `src/lib/learning/contentQuality.ts`
- `src/lib/db/learningStudio.ts`

在 `runAnswererStage` 和 `runReviewerStage` 之间加入返工循环：

```text
answer
-> review
-> if auto_publish: keep
-> if auto_rewrite: rewrite with quality report
-> review again
-> if still bad after max retry: manual_queue or discard
```

新增函数建议：

```ts
async function runRewriterStage(input: {
  bankName: string;
  categoryTitle: string;
  question: QuestionPlan;
  previousContent: TopicContent;
  qualityReport: ContentQualityReport;
}): Promise<AnswerPlan>;
```

重写 Prompt 不能让模型自由发挥，要明确告诉它：

- 哪些 blocker 必须修。
- 哪些 section 需要重写。
- 哪些事实不能改变。
- 不能引入外部资料原文。
- 输出仍然必须是结构化 JSON。

`learningStudio` 记录返工历史：

```ts
type RewriteHistoryItem = {
  questionId: string;
  attempt: number;
  scoreBefore: number;
  scoreAfter?: number;
  blockersBefore: string[];
  rewriteInstruction: string;
  changedSections?: string[];
};
```

### 16.4 第三阶段：引入事实卡片

目标：让答案从“模型写”升级成“事实驱动生成”。

新增文件建议：

- `src/lib/learning/factCards.ts`
- `src/lib/learning/evidenceExtractor.ts`

`factCards.ts` 负责类型和基础校验：

```ts
export type FactCard = {
  id: string;
  topic: string;
  claim: string;
  explanation: string;
  evidenceType: "official" | "book" | "article" | "source-code" | "sample" | "human-review";
  sourceTitle?: string;
  sourceUrl?: string;
  sourceNote?: string;
  confidence: "high" | "medium" | "low";
  appliesTo?: string[];
  caveats?: string[];
  interviewValue: "must-know" | "useful" | "advanced";
};
```

`evidenceExtractor.ts` 负责从资料、样本、已有内容中抽取事实卡片：

```text
source text
-> atomic claims
-> merge duplicates
-> confidence scoring
-> caveat tagging
-> fact cards
```

`agentBankBuilder.ts` 流程升级：

```text
Architect
-> Source Scout
-> Evidence Extractor
-> Question Planner
-> Content Composer
-> Interview Drill Designer
-> Quality Reviewers
-> Auto Publisher
```

短期可先用 `reference/yuque` 的 PDF 抽取样本事实卡片，作为黄金样稿参考。注意只抽事实和结构，不复制原文。

### 16.5 第四阶段：V2 内容结构兼容

目标：让学习详情页真正展示“学习 + 图文讲解 + 代码示例 + 面试 + 追问 + 项目表达”。

改动文件：

- `src/lib/db/learningDb.ts`
- `src/lib/learning/questionDetail.ts`
- `src/app/learning/[kbId]/questions/[questionId]/*`
- `src/app/api/learning/questions/[questionId]/route.ts`
- `src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/QuestionDetailClient.tsx`

兼容策略：

- 旧内容仍然按 `TopicContent` 展示。
- 新内容优先读取 `contentV2`。
- 没有 `contentV2` 时，用 `normalizeStructuredContent` 生成兼容视图。

建议文件型数据先这样扩展：

```ts
type LearningQuestionRecordV2 = {
  content: TopicContent;
  contentV2?: LearningQuestionContentV2;
};
```

前台展示顺序建议：

```text
核心结论
-> 学习讲解
-> 对比表
-> 图示
-> 代码示例
-> 代码解析
-> 30 秒面试回答
-> 1 分钟面试回答
-> 深入追问
-> 项目表达
-> 常见误区
-> 关联题目
```

兼容规则：

- 老数据继续读取 `content.sections`，不破坏现有页面。
- 新数据优先读取 `contentV2.learningBlocks`。
- 如果 `contentV2` 不存在，但 `sections` 里包含 Markdown 表格、ASCII 结构图、Mermaid 或代码块，详情页也要能渲染。
- `questionDetail.ts` 需要从 V2 或 Markdown 代码块中提取 `answer.codeExample`，从 V2 diagram 中提取图示；只有 `diagramType === "mermaid"` 时才进入 Mermaid 渲染。
- `QuestionDetailClient.tsx` 需要支持按 block 渲染：paragraph、table、code、diagram、callout，而不是只把 paragraphs/bullets 拼成纯 Markdown。

### 16.5.1 生成 Agent 输出协议升级

Answerer / Content Composer 的 JSON 输出不能再只要求三段文字，必须要求富内容块。

新的输出协议：

```json
{
  "questionId": "",
  "title": "",
  "contentV2": {
    "coreConclusion": "",
    "learningBlocks": [],
    "interviewAnswer30s": "",
    "interviewAnswer1m": "",
    "interviewAnswerDeep": "",
    "followUps": [],
    "projectTransfer": [],
    "commonMistakes": []
  }
}
```

集合类题的 Prompt 必须明确要求：

- 用表格比较 `List / Set / Map` 的定位、是否有序、是否可重复、典型实现、典型场景。
- 用 ASCII 结构图展示集合体系，例如 `Collection -> List / Set`，`Map -> HashMap / TreeMap`。
- 用 Java 代码演示 List 保留重复、Set 去重、Map 根据 key 查询。
- 解释代码输出。
- 给出面试回答分层和追问链。
- 禁止默认使用 Mermaid；只有复杂流程题才允许使用 Mermaid。

### 16.5.2 质量门禁升级

`contentQuality.ts` 的评分维度要增加富内容要求：

- `visualCompleteness`：是否有图示或表格。
- `codeExampleQuality`：代码是否存在、是否能解释行为。
- `comparisonDepth`：对比题是否有表格，表格是否覆盖关键维度。
- `exampleGrounding`：是否有可运行或接近真实的例子。

阻断规则：

- 集合/并发/源码/实现类题没有代码示例，不能自动发布。
- 对比类题没有对比表，不能自动发布。
- 流程/机制类题没有结构图、流程拆解或代码推导，不能自动发布。
- 代码没有解释输出或行为原因，不能自动发布。
- 基础对比题使用 Mermaid 但没有表格或代码，不能自动发布。

### 16.6 第五阶段：后台自动化看板

目标：让你不用逐篇看内容，只看系统运行质量。

改动文件：

- `src/app/admin/learning/page.tsx`
- `src/app/admin/learning/[kbId]/page.tsx`
- `src/app/api/admin/learning/studio/route.ts`
- `src/app/api/admin/learning/questions/route.ts`

后台新增模块：

- 自动发布率。
- 自动返工成功率。
- 人工异常队列数量。
- R0-R4 风险分布。
- blocker 排行。
- 最近生成失败原因。
- 低分题库排行。
- 黄金样稿覆盖率。

单题后台展示：

- 质量总分。
- 自动决策。
- blocker/warning。
- 返工历史。
- 事实卡片。
- 一键重跑质检。
- 一键重写。
- 标记黄金样稿。

### 16.7 第六阶段：用户反馈反哺

目标：让内容质量随着用户使用自动变好。

改动文件：

- `src/app/api/learning/progress/route.ts`
- `src/app/api/learning/practice/evaluate/route.ts`
- `src/app/api/learning/assistant/route.ts`
- `src/lib/learning/contentQuality.ts`

新增反馈信号：

- 用户看完后练习是否答对。
- 用户在模拟面试中该知识点回答得分。
- 用户是否收藏、反复查看、跳出。
- 用户是否点击“看不懂/太浅/不准确/太长”。
- AI 助手是否频繁被问同一个解释。

反馈进入 `Content Updater`：

```text
low score answer
-> identify weak concept
-> find related question
-> mark content weakness
-> generate improvement suggestion
-> auto rewrite if safe
```

## 17. 推荐开发顺序

### 第 1 步：硬规则门禁

优先改：

- `src/lib/learning/contentQuality.ts`
- `src/lib/learning/agentBankBuilder.ts`

验收标准：

- 模板化标题能被拦截。
- 难度不一致能被拦截。
- hard 题太浅能被拦截。
- 社招题没有项目表达能被拦截。
- 输出包含 `riskLevel` 和 `decision`。

### 第 2 步：自动返工

优先改：

- `runReviewerStage`
- 新增 `runRewriterStage`
- `learningStudio` 增加返工历史。

验收标准：

- `score 88-91` 的内容会自动重写一次。
- 返工后重新评分。
- 最多重试 2 次。
- 仍不合格进入 `manual_queue` 或 `discard`。

### 第 3 步：事实卡片

优先新增：

- `src/lib/learning/factCards.ts`
- `src/lib/learning/evidenceExtractor.ts`

验收标准：

- 每题至少生成 5 张事实卡片。
- hard 题至少 10 张事实卡片。
- 答案中的关键结论能在事实卡片中找到对应 claim。

### 第 4 步：V2 展示

优先改：

- `questionDetail.ts`
- 题目详情页组件。
- 题目详情 API。
- `learningDb.ts` 的富内容兼容读写。
- `starterBankBlueprints.ts` 的富内容样稿。

验收标准：

- 前台能看到 30 秒答案、1 分钟答案、追问链、项目表达。
- 前台能看到表格、ASCII 结构图、代码示例；复杂流程题才使用 Mermaid。
- `List、Set、Map 有什么区别？` 必须包含对比表、集合体系结构图、Java 代码和代码解析。
- 旧题库不崩。
- 新旧数据能兼容。

### 第 4.1 步：先做集合题富内容样板

优先只拿 `Java 集合 -> List、Set、Map 有什么区别？` 做黄金样板，不急着全量铺开。

验收标准：

- 知识点总结不能只是摘要，必须像一篇完整文章。
- 有 `List / Set / Map` 对比表。
- 有常见实现类对比表。
- 有集合体系 ASCII 结构图，不能默认用 Mermaid。
- 有 Java 代码示例。
- 有代码输出和行为解释。
- 有 30 秒、1 分钟、深入追问三个回答层次。
- 有常见误区。
- 页面渲染效果像文档，而不是只有几条 bullet。

### 第 5 步：后台看板

优先改：

- admin learning 页面。
- studio API。

验收标准：

- 能看到自动发布率。
- 能看到返工成功率。
- 能看到风险分布。
- 能查看单题质量报告。

## 18. 不建议一开始做的事

- 不建议一开始大改 Prisma schema。当前学习中心很多逻辑走文件存储，先用 JSON 兼容 V2 更快。
- 不建议一次性重做全部题库。先拿 Java 基础、Java 集合验证流水线。
- 不建议先做复杂版权相似度系统。第一版可以先做 n-gram/Jaccard/最长公共片段风险提示。
- 不建议把人工队列做成复杂工作流。第一版只要能标记 `manual_queue` 并在后台筛选即可。
- 不建议继续扩 20 个题库。先把 2 个题库打磨成自动化样板。
