# 复盘中心信息架构、字段清单与 Agent 协议

## 1. 文档目的

本文件用于把复盘中心从“理念”和“要求”继续下沉到真正可开发、可联调、可验收的层面。

本文件回答 4 件事：

1. 复盘中心页面应该怎么组织。
2. 每个区块应该展示哪些字段。
3. 服务端应该沉淀哪些分析实体。
4. 多 Agent 之间应该如何传递输入输出。

---

## 2. 复盘中心信息架构总览

建议把复盘中心组织成以下 7 个一级区块：

1. 顶部筛选条
2. 总览区
3. 问题诊断区
4. 证据区
5. 行动板
6. 改善验证区
7. 历史与对比区

页面流转原则：

- 用户进入页面后，先看到“现在最重要的问题和今天该做什么”
- 然后往下看到“为什么会这样”
- 再往下看到“证据是什么”
- 接着看到“该怎么做”
- 最后看到“做了以后有没有变好”

这条信息顺序不能乱。

---

## 3. 页面信息架构详细设计

## 3.1 顶部筛选条

### 目标

让复盘中心具备数据探索能力，而不是只能看默认视图。

### 必须字段

- `timeRange`
  - 取值：`7d | 14d | 30d | all`
- `interviewType`
  - 取值：`mock | targeted | learning | all`
- `role`
  - 目标岗位
- `company`
  - 目标公司
- `dimension`
  - 指定能力维度
- `sampleStatus`
  - 取值：`valid | invalid | all`

### 交互要求

- 修改任一筛选条件后，必须刷新整个 snapshot
- 必须保留最近一次用户筛选状态

---

## 3.2 总览区

### 目标

让用户在 5 秒内知道当前最重要的事。

### 模块组成

1. 核心结论卡
2. 今日行动卡
3. 可信度卡
4. 样本摘要卡
5. KPI 卡组

### 字段清单

#### `headlineCard`

- `title`
- `summary`
- `priority`
- `issueId`
- `trendDirection`
- `sampleCount`

#### `todayActionCard`

- `title`
- `description`
- `actionType`
- `targetPath`
- `actionPayload`
- `expectedOutcome`

#### `confidenceCard`

- `confidenceLevel`
- `confidenceScore`
- `sampleCoverage`
- `timeCoverage`
- `dimensionCoverage`

#### `sampleSummaryCard`

- `validSampleCount`
- `invalidSampleCount`
- `timeRangeLabel`
- `mainSourceBreakdown`

#### `metrics`

每个 metric 包含：

- `key`
- `label`
- `value`
- `helper`
- `trend`
- `baseline`

---

## 3.3 问题诊断区

### 目标

把“表象问题”升级成“问题树”。

### 页面结构

建议分为：

1. 问题列表
2. 当前问题详情
3. 根因树
4. 影响说明

### 字段清单

#### `issues[]`

每个问题至少包含：

- `id`
- `name`
- `category`
- `severity`
- `frequency`
- `stability`
- `impactScore`
- `summary`
- `rootCause`
- `latestSeenAt`
- `relatedDimensionKeys[]`
- `recommendedActionIds[]`

#### `issueRootCauseTree`

- `issueId`
- `rootNodes[]`

每个 root node 包含：

- `id`
- `label`
- `description`
- `confidence`
- `children[]`

#### `issueImpact`

- `issueId`
- `impactAreas[]`
- `riskLevel`
- `willAffect`
- `notAffect`

---

## 3.4 证据区

### 目标

证明系统不是瞎判断。

### 页面结构

建议包含：

1. 证据列表
2. 证据详情面板
3. 原始上下文预览
4. 推荐改写对照

### 字段清单

#### `evidences[]`

每条证据必须包含：

- `id`
- `issueId`
- `sessionId`
- `sessionType`
- `sessionCreatedAt`
- `role`
- `company`
- `questionId`
- `questionTitle`
- `messageId`
- `excerpt`
- `reason`
- `dimension`
- `confidence`
- `severity`

#### `evidenceContext`

- `beforeMessages[]`
- `targetMessage`
- `afterMessages[]`
- `scoreContext`
- `followUpContext[]`

#### `rewriteSuggestion`

- `originalAnswer`
- `problemReason`
- `improvedAnswer`
- `improvementHighlights[]`

---

## 3.5 行动板

### 目标

把“建议”升级成“任务卡”。

### 页面结构

建议按优先级展示：

1. 今日最该做
2. 本周应完成
3. 持续保持项

### 字段清单

#### `actions[]`

每条 action 至少包含：

- `id`
- `issueId`
- `title`
- `description`
- `whyThisAction`
- `actionType`
- `recommendedMode`
- `recommendedQuestionTypes[]`
- `recommendedDifficulty`
- `targetPath`
- `targetPayload`
- `successMetric`
- `expectedOutcome`
- `estimatedEffort`
- `priority`

