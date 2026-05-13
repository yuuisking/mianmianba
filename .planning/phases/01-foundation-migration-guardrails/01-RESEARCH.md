# Phase 1: 领域底座与迁移护栏 - Research

**Date:** 2026-05-13
**Phase:** 1
**Goal:** 用统一领域模型、状态机、基础观测和 brownfield 迁移护栏，把当前仓库从页面驱动收敛为领域驱动。

## Research Summary

- 当前系统不是“没有 V2 结构”，而是 V2 结构与旧 `session/message/report` 主链并存，导致画像、状态和回放都存在多真源。
- Phase 1 最应该做的不是继续修页面，而是收敛四条底座：`画像真源`、`状态机权威`、`迁移主链`、`三层观测`。
- 现有仓库已经有可复用资产：Prisma 枚举与主表、`stateMachine.ts`、`planService.ts`、`InterviewAgentRun`、`planningSummary.orchestration`、`roomKey` 身份机制；不需要从零发明第二套体系。
- 现有最大风险不是功能缺失，而是声明模型与真实运行链不一致，例如前端缓存与服务端状态并存、报告链回写 V2 状态但依旧依赖旧会话、声明状态机未成为唯一守门器。

## Domain Research

### 1. 画像真源现状

- 当前没有独立的候选画像实体，画像信息分散在：
  - 前端 `InterviewProfileState`
  - `InterviewPlan.latestProfileInput`
  - `InterviewPlan.planningSummary`
  - 会话/报告派生数据
- `InterviewProfileState` 同时承载画像字段和运行时字段，边界过重：既有 `companyName / targetRoleName / projects / resumeSummaryMarkdown`，也有 `launchId / interviewPlanId / currentStageStatus / realtimeInterruptionContext`。
- `/api/parse` 已能生成较完整的结构化画像最小集，是“目标画像生成器”的最好起点。
- `planService.getInterviewRuntimeProfile()` 已证明服务端可从 `plan/stage/round` 组装运行态画像，是“运行时快照唯一装配入口”的最佳候选。
- `MODEL-02` 需要的三类派生结果目前没有独立真源：`岗位能力权重`、`目标轮次`、`公司流程假设` 只零散出现在 `planService` 的规划摘要、阶段草案和经验整理逻辑里，尚未被定义为明确可冻结、可回放的画像派生产物。

### 2. 状态机现状

- Prisma 与 `domain.ts` 已定义 `InterviewPlan / Stage / Round / CodingSession` 的严格状态枚举。
- `stateMachine.ts` 已有合法迁移表，但聊天、算法题、评审、结束收口并未统一通过状态机执行器落库。
- 当前真实运行链中，状态迁移分散在：
  - `chat/route.ts`
  - `codingSessionService.ts`
  - `reviewerPanel.ts`
  - `sessions/[id]/route.ts`
  - `lifecycle.ts`
- 这导致“声明状态机”和“真实可发生迁移”不一致，典型例子是 `CodingSession READY -> RUNNING/REVIEWED` 的直跳与声明机不一致。

### 3. 迁移主链现状

#### setup -> interview
- 目前至少有两条入口：
  - 阶段面试：`setup -> profile -> interview`
  - 全流程：`setup -> interview`
- 入口阶段既依赖前端缓存的画像，也依赖服务端 `plan/stage/round` 与 `roomKey`，因此存在双身份、双真源。
- `专项训练` 入口当前未被纳入同一强度研究与主链收敛，但根据 `MODEL-03` 要求，它不能长期游离在共享画像与状态机之外；Phase 1 至少要明确它是共享主链还是过渡模式。

#### interview -> report
- 目前报告主链仍以旧 `InterviewSession / Message / Report` 为读写核心。
- V2 `plan/stage/round` 侧已经能承接 reviewer panel、scorecard、insight report，但其触发时机仍绑在旧报告生成链上。
- 报告页自身依赖 `sessionId` / `roomKey` 与浏览器 fallback，因此它目前更像“旧主链外挂上 V2 回写”，而不是 V2 原生闭环。

### 4. 观测与回放现状

