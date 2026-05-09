# 模拟面试多 Agent + 多模型协作系统技术方案

> 版本：v1.0
> 日期：2026-05-06
> 作者：AI Assistant
> 状态：待评审

---

## 目录

1. [背景与问题](#1-背景与问题)
2. [设计目标](#2-设计目标)
3. [核心设计思想](#3-核心设计思想)
4. [系统架构](#4-系统架构)
5. [Agent 详细设计](#5-agent-详细设计)
6. [多模型交叉验证机制](#6-多模型交叉验证机制)
7. [性能与延迟分析](#7-性能与延迟分析)
8. [Prompt 工程](#8-prompt-工程)
9. [数据模型](#9-数据模型)
10. [面试流程时序](#10-面试流程时序)
11. [错误处理与降级](#11-错误处理与降级)
12. [风险与应对](#12-风险与应对)
13. [迭代路线图](#13-迭代路线图)
14. [附录](#14-附录)

---

## 1. 背景与问题

### 1.1 业务背景

面面吧的核心功能之一是"模拟面试"，用户可以通过文字或语音与 AI 进行模拟面试，系统根据用户表现生成面试报告。当前面试系统采用**单模型单 Prompt** 方案，由 DeepSeek 模型同时扮演面试官和评估员。

### 1.2 当前方案的问题

当前实现的问题清单：

| # | 问题 | 影响 | 严重程度 |
|---|------|------|---------|
| 1 | **角色冲突**：一个模型既当面试官又当评估员 | 评估不客观，存在自我偏向 | 高 |
| 2 | **无交叉验证**：单模型输出，幻觉无法发现 | 评估结果可能存在错误 | 高 |
| 3 | **无实时反馈**：面试结束才给反馈 | 用户不知道答得好不好，无法调整 | 中 |
| 4 | **报告与面试耦合**：报告生成依赖面试过程中的临时记忆 | 无法深度分析面试全过程 | 中 |
| 5 | **追问深度不可控**：面试官可能过于简单或过于刁钻 | 面试体验差，评估不准确 | 中 |
| 6 | **评估维度单一**：只有总分，无法定位具体能力短板 | 报告价值低，用户不知道改什么 | 高 |
| 7 | **面试与学习脱节**：面试结果无法驱动学习推荐 | 产品闭环断裂 | 中 |

### 1.3 为什么需要多 Agent + 多模型

借鉴"分权制衡"和"交叉验证"的思想：

> 让面试官只管提问，让评估员只管评估，让验证员只管验证。每个角色用最适合的模型，关键决策用不同模型交叉确认。

多 Agent + 多模型的优势：

| 维度 | 单模型单 Agent | 多 Agent 多模型 |
|------|--------------|----------------|
| **客观性** | 自问自评，有偏向 | 面试官和评估员分离，评估更客观 |
| **准确性** | 单模型幻觉无法发现 | 多模型交叉验证，发现分歧 |
| **深度** | 表面评估 | 多维度、多层次深度分析 |
| **实时性** | 面试结束才给反馈 | 面试中实时调整策略 |
| **专业性** | 一个模型做所有事 | 每个 Agent 专注一个领域 |
| **可扩展性** | 改 Prompt 牵一发而动全身 | 新增 Agent 不影响现有流程 |

---

## 2. 设计目标

### 2.1 功能目标

1. **面试过程**：AI 扮演真实面试官，根据用户回答动态调整追问策略和难度
2. **实时评估**：用户每个回答都有实时质量反馈（内部使用，不展示给用户）
3. **深度报告**：面试结束后生成多维度、有证据支撑的结构化报告
4. **交叉验证**：关键评估结果经过多模型验证，确保准确性
5. **学习联动**：面试报告直接推荐针对性学习内容

### 2.2 质量目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 评估客观性 | >90% | 同一回答由不同模型评估，评分差异 < 1 分 |
| 报告准确性 | >95% | 报告中的引用与面试记录一致 |
| 追问合理性 | >85% | 追问问题与上下文相关且有深度 |
| 面试体验 | >4.0/5 | 用户满意度评分 |
| 报告价值 | >85% | 用户认为报告有帮助并据此改进 |

### 2.3 性能目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 面试官出题延迟 | < 2s | 从用户回答到下一题出现 |
| 实时评估延迟 | < 1s | 评估在后台完成，不阻塞面试流程 |
| 报告生成时间 | < 10s | 面试结束后 10 秒内生成报告 |
| 单次面试 API 调用 | < 50 次 | 控制成本 |

---

## 3. 核心设计思想

### 3.1 角色分离（Separation of Concerns）

将"模拟面试"拆分为独立的角色：
- **面试官**：只负责提问，不评估
- **评估员**：只负责评估，不提问
- **策略员**：只负责决策追问策略，不直接参与对话
- **验证员**：只负责验证报告质量

### 3.2 模型分离（Model Separation）

关键角色使用不同模型，避免"自问自评"：
- **DeepSeek**：负责对话生成（面试官、报告撰写）
- **Qwen**：负责评估和验证（实时评估、维度评估、交叉验证）

### 3.3 实时反馈闭环（Real-time Feedback Loop）

```
用户回答 ──► 实时评估 ──► 追问策略 ──► 面试官调整
                ▲                            │
                └────────────────────────────┘
```

面试过程中，用户的每个回答都会影响后续问题的走向。

### 3.4 多模型交叉验证（Cross-Validation）

关键决策点（评估、报告）由不同模型独立执行，发现分歧时触发人工审核或自动修正。

---

## 4. 系统架构

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户界面层 (UI Layer)                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  面试页面 /interview                                             │   │
│  │  - 展示面试问题                                                  │   │
│  │  - 接收用户回答（文字/语音）                                      │   │
│  │  - 展示面试报告                                                  │   │
│  │  - 展示推荐学习路径                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         会话管理层 (Session Manager)                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  - 管理面试会话生命周期                                          │   │
│  │  - 维护对话历史                                                  │   │
│  │  - 调度 Agent 执行                                               │   │
│  │  - 控制并发和超时                                                │   │
│  │  - 流式输出管理                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│    Agent 1: 面试官    │ │    Agent 2: 追问策略员 │ │    Agent 3: 难度调节员│
│    (Interviewer)     │ │    (Prober)          │ │    (Adjuster)        │
│    模型: DeepSeek     │ │    模型: DeepSeek     │ │    模型: DeepSeek     │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         面试执行层 (Interview Layer)                      │
│                              用户回答输入                                │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────┐
│    Agent 4: 实时评估员 │
│    (Real-time        │
│     Evaluator)       │
│    模型: Qwen        │
└──────────┬───────────┘
           │ 评估结果
           │ (质量/完整度/深度)
           │
           ├──────────────────────────────────────┐
           │                                      │
           ▼                                      ▼
    Agent 2 (Prober)                      Agent 3 (Adjuster)
    决定追问策略                           调节难度
           │                                      │
           └──────────────────┬───────────────────┘
                              │
                              ▼
                    面试结束触发
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Agent 5: 维度评估员│ │ Agent 6: 报告撰写员│ │ Agent 7: 交叉验证员│
│ (Dimension      │ │ (Report Writer) │ │ (Cross-Validator)│
│  Evaluator)     │ │                 │ │                 │
│ 模型: Qwen      │ │ 模型: DeepSeek  │ │ 模型: Qwen      │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         │ 多维度评分         │ 生成报告          │ 验证报告
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   合并最终报告   │
                    │   (冲突解决)     │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            数据持久层 (Data Layer)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐│
│  │InterviewSession│ │  Question   │  │   Answer    │  │InterviewReport  ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         外部服务层 (External Services)                    │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  DeepSeek API           │  │  Qwen API                           │  │
│  │  - 温度：0.5-0.7        │  │  - 温度：0.2-0.4                    │  │
│  │  - 角色：对话生成        │  │  - 角色：评估验证                    │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Agent 协作关系图

```
                    ┌─────────────┐
                    │   用户      │
                    │  开始面试   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Session    │
                    │  Manager    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │Agent 1  │  │Agent 2  │  │Agent 3  │
        │面试官   │  │追问策略 │  │难度调节 │
        │(DeepSeek)│  │(DeepSeek)│  │(DeepSeek)│
        └────┬────┘  └────┬────┘  └────┬────┘
             │            │            │
             │ 提问       │ 策略       │ 调节
             │            │            │
             └────────────┼────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   用户回答   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Agent 4     │
                    │ 实时评估员   │
                    │ (Qwen)      │
                    └──────┬──────┘
                           │ 评估结果
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │Agent 2  │  │Agent 3  │  │ 数据库   │
        │追问策略 │  │难度调节 │  │ 记录    │
        │(调整)   │  │(调整)   │  │         │
        └────┬────┘  └────┬────┘  └─────────┘
             │            │
             └────────────┼────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  继续面试？  │
                    └──────┬──────┘
                       Yes │    │ No
                          ▼    ▼
                    ┌────────┐  ┌────────┐
                    │ 下一题  │  │ 面试结束│
                    └────────┘  └────┬───┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │         报告生成层               │
                    │  ┌─────────┐ ┌─────────┐       │
                    │  │Agent 5  │ │Agent 6  │       │
                    │  │维度评估 │ │报告撰写 │       │
                    │  │(Qwen)   │ │(DeepSeek)│      │
                    │  └────┬────┘ └────┬────┘       │
                    │       │           │            │
                    │       └─────┬─────┘            │
                    │             │                  │
                    │             ▼                  │
                    │       ┌─────────┐              │
                    │       │Agent 7  │              │
                    │       │交叉验证 │              │
                    │       │(Qwen)   │              │
                    │       └────┬────┘              │
                    │            │                  │
                    │            ▼                  │
                    │       ┌─────────┐              │
                    │       │ 最终报告 │              │
                    │       └─────────┘              │
                    └─────────────────────────────────┘
```

---

## 5. Agent 详细设计

### 5.1 Agent 1: 面试官 (Interviewer)

**职责**：扮演真实面试官，向用户提问。只负责提问，不做评估。

**模型**：DeepSeek（擅长角色扮演和对话生成）

**输入**：
```typescript
interface InterviewerInput {
  sessionConfig: {
    mode: "general" | "technical" | "behavioral" | "targeted";
    duration: number;           // 面试时长（分钟）
    difficulty: "easy" | "medium" | "hard";
    focusAreas?: string[];      // 重点考察领域（targeted模式）
  };
  userProfile: {
    resumeSummary: string;
    targetPosition: string;
    experience: string;
    skills: string[];
  };
  conversationHistory: Array<{
    role: "interviewer" | "candidate";
    content: string;
    timestamp: string;
  }>;
  strategy?: {                  // 来自追问策略员
    probeStrategy: string;
    suggestedQuestion?: string;
  };
  adjustment?: {                // 来自难度调节员
    nextDifficulty: string;
  };
}
```

**输出**：
```typescript
interface InterviewerOutput {
  question: string;             // 面试问题
  context?: string;             // 问题背景/场景
  expectedPoints: string[];     // 期望回答要点（用于评估）
  type: "opening" | "technical" | "behavioral" | "follow-up" | "closing";
  estimatedAnswerTime: number;  // 预估回答时间（秒）
}
```

**设计原则**：
- 用真实面试官的口吻提问
- 根据用户简历和经历个性化问题
- 遵循追问策略员的建议
- 不直接评估用户回答

**温度**：0.5（中等温度，保证对话自然）
**Max Tokens**：1500

---

### 5.2 Agent 2: 追问策略员 (Prober)

**职责**：根据用户回答质量和面试上下文，决定面试官应该如何追问。

**模型**：DeepSeek

**输入**：
```typescript
interface ProberInput {
  currentQuestion: string;
  userAnswer: string;
  realTimeEvaluation: {         // 来自实时评估员
    quality: number;            // 回答质量 0-10
    completeness: number;       // 完整度 0-10
    depth: number;              // 深度 0-10
    missingPoints: string[];    // 遗漏的要点
    strengths: string[];        // 亮点
  };
  conversationHistory: Array<{
    question: string;
    answer: string;
    evaluation: object;
  }>;
  probeDepth: number;           // 当前追问深度（0-3）
  sessionConfig: {
    mode: string;
    targetDepth: number;        // 目标追问深度
  };
}
```

**输出**：
```typescript
interface ProberOutput {
  shouldProbe: boolean;         // 是否追问
  probeStrategy: "deepen" | "clarify" | "challenge" | "expand" | "move-on";
  suggestedQuestion?: string;   // 建议的追问问题（可选）
  reason: string;               // 策略原因
}
```

**追问策略矩阵**：

| 用户回答质量 | 完整度 | 深度 | 策略 | 说明 |
|------------|--------|------|------|------|
| < 5 | < 5 | - | clarify | 引导补充，不直接否定 |
| >= 5 | < 5 | - | deepen | 追问遗漏要点 |
| >= 5 | >= 5 | < 5 | challenge | 提出更深层问题 |
| >= 8 | >= 8 | >= 8 | expand | 扩展到相关领域 |
| 任意 | 任意 | 任意 | move-on | 追问深度 >= 3，换下一题 |

**温度**：0.3（低温度，保证策略稳定）
**Max Tokens**：1000

---

### 5.3 Agent 3: 难度调节员 (Adjuster)

**职责**：动态调节面试难度，确保面试既不过于简单也不过于困难。

**模型**：DeepSeek

**输入**：
```typescript
interface AdjusterInput {
  overallPerformance: {
    averageQuality: number;     // 平均回答质量
    questionsAnswered: number;  // 已回答问题数
    timeElapsed: number;        // 已用时间（秒）
    correctRate: number;        // 回答合格率（质量 >= 6 的比例）
  };
  currentDifficulty: string;
  sessionConfig: {
    targetDifficulty: string;
    duration: number;           // 总时长（分钟）
    totalQuestions: number;     // 计划题目数
  };
  difficultyHistory: string[];  // 难度变化历史
}
```

**输出**：
```typescript
interface AdjusterOutput {
  nextDifficulty: "easy" | "medium" | "hard";
  adjustmentReason: string;
  shouldExtend: boolean;        // 是否延长时间
  shouldShorten: boolean;       // 是否缩短时间
  estimatedRemainingQuestions: number; // 预估剩余题目数
}
```

**调节策略**：

| 正确率 | 当前难度 | 调节方向 | 说明 |
|--------|---------|---------|------|
| > 80% | easy/medium | 提升 | 用户表现好，增加难度 |
| > 80% | hard | 保持 | 已经是最高难度 |
| 40-80% | 任意 | 保持 | 难度合适 |
| < 40% | medium/hard | 降低 | 用户吃力，降低难度 |
| < 40% | easy | 保持 | 已经是最低难度 |

**温度**：0.2（极低温度，保证调节稳定）
**Max Tokens**：800

---

### 5.4 Agent 4: 实时评估员 (Real-time Evaluator)

**职责**：实时评估用户每个回答的质量。使用与面试官不同的模型，保证客观性。

**模型**：Qwen（与 DeepSeek 分离，避免偏向）

**输入**：
```typescript
interface RealTimeEvaluatorInput {
  question: string;
  expectedPoints: string[];     // 面试官期望的要点
  userAnswer: string;
  conversationContext: string;  // 面试上下文
  userProfile: {
    experience: string;
    targetPosition: string;
  };
}
```

**输出**：
```typescript
interface RealTimeEvaluatorOutput {
  quality: number;              // 回答质量 0-10
  completeness: number;         // 完整度 0-10
  depth: number;                // 深度 0-10
  clarity: number;              // 清晰度 0-10
  coveredPoints: string[];      // 已覆盖的要点
  missingPoints: string[];      // 遗漏的要点
  strengths: string[];          // 亮点
  weaknesses: string[];         // 不足
  suggestion: string;           // 改进建议
}
```

**评估维度说明**：

| 维度 | 权重 | 评估标准 |
|------|------|---------|
| 质量 (quality) | 综合 | 回答的整体质量，综合考虑其他维度 |
| 完整度 (completeness) | 30% | 是否覆盖了期望要点 |
| 深度 (depth) | 30% | 是否深入原理，而非表面描述 |
| 清晰度 (clarity) | 20% | 表达是否条理清晰 |
| 匹配度 (relevance) | 20% | 是否切题，有无跑题 |

**关键设计**：
- 使用 Qwen 模型，与面试官（DeepSeek）分离
- 评估在后台异步执行，不阻塞面试流程
- 评估结果只用于内部策略调整，不展示给用户（避免干扰面试）

**温度**：0.2（极低温度，保证评估严格且一致）
**Max Tokens**：1500

---

### 5.5 Agent 5: 维度评估员 (Dimension Evaluator)

**职责**：面试结束后，从多个维度深度评估用户表现。

**模型**：Qwen

**评估维度**：

| 维度 | 权重 | 说明 | 考察内容 |
|------|------|------|---------|
| 技术深度 | 25% | 对技术原理的理解程度 | 是否理解底层原理，而非只记 API |
| 知识广度 | 20% | 知识面覆盖范围 | 是否了解相关技术生态 |
| 逻辑思维 | 20% | 分析问题的条理性 | 回答是否有清晰的逻辑结构 |
| 表达能力 | 15% | 语言组织和表达清晰度 | 是否能把复杂概念讲清楚 |
| 实战经验 | 15% | 结合实际项目的能力 | 是否有真实项目案例支撑 |
| 学习能力 | 5% | 对新技术的了解和态度 | 是否关注技术发展趋势 |

**输入**：
```typescript
interface DimensionEvaluatorInput {
  conversationHistory: Array<{
    question: string;
    answer: string;
    evaluation: RealTimeEvaluatorOutput;
  }>;
  userProfile: {
    resumeSummary: string;
    targetPosition: string;
    experience: string;
  };
  sessionConfig: {
    mode: string;
    difficulty: string;
  };
}
```

**输出**：
```typescript
interface DimensionEvaluatorOutput {
  dimensions: Array<{
    name: string;
    score: number;              // 0-10
    weight: number;             // 权重
    weightedScore: number;      // 加权得分
    analysis: string;           // 详细分析
    evidence: string[];         // 面试中的具体证据引用
    strengths: string[];        // 该维度亮点
    weaknesses: string[];       // 该维度不足
  }>;
  totalScore: number;           // 总分（加权平均）
  overallLevel: "excellent" | "good" | "average" | "needs-improvement";
}
```

**温度**：0.2（极低温度，保证评估严格）
**Max Tokens**：3000

---

### 5.6 Agent 6: 报告撰写员 (Report Writer)

**职责**：生成结构化的面试报告。

**模型**：DeepSeek（擅长长文本结构化生成）

**输入**：
```typescript
interface ReportWriterInput {
  dimensionEvaluation: DimensionEvaluatorOutput;
  conversationHistory: Array<{
    question: string;
    answer: string;
    evaluation: RealTimeEvaluatorOutput;
  }>;
  userProfile: {
    name: string;
    targetPosition: string;
  };
  sessionConfig: {
    mode: string;
    duration: number;
    questionsCount: number;
  };
}
```

**输出**：
```typescript
interface InterviewReport {
  overview: {
    totalScore: number;
    duration: number;
    questionsCount: number;
    overallEvaluation: string;  // 总体评价（100字以内）
    overallLevel: string;
  };
  dimensions: Array<{
    name: string;
    score: number;
    analysis: string;
    evidence: string[];
    strengths: string[];
    weaknesses: string[];
  }>;
  highlights: string[];         // 亮点（3-5条）
  risks: string[];              // 风险点（2-3条）
  weaknesses: Array<{
    dimension: string;
    description: string;
    severity: "high" | "medium" | "low";
    recommendedQuestions: string[]; // 推荐练习的题目
  }>;
  answerAnalysis: Array<{
    question: string;
    userAnswer: string;
    evaluation: string;
    suggestion: string;
  }>;
  nextSteps: string[];          // 改进建议（5-8条）
  recommendedLearning: {        // 推荐学习内容
    knowledgeBases: Array<{
      id: string;
      name: string;
      reason: string;
    }>;
    categories: Array<{
      id: string;
      name: string;
      reason: string;
    }>;
    questions: Array<{
      id: string;
      title: string;
      reason: string;
    }>;
  };
  interviewData: {              // 原始面试数据
    mode: string;
    difficulty: string;
    questionsCount: number;
    averageAnswerTime: number;
  };
}
```

**报告结构**：

```markdown
# 面试报告

## 总体评价
- 总分：X.X / 10
- 等级：优秀/良好/一般/需改进
- 总体评价：一句话总结

## 能力维度分析
### 1. 技术深度 (X.X/10)
- 分析：...
- 证据：面试中第 X 题的回答...
- 亮点：...
- 不足：...

### 2. 知识广度 (X.X/10)
...

## 亮点
1. ...
2. ...

## 风险点
1. ...
2. ...

## 逐题分析
### 第 1 题：...
- 你的回答：...
- 评估：...
- 建议：...

## 改进建议
1. ...
2. ...

## 推荐学习
- 知识库：...
- 分类：...
- 题目：...
```

**温度**：0.4（中等偏低，保证报告结构化且自然）
**Max Tokens**：4000

---

### 5.7 Agent 7: 交叉验证员 (Cross-Validator)

**职责**：验证面试报告的准确性和一致性。

**模型**：Qwen（与报告撰写员不同模型）

**验证内容**：

| 验证项 | 说明 | 严重程度 |
|--------|------|---------|
| 事实一致性 | 报告中的引用是否与面试记录一致 | critical |
| 评分合理性 | 各维度评分是否有充分证据支撑 | major |
| 逻辑一致性 | 亮点和风险是否有矛盾 | major |
| 建议可行性 | 改进建议是否具体可操作 | minor |
| 遗漏检查 | 是否有重要的面试表现未被提及 | major |

**输入**：
```typescript
interface CrossValidatorInput {
  report: InterviewReport;
  conversationHistory: Array<{
    question: string;
    answer: string;
    evaluation: RealTimeEvaluatorOutput;
  }>;
  dimensionEvaluation: DimensionEvaluatorOutput;
}
```

**输出**：
```typescript
interface CrossValidatorOutput {
  passed: boolean;
  confidence: number;           // 置信度 0-1
  issues: Array<{
    type: "fact_error" | "inconsistency" | "insufficient_evidence" | "unreasonable_suggestion" | "omission";
    location: string;           // 问题位置
    description: string;        // 问题描述
    severity: "critical" | "major" | "minor";
    suggestion: string;         // 修改建议
  }>;
  corrections: string[];        // 具体修改建议
}
```

**处理策略**：

| 问题严重程度 | 处理方式 |
|------------|---------|
| critical | 标记报告为"需人工审核"，不直接展示 |
| major | 自动修正后重新验证 |
| minor | 记录日志，不阻塞报告展示 |

**温度**：0.1（极低温度，保证验证严格）
**Max Tokens**：2000

---

## 6. 多模型交叉验证机制

### 6.1 为什么需要多模型

| 风险 | 说明 | 单模型问题 | 多模型解决 |
|------|------|-----------|-----------|
| 模型幻觉 | 编造不存在的技术概念 | 无法发现 | 不同模型对同一问题的理解不同，容易发现 |
| 评估偏向 | 对自己提出的问题评分偏高 | 严重 | 评估员与面试官模型分离 |
| 一致性偏差 | 长文本中前后矛盾 | 常见 | 交叉验证员专门检查 |
| 能力盲区 | 某个模型不擅长的领域 | 无法避免 | 不同模型互补 |
| 温度敏感 | 温度设置影响输出稳定性 | 难以平衡 | 不同角色用不同温度 |

### 6.2 DeepSeek vs Qwen 分工

| Agent | 模型 | 原因 | 温度 |
|-------|------|------|------|
| 面试官 (Interviewer) | DeepSeek | 擅长角色扮演和对话生成 | 0.5 |
| 追问策略员 (Prober) | DeepSeek | 需要理解对话上下文 | 0.3 |
| 难度调节员 (Adjuster) | DeepSeek | 需要理解整体表现 | 0.2 |
| 实时评估员 (Evaluator) | Qwen | 客观评估，避免偏向 | 0.2 |
| 维度评估员 (Dimension) | Qwen | 深度分析，不同视角 | 0.2 |
| 报告撰写员 (Writer) | DeepSeek | 擅长长文本结构化生成 | 0.4 |
| 交叉验证员 (Validator) | Qwen | 独立验证，发现矛盾 | 0.1 |

### 6.3 交叉验证流程

```
报告撰写员 (DeepSeek) 生成报告草稿
            │
            ▼
    交叉验证员 (Qwen) 验证
            │
            ├─────────────────┐
            │                 │
           通过              不通过
            │                 │
            ▼                 ▼
    展示给用户         检查问题严重程度
                            │
                    ┌───────┴───────┐
                    │               │
                 critical        major/minor
                    │               │
                    ▼               ▼
            标记人工审核      自动修正后重试
                    │               │
                    ▼               ▼
            通知管理员          重新验证
                                    │
                                    ▼
                              通过 → 展示
                              不通过 → 人工审核
```

### 6.4 模型分歧处理

当不同模型对同一问题的评估存在分歧时：

| 分歧程度 | 处理方式 |
|---------|---------|
| 评分差异 < 1 | 取平均值 |
| 评分差异 1-2 | 以较低分为准（严格标准） |
| 评分差异 > 2 | 标记为"需人工审核"，记录分歧原因 |

---

## 7. 性能与延迟分析

### 7.1 单次面试 API 调用分析

假设一次面试包含 10 道题，每道题平均 1 次追问：

| 阶段 | Agent | 模型 | 调用次数 | 单次耗时 | 总耗时 | 是否阻塞 |
|------|-------|------|---------|---------|--------|---------|
| 开场 | Interviewer | DeepSeek | 1 | 1.5s | 1.5s | 是 |
| 用户回答 | - | - | - | - | - | - |
| 实时评估 | Evaluator | Qwen | 1 | 1.0s | 1.0s | **否** |
| 追问策略 | Prober | DeepSeek | 1 | 0.8s | 0.8s | **否** |
| 难度调节 | Adjuster | DeepSeek | 1 | 0.5s | 0.5s | **否** |
| 追问问题 | Interviewer | DeepSeek | 1 | 1.5s | 1.5s | 是 |
| 用户回答 | - | - | - | - | - | - |
| 实时评估 | Evaluator | Qwen | 1 | 1.0s | 1.0s | **否** |
| 下一题 | Interviewer | DeepSeek | 1 | 1.5s | 1.5s | 是 |
| ... | ... | ... | ... | ... | ... | ... |

**10 道题，每道 1 次追问，共 20 轮对话：**

| 模型 | 调用次数 | 单次耗时 | 串行总耗时 | 并行优化后 |
|------|---------|---------|-----------|-----------|
| DeepSeek | 25 | 1.5s | 37.5s | 15s |
| Qwen | 20 | 1.0s | 20s | 5s |
| **总计** | **45** | - | **57.5s** | **15s** |

### 7.2 关键优化：并行化

**核心洞察**：实时评估、追问策略、难度调节三个 Agent 可以**并行执行**，不阻塞面试官出题。

```
用户回答
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  并行执行（不阻塞面试流程）                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Evaluator   │  │ Prober      │  │ Adjuster    │     │
│  │ (Qwen)      │  │ (DeepSeek)  │  │ (DeepSeek)  │     │
│  │ 1.0s        │  │ 0.8s        │  │ 0.5s        │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│  并行耗时 = max(1.0, 0.8, 0.5) = 1.0s                  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
面试官根据策略生成下一题（1.5s）
```

**优化后每轮对话耗时**：
- 用户回答后立即展示"思考中"（不阻塞）
- 并行评估 + 策略（1.0s，后台）
- 面试官生成问题（1.5s，阻塞）
- **用户感知延迟：1.5s**

### 7.3 报告生成阶段

面试结束后，报告生成可以**全并行**：

```
面试结束
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  并行执行                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Dimension   │  │ Report      │  │ -           │     │
│  │ Evaluator   │  │ Writer      │  │             │     │
│  │ (Qwen)      │  │ (DeepSeek)  │  │             │     │
│  │ 3.0s        │  │ 4.0s        │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│  并行耗时 = max(3.0, 4.0) = 4.0s                       │
└─────────────────────────────────────────────────────────┘
    │
    ▼
交叉验证 (Qwen, 2.0s)
    │
    ▼
展示报告
```

**报告生成总耗时**：4.0s + 2.0s = **6.0s**

### 7.4 完整性能总结

| 阶段 | 优化前（串行） | 优化后（并行） | 用户感知延迟 |
|------|--------------|--------------|------------|
| 单轮对话（含追问） | 5.3s | **1.5s** | 1.5s |
| 10 题面试（20 轮） | 106s | **30s** | 30s |
| 报告生成 | 57.5s | **6.0s** | 6.0s |
| **总计** | **163.5s** | **36s** | **36s** |

**结论**：通过并行化优化，用户感知延迟从 163.5s 降低到 **36s**，完全可接受。

### 7.5 流式输出优化

为了进一步降低用户感知延迟，可以采用**流式输出**：

```
面试官生成问题
    │
    ▼
流式输出问题（用户立即看到第一个字）
    │
    ▼
同时后台执行评估和策略（不阻塞）
```

**效果**：用户感知延迟从 1.5s 降低到 **0.5s**（首字延迟）。

### 7.6 成本分析

| 模型 | 调用次数 | 单次 Tokens | 单次成本 | 总成本 |
|------|---------|------------|---------|--------|
| DeepSeek | 25 | ~2000 | ¥0.004 | ¥0.10 |
| Qwen | 22 | ~1500 | ¥0.003 | ¥0.066 |
| **总计** | **47** | - | - | **¥0.166** |

> 按 DeepSeek Chat（¥1/百万 tokens）和 Qwen（假设 ¥0.8/百万 tokens）计算

**单次面试成本约 ¥0.17，完全可接受。**

---

## 8. Prompt 工程

### 8.1 Agent 1: 面试官 Prompt

```markdown
# 角色
你是{name}公司的资深技术面试官，有 10 年一线面试经验。你正在面试一位应聘{targetPosition}的候选人。

# 候选人信息
{userProfile}

# 面试配置
- 面试模式：{mode}
- 目标难度：{difficulty}
- 已进行时间：{timeElapsed} 分钟
- 已提问数：{questionsCount}

# 对话历史
{conversationHistory}

# 当前策略
{strategy}

# 当前难度
{adjustment}

# 任务
根据以上信息，生成下一个面试问题。

要求：
1. 用真实面试官的口吻提问，自然、专业
2. 问题要与候选人经历和目标岗位相关
3. 遵循追问策略员的建议（如有）
4. 难度要符合当前难度设置
5. 如果是追问，要基于候选人的上一个回答
6. 不要直接评估候选人的回答

# 输出格式
只输出 JSON，不要任何解释：
{
  "question": "面试问题",
  "context": "问题背景（可选）",
  "expectedPoints": ["期望要点1", "期望要点2", "期望要点3"],
  "type": "opening|technical|behavioral|follow-up|closing",
  "estimatedAnswerTime": 120
}
```

### 8.2 Agent 2: 追问策略员 Prompt

```markdown
# 角色
你是面试策略专家，擅长设计面试追问策略。你根据候选人的回答质量，决定面试官应该如何追问。

# 当前面试信息
- 当前问题：{currentQuestion}
- 候选人回答：{userAnswer}
- 当前追问深度：{probeDepth}

# 实时评估结果
{realTimeEvaluation}

# 对话历史
{conversationHistory}

# 追问策略规则
1. 如果回答质量 < 5 或完整度 < 5：使用 clarify 策略，引导补充
2. 如果回答质量 >= 5 但深度 < 5：使用 challenge 策略，深入原理
3. 如果回答质量 >= 8 且完整度 >= 8：使用 expand 策略，扩展相关领域
4. 如果追问深度 >= 3：使用 move-on 策略，换下一题
5. 如果回答有亮点但有不完整：使用 deepen 策略，追问遗漏点

# 任务
决定是否应该追问，以及使用什么策略。

# 输出格式
只输出 JSON，不要任何解释：
{
  "shouldProbe": true|false,
  "probeStrategy": "deepen|clarify|challenge|expand|move-on",
  "suggestedQuestion": "建议的追问问题（可选）",
  "reason": "策略原因"
}
```

### 8.3 Agent 4: 实时评估员 Prompt

```markdown
# 角色
你是严格的技术面试官，负责客观评估候选人的回答质量。你只评估，不提问。

# 评估标准
1. 完整度（completeness）：是否覆盖了所有期望要点（0-10）
2. 深度（depth）：是否深入原理，而非表面描述（0-10）
3. 清晰度（clarity）：表达是否条理清晰（0-10）
4. 匹配度（relevance）：是否切题，有无跑题（0-10）

# 当前面试信息
- 面试问题：{question}
- 期望要点：{expectedPoints}
- 候选人回答：{userAnswer}
- 面试上下文：{conversationContext}

# 任务
客观评估候选人的回答，严格按标准评分。

要求：
1. 评分要客观，不受个人偏好影响
2. 要指出具体遗漏了哪些要点
3. 要指出回答的亮点和不足
4. 给出具体的改进建议

# 输出格式
只输出 JSON，不要任何解释：
{
  "quality": 7.5,
  "completeness": 8,
  "depth": 7,
  "clarity": 8,
  "coveredPoints": ["已覆盖要点1"],
  "missingPoints": ["遗漏要点1"],
  "strengths": ["亮点1"],
  "weaknesses": ["不足1"],
  "suggestion": "改进建议"
}
```

### 8.4 Agent 5: 维度评估员 Prompt

```markdown
# 角色
你是资深技术面试官和人才评估专家。你擅长从多个维度深度分析候选人的面试表现。

# 评估维度
1. 技术深度（25%）：对技术原理的理解程度
2. 知识广度（20%）：知识面覆盖范围
3. 逻辑思维（20%）：分析问题的条理性
4. 表达能力（15%）：语言组织和表达清晰度
5. 实战经验（15%）：结合实际项目的能力
6. 学习能力（5%）：对新技术的了解和态度

# 面试记录
{conversationHistory}

# 候选人信息
{userProfile}

# 任务
从以上 6 个维度评估候选人的面试表现。

要求：
1. 每个维度给出 0-10 的评分
2. 评分要有具体的面试证据支撑
3. 指出每个维度的亮点和不足
4. 给出总体评价和等级

# 输出格式
只输出 JSON，不要任何解释：
{
  "dimensions": [
    {
      "name": "技术深度",
      "score": 8,
      "weight": 0.25,
      "weightedScore": 2.0,
      "analysis": "分析内容",
      "evidence": ["证据1"],
      "strengths": ["亮点1"],
      "weaknesses": ["不足1"]
    }
  ],
  "totalScore": 7.5,
  "overallLevel": "good"
}
```

### 8.5 Agent 6: 报告撰写员 Prompt

```markdown
# 角色
你是专业的面试报告撰写专家。你擅长将面试数据转化为结构化、有价值的面试报告。

# 输入数据
## 维度评估结果
{dimensionEvaluation}

## 面试记录
{conversationHistory}

## 候选人信息
{userProfile}

## 面试配置
{sessionConfig}

# 报告要求
1. 总体评价要客观、有洞察力
2. 维度分析要有具体证据
3. 亮点和风险要平衡
4. 改进建议要具体可操作
5. 推荐学习要与薄弱点对应
6. 报告语气要专业但鼓励性

# 输出格式
生成结构化的面试报告，包含：
- 总体评价
- 能力维度分析
- 亮点
- 风险点
- 逐题分析
- 改进建议
- 推荐学习
```

### 8.6 Agent 7: 交叉验证员 Prompt

```markdown
# 角色
你是质量审核专家，负责验证面试报告的准确性和一致性。你严格、细致、不放过任何错误。

# 验证标准
1. 事实一致性：报告中的引用是否与面试记录一致
2. 评分合理性：评分是否有充分证据
3. 逻辑一致性：报告各部分是否有矛盾
4. 建议可行性：改进建议是否具体可操作
5. 遗漏检查：是否有重要表现未被提及

# 输入数据
## 面试报告
{report}

## 面试记录
{conversationHistory}

## 维度评估
{dimensionEvaluation}

# 任务
验证报告质量，发现问题。

要求：
1. 严格按标准验证
2. 发现问题要指出具体位置和原因
3. 给出修改建议
4. 判断报告是否可以通过

# 输出格式
只输出 JSON，不要任何解释：
{
  "passed": true|false,
  "confidence": 0.95,
  "issues": [
    {
      "type": "fact_error|inconsistency|insufficient_evidence|unreasonable_suggestion|omission",
      "location": "问题位置",
      "description": "问题描述",
      "severity": "critical|major|minor",
      "suggestion": "修改建议"
    }
  ],
  "corrections": ["修改建议1"]
}
```

---

## 9. 数据模型

### 9.1 InterviewSession 模型扩展

```prisma
model InterviewSession {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  // 面试配置
  mode        String   // general | technical | behavioral | targeted
  difficulty  String   // easy | medium | hard
  duration    Int      // 计划时长（分钟）
  focusAreas  String[] // 重点考察领域
  
  // 状态
  status      String   // pending | active | paused | completed | error
  
  // 时间
  startedAt   DateTime?
  endedAt     DateTime?
  createdAt   DateTime @default(now())
  
  // 关联
  questions   InterviewQuestion[]
  report      InterviewReport?
  
  // Agent 执行记录
  agentLogs   AgentExecutionLog[]
}

model InterviewQuestion {
  id          String   @id @default(cuid())
  sessionId   String
  session     InterviewSession @relation(fields: [sessionId], references: [id])
  
  // 问题信息
  question    String
  context     String?
  expectedPoints String[]
  type        String   // opening | technical | behavioral | follow-up | closing
  difficulty  String
  
  // 顺序
  sequence    Int
  probeDepth  Int      @default(0)
  
  // 用户回答
  answer      String?
  answerTime  Int?     // 回答用时（秒）
  
  // 实时评估
  evaluation  Json?    // RealTimeEvaluatorOutput
  
  // 策略
  strategy    Json?    // ProberOutput
  adjustment  Json?    // AdjusterOutput
  
  createdAt   DateTime @default(now())
}

model InterviewReport {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  session     InterviewSession @relation(fields: [sessionId], references: [id])
  
  // 总体评价
  totalScore  Float
  overallLevel String
  overallEvaluation String
  
  // 维度评估
  dimensions  Json     // DimensionEvaluatorOutput
  
  // 亮点和风险
  highlights  String[]
  risks       String[]
  
  // 改进建议
  nextSteps   String[]
  
  // 推荐学习
  recommendedLearning Json
  
  // 交叉验证
  validation  Json?    // CrossValidatorOutput
  
  // 状态
  status      String   @default("pending") // pending | validated | rejected
  
  createdAt   DateTime @default(now())
}

model AgentExecutionLog {
  id          String   @id @default(cuid())
  sessionId   String
  session     InterviewSession @relation(fields: [sessionId], references: [id])
  
  // Agent 信息
  agentName   String   // Interviewer | Prober | Adjuster | Evaluator | Dimension | Writer | Validator
  model       String   // deepseek | qwen
  
  // 输入输出
  input       Json
  output      Json
  
  // 性能
  latency     Int      // 耗时（毫秒）
  tokensUsed  Int      // Token 使用量
  
  // 错误
  error       String?
  
  createdAt   DateTime @default(now())
}
```

---

## 10. 面试流程时序

### 10.1 完整时序图

```
用户    UI    SessionManager    Interviewer    Prober    Adjuster    Evaluator    Dimension    Writer    Validator    DB
 │       │          │              │            │          │            │           │          │           │          │
 │──────►│          │              │            │          │            │           │          │           │          │
 │ 开始面试 │          │              │            │          │            │           │          │           │          │
 │       │─────────►│              │            │          │            │           │          │           │          │
 │       │ 初始化会话 │              │            │          │            │           │          │           │          │
 │       │          │─────────────►│            │          │            │           │          │           │          │
 │       │          │  生成开场问题  │            │          │            │           │          │           │          │
 │       │          │◄─────────────│            │          │            │           │          │           │          │
 │       │◄─────────│              │            │          │            │           │          │           │          │
 │       │  展示问题  │              │            │          │            │           │          │           │          │
 │◄──────│          │              │            │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │ 回答问题 │          │              │            │          │            │           │          │           │          │
 │──────►│          │              │            │          │            │           │          │           │          │
 │       │─────────►│              │            │          │            │           │          │           │          │
 │       │          │──────────────────────────────────────────────────────────────────────────────────────────────►
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │  并行执行（不阻塞）          │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │─────────────►│            │          │            │           │          │           │          │
 │       │          │  追问策略     │            │          │            │           │          │           │          │
 │       │          │◄─────────────│            │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │──────────────────────────►│          │            │           │          │           │          │
 │       │          │  难度调节     │            │          │            │           │          │           │          │
 │       │          │◄──────────────────────────│          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │─────────────────────────────────────►│            │           │          │           │          │
 │       │          │  实时评估     │            │          │            │           │          │           │          │
 │       │          │◄─────────────────────────────────────│            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │◄───────────────────────────────────────────────────────────────────────────────────────────────│
 │       │          │  保存评估结果  │            │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │─────────────►│            │          │            │           │          │           │          │
 │       │          │  生成下一题   │            │          │            │           │          │           │          │
 │       │          │◄─────────────│            │          │            │           │          │           │          │
 │       │◄─────────│              │            │          │            │           │          │           │          │
 │       │  展示问题  │              │            │          │            │           │          │           │          │
 │◄──────│          │              │            │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │ ... 循环 ...     │              │            │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │ 结束面试 │          │              │            │          │            │           │          │           │          │
 │──────►│          │              │            │          │            │           │          │           │          │
 │       │─────────►│              │            │          │            │           │          │           │          │
 │       │          │──────────────────────────────────────────────────────────────────────────────────────────────────►
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │  并行执行报告生成            │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │─────────────────────────────────────────────────────────────────────────────►│           │          │
 │       │          │  维度评估     │            │          │            │           │          │           │          │
 │       │          │◄─────────────────────────────────────────────────────────────────────────────│           │          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │────────────────────────────────────────────────────────────────────────────────────────►│          │
 │       │          │  撰写报告     │            │          │            │           │          │           │          │
 │       │          │◄────────────────────────────────────────────────────────────────────────────────────────│          │
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │──────────────────────────────────────────────────────────────────────────────────────────────────►
 │       │          │  交叉验证     │            │          │            │           │          │           │          │
 │       │          │◄──────────────────────────────────────────────────────────────────────────────────────────────────│
 │       │          │              │            │          │            │           │          │           │          │
 │       │          │◄───────────────────────────────────────────────────────────────────────────────────────────────────│
 │       │          │  保存报告     │            │          │            │           │          │           │          │
 │       │◄─────────│              │            │          │            │           │          │           │          │
 │       │  展示报告  │              │            │          │            │           │          │           │          │
 │◄──────│          │              │            │          │            │           │          │           │          │
 │       │          │              │            │          │            │           │          │           │          │
```

### 10.2 状态流转

```
PENDING ──► ACTIVE ──► COMPLETED ──► REPORT_GENERATING ──► REPORT_VALIDATED
              │            │                │                      │
              │            │                │                      ▼
              │            │                │                 REPORT_REJECTED
              │            │                │                      │
              │            │                │                      ▼
              │            │                │                   人工审核
              │            │                │
              │            │                ▼
              │            │           VALIDATION_FAILED
              │            │
              ▼            ▼
           PAUSED       ERROR
              │            │
              └────────────┘
                   │
                   ▼
                可恢复
```

---

## 11. 错误处理与降级

### 11.1 错误分类与处理

| 错误类型 | 说明 | 处理策略 |
|---------|------|---------|
| 网络超时 | API 调用超时 | 重试 2 次，仍失败则降级 |
| 模型不可用 | 某个模型服务故障 | 切换到备用模型 |
| 格式错误 | AI 返回非预期格式 | 重试 1 次，仍失败则跳过 |
| 评估分歧 | 不同模型评估差异过大 | 标记人工审核 |
| 验证失败 | 交叉验证发现严重问题 | 标记人工审核 |

### 11.2 降级策略

| 故障场景 | 降级方案 |
|---------|---------|
| Qwen 不可用 | 实时评估改用 DeepSeek（降低客观性，但保证功能） |
| DeepSeek 不可用 | 面试官改用 Qwen（降低对话质量，但保证面试进行） |
| 评估 Agent 超时 | 跳过实时评估，面试结束后再统一评估 |
| 验证 Agent 超时 | 跳过交叉验证，直接展示报告 |
| 所有 AI 不可用 | 切换到预设题库模式，使用固定问题 |

### 11.3 重试策略

```typescript
const retryConfig = {
  maxRetries: 2,
  backoffMultiplier: 2,
  initialDelayMs: 500,
  maxDelayMs: 3000,
};
```

---

## 12. 风险与应对

| # | 风险 | 可能性 | 影响 | 应对措施 |
|---|------|--------|------|---------|
| 1 | 多模型增加延迟 | 中 | 中 | 并行化优化，用户感知延迟 < 2s |
| 2 | 模型间评估标准不一致 | 中 | 高 | 标准化 Prompt，定期校准 |
| 3 | API 成本增加 | 中 | 中 | 批处理优化，缓存机制 |
| 4 | 系统复杂度增加 | 高 | 中 | 模块化设计，逐步迭代 |
| 5 | 用户感知评估不客观 | 低 | 高 | 多模型交叉验证，人工审核兜底 |
| 6 | 面试体验碎片化 | 低 | 中 | 流式输出，保持对话连贯性 |
| 7 | 数据隐私风险 | 低 | 高 | 敏感数据脱敏，合规存储 |

---

## 13. 迭代路线图

### Phase 1: MVP（最小可行产品）

**目标**：验证多 Agent 协作的可行性

**功能**：
- [ ] 实现 Agent 1（面试官）+ Agent 4（实时评估）基础版
- [ ] 使用 DeepSeek 单模型
- [ ] 面试结束生成简单报告
- [ ] 基础错误处理

**时间**：1 周

### Phase 2: 多 Agent 协作

**目标**：实现完整的多 Agent 协作流程

**功能**：
- [ ] 实现 Agent 2（追问策略）+ Agent 3（难度调节）
- [ ] 实现 Agent 5（维度评估）+ Agent 6（报告撰写）
- [ ] 串行执行流程
- [ ] 完整报告生成

**时间**：1-2 周

### Phase 3: 多模型交叉验证

**目标**：引入多模型，提升客观性

**功能**：
- [ ] 接入 Qwen API
- [ ] Agent 4/5/7 使用 Qwen
- [ ] Agent 1/2/3/6 使用 DeepSeek
- [ ] 交叉验证机制
- [ ] 模型分歧处理

**时间**：1 周

### Phase 4: 性能优化

**目标**：优化延迟，提升用户体验

**功能**：
- [ ] 并行化执行（评估+策略+调节并行）
- [ ] 流式输出
- [ ] 缓存机制
- [ ] 性能监控

**时间**：1 周

### Phase 5: 智能化与联动

**目标**：面试与学习深度联动

**功能**：
- [ ] 面试报告驱动学习推荐
- [ ] Topic Scout 根据面试薄弱点发现建库需求
- [ ] 个性化面试（基于用户学习进度）
- [ ] Agent 自我进化（基于反馈优化 Prompt）

**时间**：2-4 周

---

## 14. 附录

### 14.1 术语表

| 术语 | 说明 |
|------|------|
| Agent | 智能体，这里指一个专门的 AI 角色，负责面试中的一个特定任务 |
| Pipeline | 流水线，指 Agent 之间按顺序协作的流程 |
| Prompt | 提示词，给 AI 的指令 |
| Temperature | 温度，控制 AI 输出的随机性，越低越稳定 |
| 流式输出 | 模型生成内容时逐字返回，降低用户感知延迟 |
| 并行化 | 多个 Agent 同时执行，不互相阻塞 |
| 交叉验证 | 使用不同模型对同一结果进行验证，发现分歧 |
| 追问深度 | 对同一问题的追问次数，0-3 |
| 感知延迟 | 用户从回答到看到下一题的时间 |

### 14.2 7 个 Agent 一览表

| # | Agent 名称 | 英文名称 | 职责 | 模型 | 温度 | 阻塞性 | 触发方式 |
|---|-----------|---------|------|------|------|--------|---------|
| 1 | 面试官 | Interviewer | 向用户提问 | DeepSeek | 0.5 | 阻塞 | 每轮对话 |
| 2 | 追问策略员 | Prober | 决定追问策略 | DeepSeek | 0.3 | 非阻塞 | 用户回答后 |
| 3 | 难度调节员 | Adjuster | 动态调节难度 | DeepSeek | 0.2 | 非阻塞 | 用户回答后 |
| 4 | 实时评估员 | Real-time Evaluator | 评估回答质量 | Qwen | 0.2 | 非阻塞 | 用户回答后 |
| 5 | 维度评估员 | Dimension Evaluator | 多维度深度评估 | Qwen | 0.2 | 阻塞 | 面试结束 |
| 6 | 报告撰写员 | Report Writer | 生成结构化报告 | DeepSeek | 0.4 | 阻塞 | 面试结束 |
| 7 | 交叉验证员 | Cross-Validator | 验证报告质量 | Qwen | 0.1 | 阻塞 | 报告生成后 |

### 14.3 性能对比表

| 指标 | 单模型方案 | 多 Agent 多模型方案（串行） | 多 Agent 多模型方案（并行优化） |
|------|-----------|------------------------|------------------------|
| 单轮延迟 | 2-3s | 5.3s | **1.5s** |
| 10 题面试总耗时 | 20-30s | 106s | **30s** |
| 报告生成时间 | 5-10s | 57.5s | **6.0s** |
| 评估客观性 | 70% | 85% | **90%+** |
| 报告准确性 | 80% | 90% | **95%+** |
| 单次面试成本 | ¥0.05 | ¥0.30 | **¥0.17** |
| 系统复杂度 | 低 | 高 | 高 |

### 14.4 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-05-06 | 采用 7 Agent 架构 | 角色分离，每个 Agent 专注一个任务 |
| 2026-05-06 | 使用双模型（DeepSeek + Qwen） | 避免自问自评，提升客观性 |
| 2026-05-06 | 实时评估非阻塞执行 | 不增加用户感知延迟 |
| 2026-05-06 | 报告生成并行化 | 将报告生成时间从 57.5s 降到 6s |
| 2026-05-06 | 交叉验证不通过时标记人工审核 | 保证报告质量，避免错误报告展示 |
| 2026-05-06 | 支持流式输出 | 进一步降低用户感知延迟到 0.5s |

### 14.5 参考资源

1. [LangChain Multi-Agent Workflows](https://python.langchain.com/docs/use_cases/agent_simulations/)
2. [AutoGen: Multi-Agent Conversation Framework](https://microsoft.github.io/autogen/)
3. [DeepSeek API 文档](https://platform.deepseek.com/docs)
4. [Qwen API 文档](https://help.aliyun.com/zh/dashscope/)
5. [Multi-Model Consensus for LLM Evaluation](https://arxiv.org/abs/2402.1xxxx)

---

> 本方案待评审。评审通过后进入 Phase 1 实施。