#### `targetPayload`

建议包含：

- `role`
- `company`
- `level`
- `issueId`
- `issueName`
- `trainingGoal`
- `recentFailureSummary`
- `recommendedPromptStyle`
- `evaluationCriteria[]`

---

## 3.6 改善验证区

### 目标

让系统能回答“练完之后有没有真的变好”。

### 页面结构

建议包含：

1. 改善概览
2. 问题前后对比
3. 建议有效性
4. 反弹监控

### 字段清单

#### `progressOverview`

- `improvedIssueCount`
- `worsenedIssueCount`
- `stableIssueCount`
- `verifiedActionCount`
- `effectiveActionCount`

#### `issueProgress[]`

每项包含：

- `issueId`
- `issueName`
- `previousScore`
- `currentScore`
- `changeValue`
- `changeDirection`
- `sampleDelta`
- `judgement`

#### `actionEffectiveness[]`

每项包含：

- `actionId`
- `actionTitle`
- `executionCount`
- `postActionSampleCount`
- `effectiveness`
- `summary`

---

## 3.7 历史与对比区

### 目标

把“历史记录列表”升级成“历史分析入口”。

### 页面结构

建议包含：

1. 有效训练记录
2. 无效样本归档
3. 同问题前后对比
4. 同岗位对比

### 字段清单

#### `historySessions[]`

- `id`
- `createdAt`
- `status`
- `sampleValidity`
- `invalidReason`
- `mode`
- `role`
- `company`
- `roundCount`
- `score`
- `reportStatus`
- `hasEvidence`

#### `comparisonGroups[]`

- `groupKey`
- `groupType`
- `items[]`

---

## 4. 建议沉淀的数据实体

## 4.1 ReviewSnapshot

表示一次复盘查询的聚合快照。

### 字段建议

- `id`
- `userId`
- `timeRange`
- `filters`
- `headline`
- `confidenceLevel`
- `confidenceScore`
- `validSampleCount`
- `invalidSampleCount`
- `generatedAt`

## 4.2 ReviewIssue

表示一个稳定存在的问题。

### 字段建议

- `id`
- `snapshotId`
- `name`
- `category`
- `severity`
- `frequency`
- `stability`
- `impactScore`
- `summary`
- `rootCause`
- `status`

## 4.3 ReviewEvidence

表示支持问题的证据。

### 字段建议

- `id`
- `issueId`
- `sessionId`
- `questionId`
- `messageId`
- `excerpt`
- `reason`
- `dimension`
- `confidence`

## 4.4 ReviewAction

表示可执行动作。

### 字段建议

- `id`
- `issueId`
- `title`
- `description`
- `actionType`
- `targetPath`
- `targetPayload`
- `successMetric`
- `expectedOutcome`
- `priority`

## 4.5 ReviewActionExecution

表示动作执行结果。

### 字段建议

- `id`
- `actionId`
- `userId`
- `startedAt`
- `completedAt`
- `resultStatus`
- `improvementScore`
- `notes`

---

## 5. Agent 总体协作协议

## 5.1 顶层调度协议

由 `Orchestrator Agent` 统一接收请求。

### 输入

```ts
type ReviewDashboardRequest = {
  userId: string;
  filters: {
    timeRange: "7d" | "14d" | "30d" | "all";
    interviewType?: "mock" | "targeted" | "learning" | "all";
    role?: string | null;
    company?: string | null;
    dimension?: string | null;
    sampleStatus?: "valid" | "invalid" | "all";
  };
};
```

### 输出

```ts
type ReviewDashboardResponse = {
  snapshot: ReviewSnapshotDTO;
  issues: ReviewIssueDTO[];
  evidences: ReviewEvidenceDTO[];
  actions: ReviewActionDTO[];
  progress: ReviewProgressDTO;
  agentTrace: ReviewAgentTraceDTO[];
};
```

---

## 5.2 Signal Agent 协议

### 职责

- 拉取原始样本
- 判断有效样本
- 给样本打基础标签

### 输入

- `userId`
- `filters`

### 输出

```ts
type SignalAgentOutput = {
  validSamples: ValidSampleDTO[];
  invalidSamples: InvalidSampleDTO[];
  metrics: BaseMetricDTO[];
  tags: SampleTagDTO[];
};
```

### 降级策略

- 如果样本不足，必须输出“低置信度”标记
- 不允许直接给强结论

---

## 5.3 Evidence Agent 协议

### 职责

- 从原始会话和评分结果中抽取高价值证据

### 输入

- `validSamples`
- `tags`
- `scoringData`

### 输出

