# Phase 1: 领域底座与迁移护栏 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 1-领域底座与迁移护栏
**Areas discussed:** 画像真源, 状态机权威, 迁移切换顺序, 回放与观测, Phase 1 定位

---

## 画像真源

| Option | Description | Selected |
|--------|-------------|----------|
| 独立画像实体 | 抽成独立领域对象，plan 只持引用或快照 | ✓ |
| Plan 持有快照 | 每次流程由 plan 持有完整画像 | |
| 运行时画像优先 | 延续前端运行时画像主导 | |

**User's choice:** 独立画像实体；并补充“候选画像的定义我们先明确一下吧”。
**Notes:** 后续进一步锁定为：长期基础档案最轻；目标画像随简历版本变化；一份简历可派生多个目标画像；发起面试时复制目标画像快照。

---

## 状态机权威

| Option | Description | Selected |
|--------|-------------|----------|
| 服务端唯一权威 | 服务端负责所有合法迁移 | ✓ |
| 前后端双层判断 | 前端先判、服务端再落库 | |
| 前端主导 | 运行时业务状态由前端主导 | |

**User's choice:** 服务端唯一权威。
**Notes:** 前端只保留界面态；前端发业务事件，不直接改状态；非法迁移必须明确拒绝并返回原因。用户额外强调要先共识“什么是状态转移”，最终决定 Phase 1 把四层对象都纳入统一状态转移语言。

---

## 迁移切换顺序

| Option | Description | Selected |
|--------|-------------|----------|
| setup->interview 优先 | 先锁入口链 | ✓ |
| interview->report 优先 | 先锁收口链 | |
| fullflow list->round 优先 | 先锁流程推进链 | |

**User's choice:** 第一优先 `setup -> interview`，第二优先 `interview -> report`。
**Notes:** 用户拒绝“为了兼容而兼容”。明确要求先盘点再分级；合理旧链路保留并纳入迁移；不合理旧链路直接改掉。不合理的判定标准是：完全打补丁、与核心设计相悖、破坏真源或状态机权威的逻辑，不能容忍，直接干掉。盘点后优先清理补丁链。

---

## 回放与观测

| Option | Description | Selected |
|--------|-------------|----------|
| 状态与事件链优先 | 先看事件和迁移 | |
| 用户结果链优先 | 先看用户主链 | |
| Agent 运行链优先 | 先看 Agent | |

**User's choice:** “都优先”。
**Notes:** 进一步锁定为：三层观测都必须有；Phase 1 的最低标准不是三选一，而是三层同时落；Agent 运行链先做摘要级；线上问题默认从用户主链回放开始排查。

---

## Phase 1 定位

| Option | Description | Selected |
|--------|-------------|----------|
| 就是这个 | Phase 1 是统一语义层、规则层、迁移层 | ✓ |
| 再偏产品化 | 更强调用户价值 | |
| 再偏技术化 | 更强调基础设施定义 | |

**User's choice:** 就是这个。
**Notes:** 用户认可的 framing 是：Phase 1 不是做零散新功能，也不是纯技术清理，而是为后续所有阶段建立统一语义层、规则层和迁移层。

---

## Claude's Discretion

- 具体字段命名、事件命名、版本编号与观测字段表可由后续 research / planning 在不违背已锁定决策的前提下细化。

## Deferred Ideas

- None.
