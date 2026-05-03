# 数据存储基础加固 Spec

## Why
当前系统同时使用 SQLite（Prisma）与本地 JSON 文件等多种存储方式，开发阶段方便，但在“长期数据可靠性、并发、备份、迁移与线上部署”方面存在潜在风险，需要先把数据底座梳理清楚并制定可落地的改造路径。

## What Changes
- 系统性盘点现有数据资产：用户、历史会话/消息、报告、错题/薄弱项、学习中心知识库、上传文件等的“写入点/读取点/存储介质/生命周期”
- 明确线上部署目标形态：关系型数据库选型（默认 PostgreSQL + Prisma）、文件/大对象存储方式、备份与迁移策略
- 制定最小可行的改造与迁移方案：从现状到目标形态的步骤、风险控制与回滚策略
- **BREAKING**（可能）：若将学习中心从 JSON 迁移到数据库，或调整表结构/索引/约束，可能需要数据迁移与接口兼容层

## Impact
- Affected specs: 用户认证、面试会话与报告、复盘中心、学习中心 CMS、部署与运维
- Affected code:
  - Prisma：`prisma/schema.prisma`、相关 API routes（`src/app/api/**`）与 `src/lib/prisma.ts`
  - 学习中心：`data/learning-center.json`、`src/lib/db/learningDb.ts`、`src/app/api/learning/**`、`src/app/api/admin/learning/**`
  - 上传/解析：`src/app/api/parse/**`（如涉及文件存储/临时文件/对象存储）

## ADDED Requirements
### Requirement: 数据资产清单与数据流图
系统 SHALL 产出一份“数据资产清单”，覆盖所有核心业务数据的存储位置、读写路径与生命周期，并可追溯到具体代码入口。

#### Scenario: 研发接续
- **WHEN** 研发需要定位“某类数据（如错题/会话/报告/知识库）如何存、存在哪、如何迁移”
- **THEN** 能在清单中找到存储介质（SQLite/JSON/外部服务）、表/字段或 JSON 结构、以及读写相关的 API/页面/库文件

### Requirement: 线上部署可行的存储基线
系统 SHALL 定义一套线上部署可行的存储基线，至少包含：
- 关系型数据库（默认 PostgreSQL）用于用户/会话/消息/报告/薄弱项等强一致数据
- 对象存储（可选）用于大文件（简历/附件）或大文本原文，避免写入数据库导致膨胀与备份困难
- 备份、迁移与数据保留策略（RPO/RTO 以策略描述形式给出，不需要数值承诺）

#### Scenario: 线上部署
- **WHEN** 系统部署到云环境（单机/容器/Serverless）
- **THEN** 不依赖本地磁盘持久化（除缓存/临时文件），关键数据可通过外部持久化服务恢复

### Requirement: 学习中心存储策略明确化
系统 SHALL 明确学习中心（知识库/CMS）的持久化策略，保证：
- 多用户并发写入时数据一致性不被破坏
- 数据可版本化、可备份、可迁移

#### Scenario: 管理员内容录入
- **WHEN** 管理员在 `/admin/learning` 批量导入或发布草稿
- **THEN** 数据落盘方式满足线上部署要求，并能在故障后恢复

## MODIFIED Requirements
### Requirement: 历史会话与错题本的可追溯性
系统 SHALL 保证历史会话、报告与错题/薄弱项可追溯到用户与会话，并支持后续扩展（分页、搜索、删除、导出）。

## REMOVED Requirements
无

