# Tasks

- [x] Task 1: 项目初始化与基础设施搭建
  - [x] SubTask 1.1: 使用 Next.js (App Router) 创建 TypeScript 全栈项目，清理无用默认样式。
  - [x] SubTask 1.2: 配置 Prisma ORM 和本地 SQLite/PostgreSQL 数据库连接。
  - [x] SubTask 1.3: 提取 `index.html` 中的全局 CSS 变量、字体（Poppins/Lora）和基础样式到全局样式文件 `globals.css` 中。
  - [x] SubTask 1.4: 配置基础的 NextAuth 认证模块，准备 User 相关数据表。

- [x] Task 2: 100% UI 组件化与页面拆分（静态还原阶段）
  - [x] SubTask 2.1: 实现公共布局组件（Header, Navigation, UserMenu, Loading Overlay）。
  - [x] SubTask 2.2: 提取并实现 Login (登录页) 和 Dashboard (控制台) 视图组件。
  - [x] SubTask 2.3: 提取并实现 Setup (配置面试) 与 Profile (画像确认) 视图组件，严格复用原版 class 和 DOM 结构。
  - [x] SubTask 2.4: 提取并实现 Interview Room (文字模式面试房间) 视图组件。
  - [x] SubTask 2.5: 提取并实现 Report (报告页) 与 Review (复盘中心) 视图组件。
  - [x] SubTask 2.6: 实现简单的客户端路由或视图切换逻辑，确保静态页面间可按原版交互流转。

- [x] Task 3: 数据库 Schema 设计与数据模型落实
  - [x] SubTask 3.1: 设计并创建 `User`, `InterviewSession`, `Message`, `Report`, `Weakness` 等 Prisma models。
  - [x] SubTask 3.2: 编写针对用户、面试记录、复盘数据的核心 CRUD 接口 (Next.js Route Handlers)。

- [x] Task 4: 核心业务逻辑 - 简历/JD 解析与画像生成
  - [x] SubTask 4.1: 开发简历/JD 上传与文本解析 API 接口。
  - [x] SubTask 4.2: 编写并调试 AI Prompt，结构化输出候选人技能、项目追问点及 JD 差距分析。
  - [x] SubTask 4.3: 前端联调，将解析结果绑定至 Profile 确认视图。

- [x] Task 5: 核心业务逻辑 - 模拟面试引擎与实时对话
  - [x] SubTask 5.1: 开发面试初始化 API，基于画像生成面试题目大纲。
  - [x] SubTask 5.2: 开发实时对话 API，对接 AI 大模型（支持流式响应），实现结合上下文的追问判断策略。
  - [x] SubTask 5.3: 前端聊天界面状态联调，支持发送、自动滚动、耗时统计、“跳过/我不知道”及结束功能。

- [x] Task 6: 核心业务逻辑 - 报告生成与复盘中心
  - [x] SubTask 6.1: 编写 AI Prompt，根据整场面试记录生成包含分数、亮点、风险点引用和训练计划的 JSON 报告。
  - [x] SubTask 6.2: 报告页数据动态渲染及样式无缝对接。
  - [x] SubTask 6.3: 复盘中心接口联调，展示高频薄弱维度与历史面试得分列表。

- [x] Task 7: 额度控制与端到端测试验证
  - [x] SubTask 7.1: 实现中间件或服务层拦截，实现免费用户每日面试次数限制。
  - [x] SubTask 7.2: 全流程端到端测试，验证 UI 100% 还原度及所有 PRD 规定功能的可行性与完整性。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2], [Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 6]
