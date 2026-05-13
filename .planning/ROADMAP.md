# Roadmap: 面面吧 V2.0 重设计

**Created:** 2026-05-13
**Project Mode:** standard
**Source:** `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/research/SUMMARY.md`

## Phase Summary

| Phase | Name | Goal | Requirements |
|------|------|------|--------------|
| 1 | 领域底座与迁移护栏 | 统一画像、状态机、基础观测和 brownfield 迁移边界 | MODEL-01, MODEL-02, MODEL-03, ORCH-01, ORCH-03, PLAT-01 |
| 2 | 证据与 Judge 评估内核 | 建立 Evidence -> Judge -> Calibration -> Trust 的统一评估链 | EVAL-01, EVAL-02, EVAL-03, PLAT-02 |
| 3 | 阶段面试运行时重建 | 让单场阶段面试先在统一内核上稳定运行、恢复与追问 | STAGE-01, STAGE-02, STAGE-03 |
| 4 | 全流程计划与评审推进 | 把真实轮次、面试官角色、评审投票和阶段推进接入产品主链 | FLOW-01, FLOW-02, FLOW-03, FLOW-04, ORCH-02 |
| 5 | 算法题与增量报告 | 把 coding room 和骨架报告纳入同一状态链和证据链 | CODE-01, CODE-02, CODE-03, EVAL-04 |
| 6 | 复盘、训练、知识闭环 | 从结构化历史中产出问题聚合、行动回流与学习补强 | LOOP-01, LOOP-02, LOOP-03 |
| 7 | 成长档案与 Ready 收口 | 形成长期趋势、readiness 和 brownfield 切流收口 | GROW-01, READY-01 |

## Roadmap Details

### Phase 1: 领域底座与迁移护栏
**Goal:** 用统一领域模型、状态机和迁移护栏把当前 brownfield 仓库从“页面驱动”切换到“领域驱动”。
**Requirements:** `MODEL-01`, `MODEL-02`, `MODEL-03`, `ORCH-01`, `ORCH-03`, `PLAT-01`
**UI hint:** no
**Success Criteria:**
1. 候选画像、岗位画像、公司画像、plan、stage、round、终止原因、恢复状态都有清晰的结构化定义。
2. 阶段面试、全流程面试、专项训练共享同一份画像与状态机事件，不再各自维护隐式口径。
3. 迁移策略明确区分“并存写入、验证读、正式切换、旧链路清理”四步，并标注每条线上关键链路的切换条件。
4. 关键观测字段可记录请求链、Agent 调用、延迟、置信度和失败原因，为后续回放与排障打底。

### Phase 2: 证据与 Judge 评估内核
**Goal:** 建立支撑所有面试、报告、投票、复盘与 readiness 的统一评估链路。
**Requirements:** `EVAL-01`, `EVAL-02`, `EVAL-03`, `PLAT-02`
**UI hint:** no
**Success Criteria:**
1. 每轮回答都能产出 evidence spans、candidate dimension links 和低置信标记。
2. 各 Judge 以独立结构化输出工作，不再把评分、追问和总结混在一个模型调用里。
3. 校准与 Trust 机制可以识别“证据不足、Judge 分歧大、信息密度低”等情况并降置信。
4. 任一轮的评分、追问理由和报告结论都可以被回放到具体证据与 Agent 结果。

### Phase 3: 阶段面试运行时重建
**Goal:** 先把单场阶段面试重建为稳定、可恢复、可解释的统一运行时。
**Requirements:** `STAGE-01`, `STAGE-02`, `STAGE-03`
**UI hint:** yes
**Success Criteria:**
1. 用户从 setup 发起阶段面试后，首题与追问明确绑定目标岗位、画像和当前阶段目标。
2. 面试过程中可以稳定返回下一问、即时反馈状态和评估中间态，而不是长时间无感等待。
3. 刷新、掉线、回房间后可以恢复消息、计时、当前轮次与报告骨架，不再出现房间身份漂移。
4. 阶段面试运行时与评估内核之间通过结构化 contract 通信，不再直接拼接 UI 状态对象。

### Phase 4: 全流程计划与评审推进
**Goal:** 把全流程从“多轮聊天入口”升级为“真实轮次编排 + 评审团推进”的流程系统。
**Requirements:** `FLOW-01`, `FLOW-02`, `FLOW-03`, `FLOW-04`, `ORCH-02`
**UI hint:** yes
**Success Criteria:**
1. 用户可以看到完整计划、阶段列表、当前轮次、后续轮次和每轮风险，而不是只有一个开始按钮。
2. 每个阶段都绑定独立主面试官角色、题型策略、通过条件和评审团规则。
3. 一轮结束后系统能稳定给出“通过 / 未通过”结果，以及加一项、优化点和下一步动作。
4. 流程推进逻辑可以继承前一轮暴露的问题，决定晋级、补强后重试或终止，不再依赖手工补状态。

### Phase 5: 算法题与增量报告
**Goal:** 把独立 coding room 和正式报告纳入统一状态链、证据链和结束收口链。
**Requirements:** `CODE-01`, `CODE-02`, `CODE-03`, `EVAL-04`
**UI hint:** yes
**Success Criteria:**
1. 算法题触发条件、独立页面、运行/提交/结束动作全部由统一状态机控制。
2. 算法题引导语和题面上下文只引用经过证据校验的真实项目、公司和岗位信息。
3. 编码过程、提交结果和阶段结论可以稳定回写到当前 round / stage / report。
4. 用户结束面试后可以立即看到骨架报告，随后异步补齐证据引用和长文本说明。

### Phase 6: 复盘、训练、知识闭环
**Goal:** 让问题识别、专项训练、学习补强和同题重答成为一条可执行闭环，而不是分散入口。
**Requirements:** `LOOP-01`, `LOOP-02`, `LOOP-03`
**UI hint:** yes
**Success Criteria:**
1. 复盘中心可以区分稳定弱项、波动问题、已修复问题，并展示相应证据包。
2. 任一复盘问题都能直接映射到专项训练、学习卡、项目举证或下一轮准备动作。
3. 学习中心输出的是与当前岗位和问题强相关的高分案例、反例与知识卡，而不是泛浏览内容。
4. 同题重答和专项训练结果可以回写历史问题状态，为成长档案提供真实改善依据。

### Phase 7: 成长档案与 Ready 收口
**Goal:** 在前六阶段稳定的基础上，产出长期成长叙事、readiness 判断和最终切流方案。
**Requirements:** `GROW-01`, `READY-01`
**UI hint:** yes
**Success Criteria:**
1. 成长档案可以稳定展示维度趋势、已修复问题、回退风险和关键转折点。
2. readiness 判断能够解释“现在能不能投、最可能卡在哪一轮、应该优先补什么”，并引用阶段风险与历史证据。
3. V2 新链路具备明确切流条件、回滚条件和旧实现清理计划，brownfield 收口路径完整。
4. `PROJECT.md`、`REQUIREMENTS.md`、`STATE.md` 与 `说明文档.md` 在阶段完成后保持同步更新。

## Delivery Notes

- 所有 v1 requirement 已映射到且仅映射到一个 phase。
- Phase 1-2 是后续所有用户可见能力的前置阶段，不允许跳过。
- 用户可见体验优化必须服从阶段边界，避免再次出现“为了修页面而破坏主状态链”的返工。

---
*Last updated: 2026-05-13 after roadmap creation*
