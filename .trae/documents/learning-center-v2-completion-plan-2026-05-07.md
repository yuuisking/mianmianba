# 学习中心 V2 收口迁移计划

## Summary
- 目标：在当前 `resumer` 项目内，基于现有 Prisma 学习中心模型，把参考项目的文档生成体系、文档展示体系、后台题库/文档/AI 任务/审核体系完整搬到现有学习中心，并保持 `/learning` 原路径无感替换。
- 首期验收范围：仅围绕你指定的 4 组标杆专题完成端到端闭环：
  - `MySQL`：索引（B+Tree）、事务、MVCC
  - `Redis`：缓存穿透、持久化、滑动窗口
  - `Java 并发`：AQS、线程池、volatile
  - `JVM`：类加载、GC、内存模型
- UI 方向：题库首页卡片、文档字体和正文格式对齐参考项目；文档目录不照搬参考项目，改成你指定的语雀式目录。
- 实施原则：不新拆项目，不碰“面面吧智能助手”主链路，Prisma/PostgreSQL 作为学习中心正式主数据源，旧文件仓退出正式链路并最终清空。

## Current State Analysis

### 已经完成到位的部分
- `prisma/schema.prisma` 已经同时具备学习中心 V2 所需核心模型：`TopicBank`、`Chapter`、`Document`、`DocumentVersion`、`QualityReport`、`ReviewTask`、`AiTask`、`DocumentInterviewSession`、`UserAnswerScore`、`SourceMaterial`、`LearningProgress`。
- 学习中心公共链路已经明显开始切到 Prisma：
  - `src/lib/learning/content-contract.ts`
  - `src/lib/learning/topicBankService.ts`
  - `src/lib/learning/documentService.ts`
  - `src/lib/learning/questionDetail.ts`
  - `src/app/learning/page.tsx`
  - `src/app/learning/[kbId]/page.tsx`
  - `src/app/api/learning/route.ts`
  - `src/app/api/learning/banks/route.ts`
  - `src/app/api/learning/banks/[kbId]/route.ts`
  - `src/app/api/learning/questions/[questionId]/route.ts`
- 首批标杆内容的种子脚手架已经存在：
  - `src/lib/learning/v2SeedData.ts`
  - `src/lib/learning/v2Seeder.ts`
- 后台管理 API 也已经有一部分开始改到 Prisma 方向：
  - `src/app/api/admin/learning/studio/route.ts`
  - `src/app/api/admin/learning/studio/[kbId]/route.ts`
  - `src/app/api/admin/learning/generate/route.ts`
  - `src/app/api/admin/learning/kbs/route.ts`

### 当前真实断点
- 后台页面仍然是旧“题库工坊 + 运行记录”视角，和当前 Prisma 化 API/数据模型不一致：
  - `src/app/admin/learning/page.tsx`
  - `src/app/admin/learning/[kbId]/page.tsx`
  - 页面仍大量依赖 `run.currentStageKey`、`run.stages`、`run.warnings`、`latestResult.run` 这套旧工坊结构。
- 后台 API 仍然存在新旧模型混用，尚未完全切干净：
  - `src/app/api/admin/learning/kbs/[kbId]/route.ts` 仍操作 `prisma.knowledgeBase`
  - `src/app/api/admin/learning/generate-kb/route.ts` 仍创建 `prisma.knowledgeBase`
- 训练链路和当前 schema 仍有契约不一致：
  - `src/lib/learning/interviewTrainingService.ts` 仍写入 `qaHistory`
  - 但 `prisma/schema.prisma` 的 `DocumentInterviewSession` 模型并没有 `qaHistory` 字段，只有 `question`、`totalScore` 等正式字段
- 前台详情页已经切到文档服务，但局部展示契约仍遗留旧字段假设：
  - `src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/QuestionDetailClient.tsx`
  - 当前仍读取 `test.level`，而 `content-contract.ts` 里的 `SelfTest` 契约并不保证这个字段存在
- 旧文件仓和旧学习工坊仍未真正退出主系统：
  - `src/lib/db/learningDb.ts`
  - `src/lib/db/learningStudio.ts`
  - `src/lib/learning/questionBankFallback.ts`
  - `src/lib/learning/agentBankBuilder.ts`
  - `src/lib/learning/starterBankBlueprints.ts`

### 结论
- 当前仓库不是“还没开始迁”，而是“公共学习链路已经半迁成功，但后台、训练、旧链路清理还没收口”。
- 本次执行重点不应该再做大范围重构讨论，而是把已存在的 Prisma 文档系统补齐成一套可验收闭环。

