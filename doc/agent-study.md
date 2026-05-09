# 多 Agent 协作面试题库采集生成系统技术方案

> 版本：v1.0
> 日期：2026-05-05
> 作者：AI Assistant
> 状态：待评审

---

## 目录

1. [背景与问题](#1-背景与问题)
2. [设计目标](#2-设计目标)
3. [核心设计思想](#3-核心设计思想)
4. [系统架构](#4-系统架构)
5. [Agent 详细设计](#5-agent-详细设计)
6. [协作流程](#6-协作流程)
7. [Prompt 工程](#7-prompt-工程)
8. [数据模型](#8-数据模型)
9. [错误处理与重试](#9-错误处理与重试)
10. [性能与成本](#10-性能与成本)
11. [风险与应对](#11-风险与应对)
12. [迭代路线图](#12-迭代路线图)
13. [全自动运营闭环](#13-全自动运营闭环)
14. [附录](#14-附录)

---

## 1. 背景与问题

### 1.1 业务背景

面面吧学习中心正在从"语雀式文档系统"重构为"面试鸭式题库系统"。新系统的核心是以"题目"为单位组织学习内容，每道题包含：
- 题干（面试问法）
- 难度分级
- 标签体系
- 结构化参考答案（核心要点 + 详细解析 + 代码示例）
- 关联题目
- 面试频率标注

### 1.2 当前方案的问题

当前实现采用**单 Agent 单 Prompt** 方案：

```
用户输入主题 → 一个 Prompt 要求 AI 同时生成：
  - 知识库信息
  - 分类结构
  - 所有题目
  - 所有答案
  → 一次性返回 JSON → 入库
```

**问题清单：**

| # | 问题 | 影响 |
|---|------|------|
| 1 | Prompt 过长（>3000 tokens） | 模型注意力分散，各部分质量不均 |
| 2 | 角色混杂 | 同时要求 AI 做"架构设计"+"出题"+"写答案"+"审核"，每个角色都不专业 |
| 3 | 不可控 | 黑盒生成，无法干预中间过程 |
| 4 | 错误难定位 | 如果某道题答案有误，不知道是哪一步出的问题 |
| 5 | 无法迭代优化 | 改 Prompt 牵一发而动全身 |
| 6 | 质量参差 | 分类可能合理但题目质量差，或题目好但分类混乱 |

### 1.3 为什么需要多 Agent

借鉴软件工程中的**单一职责原则（SRP）**和**流水线（Pipeline）**思想：

> 让一个 Agent 只做一件事，把这件事做到极致。

多 Agent 协作的优势：

| 维度 | 单 Agent | 多 Agent |
|------|---------|---------|
| **专业性** | 一个模型做所有事，容易泛泛而谈 | 每个 Agent 专注一个领域，输出更专业 |
| **质量控制** | 一次性生成，错误难以发现 | 多轮审核，层层把关 |
| **可调试性** | 黑盒，出问题不知道在哪 | 每个环节有明确输入输出，可单独测试 |
| **扩展性** | 改 Prompt 牵一发而动全身 | 新增 Agent 不影响现有流程 |
| **可控性** | 不可干预 | 每个环节可人工审查、可重试、可跳过 |
| **一致性** | 长文本导致前后矛盾 | 短文本聚焦，输出更一致 |

---

## 2. 设计目标

### 2.1 功能目标

1. **输入**：用户提供一个面试主题（如"Java后端"、"Redis"、"微服务架构"）
2. **输出**：一个完整的知识库，包含：
   - 知识库元信息（名称、副标题、描述、标签）
   - 3-8 个分类，覆盖该领域核心考点
   - 每分类 3-10 道高质量面试题
   - 每道题有完整的结构化参考答案
   - 题目间有关联关系
   - 全部保存为草稿状态，等待人工终审

### 2.2 质量目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 题目真实性 | >90% | 题目必须是真实面试中出现过的 |
| 答案准确性 | >95% | 技术内容不能有明显错误 |
| 答案完整性 | >90% | 必须覆盖面试必答的核心要点 |
| 分类合理性 | >85% | 分类结构符合该领域知识体系 |
| 关联准确性 | >80% | 关联题目确实有知识点关联 |

### 2.3 性能目标

| 指标 | 目标值 |
|------|--------|
| 生成一个知识库（30题） | < 60 秒 |
| 单题生成耗时 | < 5 秒 |
| 系统并发 | 支持 3 个知识库同时生成 |

---

## 3. 核心设计思想

### 3.1 分而治之（Divide and Conquer）

将"生成一个完整知识库"这个复杂任务，拆分为 6 个独立的子任务，每个子任务由一个专门的 Agent 负责。

### 3.2 流水线（Pipeline）

Agent 之间通过**明确的数据契约**连接，前一个 Agent 的输出是后一个 Agent 的输入。

### 3.3 质量关卡（Quality Gate）

在关键环节设置审核 Agent，不达标的输出返回上游重新生成。

### 3.4 人机协作（Human-in-the-Loop）

关键节点（如分类结构确定、审核不通过的题目）允许人工介入。

---

## 4. 系统架构

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户界面层 (UI Layer)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  学习后台 /admin/learning                                            │   │
│  │  - 输入主题                                                          │   │
│  │  - 配置参数（题目数量、难度分布等）                                    │   │
│  │  - 查看生成进度                                                      │   │
│  │  - 人工审核与发布                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           编排调度层 (Orchestration Layer)                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Pipeline Orchestrator                                              │   │
│  │  - 管理 Agent 执行顺序                                               │   │
│  │  - 处理并行/串行逻辑                                                 │   │
│  │  - 状态机管理（pending → running → done → error）                    │   │
│  │  - 重试策略                                                          │   │
│  │  - 人工介入点控制                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐         ┌──────────────────────┐         ┌───────────────┐
│Agent 7:       │         │    Agent 1: 架构师    │         │Agent 8:       │
│Topic Scout    │         │    (Architect)       │         │Content Updater│
│(主题发现员)    │         └──────────────────────┘         │(内容更新员)    │
└───────┬───────┘                    │                     └───────┬───────┘
        │                            │                             │
        │ 发现新主题                  │                             │ 检测更新
        └──────────────►             │                             └──────►
                           ┌─────────┼─────────┐
                           ▼         ▼         ▼
                    ┌──────────┐ ┌──────────┐ ┌──────────┐
                    │ Agent 2  │ │ Agent 3  │ │ Agent 4  │
                    │Questioner│ │Answerer  │ │Reviewer  │
                    └────┬─────┘ └────┬─────┘ └────┬─────┘
                         │            │            │
                         └────────────┼────────────┘
                                      ▼
                           ┌──────────────────┐
                           │   Agent 5:       │
                           │   Linker         │
                           │   (关联员)        │
                           └────────┬─────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │   Agent 6:       │
                           │   Persister      │
                           │   (入库员)        │
                           └────────┬─────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            数据持久层 (Data Layer)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │KnowledgeBase│  │  Category   │  │  Question   │  │GenerationRecord │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         外部服务层 (External Services)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DeepSeek API (deepseek-chat)                                       │   │
│  │  - 温度：0.3-0.7（根据 Agent 调整）                                  │   │
│  │  - Max Tokens：2000-8000（根据 Agent 调整）                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Agent 协作流程图

```
用户输入主题
    │
    ▼
┌─────────────────┐
│  Agent 1: 架构师 │ ──→ 输出：知识库骨架（名称、分类列表）
│  设计知识库结构   │
└─────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  并行调用 Agent 2: 出题员（每个分类一次）  │
│  为每个分类生成面试题目                    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  并行调用 Agent 3: 答案师（每道题一次）    │
│  为每道题写参考答案                        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Agent 4: 审核员                         │
│  逐题审核质量                             │
│  ┌─────────────────┐                    │
│  │ 评分 >= 阈值？   │──No──→ 返回修改    │
│  └─────────────────┘                    │
│         Yes                             │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────┐
│  Agent 5: 关联员 │ ──→ 输出：题目关联关系
│  建立题目关联    │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Agent 6: 入库员 │ ──→ 保存到数据库（draft 状态）
│  数据持久化      │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  人工终审        │ ──→ 发布 / 修改 / 删除
│  管理员审核      │
└─────────────────┘
```

### 4.3 状态机

```
                    ┌─────────────┐
                    │   PENDING   │
                    │   （待启动）  │
                    └──────┬──────┘
                           │ 用户点击"开始生成"
                           ▼
                    ┌─────────────┐
         ┌─────────│  ARCHITECT  │
         │         │  （架构设计） │
         │         └──────┬──────┘
         │                │ 完成
         │                ▼
         │         ┌─────────────┐
         │         │ QUESTIONING │◄────────────────┐
         │         │  （出题中）  │                 │
         │         └──────┬──────┘                 │
         │                │ 完成                   │
         │                ▼                        │
         │         ┌─────────────┐                 │
         │         │  ANSWERING  │                 │
         │         │  （写答案）  │                 │
         │         └──────┬──────┘                 │
         │                │ 完成                   │
         │                ▼                        │
         │         ┌─────────────┐    评分<阈值     │
         │         │  REVIEWING  │─────────────────┘
         │         │  （审核中）  │
         │         └──────┬──────┘
         │                │ 通过
         │                ▼
         │         ┌─────────────┐
         │         │   LINKING   │
         │         │  （建关联）  │
         │         └──────┬──────┘
         │                │ 完成
         │                ▼
         │         ┌─────────────┐
         │         │  PERSISTING │
         │         │  （入库中）  │
         │         └──────┬──────┘
         │                │ 完成
         │                ▼
         │         ┌─────────────┐
         └────────►│   DONE      │
                   │  （已完成）  │
                   └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │ HUMAN  │  │ HUMAN  │  │ HUMAN  │
         │REVIEW  │  │ MODIFY │  │ REJECT │
         │（审核） │  │（修改） │  │（驳回） │
         └───┬────┘  └───┬────┘  └───┬────┘
             │           │           │
             ▼           ▼           ▼
        ┌────────┐  ┌────────┐  ┌────────┐
        │PUBLISH │  │ UPDATE │  │ DELETE │
        │（发布） │  │（更新） │  │（删除） │
        └────────┘  └────────┘  └────────┘

任何阶段都可能转移到 ERROR 状态：
  ┌─────────┐
  │  ERROR  │
  │（出错）  │
  └────┬────┘
       │ 可重试
       └──────► 回到上一状态
```

---

## 5. Agent 详细设计

### 5.1 Agent 1: 架构师 (Architect)

**职责**：设计知识库的整体骨架

**输入**：
```typescript
interface ArchitectInput {
  topic: string;           // 用户输入的主题，如"Java后端"
  preferredCategoryCount?: number; // 期望分类数量（可选，默认自动）
}
```

**输出**：
```typescript
interface ArchitectOutput {
  name: string;            // 知识库名称
  subtitle: string;        // 一句话描述
  description: string;     // 详细描述
  tags: string[];          // 标签
  categories: Array<{
    name: string;          // 分类名称
    description: string;   // 分类描述（考察重点）
    sortOrder: number;     // 排序
  }>;
}
```

**设计原则**：
- 分类数量 4-8 个
- 分类之间要有逻辑递进关系（基础→进阶→高级）
- 分类命名用面试场景化表达
- 每个分类有明确的考察重点描述

**温度**：0.3（低温度，保证结构稳定）
**Max Tokens**：2000

---

### 5.2 Agent 2: 出题员 (Questioner)

**职责**：为指定分类生成面试题目

**输入**：
```typescript
interface QuestionerInput {
  categoryName: string;        // 分类名称
  categoryDescription: string; // 分类描述
  knowledgeBaseTopic: string;  // 所属知识库主题
  questionCount: number;       // 需要生成的题目数量
}
```

**输出**：
```typescript
interface QuestionerOutput {
  questions: Array<{
    title: string;              // 面试题干
    difficulty: "easy" | "medium" | "hard";
    tags: string[];             // 技术标签
    interviewFrequency: "high" | "medium" | "low";
  }>;
}
```

**设计原则**：
- 题目必须是真实面试中出现过的
- 题干用面试官口吻
- 难度分布：简单 30%、中等 50%、困难 20%
- 标签要具体到技术点

**温度**：0.5（中等温度，保证多样性）
**Max Tokens**：3000

**并行策略**：每个分类独立调用一次，多个分类并行执行

---

### 5.3 Agent 3: 答案师 (Answerer)

**职责**：为指定题目写参考答案

**输入**：
```typescript
interface AnswererInput {
  questionTitle: string;       // 题目
  categoryName: string;        // 所属分类
  categoryDescription: string; // 分类描述
  difficulty: string;          // 难度
  tags: string[];              // 标签
}
```

**输出**：
```typescript
interface AnswererOutput {
  keyPoints: string[];         // 核心要点（3-5条）
  detailedExplanation: string; // 详细解析（200-500字）
  codeExample: string | null;  // 代码示例
}
```

**设计原则**：
- 核心要点是面试时必须答到的关键点
- 详细解析用"首先...其次...另外..."的面试回答结构
- 代码示例必须是可运行的真实代码
- 口吻像候选人在面试中回答

**温度**：0.4（低温度，保证准确性）
**Max Tokens**：4000

**并行策略**：每道题独立调用一次，同一分类内的题目并行执行

---

### 5.4 Agent 4: 审核员 (Reviewer)

**职责**：审核题目和答案的质量

**输入**：
```typescript
interface ReviewerInput {
  question: {
    title: string;
    difficulty: string;
    tags: string[];
  };
  answer: {
    keyPoints: string[];
    detailedExplanation: string;
    codeExample: string | null;
  };
  categoryName: string;
}
```

**输出**：
```typescript
interface ReviewerOutput {
  overallScore: number;        // 总分（0-10）
  passed: boolean;             // 是否通过
  dimensions: {
    authenticity: number;      // 真实性（是否真实面试题）
    accuracy: number;          // 准确性（技术内容是否正确）
    completeness: number;      // 完整性（是否覆盖必答点）
    expression: number;        // 表达质量（是否适合面试）
  };
  issues: Array<{
    severity: "major" | "minor" | "suggestion";
    field: "title" | "answer" | "both";
    message: string;
  }>;
  suggestion: string;          // 修改建议
}
```

**通过阈值**：
- overallScore >= 7.0 为通过
- accuracy >= 8.0（准确性必须高）
- 有 major issue 直接不通过

**温度**：0.2（极低温度，保证审核严格且一致）
**Max Tokens**：2000

**串行策略**：逐题审核，不通过则返回修改

---

### 5.5 Agent 5: 关联员 (Linker)

**职责**：建立题目之间的关联关系

**输入**：
```typescript
interface LinkerInput {
  questions: Array<{
    id: string;           // 临时ID
    title: string;
    tags: string[];
    categoryName: string;
    keyPoints: string[];
  }>;
}
```

**输出**：
```typescript
interface LinkerOutput {
  relations: Array<{
    questionId: string;           // 源题目ID
    relatedQuestionIds: string[]; // 关联题目ID列表（最多5个）
    reason: string;               // 关联原因
  }>;
}
```

**关联策略**：
1. 同标签题目优先关联
2. 同分类题目次之
3. 知识点递进关系（基础→进阶）
4. 每道题最多关联 5 个其他题目

**温度**：0.3
**Max Tokens**：3000

---

### 5.6 Agent 6: 入库员 (Persister)

**职责**：将数据保存到数据库

**说明**：这不是 AI Agent，而是纯代码逻辑。

**执行步骤**：
1. 创建 KnowledgeBase 记录
2. 批量创建 Category 记录
3. 批量创建 Question 记录（status = "draft"）
4. 更新 Question 的 relatedQuestionIds
5. 创建 GenerationRecord 记录生成日志

**事务保证**：使用 Prisma 事务，要么全部成功，要么全部回滚。

---

### 5.7 Agent 7: 主题发现员 (Topic Scout)

**职责**：自动发现值得建库的面试主题，实现"建什么"的自动化决策

**解决的问题**：
- 人工决定建库主题有滞后性，无法及时覆盖新兴技术
- 用户面试报告中暴露的薄弱点，可以自动转化为建库需求
- 热门技术趋势变化需要被及时捕捉

**输入**：
```typescript
interface TopicScoutInput {
  existingKnowledgeBases: Array<{
    id: string;
    name: string;
    tags: string[];
    createdAt: string;
  }>; // 现有知识库列表（避免重复推荐）
  interviewReports?: Array<{
    weakPoints: string[];      // 面试薄弱点
    timestamp: string;
  }>; // 近期面试报告（可选）
  externalTrends?: Array<{
    topic: string;
    hotness: number;           // 热度指数
    source: string;            // 数据来源
  }>; // 外部趋势数据（可选）
}
```

**输出**：
```typescript
interface TopicScoutOutput {
  suggestions: Array<{
    topic: string;              // 建议主题
    reason: string;             // 推荐理由（数据支撑）
    priority: "high" | "medium" | "low";
    estimatedQuestionCount: number;  // 预估题目数量
    relatedExistingKbs: string[];    // 相关现有知识库ID（避免重复）
    dataSources: string[];      // 数据来源说明
  }>;
  analysis: {
    totalReportsAnalyzed: number;
    weakPointTrends: Array<{
      topic: string;
      frequency: number;        // 出现频率
      growthRate: number;       // 增长率
    }>;
  };
}
```

**触发时机**：

| 触发方式 | 频率 | 说明 |
|---------|------|------|
| 定时任务 | 每周一次 | 扫描全量数据，生成趋势报告 |
| 事件驱动 | 实时 | 用户完成面试后，分析薄弱点 |
| 手动触发 | 按需 | 管理员点击"发现新主题" |

**示例输出**：
```json
{
  "suggestions": [
    {
      "topic": "AI 大模型应用开发",
      "reason": "最近 3 个月面试报告中出现频率增长 300%，涉及 LangChain、RAG、Prompt Engineering 等考点，但现有题库无此内容",
      "priority": "high",
      "estimatedQuestionCount": 25,
      "relatedExistingKbs": [],
      "dataSources": ["interview_reports:weak_points", "github_trending"]
    },
    {
      "topic": "Go 语言高级特性",
      "reason": "用户面试报告中 Go 相关薄弱点占比 15%，且 Go 1.21 新增了泛型、PGO 等新特性",
      "priority": "medium",
      "estimatedQuestionCount": 20,
      "relatedExistingKbs": ["后端开发面试"],
      "dataSources": ["interview_reports:weak_points"]
    }
  ],
  "analysis": {
    "totalReportsAnalyzed": 150,
    "weakPointTrends": [
      { "topic": "AI 大模型", "frequency": 45, "growthRate": 3.0 },
      { "topic": "云原生", "frequency": 38, "growthRate": 1.2 }
    ]
  }
}
```

**温度**：0.3（低温度，保证分析严谨）
**Max Tokens**：3000

---

### 5.8 Agent 8: 内容更新员 (Content Updater)

**职责**：自动更新和维护现有知识库内容，实现"内容保鲜"

**解决的问题**：
- 技术在发展，旧题目的答案可能过时（如 JDK 版本更新、框架升级）
- 新面试题不断出现，需要补充到现有分类
- 用户刷题数据反馈哪些题目需要优化
- 掌握率低的题目可能需要更好的答案表达

**输入**：
```typescript
interface ContentUpdaterInput {
  knowledgeBaseId: string;      // 要更新的知识库
  updateType: "patch" | "minor" | "major"; // 更新类型
  // patch: 修正错误、优化表达
  // minor: 新增题目、更新答案
  // major: 重构分类、大规模更新
  trigger: {
    type: "scheduled" | "feedback" | "trend" | "manual";
    reason: string;             // 触发原因
  };
  context?: {
    weakPointsFromReports: Array<{
      questionId: string;
      feedback: string;
      count: number;            // 反馈次数
    }>;
    lowMasteryQuestions: Array<{
      questionId: string;
      masteryRate: number;      // 掌握率（%）
      attemptCount: number;     // 尝试次数
    }>;
    outdatedQuestions: Array<{
      questionId: string;
      reason: string;           // 过时原因
      suggestedVersion: string; // 建议更新到的版本
    }>;
  };
}
```

**输出**：
```typescript
interface ContentUpdaterOutput {
  updatePlan: {
    knowledgeBaseId: string;
    updateType: string;
    summary: string;            // 更新摘要
  };
  updates: Array<{
    questionId?: string;        // 题目ID（新增则为空）
    action: "create" | "update" | "delete" | "merge";
    categoryName?: string;      // 所属分类（新增/移动时）
    reason: string;             // 更新原因（数据支撑）
    before?: {                  // 更新前内容（update/delete 时）
      title?: string;
      answerKeyPoints?: string[];
      answerDetailed?: string;
    };
    after: {                    // 更新后内容
      title?: string;
      difficulty?: string;
      tags?: string[];
      answerKeyPoints?: string[];
      answerDetailed?: string;
      answerCodeExample?: string | null;
    };
  }>;
  newCategories?: Array<{      // 新增分类（major 更新时）
    name: string;
    description: string;
    sortOrder: number;
  }>;
  stats: {
    created: number;
    updated: number;
    deleted: number;
    unchanged: number;
  };
}
```

**更新策略矩阵**：

| 触发条件 | 更新类型 | 具体操作 | 示例 |
|---------|---------|---------|------|
| 用户反馈某题答案有误 | patch | 修正该题答案 | "HashMap 扩容条件描述不准确" |
| 某分类题目数量 < 5 | minor | 该分类补充 3-5 道新题 | "Redis 持久化分类只有 3 题，补充到 8 题" |
| 新技术版本发布 | minor | 更新相关题目答案 | "JDK 21 新增虚拟线程，更新并发编程题" |
| 面试趋势变化 | major | 新增分类、重构结构 | "AI 相关题目增多，新增'大模型应用'分类" |
| 某题掌握率 < 30% | patch | 优化答案表达、补充要点 | "该题 100 人刷过只有 20 人掌握，优化答案" |
| 某题被收藏率 > 80% | minor | 补充关联题、扩展考点 | "这道题很受欢迎，补充 2 道进阶题" |

**温度**：0.4（中等偏低，保证更新准确性）
**Max Tokens**：4000

**执行流程**：
```
检测触发条件
    │
    ▼
分析现有内容质量
    │
    ▼
生成更新计划（哪些题需要更新、为什么）
    │
    ▼
调用 Answerer 生成新内容 / 修改内容
    │
    ▼
Reviewer 审核更新内容
    │
    ▼
Persister 执行更新（创建新版本或覆盖）
    │
    ▼
记录更新日志
```

---

## 6. 协作流程

### 6.1 完整流程时序图

```
用户    UI    Orchestrator    Architect    Questioner    Answerer    Reviewer    Linker    Persister    DB
 │       │          │             │             │            │           │          │          │         │
 │──────►│          │             │             │            │           │          │          │         │
 │ 输入主题 │          │             │             │            │           │          │          │         │
 │       │─────────►│             │             │            │           │          │          │         │
 │       │  start() │             │             │            │           │          │          │         │
 │       │          │────────────►│             │            │           │          │          │         │
 │       │          │  design()   │             │            │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │◄────────────│             │            │           │          │          │         │
 │       │          │  返回骨架    │             │            │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │──────────────────────────►│            │           │          │          │         │
 │       │          │        并行调用（每个分类） │            │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │◄──────────────────────────│            │           │          │          │         │
 │       │          │        返回题目列表         │            │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │───────────────────────────────────────►│           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │        并行调用（每道题）               │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │◄───────────────────────────────────────│           │          │          │         │
 │       │          │        返回答案                         │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │───────────────────────────────────────────────────►│          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │        串行审核（逐题）                      │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │◄───────────────────────────────────────────────────│          │          │         │
 │       │          │        返回审核结果                        │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │──────────────────────────────────────────────────────────────►│          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │◄──────────────────────────────────────────────────────────────│          │         │
 │       │          │        返回关联关系                        │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │─────────────────────────────────────────────────────────────────────────►│         │
 │       │          │             │             │            │           │          │          │         │
 │       │          │◄─────────────────────────────────────────────────────────────────────────│         │
 │       │          │        返回入库结果                        │           │          │          │         │
 │       │◄─────────│          │             │             │            │           │          │          │
 │ 生成完成 │          │             │             │            │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
 │──────►│          │             │             │            │           │          │          │         │
 │ 人工审核 │          │             │             │            │           │          │          │         │
 │       │────────────────────────────────────────────────────────────────────────────────────────────────►│
 │       │          │             │             │            │           │          │          │         │
 │       │◄────────────────────────────────────────────────────────────────────────────────────────────────│
 │ 审核完成 │          │             │             │            │           │          │          │         │
 │       │          │             │             │            │           │          │          │         │
```

### 6.2 重试流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   调用Agent  │────►│  成功？      │────►│    完成     │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │ No
                           ▼
                    ┌─────────────┐
                    │  重试次数    │
                    │   < 3？     │
                    └──────┬──────┘
                           │ Yes
                           ▼
                    ┌─────────────┐
                    │  指数退避    │
                    │  等待 2^n 秒 │
                    └──────┬──────┘
                           │
                           └──────► 重新调用
                           │ No
                           ▼
                    ┌─────────────┐
                    │  标记失败    │
                    │  人工介入    │
                    └─────────────┘
```

### 6.3 人工介入点

| 介入点 | 触发条件 | 人工操作 |
|--------|---------|---------|
| 架构确认 | Architect 完成后 | 可修改分类结构、增删分类 |
| 题目审核 | Reviewer 评分 < 7 | 可修改题目/答案、删除题目、重新生成 |
| 关联确认 | Linker 完成后 | 可调整关联关系 |
| 最终发布 | Persister 完成后 | 审核全部题目，批量发布或逐题发布 |

---

## 7. Prompt 工程

### 7.1 Prompt 设计原则

1. **角色明确**：每个 Prompt 开头明确 Agent 的身份和专长
2. **输入输出分离**：清晰定义输入数据和期望输出格式
3. **示例驱动（Few-shot）**：提供 1-2 个高质量示例
4. **约束清晰**：明确数量、格式、风格等约束
5. **防幻觉**：要求基于真实面试经验，禁止编造

### 7.2 Agent 1: 架构师 Prompt

```markdown
# 角色
你是资深技术面试官和课程设计师，有 15 年互联网大厂面试经验，设计过多个技术领域的面试题库。

# 任务
为"{topic}"设计一个面试题库的知识库结构。

# 输入
主题：{topic}

# 要求
1. 分类数量控制在 4-8 个，必须覆盖该领域最核心的面试考点
2. 分类之间要有清晰的逻辑递进关系：
   - 前面的分类是后面的基础
   - 从"基础概念"到"进阶原理"到"实战应用"
3. 分类命名要用面试场景化的表达：
   - 好："Java集合框架"、"并发编程实战"
   - 差："集合"、"并发"
4. 每个分类需要有一句描述，说明该分类考察候选人的什么能力
5. 标签要精准，能代表该知识库的核心技术栈

# 输出格式
只输出 JSON，不要任何解释文字：
{
  "name": "知识库名称（简洁，如：Java后端面试）",
  "subtitle": "一句话描述（如：覆盖Java基础、集合、并发、JVM等核心考点）",
  "description": "详细描述（100字以内）",
  "tags": ["标签1", "标签2", "标签3"],
  "categories": [
    {
      "name": "分类名称",
      "description": "该分类的考察重点",
      "sortOrder": 0
    }
  ]
}

# 示例
输入主题：Redis
输出：
{
  "name": "Redis面试宝典",
  "subtitle": "从基础数据结构到高可用架构，覆盖Redis面试全链路",
  "description": "本知识库涵盖Redis面试中的所有核心考点，包括基础数据类型、持久化机制、主从复制、哨兵模式、集群方案、性能优化等。",
  "tags": ["Redis", "缓存", "NoSQL", "分布式"],
  "categories": [
    {
      "name": "Redis基础数据类型",
      "description": "考察对String、Hash、List、Set、ZSet等基础类型的理解及应用场景",
      "sortOrder": 0
    },
    {
      "name": "Redis持久化机制",
      "description": "考察RDB和AOF的原理、优缺点及选型",
      "sortOrder": 1
    },
    {
      "name": "Redis高可用架构",
      "description": "考察主从复制、哨兵、Cluster模式的原理和故障处理",
      "sortOrder": 2
    },
    {
      "name": "Redis性能优化",
      "description": "考察缓存设计、内存管理、大Key处理等实战经验",
      "sortOrder": 3
    },
    {
      "name": "Redis实战场景",
      "description": "考察分布式锁、限流、排行榜等典型业务场景的实现",
      "sortOrder": 4
    }
  ]
}
```

### 7.3 Agent 2: 出题员 Prompt

```markdown
# 角色
你是{topic}领域的资深技术面试官，有 10 年一线面试经验，面试过 500+ 候选人。你只出"真实面试中问过"的题目，不出教科书概念题。

# 任务
为"{categoryName}"这个分类生成 {questionCount} 道面试题。

# 输入
分类名称：{categoryName}
分类描述：{categoryDescription}
所属知识库：{knowledgeBaseTopic}

# 要求
1. **真实性**：每道题必须是你真实面试中问过或遇到过的，不是编造的概念题
2. **面试口吻**：题干用面试官的口吻，如：
   - "请说一下..."
   - "你在项目中是怎么处理..."
   - "如果线上遇到...你会怎么排查"
3. **难度分布**：
   - 简单（30%）：考察基础概念和常用API
   - 中等（50%）：考察原理理解和实战经验
   - 困难（20%）：考察深度原理和复杂场景
4. **标签精准**：标签要具体到技术点，如["HashMap","线程安全","扩容机制"]而非["Java"]
5. **面试频率标注**：
   - high：几乎每场面试都会问
   - medium：经常问到
   - low：偶尔问到，但很重要

# 输出格式
只输出 JSON 数组，不要任何解释文字：
[
  {
    "title": "面试题干",
    "difficulty": "easy|medium|hard",
    "tags": ["标签1", "标签2"],
    "interviewFrequency": "high|medium|low"
  }
]

# 示例
分类：Redis基础数据类型
输出：
[
  {
    "title": "Redis 的 String 类型底层是怎么实现的？SDS 和 C 字符串有什么区别？",
    "difficulty": "medium",
    "tags": ["Redis", "String", "SDS", "底层实现"],
    "interviewFrequency": "high"
  },
  {
    "title": "你在什么场景下会用 Redis 的 Hash？和 String 存 JSON 有什么区别？",
    "difficulty": "easy",
    "tags": ["Redis", "Hash", "String", "应用场景"],
    "interviewFrequency": "high"
  }
]
```

### 7.4 Agent 3: 答案师 Prompt

```markdown
# 角色
你是{topic}领域的技术专家，擅长用面试场景化的表达讲解技术。你的答案不是教科书，而是"候选人面试时的最佳回答"。

# 任务
为以下面试题写参考答案。

# 输入
题目：{questionTitle}
分类：{categoryName}
分类描述：{categoryDescription}
难度：{difficulty}
标签：{tags}

# 要求
1. **核心要点（keyPoints）**：
   - 3-5 条，是面试时必须答到的关键点
   - 用简洁的短语，不是完整句子
   - 按重要性排序

2. **详细解析（detailedExplanation）**：
   - 200-500 字
   - 用面试回答的口吻，结构清晰：
     - 首先...（核心概念）
     - 其次...（原理/机制）
     - 另外...（注意事项/最佳实践）
     - 总结...（一句话概括）
   - 不要像教科书那样罗列概念，要像候选人在回答面试官

3. **代码示例（codeExample）**：
   - 如有必要，提供可运行的真实代码
   - 代码要有注释说明关键逻辑
   - 如果不需要代码，返回 null

4. **准确性**：
   - 技术细节必须准确
   - 不确定的内容不要写
   - 版本相关的内容要注明版本

# 输出格式
只输出 JSON，不要任何解释文字：
{
  "keyPoints": [
    "核心要点1",
    "核心要点2",
    "核心要点3"
  ],
  "detailedExplanation": "详细解析内容...",
  "codeExample": "代码示例..." // 或 null
}

# 示例
题目：Redis 的 String 类型底层是怎么实现的？SDS 和 C 字符串有什么区别？
输出：
{
  "keyPoints": [
    "Redis String 底层使用 SDS（Simple Dynamic String）实现",
    "SDS 记录了长度信息，获取长度是 O(1)",
    "SDS 预分配空间，减少内存重分配次数",
    "SDS 是二进制安全的，可以存储任意二进制数据",
    "C 字符串以 \\0 结尾，SDS 不以 \\0 结尾"
  ],
  "detailedExplanation": "首先，Redis 的 String 类型底层并不是直接用 C 语言的字符串，而是自己实现了一个叫 SDS（Simple Dynamic String）的结构体。\\n\\n其次，SDS 和 C 字符串有几个关键区别：第一，SDS 内部记录了字符串的长度，所以获取长度是 O(1)，而 C 字符串需要遍历，是 O(n)；第二，SDS 采用了空间预分配策略，当字符串需要扩展时，会多分配一些空间，减少后续的内存重分配次数；第三，SDS 是二进制安全的，不会因为中间有 \\0 就截断，所以可以存储图片、序列化数据等任意二进制内容。\\n\\n另外，SDS 的 buf 数组也是以 \\0 结尾的，但这只是为了兼容 C 字符串函数，SDS 的实际长度由 len 字段决定，不是以 \\0 为结束标志。\\n\\n总结来说，SDS 在 C 字符串的基础上增加了长度记录、预分配和二进制安全等特性，让 Redis 的字符串操作更高效、更安全。",
  "codeExample": "// SDS 结构定义（Redis 3.2 之前）\\nstruct sdshdr {\\n    int len;      // 已使用长度\\n    int free;     // 未使用长度\\n    char buf[];   // 数据缓冲区\\n};\\n\\n// 获取长度：O(1)\\nsize_t sdslen(const sds s) {\\n    struct sdshdr *sh = (void*)(s - sizeof(struct sdshdr));\\n    return sh->len;\\n}"
}
```

### 7.5 Agent 4: 审核员 Prompt

```markdown
# 角色
你是严格的技术面试官，负责审核题库质量。你对错误零容忍，对模糊表达零容忍。你的审核标准是大厂面试的实际标准。

# 任务
审核以下面试题和参考答案的质量。

# 输入
分类：{categoryName}

题目：{questionTitle}
难度：{difficulty}
标签：{tags}

参考答案：
- 核心要点：{keyPoints}
- 详细解析：{detailedExplanation}
- 代码示例：{codeExample}

# 审核维度
1. **真实性（authenticity）**：这道题是否像真实面试题？题干是否自然？
   - 10分：完全像真实面试题
   - 5分：有点像，但有编造痕迹
   - 0分：明显是概念拼凑，不是面试题

2. **准确性（accuracy）**：答案中的技术内容是否正确？
   - 10分：完全正确，细节到位
   - 5分：大体正确，有小错误
   - 0分：有明显技术错误

3. **完整性（completeness）**：答案是否覆盖了面试必答的核心要点？
   - 10分：覆盖了所有必答点，还有加分项
   - 5分：覆盖了主要要点，有遗漏
   - 0分：遗漏了关键要点

4. **表达质量（expression）**：答案是否适合面试场景？结构是否清晰？
   - 10分：面试回答的口吻，结构清晰，条理分明
   - 5分：大体可以，但有教科书痕迹
   - 0分：像教科书或博客文章，不像面试回答

# 通过标准
- 总分 >= 7.0
- 准确性 >= 8.0（技术错误不可接受）
- 没有 major 级别的问题

# 输出格式
只输出 JSON，不要任何解释文字：
{
  "overallScore": 8.5,
  "passed": true,
  "dimensions": {
    "authenticity": 9,
    "accuracy": 8,
    "completeness": 8,
    "expression": 9
  },
  "issues": [
    {
      "severity": "major|minor|suggestion",
      "field": "title|answer",
      "message": "问题描述"
    }
  ],
  "suggestion": "修改建议（如果有）"
}
```

### 7.6 Agent 5: 关联员 Prompt

```markdown
# 角色
你是课程设计专家，擅长设计知识点之间的关联路径。你知道学习应该由浅入深，相关知识点应该串联起来。

# 任务
为以下题目建立关联关系。

# 输入
题目列表：
{questions}

# 关联规则
1. **同标签优先**：有相同标签的题目应该关联
2. **知识点递进**：基础题和进阶题应该关联（如"HashMap原理"→"ConcurrentHashMap原理"）
3. **同分类次之**：同一分类下的题目可以关联
4. **避免过度关联**：每道题最多关联 5 个其他题目
5. **关联要有理由**：每个关联都要说明为什么关联

# 输出格式
只输出 JSON，不要任何解释文字：
{
  "relations": [
    {
      "questionId": "题目ID",
      "relatedQuestionIds": ["关联题目ID1", "关联题目ID2"],
      "reason": "关联原因"
    }
  ]
}
```

---

## 8. 数据模型

### 8.1 新增模型：GenerationRecord

记录每次知识库生成的完整日志，便于追踪和复盘。

```prisma
model GenerationRecord {
  id          String   @id @default(cuid())
  topic       String   // 用户输入的主题
  status      String   // pending | running | done | error | human_review
  config      Json     // 生成配置（题目数量、难度分布等）
  
  // 各阶段结果
  architectResult   Json?  // Agent 1 输出
  questionerResults Json?  // Agent 2 输出（按分类）
  answererResults   Json?  // Agent 3 输出（按题目）
  reviewResults     Json?  // Agent 4 输出
  linkerResult      Json?  // Agent 5 输出
  
  // 统计
  totalQuestions    Int    @default(0)
  passedQuestions   Int    @default(0)
  failedQuestions   Int    @default(0)
  
  // 关联
  knowledgeBaseId   String?
  knowledgeBase     KnowledgeBase? @relation(fields: [knowledgeBaseId], references: [id])
  
  // 时间
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  completedAt DateTime?
  
  // 错误信息
  errorMessage String?
  errorStack   String?
}
```

### 8.2 KnowledgeBase 模型扩展

```prisma
model KnowledgeBase {
  // ... 现有字段 ...
  
  // 新增：生成来源标记
  generationSource String @default("manual") // "manual" | "ai_agent"
  
  // 新增：关联生成记录
  generationRecords GenerationRecord[]
}
```

---

## 9. 错误处理与重试

### 9.1 错误分类

| 错误类型 | 说明 | 处理策略 |
|---------|------|---------|
| 网络错误 | API 调用超时、连接失败 | 指数退避重试，最多 3 次 |
| 格式错误 | AI 返回非预期格式 | 重试 1 次，仍失败则人工介入 |
| 内容错误 | AI 返回内容质量差 | 由 Reviewer 发现，返回上游修改 |
| 系统错误 | 数据库连接失败等 | 立即终止，记录错误，人工处理 |

### 9.2 重试策略

```typescript
const retryConfig = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
};

function calculateDelay(attempt: number): number {
  const delay = retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
  return Math.min(delay, retryConfig.maxDelayMs);
}
```

### 9.3 降级策略

如果某个 Agent 多次失败：
1. **Agent 2（出题员）失败**：跳过该分类，继续生成其他分类
2. **Agent 3（答案师）失败**：该题标记为"待补充答案"，入库后人工补充
3. **Agent 4（审核员）失败**：降低阈值继续，或跳过审核直接入库
4. **Agent 5（关联员）失败**：跳过关联，题目无关联关系

---

## 10. 性能与成本

### 10.1 API 调用次数估算

生成一个 30 题的知识库：

| Agent | 调用次数 | 单次 Tokens | 单次成本 |
|-------|---------|------------|---------|
| Architect | 1 | ~1500 | ¥0.003 |
| Questioner | 5（假设5个分类） | ~2000 | ¥0.004 |
| Answerer | 30 | ~3000 | ¥0.006 |
| Reviewer | 30 | ~2500 | ¥0.005 |
| Linker | 1 | ~4000 | ¥0.008 |
| **总计** | **67** | **-** | **~¥0.50** |

> 按 DeepSeek Chat 价格计算（输入 ¥1/百万 tokens，输出 ¥2/百万 tokens）

### 10.2 耗时估算

| 阶段 | 耗时 | 说明 |
|------|------|------|
| Architect | 2-3s | 单次调用 |
| Questioner | 3-5s | 5 个分类并行 |
| Answerer | 5-8s | 30 道题并行（分 3 批，每批 10 道） |
| Reviewer | 5-8s | 30 道题串行 |
| Linker | 2-3s | 单次调用 |
| Persister | 1s | 数据库操作 |
| **总计** | **18-28s** | - |

### 10.3 优化策略

1. **批处理**：Answerer 和 Reviewer 可以批量处理（一次处理 5 道题）
2. **缓存**：相同主题的生成结果可以缓存
3. **限流**：控制并发数，避免触发 API 限流

---

## 11. 风险与应对

| # | 风险 | 可能性 | 影响 | 应对措施 |
|---|------|--------|------|---------|
| 1 | AI 生成内容有技术错误 | 中 | 高 | Reviewer Agent 审核 + 人工终审 |
| 2 | API 调用超时或失败 | 中 | 中 | 重试机制 + 降级策略 |
| 3 | 生成内容同质化 | 中 | 中 | 调整温度参数 + 多样化 Prompt |
| 4 | API 成本过高 | 低 | 中 | 批处理优化 + 缓存机制 |
| 5 | 生成速度太慢 | 低 | 中 | 并行化 + 批处理 |
| 6 | 关联关系不准确 | 中 | 低 | 人工审核时可调整 |
| 7 | 题目与现有题库重复 | 中 | 低 | 入库前查重（按标题相似度） |
| 8 | AI 返回格式不符合预期 | 低 | 中 | JSON Schema 验证 + 重试 |

---

## 12. 迭代路线图

### Phase 1: MVP（最小可行产品）

**目标**：验证多 Agent 协作的可行性

**功能**：
- [ ] 实现 6 个核心 Agent 的基础版本（Architect → Persister）
- [ ] 串行执行流程
- [ ] 基础错误处理和重试
- [ ] 人工审核页面

**时间**：1-2 周

### Phase 2: 并行优化 + 全自动发现

**目标**：提升生成效率，实现主题自动发现

**功能**：
- [ ] Questioner 按分类并行
- [ ] Answerer 按题目并行
- [ ] 批处理优化（一次处理多道题）
- [ ] 生成进度实时推送（WebSocket）
- [ ] **Agent 7 (Topic Scout) 基础版**
  - [ ] 分析面试报告薄弱点
  - [ ] 生成主题建议报告
  - [ ] 管理员确认后触发建库

**时间**：1-2 周

### Phase 3: 质量提升 + 内容保鲜

**目标**：提升生成内容质量，实现内容自动更新

**功能**：
- [ ] 引入 Few-shot 示例
- [ ] 优化 Prompt（基于实际生成结果迭代）
- [ ] 增加更多审核维度
- [ ] 题目去重（与现有题库比对）
- [ ] **Agent 8 (Content Updater) 基础版**
  - [ ] 检测掌握率低的题目
  - [ ] 自动优化答案表达
  - [ ] 用户反馈驱动的修正

**时间**：1-2 周

### Phase 4: 智能化 + 全自动运营

**目标**：实现题库系统的全自动运营闭环

**功能**：
- [ ] 基于用户面试报告生成针对性题库
- [ ] 根据题目通过率动态调整难度
- [ ] 自动发现热门面试题（从社区采集）
- [ ] Agent 自我进化（基于反馈优化 Prompt）
- [ ] **Topic Scout 全自动模式**
  - [ ] 无需人工确认，自动建库
  - [ ] 定时扫描 + 事件驱动双模式
- [ ] **Content Updater 全自动模式**
  - [ ] 定时内容保鲜（每周扫描）
  - [ ] 技术版本变更自动检测
  - [ ] 面试趋势变化自动响应

**时间**：2-4 周

### Phase 5: 生态扩展

**目标**：构建题库生态，持续自我增强

**功能**：
- [ ] 接入外部数据源（GitHub、技术社区、招聘网站）
- [ ] 用户贡献题目（社区化）
- [ ] Agent 间协作优化（如 Reviewer 反馈优化 Questioner Prompt）
- [ ] 多模型支持（不同 Agent 使用不同模型）

**时间**：4-8 周

---

## 13. 全自动运营闭环

### 13.1 闭环架构

新增 Agent 7 和 Agent 8 后，系统形成完整的**全自动运营闭环**：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         全自动运营闭环                                   │
│                                                                         │
│  ┌─────────────┐                                                       │
│  │  用户面试    │                                                       │
│  │  完成面试   │                                                       │
│  └──────┬──────┘                                                       │
│         │ 生成面试报告                                                   │
│         ▼                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             │
│  │ Topic Scout │────►│  Architect  │────►│ Questioner  │             │
│  │ (主题发现)   │     │  (架构设计)  │     │  (出题员)    │             │
│  └─────────────┘     └─────────────┘     └─────────────┘             │
│       ▲    │                                  │                        │
│       │    │ 发现薄弱点                        │                        │
│       │    └──────────────────────────────────┘                        │
│       │                                                                │
│       │         ┌─────────────┐     ┌─────────────┐                   │
│       │         │  Answerer   │────►│  Reviewer   │                   │
│       │         │  (答案师)    │     │  (审核员)    │                   │
│       │         └─────────────┘     └──────┬──────┘                   │
│       │                                    │                           │
│       │         ┌─────────────┐     ┌──────┴──────┐                   │
│       │         │   Linker    │────►│  Persister  │                   │
│       │         │  (关联员)    │     │  (入库员)    │                   │
│       │         └─────────────┘     └──────┬──────┘                   │
│       │                                    │                           │
│       │         ┌─────────────┐     ┌──────┴──────┐                   │
│       │         │Content Updater│◄───│   数据库    │                   │
│       │         │ (内容更新员)  │     │  (draft)   │                   │
│       │         └──────┬──────┘     └─────────────┘                   │
│       │                │                                               │
│       │    检测到内容过时│                                               │
│       └────────────────┘                                               │
│                                                                         │
│  循环说明：                                                              │
│  1. 用户面试 → 产生薄弱点数据                                             │
│  2. Topic Scout 分析薄弱点 → 发现新主题需求                                │
│  3. 触发 Architect → ... → Persister 生成新库                            │
│  4. 用户刷题 → 产生掌握率数据                                             │
│  5. Content Updater 检测低掌握率题目 → 自动优化                            │
│  6. 技术版本更新 → Content Updater 检测过时内容 → 自动更新                  │
│  7. 回到步骤 1，持续循环                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 13.2 全自动流程示例

#### 场景 1：从用户面试到自动建库

```
用户 A 完成 Java 后端面试
    │
    ▼
系统生成面试报告：
- 薄弱点："AI 大模型应用"（完全不会）
- 薄弱点："Redis 集群"（回答不完整）
    │
    ▼
Topic Scout 分析（定时任务或实时触发）：
- "AI 大模型应用" 在最近 100 份报告中出现 45 次，增长 300%
- 现有题库无此内容
- 生成建议：新建 "AI 大模型应用开发" 知识库
    │
    ▼
管理员收到通知（半自动模式）/ 直接触发（全自动模式）
    │
    ▼
触发 Architect → Questioner → Answerer → Reviewer → Linker → Persister
    │
    ▼
新库 "AI 大模型应用开发" 创建完成，30 道题待审核
    │
    ▼
管理员审核通过 → 发布
    │
    ▼
用户 A 收到推荐："根据你的面试情况，推荐学习 AI 大模型应用开发"
```

#### 场景 2：内容自动保鲜

```
系统定时扫描（每周一凌晨 2:00）
    │
    ▼
Content Updater 分析全库：
- "HashMap 原理" 掌握率 25%（100人刷过，25人掌握）
- "JDK 8 Lambda" 相关题目可能过时（JDK 21 已发布）
- "Redis 持久化" 分类只有 3 题，需要补充
    │
    ▼
生成更新计划：
1. 优化 "HashMap 原理" 答案表达
2. 更新 "Lambda" 题目，补充 JDK 21 新特性
3. 为 "Redis 持久化" 补充 5 道新题
    │
    ▼
调用 Answerer 生成新内容
    │
    ▼
Reviewer 审核更新内容
    │
    ▼
Persister 执行更新（创建新版本）
    │
    ▼
记录更新日志，通知管理员
```

### 13.3 自动化程度配置

系统支持三种自动化模式，管理员可配置：

| 模式 | Topic Scout | Content Updater | 人工介入点 | 适用阶段 |
|------|-------------|-----------------|-----------|---------|
| **手动模式** | 生成建议，不自动触发 | 生成报告，不自动执行 | 所有环节 | 初期测试 |
| **半自动模式**（推荐） | 生成建议，管理员确认后建库 | 生成更新计划，管理员确认后执行 | 确认触发 + 最终审核 | 稳定运营 |
| **全自动模式** | 自动发现，自动建库 | 自动检测，自动更新 | 仅异常处理 | 成熟阶段 |

### 13.4 新增 Prompt 设计

#### Agent 7: Topic Scout Prompt

```markdown
# 角色
你是技术趋势分析师和面试题库产品经理。你擅长从用户行为数据中发现内容需求，决定"应该建什么库"。

# 任务
分析以下数据，发现值得新建的面试题库主题。

# 输入数据
## 现有知识库
{existingKnowledgeBases}

## 近期面试报告薄弱点（最近 3 个月）
{interviewReports}

## 外部技术趋势（可选）
{externalTrends}

# 分析要求
1. **薄弱点分析**：
   - 统计各技术点在面试报告中的出现频率
   - 识别增长最快的薄弱点（增长率 > 100%）
   - 排除已有知识库覆盖的内容

2. **建库可行性评估**：
   - 该主题是否有足够的面试题可生成（>15 道）
   - 该主题是否有明确的考察范围
   - 该主题是否与技术发展趋势一致

3. **优先级排序**：
   - high：用户急需、市场热门、无替代内容
   - medium：有一定需求、可暂缓
   - low：需求不明确、已有部分内容覆盖

# 输出格式
只输出 JSON，不要任何解释文字：
{
  "suggestions": [
    {
      "topic": "建议主题",
      "reason": "详细的数据支撑理由",
      "priority": "high|medium|low",
      "estimatedQuestionCount": 20,
      "relatedExistingKbs": ["现有库ID"],
      "dataSources": ["数据来源说明"]
    }
  ],
  "analysis": {
    "totalReportsAnalyzed": 150,
    "weakPointTrends": [
      {"topic": "技术点", "frequency": 45, "growthRate": 3.0}
    ]
  }
}
```

#### Agent 8: Content Updater Prompt

```markdown
# 角色
你是技术内容编辑和面试题库维护专家。你负责让题库内容保持新鲜、准确、有效。

# 任务
分析以下知识库的健康状况，生成更新计划。

# 输入数据
## 知识库信息
{knowledgeBaseInfo}

## 题目列表及统计数据
{questionsWithStats}

## 用户反馈
{userFeedbacks}

## 触发信息
- 触发类型：{triggerType}
- 触发原因：{triggerReason}

# 分析要求
1. **低质量内容识别**：
   - 掌握率 < 30% 的题目（答案可能有问题）
   - 被标记"答案不清晰"次数 > 3 的题目
   - 收藏率 < 5% 的题目（可能不够有价值）

2. **过时内容识别**：
   - 涉及的技术版本已更新（如 JDK 8 → JDK 21）
   - 框架 API 已变更（如 Spring Boot 2.x → 3.x）
   - 行业最佳实践已变化

3. **内容缺口识别**：
   - 题目数量 < 5 的分类
   - 某难度级别题目过少（如没有困难题）
   - 热门考点缺失

4. **更新计划生成**：
   - 明确每道题的更新原因
   - 提供具体的修改建议
   - 标注更新优先级

# 输出格式
只输出 JSON，不要任何解释文字：
{
  "updatePlan": {
    "knowledgeBaseId": "库ID",
    "updateType": "patch|minor|major",
    "summary": "更新摘要"
  },
  "updates": [
    {
      "questionId": "题目ID（新增为空）",
      "action": "create|update|delete",
      "categoryName": "所属分类",
      "reason": "更新原因（数据支撑）",
      "before": {"title": "", "answerKeyPoints": []},
      "after": {"title": "", "answerKeyPoints": [], "answerDetailed": ""}
    }
  ],
  "newCategories": [
    {"name": "", "description": "", "sortOrder": 0}
  ],
  "stats": {"created": 0, "updated": 0, "deleted": 0, "unchanged": 0}
}
```

---

## 14. 附录

### 14.1 术语表

| 术语 | 说明 |
|------|------|
| Agent | 智能体，这里指一个专门的 AI 角色，负责一个特定任务 |
| Pipeline | 流水线，指 Agent 之间按顺序协作的流程 |
| Prompt | 提示词，给 AI 的指令 |
| Temperature | 温度，控制 AI 输出的随机性，越低越稳定 |
| Few-shot | 少样本学习，给 AI 提供示例帮助其理解任务 |
| SDS | Simple Dynamic String，Redis 的字符串实现 |
| Topic Scout | 主题发现员 Agent，自动发现值得建库的主题 |
| Content Updater | 内容更新员 Agent，自动维护和更新现有内容 |
| 全自动运营闭环 | 从发现需求→生成内容→更新维护的完整自动化流程 |

### 14.2 参考资源

1. [LangChain Multi-Agent Workflows](https://python.langchain.com/docs/use_cases/agent_simulations/)
2. [AutoGen: Multi-Agent Conversation Framework](https://microsoft.github.io/autogen/)
3. [DeepSeek API 文档](https://platform.deepseek.com/docs)
4. [Multi-Agent Reinforcement Learning](https://www.cs.cmu.edu/~mmv/papers/94-3-rl-ieee.pdf)

### 14.3 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-05-05 | 采用 6 Agent 架构 | 单一职责原则，每个 Agent 专注一个任务 |
| 2026-05-05 | Reviewer 串行执行 | 保证审核质量，避免并发导致的评分标准不一致 |
| 2026-05-05 | 全部保存为 draft | 人工终审是必须的，AI 生成内容不能直接发布 |
| 2026-05-05 | 使用 DeepSeek Chat | 成本低、中文效果好、已集成到现有系统 |
| 2026-05-05 | 新增 Agent 7 (Topic Scout) | 实现"建什么"的自动化决策，从被动响应到主动发现 |
| 2026-05-05 | 新增 Agent 8 (Content Updater) | 实现内容保鲜，解决技术更新导致的题库过时问题 |
| 2026-05-05 | 支持三种自动化模式 | 手动/半自动/全自动，适应不同运营阶段 |

### 14.4 8 个 Agent 一览表

| # | Agent 名称 | 英文名称 | 职责 | 类型 | 温度 | 触发方式 |
|---|-----------|---------|------|------|------|---------|
| 1 | 架构师 | Architect | 设计知识库结构 | AI | 0.3 | Pipeline |
| 2 | 出题员 | Questioner | 生成面试题目 | AI | 0.5 | Pipeline |
| 3 | 答案师 | Answerer | 写参考答案 | AI | 0.4 | Pipeline |
| 4 | 审核员 | Reviewer | 质量审核 | AI | 0.2 | Pipeline |
| 5 | 关联员 | Linker | 建立题目关联 | AI | 0.3 | Pipeline |
| 6 | 入库员 | Persister | 数据持久化 | 代码 | - | Pipeline |
| 7 | 主题发现员 | Topic Scout | 发现新主题 | AI | 0.3 | 定时/事件/手动 |
| 8 | 内容更新员 | Content Updater | 更新现有内容 | AI | 0.4 | 定时/反馈/手动 |

---

> 本方案待评审。评审通过后进入 Phase 1 实施。
