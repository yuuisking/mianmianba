# Phase 1: 领域底座与迁移护栏 - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

## Phase Boundary

Phase 1 不是交付新的用户功能页面，而是把当前 brownfield 仓库从“页面驱动 + 补丁兜底”切换为“领域对象清晰、状态转移统一、迁移标准明确、观测链可回放”的底座阶段。

本阶段必须先统一语义层、规则层与迁移层，明确哪些旧链路应保留并纳入迁移，哪些补丁逻辑因违背核心设计而直接淘汰。后续 Phase 2-7 都依赖这层基础，不允许把本阶段做成零散技术清理或临时兼容堆叠。

## Implementation Decisions

### Phase 1 Purpose
- **D-01:** Phase 1 的本质是建立统一语义层、规则层和迁移层，而不是继续补新功能或修局部 UI。
- **D-02:** 本阶段的直接价值，是阻断“修一个地方坏三个地方”的返工模式，为后续评估内核、运行时、全流程、算法题、复盘与 readiness 提供统一底座。
- **D-03:** 下游 plan 必须把本阶段视为 V2 的结构性基础设施阶段，而不是纯技术债清理阶段。

### 画像真源
- **D-04:** 候选画像采用双层模型：`长期基础档案` + `目标画像`。
- **D-05:** 长期基础档案保持最轻，只承载稳定不常变的信息，例如基础背景与通用标签；公司、岗位、JD、简历正文、项目经历、求职策略等都进入目标画像。
- **D-06:** 目标画像以简历版本为核心生成；一份简历版本可以派生多个目标画像，以支持不同公司/岗位/JD 的并行准备。
- **D-06A:** 目标画像除了保存输入资料，还必须冻结 `岗位能力权重`、`目标轮次`、`公司流程假设` 这三类派生结果，满足 `MODEL-02` 的回放与后续编排需求。
- **D-07:** 发起任一阶段面试或全流程时，运行时必须复制目标画像快照；历史面试、报告与复盘不允许被后续画像修改反向污染。

### 状态机权威
- **D-08:** 服务端状态机是 `目标画像 / 面试主链 / 迁移任务` 四层对象的唯一权威。
- **D-09:** 前端只保留界面态，例如输入草稿、loading、滚动位置和临时等待态；不再持有业务真态。
- **D-10:** 前端与服务端之间的驱动方式统一为“业务事件”，例如 `start_plan`、`activate_stage`、`submit_answer`、`finish_interview`，而不是直接提交目标状态值。
- **D-11:** 非法状态迁移必须被明确拒绝，并返回标准错误、当前真实状态、拒绝原因和建议下一步；不允许静默吞掉或只做模糊失败提示。
- **D-12:** Phase 1 要先把状态转移语言扩展到四层对象中，而不是只覆盖 `InterviewPlan / Stage / Round`。

### 迁移切换顺序
- **D-13:** brownfield 迁移采用“先盘点后分级”的执行方式，而不是边修边判定。
- **D-14:** 优先保护的第一条主链是 `setup -> interview`；第二条是 `interview -> report`。
- **D-14A:** `专项训练` 不能继续游离在共享画像与状态机之外；Phase 1 必须至少定义它与 `setup -> interview` 主链的共享身份口径或过渡策略。
- **D-15:** 旧链路判定标准以是否破坏画像真源、状态机权威、房间身份一致性和报告可信度为准；只要违背核心设计，就不继续兼容。
- **D-16:** 盘点完成后，优先清理明显绕开真源和状态机的补丁链，而不是先容忍这些逻辑继续挂在主链旁边。
- **D-17:** 合理旧链路保留并纳入迁移；不合理旧链路直接改掉，不再为了“历史兼容”继续背包袱。
- **D-17A:** `迁移任务` 本身要被纳入服务端权威对象，至少能表达 `并存 / 验证 / 切换 / 清理` 四步与回滚边界，不能只停留在文档口号中。

### 回放与观测
- **D-18:** Phase 1 的最低观测标准是三层都必须落地：`状态与事件链`、`用户主链回放`、`Agent 运行链`。
- **D-19:** Agent 运行链在 Phase 1 先落摘要级观测，记录角色、输入摘要、输出摘要、模型名、耗时、状态及关联的 `plan/stage/round`。
- **D-19A:** `PLAT-01` 中的 `成本` 与 `置信度` 不能被遗漏；Phase 1 至少要给出可写字段或明确聚合位点，不能留到执行期临时决定。
- **D-20:** 以后线上问题的默认第一排查入口是 `用户主链回放`，再下钻到状态与事件链和 Agent 摘要链。
- **D-21:** 观测层的目标不是堆日志，而是证明状态机、报告与迁移是否按设计运行，并为后续用户信任与内部排障提供依据。

