# Tasks

- [x] Task 1: 封装火山方舟知识库 API (`src/lib/knowledge/volc.ts`)
  - 查阅火山方舟 API 文档，实现上传文档、分块配置、创建知识集和检索知识的 HTTP 请求。
- [x] Task 2: 给大模型赋予知识库查询工具 (`src/app/api/chat/route.ts`)
  - 在请求 DeepSeek 的 `/api/chat/completions` 时，通过 `tools` 字段注册 `search_knowledge_base` 工具。
  - 处理大模型返回的 `tool_calls`，当触发时，调用 Task 1 中的检索 API，将检索到的“开源题目或技术名词解释”追加回对话上下文，再发起第二次请求让模型生成真正的面试回复。
- [x] Task 3: 编写本地题库的自动导入脚本 (`scripts/import-kb.ts`)
  - 使用 Node.js 和 `fs` 模块，读取一个本地存放着开源题库（如 `assets/questions/*.md`）的目录，解析其结构并批量调用火山 API 上传到知识库。
- [x] Task 4: 开发可视化题库管理后台 (`src/app/admin/knowledge/page.tsx`)
  - 创建一个简单的 React 页面，能够列出知识库里已有的文档列表。
  - 支持在这个页面上，上传单篇 Markdown/TXT 文件，或者通过粘贴纯文本的方式，录入新的面试题。
- [x] Task 5: 增加合法合规的定时数据采集接口 (`src/app/api/cron/spider/route.ts`)
  - 开发一个简单的 API（可通过 Vercel Cron 等定时触发）。
  - **合规前置约束**：硬编码或配置一个“数据源白名单”，仅允许拉取基于 MIT/Apache 等开源协议的指定公开 GitHub 仓库或官方文档（如 `github.com/someone/interview-questions`）。绝对不抓取具有反爬协议（robots.txt 禁止）的网站或商业题库。
  - 提取、清理并格式化文本后，增量同步到火山知识库中，让模型“合法地自动学习”新知识（如 MCP）。
