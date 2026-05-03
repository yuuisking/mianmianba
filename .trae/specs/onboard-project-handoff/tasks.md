# Tasks
- [x] Task 1: 阅读交接材料并抽取“可执行信息”
  - [x] 子任务 1.1：阅读 `.trae/documents/handoff.md`，整理：常用入口、关键代码位置、同步范围与敏感项（环境变量）
  - [x] 子任务 1.2：阅读 `.trae/documents/ui_redesign_plan.md`，整理：目标改动点、涉及页面/API/样式入口与验证步骤
  - [x] 子任务 1.3：阅读 `.trae/documents/多设备开发_上下文连续方案.md`，整理：三类上下文边界、推荐同步方式与校验清单

- [x] Task 2: 盘点现有规格与“下一步工作入口”
  - [x] 子任务 2.1：浏览 `.trae/specs/` 各 change-id 的 spec/tasks/checklist，标注：已完成/未完成/可并行
  - [x] 子任务 2.2：识别与交接材料强相关的规格（学习中心、后台管理、知识库、鉴权等），给出推荐继续推进顺序

- [x] Task 3: 结合代码现状补全关键路径（只读梳理）
  - [x] 子任务 3.1：确认路由入口与页面文件：`/login`、`/learning`、`/admin/learning`
  - [x] 子任务 3.2：确认鉴权与会话：NextAuth 配置与 API 路由文件
  - [x] 子任务 3.3：确认学习中心数据链路：`data/learning-center.json` 与 DB 读写实现
  - [x] 子任务 3.4：确认本地运行依赖：`package.json` 脚本、Prisma 配置、数据库文件位置

- [x] Task 4: 输出“接续开发上下文包”（在对话中交付）
  - [x] 子任务 4.1：给出项目一句话目标与模块地图（页面/服务/数据）
  - [x] 子任务 4.2：给出本地运行 Runbook（需要哪些文件/环境变量/命令）
  - [x] 子任务 4.3：给出继续开发指引（从哪个 spec 开始、改哪些文件、如何验证）

# Task Dependencies
- Task 4 depends on Task 1, Task 2, Task 3