## Assumptions & Decisions
- 决策 1：继续在当前 Next.js 单仓内实施，不拆独立学习中心项目。
- 决策 2：学习中心正式主数据源固定为 `Prisma + PostgreSQL`，不再保留“文件仓优先”的正式双轨。
- 决策 3：首期必须同时交付 `生成 + 展示 + 后台`，不能只迁展示层。
- 决策 4：公开路由保持不变，沿用现有 `/learning` 和 `/learning/[kbId]/category/[categoryId]/question/[questionId]` 形态，对外无感替换。
- 决策 5：题库首页卡片、正文排版、字体节奏向参考项目靠拢；目录样式改成语雀式左侧文档目录，不采用参考项目原目录结构。
- 决策 6：首期只围绕 4 组标杆专题完成高质量闭环，不额外扩面。
- 决策 7：旧文件仓历史数据在 Prisma 主链路验收通过后统一清理，不做长期兼容保留。

## Proposed Changes

### 1. 先把内容契约彻底收口

#### 1.1 统一学习文档、训练、质检 DTO
- 文件：
  - `src/lib/learning/content-contract.ts`
  - `src/lib/learning/documentService.ts`
  - `src/lib/learning/topicBankService.ts`
  - `src/lib/learning/interviewTrainingService.ts`
- 变更：
  - 固化 `LearningContent`、`LearningArticle`、`ArticleSection`、`SelfTest`、`InterviewContent`、`QualityReportPayload` 的最终契约。
  - 去掉页面和服务层对旧字段的隐式假设，补齐当前缺口：
    - `SelfTest` 的展示字段统一
    - 训练评分结果字段统一
    - 质量报告字段统一
- 原因：
  - 现在最危险的问题不是“没表”，而是“前台、服务层、seed 数据对同一份 JSON 的理解不一致”。

#### 1.2 修掉已暴露的字段错位
- 文件：
  - `src/lib/learning/interviewTrainingService.ts`
  - `src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/QuestionDetailClient.tsx`
- 变更：
  - 训练服务改为完全使用 `DocumentInterviewSession` 和 `UserAnswerScore` 的真实 schema 字段，不再写 `qaHistory` 这类不存在字段。
  - 题目详情页自测展示改为消费正式 `SelfTest` 契约，不再依赖 `test.level` 这样的旧展示字段。
- 原因：
  - 这两处都是当前会直接阻断训练和展示稳定性的真实契约错误。

### 2. 将标杆数据导入流程变成正式“文档版本生成入口”

#### 2.1 保留现有 seed 骨架，但把它定义为首批标准导入器
- 文件：
  - `src/lib/learning/v2SeedData.ts`
  - `src/lib/learning/v2Seeder.ts`
  - `src/app/api/admin/learning/generate/route.ts`
  - `src/app/api/admin/learning/studio/route.ts`
- 变更：
  - 以 `TopicBank -> Chapter -> Document -> DocumentVersion -> QualityReport -> ReviewTask -> SourceMaterial` 为正式写入链路。
  - 把 `seedLearningCenterV2()` 明确为学习中心首批标杆数据库初始化入口，而不是临时 demo。
  - 导入结果返回明确的结构化统计：题库数、章节数、文档数、版本数、质检通过数、失败原因。
- 原因：
  - 你当前最需要的是“我能点一下生成/导入，然后马上在学习中心验收 4 组标杆专题”，不是继续保留旧工坊生成语义。

#### 2.2 把参考项目的 3-step 生成语义映射到当前实现
- 文件：
  - `src/lib/learning/v2Seeder.ts`
  - `src/lib/learning/content-contract.ts`
  - `src/app/api/admin/learning/generate/route.ts`
- 变更：
  - 在当前项目里明确区分三步产物：
    - 第 1 步：学习文章内容
    - 第 2 步：面试内容与标准回答稿
    - 第 3 步：质量评估与发布决策
  - 首期允许使用确定性的标杆种子数据完成闭环，但落库结构必须按最终 3-step 语义组织，后续才能接 AI 化生成。
- 原因：
  - 这能保证现在先把成熟文档生成体系“形态”搬过来，而不是只是把几篇样稿硬塞进数据库。

### 3. 把公开学习中心彻底收成 Prisma 文档系统

#### 3.1 首页和题库入口维持现有 SSR，但完全以 Prisma 为准
- 文件：
  - `src/app/learning/page.tsx`
  - `src/app/learning/[kbId]/page.tsx`
  - `src/app/learning/_components/LearningCenterClient.tsx`
  - `src/lib/learning/topicBankService.ts`
  - `src/app/globals.css`
