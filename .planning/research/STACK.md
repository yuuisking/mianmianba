# V2 Stack Research

**Date:** 2026-05-13
**Scope:** 面面吧 V2 brownfield 重设计
**Method:** 基于现有仓库、V2 PRD、多 Agent 架构蓝图的项目级研究归纳

## Current Baseline

- **Frontend / App shell**: Next.js App Router + React + TypeScript
- **Persistence**: Prisma + PostgreSQL
- **Deployment**: 阿里云 ECS + Nginx
- **Realtime / AI integration surface**: 现有 API Routes、语音接口、面试运行时页面、Judge Runner 脚本
- **Content storage**: `data/learning-center/` 文件仓与数据库并存

## Recommended V2 Stack

### Application Layer

- **Next.js + TypeScript**: 继续作为主应用壳层，承载 Web UI、Server Components、API Routes 与管理后台。
- **Prisma + PostgreSQL**: 继续作为核心结构化数据层，统一承载画像、计划、阶段、轮次、证据、评分、报告、复盘、训练动作与 readiness 快照。
- **Zod / schema-first validation**: 为 Agent 输入输出、状态机事件和模块接口增加严格结构校验，减少“对象结构漂移”导致的线上回归。

### Domain / Orchestration Layer

- **模块化单仓服务层**: 在 `src/lib/interview-v2/` 的基础上继续拆出 `interview_core / practice_core / review_core / growth_core / knowledge_core / readiness_core` 逻辑边界。
- **事件驱动编排**: 通过结构化 domain events 串联“问答 -> 证据 -> 评分 -> 报告 -> 复盘 -> 动作”，优先用单仓内事件/任务队列实现，再视需要外拆服务。
- **Job / async task layer**: 将耗时评估、增量报告补全、面经采集、知识构建等任务从请求线程剥离，避免前端长等待和链路串味。

### Evaluation Layer

- **Evidence-first pipeline**: 先抽证据，再做 Judge，再做校准与信任守门，不允许“直接大模型总结即最终结论”。
- **Judge contract layer**: 每个 Judge 只输出结构化 `score / confidence / citations / reasons / challenge_points`，便于回放、校准和离线评测。
- **Incremental report cache**: 报告生成要在会话中间持续计算中间态，不把正式报告完全压到结束时一次性生成。

### Observability Layer

- **Structured telemetry**: 记录 agent name、prompt version、latency、token cost、confidence、first feedback latency、report ready latency 等关键字段。
- **Replayable execution traces**: 每一轮都保留“为什么问、为什么判、为什么推进/终止”的结构化依据。

## What Not To Use First

- **立即全量微服务化**: 当前问题是边界不清，不是服务数量不够；过早拆服务会先放大复杂度。
- **页面优先式重构**: 继续先改页面再补领域模型，会重复本轮混乱。
- **无 schema 的 Agent I/O**: 这会让多 Agent 架构继续停留在 Prompt 叠加层。

## Confidence

- **High**: Next.js + Prisma + PostgreSQL 继续作为 brownfield V2 主承载层。
- **High**: 先模块化单仓、后服务化，是当前仓库最稳妥路线。
- **Medium**: 任务队列与事件总线的具体实现可在 Phase 1-2 结合现有部署能力再细化。