- 用户主链回放：已有 `InterviewSession + Message + Report + roomKey` 组合，可恢复房间与消息，但还不是正式 replay 读模型。
- 状态链：已有 `planningSummary.orchestration` 快照，可看到阶段结论与推进结果，但缺少事件序列。
- Agent 摘要链：已有 `InterviewAgentRun` 表，评审与生命周期链会写摘要，但聊天主链中的 Planner/Evidence/Composer/Guard/ClosureJudge 还没有系统化落库。
- 当前“观测”更像零散日志与摘要拼图，没有一条统一的三层回放通路。
- `PLAT-01` 要求的 `成本 / 置信度` 目前没有被上游 contract 明确锁定；现有 `InterviewAgentRun` 更偏摘要日志，后续必须明确这些字段是直写、聚合还是外推得到。

### 5. 迁移任务现状

- `.planning` 与 discuss 文档已经把“并存 / 验证 / 切换 / 清理”定为 brownfield 四步法，但当前仓库里没有显式的迁移任务对象或状态载体。
- 这意味着现阶段只能在自然语言文档里描述“正在迁移什么”，无法结构化追踪某条主链是否处于并存阶段、是否通过验证、是否已经切流、是否可回滚。
- 因此 Phase 1 需要把迁移任务至少提升为最小设计对象，即使先以 schema 字段、事件表或文档驱动对象落地，也必须具备结构化追踪能力。

## Key Findings

### A. 合理旧链路

以下资产应保留并纳入迁移，而不是直接推倒：

- `InterviewPlan / InterviewPlanStage / InterviewRound / CodingSession` 数据模型
- `stateMachine.ts` 的迁移表定义
- `planService.ts` 的计划创建、画像恢复、列表聚合能力
- `buildInterviewRoomKey()` 与 `roomKey` 身份体系
- `InterviewAgentRun` 作为 Agent 摘要链载体
- `planningSummary.orchestration` 作为阶段快照的过渡承载
- `Review*`、`InterviewScorecard`、`InterviewInsightReport` 等结构化评审与复盘资产

### B. 应直接淘汰的补丁型模式

以下模式与 Phase 1 已锁定的核心设计相悖，应视为优先清理对象：

- 前端缓存与服务端同时维护业务真态
- `InterviewProfileState` 同时承担画像真源、运行时快照、会话身份三种职责
- 报告生成接口顺带承担状态收口与编排推进副作用
- 声明状态机存在，但真实迁移绕开状态机直接 update DB
- 通过浏览器缓存兜底长期承担“主链真实历史”职责
- 通过旧 `session/message/report` 链补丁式回写 V2 结果，但不保证 `plan/stage/round` 关联完整

## Recommended Phase-1 Research Conclusions

### 1. 画像层收敛

应拆成三层：
- `长期基础档案`：只放稳定信息
- `目标画像`：按简历版本 + 公司/岗位/JD 派生
- `运行时快照`：发起面试时冻结，供 plan/stage/round 使用

不建议继续扩展 `InterviewProfileState`。

同时应把 `MODEL-02` 的三类派生结果正式纳入目标画像或快照层：
- `岗位能力权重`
- `目标轮次`
- `公司流程假设`

它们不能继续只存在于规划摘要、阶段草案或 prompt 拼装逻辑里。

### 2. 状态机收敛

应引入统一 transition service：
- 输入是业务事件，不是目标状态值
- 输出是合法的新状态、拒绝原因、回放记录
- `chat / coding / reviewer / lifecycle / session patch` 全部改走同一执行器

### 3. 主链迁移顺序

建议顺序：
1. 统一 `setup -> interview` 身份与画像快照来源
2. 把 `专项训练` 明确接入共享画像与身份主链，或定义清晰的过渡策略
3. 统一 `interview -> report` 的状态收口与 V2 关联回写
4. 让聊天主链开始补写结构化 `Question/Answer/Scorecard`
5. 让报告、复盘、通知逐步转向只读 V2 结构化结果
6. 最后清理旧 `session/message/report` 主读职责

### 4. 三层观测最小落地

Phase 1 最低标准不是“全量可视化”，而是先落三层最小骨架：
- 用户主链回放：能串起 `setup -> interview -> report`
- 状态与事件链：至少有状态快照 + 事件追加记录
- Agent 摘要链：至少让聊天、评审、生命周期三条链都写 `InterviewAgentRun`

并且必须明确 `成本 / 置信度` 的字段归属或聚合位点，避免 `PLAT-01` 在计划阶段被弱化成“只有摘要没有质量信号”。

