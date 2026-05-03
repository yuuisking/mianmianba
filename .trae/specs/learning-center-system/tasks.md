# Tasks
- [x] Task 1: 搭建“学习中心”前端骨架与品牌样式（Brand Guidelines）。
  - [x] SubTask 1.1: 引入品牌色（主背景 `#faf9f5`，深色文字 `#141413`，橙色强调色 `#d97757` 等）和排版体系（标题 Poppins，正文 Lora）。
  - [x] SubTask 1.2: 新增 `/learning` 路由，开发左右分栏布局（左侧分类树，右侧知识点详情）。
  - [x] SubTask 1.3: 在顶部导航栏（NavBar）增加“学习中心”的入口。
- [x] Task 2: 构建后端数据模型与接口（结构化知识树）。
  - [x] SubTask 2.1: 设计一个存储体系化知识的数据结构（JSON 格式：Domain -> Subject -> Topic -> Content）。
  - [x] SubTask 2.2: 编写基础的 API，供前端 `/learning` 页面获取知识大纲和具体的知识点详情内容。
- [x] Task 3: 实现管理员录入与 AI 归纳引擎（后台管理）。
  - [x] SubTask 3.1: 新增 `/admin/learning` 页面，提供知识库大类的管理和原始文档的上传入口。
  - [x] SubTask 3.2: 在后端集成一个新的 LLM 任务流（Summarizer），当管理员上传文档后，调用大模型对文档进行归纳，生成符合大纲结构的内容并保存到系统中。
- [x] Task 4: 实现“学练一体化”（一站式联动）。
  - [x] SubTask 4.1: 在每个知识点详情的底部增加一个明显的 Call To Action 按钮：“开始模拟面试”。
  - [x] SubTask 4.2: 点击按钮时，自动带入当前的 `topic` 和知识点总结，跳转至 `/practice` 或 `/interview` 页面，发起针对性面试训练。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]