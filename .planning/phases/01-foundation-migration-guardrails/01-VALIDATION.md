---
phase: 1
slug: foundation-migration-guardrails
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Next.js + TypeScript + Prisma + targeted route/source verification |
| **Config file** | `package.json`, `tsconfig.json`, Prisma schema |
| **Quick run command** | `npx eslint src/lib/interview-v2 src/app/api src/app/setup src/app/interview src/app/report --ext .ts,.tsx` |
| **Full suite command** | `npx next build --webpack && npm run test:interview-runtime` |
| **Estimated runtime** | ~180-300 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx eslint src/lib/interview-v2 src/app/api src/app/setup src/app/interview src/app/report --ext .ts,.tsx`
- **After every plan wave:** Run `npx next build --webpack && npm run test:interview-runtime`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | MODEL-01 | T-1-01 | 画像真源结构只在服务端权威对象中定义，不再由前端缓存承担业务真态 | source | `grep -n "Profile" prisma/schema.prisma` | ✅ | ⬜ pending |
| 1-01-02A | 01 | 1 | MODEL-02 | T-1-02 | 目标画像可冻结并回放岗位能力权重、目标轮次、公司流程假设 | source | `grep -n "岗位能力权重\\|目标轮次\\|公司流程假设" .planning/phases/01-foundation-migration-guardrails/01-RESEARCH.md` | ✅ | ⬜ pending |
| 1-03-01 | 03 | 2 | ORCH-01 | T-1-03 | 所有合法迁移通过统一状态机/transition service 入口执行 | source | `grep -R "transition" src/lib/interview-v2` | ✅ | ⬜ pending |
| 1-03-02A | 03 | 2 | ORCH-01 | T-1-04 | 迁移任务对象可表达并存、验证、切换、清理及回滚边界 | source | `grep -R "迁移任务\\|并存\\|验证\\|切换\\|清理" .planning/phases/01-foundation-migration-guardrails prisma src/lib/interview-v2` | ✅ | ⬜ pending |
| 1-04-01 | 04 | 3 | MODEL-03 | T-1-05 | 阶段面试、全流程、专项训练共享同一画像快照与房间身份口径 | behavior | `npm run test:interview-runtime` | ✅ | ⬜ pending |
| 1-05-01A | 05 | 3 | ORCH-03 | T-1-06 | 正常结束、淘汰、中断、超时四类终态有统一矩阵、恢复边界与报告口径 | source+behavior | `grep -R "正常结束\\|淘汰\\|中断\\|超时" src/app/api/sessions src/lib/interview-v2 .planning/phases/01-foundation-migration-guardrails` | ✅ | ⬜ pending |
| 1-05-02 | 05 | 3 | PLAT-01 | T-1-07 | 用户主链、状态事件链、Agent 摘要链三层最小观测骨架可写入，且可承载成本与置信度 | source | `grep -R "InterviewAgentRun\\|orchestration\\|成本\\|置信度" src prisma .planning/phases/01-foundation-migration-guardrails` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] 明确补充 Phase 1 计划中的 source assertions 与 behavior assertions 对应命令
- [ ] 为状态机与迁移执行器准备最小 targeted tests 或 route assertions
- [ ] 明确 schema 变更后的 `prisma db push` / migration 执行策略
- [ ] 为专项训练共享画像口径准备最小验证步骤
- [ ] 为终态矩阵与迁移任务对象补充 targeted assertions

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `setup -> interview` 房间身份与画像快照一致 | MODEL-03 | 需要结合真实页面入口与恢复行为观察 | 从 setup 发起阶段面试和全流程面试各一次，确认恢复时使用同一 `roomKey + plan/stage/round` 身份 |
| 专项训练共享画像与身份口径明确 | MODEL-03 | 当前专项训练仍处于迁移中的过渡状态 | 发起一次专项训练，确认其进入共享画像链或命中过渡策略说明，不再是隐式旧入口 |
| `interview -> report` 收口与报告一致 | ORCH-03 | 当前报告链仍有浏览器缓存 fallback | 分别验证正常结束、淘汰/中断、超时等场景，核对报告展示、DB 状态、回放摘要与后续阶段处理是否一致 |
| 三层观测最小骨架可排障 | PLAT-01 | 需要人工沿用户主链 -> 状态链 -> Agent 链逐层查看 | 使用一条真实会话验证是否能先看用户主链，再下钻状态和 Agent 摘要，并确认可查看成本/置信度字段或聚合值 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