### 5. 迁移任务最小落地

Phase 1 应把迁移任务纳入统一状态语言，至少能表达：
- 迁移对象是什么主链或子链
- 当前处于 `并存 / 验证 / 切换 / 清理` 哪一步
- 当前验证是否通过
- 当前是否可回滚
- 最近一次决策时间与责任点

## Validation Architecture

### Source Assertions
- `prisma/schema.prisma` 中出现目标画像/运行时快照/事件链相关实体或明确的扩展字段，且职责边界不再混在 `InterviewPlan.planningSummary` 与前端缓存中。
- `src/lib/interview-v2/stateMachine.ts` 旁存在统一 transition service 或等效模块，聊天、算法题、评审、生命周期、结束收口不再各自直接实现状态跳转规则。
- `src/lib/interview/config.ts` 中前端运行时画像结构被下沉为 UI 态优先，不再承担业务真态。
- `src/app/api/reports/generate/route.ts` 不再作为唯一状态收口点；报告生成与状态收口职责分离或显式编排。
- `src/app/api/chat/route.ts`、`src/lib/interview-v2/reviewerPanel.ts`、`src/lib/interview-v2/lifecycle.ts` 至少一个统一接入 `InterviewAgentRun`/事件记录写入约定。

### Behavioral Assertions
- 新建一次阶段面试与全流程面试后，服务端能明确识别唯一目标画像快照与唯一房间身份。
- 新建一次专项训练后，也能明确识别其共享画像与身份口径，或命中过渡策略。
- 刷新房间、恢复房间、结束面试、生成报告后，`plan/stage/round` 与回放结果口径一致，不依赖浏览器缓存作为唯一真源。
- 非法状态转移可被服务端拒绝，并返回明确原因与当前真实状态。
- 出现线上问题时，可先从用户主链回放定位，再下钻状态事件链与 Agent 摘要链。
- 观测层可读取 `成本` 与 `置信度` 的字段或聚合值，而不是只有模型名与耗时。

### Recommended Verification During Execution
- 以 DB schema diff + targeted route tests + source assertions 为主。
- 优先验证 `setup -> interview` 和 `interview -> report` 两条主链的状态、身份、回放一致性。
- 在 Phase 1 不追求完整 UI 回放页，但必须先证明三层观测骨架真实写入。

## Files Investigated

### Planning Inputs
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/01-foundation-migration-guardrails/01-CONTEXT.md`
- `说明文档.md`

### Domain / Schema
- `prisma/schema.prisma`
- `src/lib/interview-v2/domain.ts`
- `src/lib/interview-v2/stateMachine.ts`
- `src/lib/interview-v2/planService.ts`
- `src/lib/interview-v2/codingSessionService.ts`
- `src/lib/interview-v2/reviewerPanel.ts`
- `src/lib/interview-v2/lifecycle.ts`
- `src/lib/interview/config.ts`

### Runtime / API Hotspots
- `src/app/setup/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/interview/page.tsx`
- `src/app/coding/page.tsx`
- `src/app/report/page.tsx`
- `src/app/api/chat/route.ts`
- `src/app/api/messages/route.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/sessions/[id]/route.ts`
- `src/app/api/reports/generate/route.ts`
- `src/app/api/v2/interview-plans/route.ts`
- `src/app/api/v2/coding-sessions/route.ts`

## Risks To Carry Into Planning

- 当前仓库有大量未归档改动，Phase 1 计划必须避免边盘点边扩需求。
- 旧 `session/message/report` 链仍承载现网主流程，迁移必须明确双写、切换、回滚条件。
- `reviewerPanel`、`reports/generate`、`sessions/[id]`、`lifecycle` 都有收口副作用，计划必须统一它们的终态语义。
- `InterviewProfileState` 与 `planningSummary` 的职责切分如果不先定边界，后续 Phase 2-7 会继续复发双真源问题。

## Planning Guidance

- 计划拆分应从“语义层 -> 执行器 -> 迁移矩阵 -> 观测骨架”这个顺序出发。
- 先做盘点和边界收敛，再做主链切换；不要在 Phase 1 里直接铺开所有业务端页面改造。
- 每个计划都应明确：读取哪些旧实现、保留哪些资产、移除哪些补丁行为、如何验证迁移没有回归。

---

*Research complete: 2026-05-13*
