# V2 Architecture Research

**Date:** 2026-05-13
**Scope:** 面面吧 V2 模块边界与构建顺序

## Target Component Boundaries

### 1. Modeling Core

负责候选画像、岗位画像、公司画像、能力权重、流程假设与岗位适配器。

### 2. Orchestration Core

负责 `plan / stage / round` 状态机、会话生命周期、阶段推进、终止原因、中断恢复和编排事件。

### 3. Interview Runtime

负责阶段面试与全流程面试的实时问答体验、面试官角色切换、首题与追问执行、算法题触发。

### 4. Evaluation Core

负责证据抽取、Judge 打分、校准、信任守门、增量报告中间态与最终结论。

### 5. Action Loop

负责复盘中心、专项训练、学习中心、同题重答、项目举证等行动回流。

### 6. Growth / Readiness

负责长期趋势、问题修复状态、轮次风险和 readiness 决策输出。

### 7. Experience Intelligence

负责面经采集、清洗、结构化、模式构建与质量审核，作为流程生成和知识构建的上游。

## Data Flow

```text
候选输入 / JD / 简历
  -> Modeling Core
  -> Orchestration Core 初始化 plan/stage/round
  -> Interview Runtime 执行问答或算法题
  -> Evaluation Core 抽证据 / Judge / 校准 / Trust
  -> 增量报告缓存 + 结构化结果入库
  -> Action Loop 生成复盘问题 / 训练动作 / 学习推荐
  -> Growth / Readiness 汇总长期趋势与风险
```

## Suggested Build Order

1. **领域建模与状态机先行**
   - 先定义统一实体、状态、事件和模块边界。
2. **证据评估内核第二**
   - 没有统一证据链，就无法稳定支持报告、投票、复盘、成长。
3. **阶段面试运行时第三**
   - 先让单场面试运行稳定，作为全流程和专项训练的基础执行内核。
4. **全流程计划与阶段推进第四**
   - 在稳定运行时和评估内核上叠加多轮真实流程。
5. **算法题与增量报告第五**
   - 让 coding room 成为统一流程中的一个受控阶段，而不是独立补丁。
6. **复盘、训练、知识回流第六**
   - 在结构化历史数据稳定后，做问题聚合和行动推荐才有可信度。
7. **成长档案与 readiness 第七**
   - 放在最末阶段收口，避免没有长期数据支撑就先做判断页。

## Architectural Rules

- 模块之间只能交换结构化结果，不共享隐式内部推理状态。
- 任何用户可见结论都要能回溯到 evidence、Judge 或状态机决策。
- 迁移时优先做到“新旧并存、同口径写入、可验证切换”，不做一次性总切。