- 变更：
  - 首页卡片直接读取 Prisma 题库，卡片样式、标题、副标题、标签节奏按参考项目收口。
  - 默认首文档路径继续由 `topicBankService` 统一生成，保证点卡片即进首篇文档。
- 原因：
  - 首页是你最先测试的入口，必须把“参考项目卡片感”一次性收口好。

#### 3.2 文档阅读页统一成“文档详情”而不是“题目详情”
- 文件：
  - `src/lib/learning/documentService.ts`
  - `src/lib/learning/questionDetail.ts`
  - `src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/page.tsx`
  - `src/app/learning/[kbId]/category/[categoryId]/question/[questionId]/QuestionDetailClient.tsx`
  - `src/app/globals.css`
- 变更：
  - 保留现有 URL 形态，但页面语义完全围绕 `Document + Published Version` 工作。
  - 页面展示统一为：
    - 左侧语雀式目录
    - 中间文档正文
    - 顶部模式切换与训练入口
  - 文档正文使用参考项目喜欢的字体、间距、信息块样式，但目录、布局和白底继续按你指定的语雀式方向收口。
- 原因：
  - 你这次明确要求先把“文档生成、展示全部搬到学习中心”，这里就是前台主战场。

#### 3.3 训练模式接到正式文档会话
- 文件：
  - `src/lib/learning/interviewTrainingService.ts`
  - `src/app/api/learning/practice/evaluate/route.ts`
  - `src/app/learning/[kbId]/category/[categoryId]/practice/page.tsx`
  - 如需新增，则放在 `src/app/api/learning/interview/` 下
- 变更：
  - 训练入口不再依赖旧 question 结构，而是从 `DocumentInterviewSession`、`UserAnswerScore` 出发。
  - 输出至少包括：评分、命中点、缺失点、事实错误、改进答案、追问建议。
- 原因：
  - 参考项目不是只有“好看的文档”，它的价值还在学习文档和面试训练能闭环。

### 4. 把后台从“工坊运行页”替换成“题库/文档/AI 任务/审核”后台

#### 4.1 重写后台首页数据模型
- 文件：
  - `src/app/admin/learning/page.tsx`
  - `src/app/api/admin/learning/studio/route.ts`
  - `src/lib/learning/bankStudio.ts`
- 变更：
  - 后台首页不再展示旧 `run` 进度卡、阶段流水、工坊运行记录。
  - 改成聚合面板：
    - 题库数
    - 文档数
    - 已发布版本数
    - 待审核任务数
    - AI 任务数
    - 最近导入/生成结果
  - `bankStudio.ts` 只保留面向新后台的轻量聚合职责，不再把 `learningStudio` 作为后台主模型。
- 原因：
  - 当前后台首页和现有 API 结构已经脱节，再修补旧 run 模型没有价值。

#### 4.2 重写后台题库详情页
- 文件：
  - `src/app/admin/learning/[kbId]/page.tsx`
  - `src/app/api/admin/learning/studio/[kbId]/route.ts`
  - `src/app/api/admin/learning/kbs/[kbId]/route.ts`
- 变更：
  - 后台详情页改成围绕题库、章节、文档、当前发布版本、质量报告、审核状态来展示。
  - `kbs/[kbId]` 从 `prisma.knowledgeBase` 全量迁到 `prisma.topicBank`。
- 原因：
  - 当前详情页仍然完全站在旧工坊运行记录视角，已经无法支撑你要验收的新后台。

#### 4.3 增补文档、审核、AI 任务管理接口
- 文件：
  - 新增到 `src/app/api/admin/learning/`：
    - `documents/route.ts`
    - `documents/[id]/versions/route.ts`
    - `review-tasks/route.ts`
    - `ai-tasks/route.ts`
  - 服务层：
    - `src/lib/learning/reviewService.ts`
    - 如有必要新增 `src/lib/learning/aiTaskService.ts`
- 变更：
  - 后台至少具备查看文档列表、查看版本、处理审核、查看 AI 任务的基础能力。
  - 审核接口完全围绕 `ReviewTask` 真实 schema 工作。
- 原因：
  - 你要求的是“他们的文档生成、展示全部搬过来”，后台如果还只有旧工坊入口，这件事就没有真正完成。

### 5. 清理旧文件仓正式依赖，完成无感切换

#### 5.1 将旧 question/knowledgeBase/file-store 退出学习中心主链路
- 文件：
  - `src/lib/db/learningDb.ts`
  - `src/lib/db/learningStudio.ts`
  - `src/lib/learning/questionBankFallback.ts`
  - `src/lib/learning/agentBankBuilder.ts`
  - `src/lib/learning/starterBankBlueprints.ts`
  - `src/app/api/admin/learning/generate-kb/route.ts`
  - `src/app/api/admin/learning/kbs/[kbId]/route.ts`
