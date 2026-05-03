# Tasks
- [x] Task 1: 建立轻量级本地持久化数据层（DB）。
  - [x] SubTask 1.1: 创建 `src/lib/db/learningDb.ts`，利用 Node `fs` 模块将数据保存和读取自 `data/learning-center.json`，支持初始化空结构、获取所有知识库列表、获取单个知识库体系。
- [x] Task 2: 移除所有前端与后端接口的硬编码 Mock 数据。
  - [x] SubTask 2.1: 在 `src/app/api/learning/route.ts` 中，使用真实的 `learningDb` 读取全量或特定知识库数据。如果为空，返回空数组。
  - [x] SubTask 2.2: 在 `src/app/learning/page.tsx` 中适配后端真实的返回格式，处理初始没有数据的空状态界面。
- [x] Task 3: 实现后台管理：新增知识库大类（KB Category）。
  - [x] SubTask 3.1: 在 `/admin/learning` 页面，增加“知识库管理”面板，允许管理员创建新的体系（例如“Java知识库”、“前端知识库”等），包括填写标题、副标题、标签等。
  - [x] SubTask 3.2: 创建后端接口 `POST /api/admin/learning/kb` 接收并保存新的知识库到本地 JSON 文件。
- [x] Task 4: 实现后台管理：上传文档/链接与 AI 自动化解析（核心）。
  - [x] SubTask 4.1: 在后台页面的资料录入区，将原有的纯文本输入框升级，增加“URL 抓取”选项（支持 GitHub 或其他网页链接）。
  - [x] SubTask 4.2: 开发后端接口 `POST /api/admin/learning/ingest`。该接口能够：1. 如果是 URL，使用 Node.js 发起请求抓取网页正文；2. 如果是文本，直接读取；3. 调用 `summarizer.ts` 生成带有概述、考点和面试题的结构化大纲内容。
  - [x] SubTask 4.3: 当 AI 解析完成后，系统能够将生成的 Topic 自动追加（或挂载）到指定的知识库（KB）对应的分类（Subject）下，并更新 `learning-center.json`。
- [x] Task 5: 全链路联调测试。
  - [x] SubTask 5.1: 确保在后台创建一个空知识库，随后通过贴入一个真实的 URL/文本，AI 能自动生成体系化内容。
  - [x] SubTask 5.2: 刷新前端的学习中心，看到刚才录入的知识体系完美呈现。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 4]