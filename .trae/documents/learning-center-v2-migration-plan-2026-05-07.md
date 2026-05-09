# 学习中心 V2 迁移落地计划

## Summary
- 目标：在**现有 `resumer` 项目内部**完成学习中心 V2 迁移，不独立新项目；以 **Prisma + PostgreSQL** 为学习中心主数据源，完整引入参考项目的**文档生成体系、文档版本体系、质量门禁、审核发布、学习展示与后台管理**。
- 上线策略：保持现有 `/learning` 路由和主要学习入口不变，做**原路径无感替换**；旧文件仓题库数据视为历史实现，首期迁移完成后清空旧文件历史数据，不再作为正式主数据源。
- 首批标杆验证范围：`MySQL（索引/B+Tree、事务、MVCC）`、`Redis（缓存穿透、持久化、滑动窗口）`、`Java 并发（AQS、线程池、volatile）`、`JVM（类加载、GC、内存模型）`。

## Current State Analysis

### 当前已经存在的基础
- 数据库层已经提前落了一版接近参考项目的数据模型：
  - [`prisma/schema.prisma`](file:///Users/yangyu/Desktop/resumer/prisma/schema.prisma)
  - 现有模型已包含 `topic_banks`、`chapters`、`documents`、`document_versions`、`quality_reports`、`review_tasks`、`source_materials`、`document_interview_sessions`、`user_answer_scores`、`learning_progress`、`ai_tasks` 等核心表。
- 当前项目已接入 Prisma/PostgreSQL：
  - [`src/lib/prisma.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/prisma.ts)
  - `datasource db` 使用 `postgresql`，说明本次无需更换基础数据库方案，只需要把学习中心真正切到现有 Prisma 模型。
- 当前学习中心前台已具备独立入口和服务端首屏直出能力：
  - 首页：[learning/page.tsx](file:///Users/yangyu/Desktop/resumer/src/app/learning/page.tsx)
  - 首页列表：[LearningCenterClient.tsx](file:///Users/yangyu/Desktop/resumer/src/app/learning/_components/LearningCenterClient.tsx)
  - 题目详情页：[question/page.tsx](file:///Users/yangyu/Desktop/resumer/src/app/learning/%5BkbId%5D/category/%5BcategoryId%5D/question/%5BquestionId%5D/page.tsx)
- 当前后台已具备一套“题库工坊”壳子，但其核心仍围绕文件仓题库构建：
  - 后台首页：[admin/learning/page.tsx](file:///Users/yangyu/Desktop/resumer/src/app/admin/learning/page.tsx)
  - 后台详情：[admin/learning/[kbId]/page.tsx](file:///Users/yangyu/Desktop/resumer/src/app/admin/learning/%5BkbId%5D/page.tsx)
  - 工坊接口：[studio/route.ts](file:///Users/yangyu/Desktop/resumer/src/app/api/admin/learning/studio/route.ts)
- 当前学习内容主来源仍是旧文件仓，API 和详情读取仍以“文件仓优先、Prisma 回退”为主：
  - 公共学习数据聚合：[api/learning/route.ts](file:///Users/yangyu/Desktop/resumer/src/app/api/learning/route.ts)
  - 题目详情读取：[questionDetail.ts](file:///Users/yangyu/Desktop/resumer/src/lib/learning/questionDetail.ts)
  - 当前 `getLearningQuestionDetail()` 先读 `questionBankFallback`，找不到再回退到 Prisma 的 `question` 表。

### 当前主要问题
- 当前 Prisma 数据模型和参考项目的业务方向接近，但**并没有真正成为学习中心主系统**。
- 当前后台生成链路仍以文件仓 builder 为核心：
  - [`src/lib/learning/agentBankBuilder.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/learning/agentBankBuilder.ts)
  - [`src/lib/learning/starterBankBlueprints.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/learning/starterBankBlueprints.ts)
- 当前前台展示模型仍围绕“题库 -> 分类 -> 题目”的旧题库结构展开，而不是参考项目的“题库 -> 章节 -> 文档版本 -> 学习/训练双内容”结构。
- 当前后台管理页是题库工坊，不是参考项目里的“题库管理 / 文档管理 / AI 任务 / 审核中心”四块后台。
- 当前旧文件仓仍是显式依赖：
  - [`src/lib/db/learningDb.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/db/learningDb.ts)
  - [`src/app/api/learning/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/learning/route.ts)
  - [`src/lib/learning/questionBankFallback.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/learning/questionBankFallback.ts)

## Assumptions & Decisions
- 决策 1：本次**不拆独立项目**，在当前 Next.js 项目内完成学习中心 V2 后端与前台迁移。
- 决策 2：学习中心主数据源切为 **Prisma/PostgreSQL**，旧 `data/learning-center` 文件仓只作为待清理历史实现，不再保留长期双轨。
- 决策 3：首期范围包含：
  - 文档生成体系
  - 学习展示页
  - 后台管理页
  - 审核与 AI 任务链路
- 决策 4：现有 `/learning` 路由保留，用户无感切换到新版。
- 决策 5：UI 采用“参考项目题库卡片、文档字体与正文节奏”，但文档目录保留并收口成语雀风格，而不是原参考项目目录形态。
- 决策 6：旧文件历史数据在迁移完成后清空，不做长期兼容保留。

## Proposed Changes

### 1. 用现有 Prisma 模型作为学习中心正式主干

#### 1.1 校准 Prisma Schema 到参考方案要求
- 文件：
  - [`prisma/schema.prisma`](file:///Users/yangyu/Desktop/resumer/prisma/schema.prisma)
  - [`prisma/migrations/20260507_learning_center_v2_demo_architecture/migration.sql`](file:///Users/yangyu/Desktop/resumer/prisma/migrations/20260507_learning_center_v2_demo_architecture/migration.sql)
- 变更：
  - 保留现有 `topic_banks / chapters / documents / document_versions / quality_reports / review_tasks / source_materials / learning_progress / document_interview_sessions / user_answer_scores / ai_tasks / ai_task_steps` 主结构。
  - 对齐参考方案中的最新字段语义，重点让 `learningContent`、`interviewContent`、`qualityReport`、`reviewTask` 足够承载：
    - `速读 / 深读 / 训练`
    - `文章 sections`
    - `selfTests`
    - `essentialPoints / bonusPoints / advancedPoints`
    - `sources`
  - 如果现有 `DocumentVersion.learningContent` / `interviewContent` 的 JSON 结构命名与最终前台契约不一致，则在 schema 不拆表的前提下，以应用层 DTO 统一。
- 原因：
  - 当前 schema 已经非常接近目标，最优做法是“沿用并校准”，不是新起一套重复表。

#### 1.2 明确学习中心 V2 的内容契约 DTO
- 文件：
  - 新增或集中到 `src/lib/learning/` 下，例如：
    - `src/lib/learning/content-contract.ts`
    - `src/lib/learning/document-mappers.ts`
- 变更：
  - 定义统一 DTO：
    - `LearningArticle`
    - `ArticleSection`
    - `SelfTest`
    - `InterviewContent`
    - `UserAnswerScore`
    - `EngineeringValidationResult`
  - 让 Prisma JSON、后台 API、前台页面三层统一说同一种内容语言。
- 原因：
  - 当前系统最大风险是“Prisma 表已存在，但前后台对 JSON 结构理解不一致”。

### 2. 用新版文档生成体系替换当前文件仓 Builder

#### 2.1 生成链路从“题库工坊 builder”切到“文档版本生成”
- 文件：
  - [`src/lib/learning/agentBankBuilder.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/learning/agentBankBuilder.ts)
  - [`src/lib/learning/starterBankBlueprints.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/learning/starterBankBlueprints.ts)
  - 当前后台生成接口：[generate/route.ts](file:///Users/yangyu/Desktop/resumer/src/app/api/admin/learning/generate/route.ts)
  - 当前工坊接口：[studio/route.ts](file:///Users/yangyu/Desktop/resumer/src/app/api/admin/learning/studio/route.ts)
- 变更：
  - 停止以“生成 question/topic 文件仓内容”为核心。
  - 改成以“生成 `Document` + `DocumentVersion.learningContent` + `DocumentVersion.interviewContent` + `QualityReport`”为核心。
  - 保留现有已有的质量门禁逻辑，但把门禁落点从 `TopicContent` 改成 `DocumentVersion`。
  - 将参考项目的 3-step 思路迁入当前项目：
    - Step 1：学习文章生成
    - Step 2：面试内容生成
    - Step 3：质量评估
- 原因：
  - 你要的是参考项目那套成熟文档生成体系，而不是继续把题目页内容硬拼在旧题库结构上。

#### 2.2 首批标杆文档按指定专题入库
- 首批专题：
  - `MySQL`：索引（B+Tree）、事务、MVCC
  - `Redis`：缓存穿透、持久化、滑动窗口
  - `Java 并发`：AQS、线程池、volatile
  - `JVM`：类加载、GC、内存模型
- 变更：
  - 每个专题按 `topic bank -> chapter -> document` 入库
  - 每篇文档至少具备：
    - `learningContent.article`
    - `learningContent.selfTests`
    - `interviewContent`
    - `qualityReport`
    - `sources`
- 原因：
  - 你明确要求这几个方向先验证成标杆数据库。

### 3. 用新版公共 API 替换旧学习 API

#### 3.1 替换前台学习数据读取入口
- 文件：
  - [`src/app/api/learning/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/learning/route.ts)
  - [`src/app/api/learning/banks/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/learning/banks/route.ts)
  - [`src/app/api/learning/questions/[questionId]/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/learning/questions/%5BquestionId%5D/route.ts)
  - [`src/lib/learning/questionDetail.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/learning/questionDetail.ts)
- 变更：
  - 让公共学习接口直接从 Prisma 的 `topic_banks / chapters / documents / document_versions` 读取。
  - 取消“文件仓优先、Prisma 回退”的读取顺序。
  - `questionDetail.ts` 重写为“文档详情服务”，不再绑定旧 `question` 模型语义。
- 原因：
  - 只要这层不替换，前台永远还是旧学习中心。

#### 3.2 新增或重写学习中心 V2 服务层
- 文件：
  - 新增：
    - `src/lib/learning/documentService.ts`
    - `src/lib/learning/topicBankService.ts`
    - `src/lib/learning/reviewService.ts`
    - `src/lib/learning/interviewTrainingService.ts`
- 变更：
  - 提供稳定服务函数：
    - 获取题库列表
    - 获取题库详情（章节 + 文档）
    - 获取当前发布版本文档
    - 获取速读 / 深读 / 训练模式内容
    - 创建训练会话与评分记录
  - 前台 route handlers 不再直接拼接 Prisma 查询。
- 原因：
  - 参考项目最值钱的不是表结构，而是“服务边界清楚”。

### 4. 前台学习中心 UI 按参考项目迁移，但目录收口为语雀风格

#### 4.1 学习首页换成参考项目喜欢的卡片感
- 文件：
  - [`src/app/learning/page.tsx`](file:///Users/yangyu/Desktop/resumer/src/app/learning/page.tsx)
  - [`src/app/learning/_components/LearningCenterClient.tsx`](file:///Users/yangyu/Desktop/resumer/src/app/learning/_components/LearningCenterClient.tsx)
  - [`src/app/globals.css`](file:///Users/yangyu/Desktop/resumer/src/app/globals.css)
- 变更：
  - 卡片布局、字体、标签节奏对齐参考项目喜欢的题库样式。
  - 数据来源切换到 Prisma topic bank 列表。
  - 移除旧文件仓题库统计依赖。

#### 4.2 文档页改造成“速读 / 深读 / 训练”三模式展示
- 文件：
  - [`src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/QuestionDetailClient.tsx`](file:///Users/yangyu/Desktop/resumer/src/app/learning/%5BkbId%5D/category/%5BcategoryId%5D/question/%5BquestionId%5D/QuestionDetailClient.tsx)
  - [`src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/page.tsx`](file:///Users/yangyu/Desktop/resumer/src/app/learning/%5BkbId%5D/category/%5BcategoryId%5D/question/%5BquestionId%5D/page.tsx)
  - [`src/app/globals.css`](file:///Users/yangyu/Desktop/resumer/src/app/globals.css)
- 变更：
  - 保留现有首屏直出能力，但页面契约从“题目详情”切为“文档详情”。
  - 页面上明确支持：
    - 5 分钟速读
    - 15 分钟深读
    - 直接训练
  - 文档目录保留为语雀式目录样式，不采用参考项目原目录设计。
  - 正文排版对齐参考项目字体和格式，但继续沿用你已经认可的纯白文档底色。

#### 4.3 训练模式并入当前学习页
- 文件：
  - 现有练习与评分入口：
    - [`src/app/api/learning/practice/evaluate/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/learning/practice/evaluate/route.ts)
    - [`src/app/learning/[kbId]/category/[categoryId]/practice/page.tsx`](file:///Users/yangyu/Desktop/resumer/src/app/learning/%5BkbId%5D/category/%5BcategoryId%5D/practice/page.tsx)
- 变更：
  - 将训练入口改为围绕 `DocumentInterviewSession` 与 `UserAnswerScore` 工作。
  - 支持标准题、追问、评分、改进答案、掌握报告。
- 原因：
  - 参考项目的价值之一就是训练闭环，不能只迁文章展示层。

### 5. 后台管理从“题库工坊”迁移为“题库 / 文档 / AI 任务 / 审核”

#### 5.1 替换现有后台首页与详情页
- 文件：
  - [`src/app/admin/learning/page.tsx`](file:///Users/yangyu/Desktop/resumer/src/app/admin/learning/page.tsx)
  - [`src/app/admin/learning/[kbId]/page.tsx`](file:///Users/yangyu/Desktop/resumer/src/app/admin/learning/%5BkbId%5D/page.tsx)
- 变更：
  - 不再以“工坊运行记录 + 文件仓题库”作为中心。
  - 改成更接近参考项目的后台结构：
    - 题库管理
    - 文档管理
    - AI 任务管理
    - 审核中心
- 说明：
  - 首期优先保留现有 `/admin/learning` 路由空间，在其中改造，不必强行新建 `/admin/topic-banks` 等平行顶级路由。

#### 5.2 管理端 API 迁移到 Prisma 文档系统
- 文件：
  - [`src/app/api/admin/learning/studio/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/admin/learning/studio/route.ts)
  - [`src/app/api/admin/learning/kbs/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/admin/learning/kbs/route.ts)
  - [`src/app/api/admin/learning/generate/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/admin/learning/generate/route.ts)
  - 新增：
    - `src/app/api/admin/learning/documents/route.ts`
    - `src/app/api/admin/learning/documents/[id]/versions/route.ts`
    - `src/app/api/admin/learning/review-tasks/route.ts`
    - `src/app/api/admin/learning/ai-tasks/route.ts`
- 变更：
  - 以 `documents`、`document_versions`、`quality_reports`、`review_tasks`、`ai_tasks` 为中心重写后台数据接口。
  - 删除或停用旧的文件仓清空、starter bank、工坊运行依赖。

### 6. 清理旧文件仓实现，做无感切换

#### 6.1 停止文件仓作为正式主数据源
- 文件：
  - [`src/lib/db/learningDb.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/db/learningDb.ts)
  - [`src/lib/learning/questionBankFallback.ts`](file:///Users/yangyu/Desktop/resumer/src/lib/learning/questionBankFallback.ts)
  - [`src/app/api/learning/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/learning/route.ts)
  - [`src/app/api/admin/learning/studio/route.ts`](file:///Users/yangyu/Desktop/resumer/src/app/api/admin/learning/studio/route.ts)
- 变更：
  - 移除公共学习链路对文件仓的正式依赖。
  - 旧文件历史数据按你的要求清空。
  - 若需要过渡，只允许在迁移期间短暂保留内部脚本，不允许继续作为线上正式源。

#### 6.2 统一路由映射到新文档模型
- 路由保持：
  - `/learning`
  - `/learning/[kbId]/...`
- 变更：
  - 路由参数可继续沿用现有外观，但内部读取逻辑统一映射到 `topic_banks / chapters / documents`。
  - 必要时在 service 层建立从旧 `kbId/categoryId/questionId` 到新 `topicBank/chapter/document` 的兼容映射。

## Implementation Steps

### 阶段 1：数据与契约定型
1. 校准 `prisma/schema.prisma` 与参考项目的内容契约。
2. 定义学习内容、训练内容、质量报告、工程验证的统一 DTO。
3. 明确首批 4 组标杆专题的 `topic bank / chapter / document` 切分。

### 阶段 2：生成体系迁移
1. 将现有 builder 改造为文档版本生成器。
2. 接入学习文章生成、面试内容生成、质量评估三步流水。
3. 落 `DocumentVersion + QualityReport + SourceMaterial + ReviewTask`。

### 阶段 3：前台展示迁移
1. 首页切到 Prisma 题库列表。
2. 文档详情页切到 `速读 / 深读 / 训练` 三模式。
3. 目录和正文样式按“参考项目内容节奏 + 语雀目录”收口。

### 阶段 4：后台迁移
1. 将后台首页从题库工坊重构为题库/文档/任务/审核入口。
2. 提供文档管理、版本历史、AI 任务详情、审核处理能力。
3. 去除对旧文件仓工坊的依赖。

### 阶段 5：数据切换与清理
1. 将首批标杆专题导入 Prisma 正式表。
2. 切换线上 `/learning` 到 Prisma 主链路。
3. 清空旧文件历史数据，关闭旧 fallback。

## Verification Steps
- 数据层验证
  - Prisma migration 能在当前 PostgreSQL 环境成功应用。
  - 首批 4 组标杆专题都能在 `topic_banks / chapters / documents / document_versions` 中完整查询。
- 生成链路验证
  - 任一篇标杆文档生成后，必须具备：
    - `learningContent.article`
    - `learningContent.selfTests`
    - `interviewContent`
    - `qualityReport`
    - `sources`
  - 质量门禁失败时不能发布，必须记录失败原因。
- 前台验证
  - `/learning` 能正常展示 Prisma 题库卡片。
  - 至少抽查：
    - `MySQL -> B+Tree`
    - `Redis -> 缓存穿透`
    - `Java 并发 -> AQS`
    - `JVM -> GC`
  - 每篇文档都可切换 `速读 / 深读 / 训练`。
- 后台验证
  - 管理端可查看题库、文档、版本、AI 任务、审核任务。
  - 文档审核通过/拒绝后状态正确更新。
- 切换验证
  - 现有 `/learning` 路由无需改链接即可访问新版学习中心。
  - 旧文件仓历史数据清空后，线上学习中心仍完整可用。

## Risks & Controls
- 风险：当前仓库仍有大量旧学习 API、旧题库文件仓和旧 question 模型并存。
  - 控制：先统一 service 层，再逐层替换 route handlers，最后清理 fallback。
- 风险：前台仍是“题目详情页”语义，直接替换文档模型容易出现契约不兼容。
  - 控制：先建立 `documentService` 和新 DTO，页面层只消费新 DTO。
- 风险：后台“题库工坊”与新文档后台混在一起会让执行面失焦。
  - 控制：本次计划明确以“参考项目后台结构”替换工坊中心，不再继续扩旧工坊。
- 风险：旧文件历史数据清空后无法回退。
  - 控制：清空动作放到最终切换阶段，先完成首批标杆专题和前后台验证。