- 变更：
  - 公共学习链路不再回退旧文件仓。
  - 后台管理链路不再操作 `knowledgeBase` 旧模型。
  - 旧工坊 builder 保留为迁移期间内部辅助或直接停用，不再作为正式入口。
- 原因：
  - 新旧两套体系同时挂在线上，会让展示、后台、训练和数据清理永远互相打架。

#### 5.2 最终清理旧历史数据
- 文件：
  - `src/lib/learning/v2Seeder.ts`
  - `src/app/api/admin/learning/studio/route.ts`
  - 以及 `data/learning-center` 的历史数据清理脚本/逻辑
- 变更：
  - 在 Prisma 主链路验收通过后，再执行旧文件仓历史数据清空。
  - 保证清理动作只放在最终切换阶段，不提前影响本轮验收。
- 原因：
  - 你已经明确要求旧历史数据全部清空，但顺序必须放在新版可验收之后。

## Implementation Steps

### 阶段 1：契约修正
1. 统一 `content-contract.ts` 的学习、训练、质检 DTO。
2. 修复 `interviewTrainingService.ts` 的 schema 错位。
3. 修复 `QuestionDetailClient.tsx` 的自测展示字段错位。

### 阶段 2：标杆数据正式化
1. 校准 `v2SeedData.ts` 的 4 组标杆专题结构。
2. 校准 `v2Seeder.ts` 的写入顺序、统计结果、质量报告和审核任务落库。
3. 让后台生成/导入入口统一走 `seedLearningCenterV2()`。

### 阶段 3：公开学习页收口
1. 首页卡片样式对齐参考项目。
2. 文档详情页收成“语雀式目录 + 文档正文 + 模式切换”。
3. 训练入口改到正式文档会话与评分模型。

### 阶段 4：后台替换
1. 重写 `/admin/learning` 首页，去掉旧 run 工坊视图。
2. 重写 `/admin/learning/[kbId]` 详情，改为题库/章节/文档/版本视图。
3. 补齐文档、审核、AI 任务管理 API 和页面消费逻辑。
4. 清掉 `generate-kb`、`kbs/[kbId]` 里残留的 `knowledgeBase` 旧模型调用。

### 阶段 5：切换与清理
1. 关闭公共学习链路对旧文件仓 fallback 的正式依赖。
2. 验证 4 组标杆专题在公开页、后台页、训练页均可正常工作。
3. 清空旧文件历史数据，完成正式切换。

## Verification Steps
- 数据验证：
  - 4 个标杆题库都能在 `topic_banks`、`chapters`、`documents`、`document_versions` 中查到完整数据。
  - 每篇标杆文档都具备 `learningContent.article`、`selfTests`、`interviewContent`、`qualityReport`、`sources`。
- 公共学习验证：
  - `/learning` 正常展示 4 个标杆题库卡片。
  - 任意题库点击后可直接进入首篇文档。
  - 至少抽查 `B+Tree`、`缓存穿透`、`AQS`、`GC` 4 篇文档，确认目录、正文、字体、模式切换正常。
- 训练验证：
  - 至少能成功创建 1 个 `DocumentInterviewSession`。
  - 至少能完成 1 次评分并写入 `UserAnswerScore`。
- 后台验证：
  - `/admin/learning` 能展示题库、文档、审核、任务统计，而不是旧 run 工坊卡。
  - 题库详情页能看到章节、文档、版本、质检、审核状态。
  - 审核通过/拒绝动作能正确更新 `ReviewTask`。
- 切换验证：
  - 旧文件仓被清理后，`/learning` 主链路仍完全可用。
  - 后台不再依赖 `prisma.knowledgeBase` 和 `learningStudio` 作为正式管理中心。

## Risks & Controls
- 风险：当前公开页、后台页、训练页虽然都开始切 Prisma，但契约并未完全统一。
  - 控制：先修 DTO 和字段错位，再做 UI 和后台替换。
- 风险：后台旧 run 工坊页面代码量大，直接硬改容易漏掉旧依赖。
  - 控制：先改 API 数据模型，再按新数据模型重写页面消费层。
- 风险：旧文件仓和旧 Prisma 模型继续并存会导致验收时出现“部分页面看新数据，部分页面看旧数据”。
  - 控制：把残留 `knowledgeBase`、`questionBankFallback`、`learningStudio` 依赖列为明确清理项，最后统一切断。
- 风险：过早清空旧数据会影响回看和排查。
  - 控制：清空动作放在阶段 5，且以 4 组标杆专题公开页和后台页验收通过为前提。
