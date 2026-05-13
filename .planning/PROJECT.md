# 面面吧 V2.0 重设计

## What This Is

面面吧 V2.0 不是继续在现有页面上缝补功能，而是把现有仓库重构为一个围绕目标岗位、目标公司和真实轮次运行的面试能力操作系统。它要统一阶段面试、全流程面试、专项训练、复盘中心、学习中心、成长档案与 Offer Readiness，让每一次问答都能沉淀为可追溯证据、可执行动作和可验证进步。

## Core Value

围绕目标岗位与目标公司，让用户在真实轮次模拟中获得可信证据、明确改进动作和是否 ready 的判断。

## Requirements

### Validated

- ✓ 现有仓库已经具备 Next.js + Prisma + PostgreSQL 的线上运行底座，可继续作为 brownfield 重构承载层。
- ✓ 现有产品已经存在阶段面试、全流程面试、专项训练、复盘中心、学习中心等入口，说明 V2 不需要从零定义产品外壳。
- ✓ 现有系统已积累 `planId / stageId / roundId`、报告、复盘与学习数据链路，具备向统一状态机与多 Agent 编排升级的基础。

### Active

- [ ] 建立统一的通用能力内核与岗位适配器配置模型。
- [ ] 建立统一的 `plan / stage / round` 状态机，收敛阶段面试、全流程面试和专项训练。
- [ ] 建立证据抽取、多 Judge、校准与信任守门的评估内核。
- [ ] 重建阶段面试与全流程运行时，使其共享同一套候选画像、面试官编排和报告骨架。
- [ ] 将算法题、复盘中心、学习中心、成长档案、Offer Readiness 接入同一条证据回流链。
- [ ] 制定 brownfield 迁移顺序，保证线上核心链路稳定迁移而非推倒重来。

### Out of Scope

- 一次性扩展到大量非目标岗位品类（如运营、销售、泛职场）—— 当前先打穿技术岗通用内核与岗位适配器。
- 为了视觉焕新而先做大规模页面重写 —— 没有领域模型、状态机和评估内核的 UI 重写会继续制造混乱。
- 没有证据支撑的“高分报告”或“伪 readiness 判断” —— 这会直接破坏产品信任。
- 立即拆分为大量独立微服务 —— 当前阶段应先做模块边界清晰的单仓分层，等领域稳定后再拆服务。

## Context

- 当前仓库是一个明显的 brownfield 项目，已有大量 V2 方向实现碎片，但缺少统一项目上下文、需求边界和实施路线，导致近期工作持续在 P0 修复、路由切换、状态收口和体验补丁间来回拉扯。
- 用户已明确要求本轮以 `/Users/yangyu/Desktop/resumer/doc/v2.0/interview-system-prd.md` 与 `/Users/yangyu/Desktop/resumer/doc/v2.0/multi-agent-architecture.md` 作为唯一蓝图，重新设计一次完整 V2，而不是继续局部补丁式推进。
- QA 与线上问题已经证明：没有统一状态机、证据链、模块边界和迁移顺序时，阶段面试、全流程、算法题、报告页、复盘链路会相互污染。
- 现网运行在阿里云 ECS，仓库已接入 Prisma 与 PostgreSQL；因此 V2 需要采用“并存迁移、逐步切流、每阶段可验证”的实施方式。

## Constraints

- **Scope**: 本轮只做“全产品 V2 重设计规划” —— 不额外扩展蓝图之外的新业务模块。
- **Brownfield**: 必须在现有仓库和现网基础上重构 —— 不能假设完全重写、完全停服或清空历史数据。
- **Quality**: 绝不允许继续输出无证据结论 —— 报告、投票、readiness、复盘都必须可追溯。
- **Deployment**: 线上部署仍在 ECS `47.95.233.109` —— 任何实施阶段都要能服务现网验证与回滚。
- **Workflow**: 规划产物统一落在仓库根目录 `.planning/` —— 后续实现必须围绕这些文件推进。
- **Documentation**: `说明文档.md` 仍是当前项目进度总账 —— 每次阶段推进都要同步更新。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 在仓库根目录建立 `.planning/` 作为 V2 唯一规划主线 | 需要给当前混乱的 brownfield 仓库一个统一决策源 | — Pending |
| 本轮范围按“全产品 V2”而不是单模块修补 | 用户已明确要求一次把产品、架构、迁移边界重新梳理清楚 | — Pending |
| 先做领域模型、状态机、评估内核，再推进 UI 和高级体验 | 近期 P0 几乎都来自底层状态和边界混乱，而非单点页面样式 | ✓ Good |
| V2 采用“单仓分层 + 模块边界清晰 + 后续可服务化”的路线 | 当前仓库已存在大量逻辑，先稳定边界比立即拆微服务更现实 | ✓ Good |
| 报告、复盘、成长、readiness 全部建立在证据链之上 | 产品护城河来自可信评估与行动回流，而不是 Prompt 包装 | ✓ Good |
| brownfield 迁移采用“并存、验证、切换、清理”四步法 | 可以降低线上回归风险，避免再次陷入全局返工 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason.
2. Requirements validated? -> Move to Validated with phase reference.
3. New requirements emerged? -> Add to Active.
4. Decisions to log? -> Add to Key Decisions.
5. "What This Is" still accurate? -> Update if drifted.

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections.
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state.

---
*Last updated: 2026-05-13 after V2 re-initialization*