### Claude's Discretion
- Phase 1 中“长期基础档案”的具体字段收敛、目标画像的版本编号规则、事件命名规范表、三层观测的字段命名可以由后续 research / plan 在不违背上述决策的前提下细化。

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product / Architecture Blueprints
- `doc/v2.0/interview-system-prd.md` — 定义产品目标、通用能力内核、岗位适配器和 V2 的核心价值。
- `doc/v2.0/multi-agent-architecture.md` — 定义多 Agent、状态机、服务边界、数据模型和观测原则。

### Project Planning Source
- `.planning/PROJECT.md` — 项目级目标、约束、已锁定方向与 brownfield 原则。
- `.planning/REQUIREMENTS.md` — Phase 1 对应的 REQ-ID：`MODEL-01`、`MODEL-02`、`MODEL-03`、`ORCH-01`、`ORCH-03`、`PLAT-01`。
- `.planning/ROADMAP.md` — Phase 1 目标、边界与成功标准。
- `.planning/STATE.md` — 当前阶段、风险与后续动作。
- `.planning/research/SUMMARY.md` — 对 V2 路线的研究摘要，确认本阶段是所有后续阶段的前置底座。
- `说明文档.md` — 当前项目总账与最近线上修复历史，帮助区分“合理旧链路”与“补丁式脏链路”。

### Existing Domain / Runtime Code
- `src/lib/interview-v2/domain.ts` — 当前 V2 领域类型定义与 DTO 底稿，是统一对象边界的直接起点。
- `src/lib/interview-v2/stateMachine.ts` — 当前状态迁移表定义，是服务端唯一状态机收口的起点。
- `src/lib/interview-v2/planService.ts` — 当前计划创建、阶段草案、运行时画像装配与主链聚合入口。
- `src/lib/interview/config.ts` — 当前前端运行时画像、房间身份、历史快照与模式归一化定义。
- `prisma/schema.prisma` — 现有 `InterviewPlan`、`InterviewPlanStage`、`InterviewRound`、`InterviewSession`、`InterviewAgentRun`、`Report`、`Review*` 等实体定义。

### Current User-Facing Chain Hotspots
- `src/app/setup/page.tsx` — `setup -> interview` 主入口。
- `src/app/practice/page.tsx` — 专项训练入口，Phase 1 需要定义其共享画像与身份口径。
- `src/app/interview/page.tsx` — 当前面试运行时主页面。
- `src/app/api/sessions/[id]/route.ts` — 当前结束收口与状态变更热点。
- `src/app/api/reports/generate/route.ts` — 当前报告生成与基础记录兜底逻辑。
- `src/app/report/page.tsx` — 当前 `interview -> report` 回看落点。

## Existing Code Insights

### Reusable Assets
- `src/lib/interview-v2/domain.ts`: 已有较多 V2 类型定义，可作为统一领域对象梳理的起点，而不是从零起草。
- `src/lib/interview-v2/stateMachine.ts`: 已存在 plan/stage/round/coding 的迁移表，可升级为真正的服务端唯一状态机。
- `src/lib/interview-v2/planService.ts`: 已承担计划创建、阶段草案、画像拼装和部分运行时上下文装配，适合成为 Phase 1 盘点与收敛的重点。
- `src/lib/interview/config.ts`: 已有运行时画像、房间身份和历史快照概念，可用于识别哪些前端业务态必须被下沉或冻结。
- `InterviewAgentRun` / `Report` / `Review*` 实体: 已有观测与回看基础，不需要从零设计三层观测。

### Established Patterns
- 当前仓库已经有 V2 命名空间（`src/lib/interview-v2/*`、`src/app/api/v2/*`），说明 Phase 1 可以沿现有 V2 边界做收口，而不是另开第三套体系。
- Prisma 已承载大量计划、轮次、Agent、复盘与报告实体，说明 Phase 1 更适合做模型重组与口径统一，而不是替换整套存储路线。
- 现有实现中前端运行态和服务端持久态并存，这正是本阶段需要终结的模式。

### Integration Points
- `setup -> interview` 是第一优先迁移主链，必须成为目标画像快照与房间身份统一的第一落点。
- `interview -> report` 是第二优先主链，必须成为状态收口、证据可信与回看一致性的验证口。
- `planService`、`sessions route`、`reports/generate route` 和运行时页面是 Phase 1 盘点旧链路合理性时的核心接缝。

## Specific Ideas

- 用户明确要求：合理的旧链路保留并纳入迁移；不合理的旧链路直接改掉，不再背历史包袱。
- 用户对“不合理”的定义非常明确：凡是“完全打补丁的行为，和核心设计完全相悖”的逻辑，不能有一点容忍，直接干掉。
- 用户认可的 Phase 1 framing：不是做新功能，而是为后续所有阶段建立统一语义层、规则层和迁移层。
- Phase 1 在执行时不能漏掉 `MODEL-02` 的三类派生结果，也不能把专项训练继续排除在共享画像与状态机之外。

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 1-领域底座与迁移护栏*
*Context gathered: 2026-05-13*