```ts
type EvidenceAgentOutput = {
  evidences: ReviewEvidenceDTO[];
  coverage: {
    sessionCount: number;
    issueCount: number;
    confidenceAverage: number;
  };
};
```

### 降级策略

- 如果证据不足，问题不能进入“高置信度问题池”

---

## 5.4 Diagnosis Agent 协议

### 职责

- 从证据中形成问题树

### 输入

- `validSamples`
- `evidences`
- `metrics`
- `roleContext`

### 输出

```ts
type DiagnosisAgentOutput = {
  issues: ReviewIssueDTO[];
  rootCauseTrees: RootCauseTreeDTO[];
  impactAnalysis: ImpactAnalysisDTO[];
};
```

### 降级策略

- 如果问题只出现 1 次且无稳定证据，只能进入“观察问题池”

---

## 5.5 Strategy Agent 协议

### 职责

- 把问题转成动作单

### 输入

- `issues`
- `roleContext`
- `trainingHistory`
- `resourceAvailability`

### 输出

```ts
type StrategyAgentOutput = {
  actions: ReviewActionDTO[];
  priorities: {
    today: string[];
    thisWeek: string[];
    keep: string[];
  };
};
```

---

## 5.6 Drill Agent 协议

### 职责

- 生成下一次训练任务

### 输入

- `action`
- `issue`
- `roleContext`
- `recentFailureSummary`

### 输出

```ts
type DrillAgentOutput = {
  targetPath: string;
  payload: {
    role?: string | null;
    company?: string | null;
    level?: string | null;
    issueId: string;
    issueName: string;
    trainingGoal: string;
    recommendedMode: string;
    recommendedQuestionTypes: string[];
    evaluationCriteria: string[];
  };
};
```

### 强约束

- 进入训练页后不允许再提示“等待补充岗位信息”
- 需要的上下文必须由 Drill Agent 一次性补齐

---

## 5.7 Progress Agent 协议

### 职责

- 验证建议执行后的效果

### 输入

- `issueBaseline`
- `executions`
- `newSamples`

### 输出

```ts
type ProgressAgentOutput = {
  issueProgress: IssueProgressDTO[];
  actionEffectiveness: ActionEffectivenessDTO[];
  reboundWarnings: ReboundWarningDTO[];
};
```

---

## 5.8 Narrative Agent 协议

### 职责

- 组织用户可读的表达

### 输入

- `metrics`
- `issues`
- `evidences`
- `actions`
- `progress`

### 输出

```ts
type NarrativeAgentOutput = {
  headline: string;
  trendSummary: string;
  insightCards: ReviewInsightCardDTO[];
  todayActionSummary: string;
};
```

### 强约束

- Narrative Agent 不允许创造事实
- Narrative Agent 只能组织表达，不能修改证据和判断结果

---

## 6. 页面接口建议

## 6.1 总览接口

`GET /api/v2/review/dashboard`

职责：

- 返回首页所需的完整 snapshot

## 6.2 问题详情接口

`GET /api/v2/review/issues/:issueId`

职责：

- 返回问题详情、根因树、影响描述

## 6.3 证据接口

`GET /api/v2/review/issues/:issueId/evidences`

职责：

- 返回问题对应证据列表

## 6.4 动作执行接口

`POST /api/v2/review/actions/:actionId/execute`

职责：

- 启动一条从复盘到训练的动作

## 6.5 改善验证接口

`GET /api/v2/review/progress`

职责：

- 返回改善情况和建议有效性

---

## 7. 当前实现需要重点替换的地方

基于当前仓库结构，以下几个点必须重点升级：

1. `src/lib/interview-v2/reviewDashboard.ts`
   - 不能继续只做旧报告维度聚合
   - 要升级成真正的 Orchestrator 聚合层

2. `src/app/review/page.tsx`
   - 不能继续只做长列表平铺
   - 要升级成可筛选、可下钻、可对比的分析页

3. `src/lib/interview-v2/reviewAgents.ts`
   - 不能只留蓝图定义
   - 要补真实 Agent 执行协议和结果结构

4. `src/app/api/v2/review/dashboard/route.ts`
   - 不能只返回静态拼装快照
   - 要接真实多 Agent 聚合链路

5. 复盘动作到训练动作链路
   - 不能只传 topic 和 desc
   - 必须传完整训练 payload

---

## 8. 最终落地标准

实现完成后，复盘中心必须满足以下结构化标准：

1. 页面有完整的信息架构，不再只是长列表聚合页。
2. 每个关键区块字段清晰、来源明确、可追溯。
3. 数据实体结构独立沉淀，不依赖页面临时拼装。
4. 多 Agent 有真实输入输出协议，而不是概念说明。
5. 复盘、证据、训练、改善四个环节形成统一闭环。

只要还缺少其中任一项，复盘中心都不能算真正完成。
