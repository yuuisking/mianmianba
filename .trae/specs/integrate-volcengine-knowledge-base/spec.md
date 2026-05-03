# Integrate Volcengine Knowledge Base Spec

## Why
当前 AI 面试平台生成的题目和知识面完全受限于大模型的预训练数据（Knowledge Cutoff），导致它对一些最新鲜的技术概念（例如 MCP 协议、AI Skill、最新的前端框架特性等）一无所知，这极大降低了专业面试的真实感和质量。
我们需要通过 RAG（检索增强生成）技术，接入字节“火山方舟”的知识库，不仅能沉淀 GitHub 上的海量开源高质量题库，还能具备持续的“知识保鲜”能力，让 AI 面试官能够与时俱进地向候选人抛出最新的技术考点。

## What Changes
- **接入火山方舟知识库 API**：用于题库文档的上传、向量化和语义检索（RAG）。
- **模型自主调度 (Tool Calling)**：在面试的对话接口中，赋予大模型（DeepSeek）一个名为 `search_knowledge_base` 的专属工具。大模型会根据当前的面试进度、候选人的回答以及自己知识盲区，自主决定是否去知识库检索“下一道考题”或“最新技术名词的释义”。
- **双轨数据初始化**：
  - **后端脚本自动导入**：编写 Node.js 脚本，直接读取并批量上传本地的 Markdown 格式开源题库文件至知识库。
  - **可视化管理后台**：开发一个简单的 `/admin/knowledge` 页面，支持管理员随时手动录入、上传和管理知识库文档。
- **保鲜度与合规化定时采集**：开发一个轻量级的数据采集接口（例如 `/api/cron/spider`），能够定时拉取指定且**合法合规**的公开数据源（如用户授权的 GitHub 开源协议仓库、官方开发者文档或 RSS 源），严格遵守中国法律法规（《数据安全法》《网络安全法》及相关知识产权、版权协议），解析并增量同步到火山方舟知识库中。

## Impact
- Affected specs: 面试问答逻辑（对话链路将从纯生成模式升级为 Tool-Calling + RAG 模式）。
- Affected code:
  - `src/lib/knowledge/volc.ts` (新增：火山方舟知识库 API 封装)
  - `src/app/api/chat/route.ts` (修改：增加工具调用逻辑)
  - `scripts/import-kb.ts` (新增：本地题库批量导入脚本)
  - `src/app/admin/knowledge/page.tsx` (新增：可视化题库管理界面)
  - `src/app/api/cron/spider/route.ts` (新增：定时采集更新接口)

## ADDED Requirements
### Requirement: 知识库检索与生成 (RAG)
The system SHALL provide a Volcengine-backed knowledge base that the AI interviewer can autonomously query during the interview.

#### Scenario: 候选人提及了模型不知道的新技术 (如 MCP)
- **WHEN** 候选人回答：“我最近在使用 MCP 协议构建 AI 应用。”
- **THEN** 大模型自主触发 `search_knowledge_base` 工具查询“MCP协议是什么”，并将检索到的最新知识作为上下文，进而生成专业的追问（例如：“你刚才提到 MCP，那你是怎么处理工具调用时的权限隔离的？”）。

### Requirement: 题库保鲜与定时采集
The system SHALL support automated ingestion of new interview questions and tech articles to keep the knowledge base up to date.

#### Scenario: 知识库自动且合规地更新
- **WHEN** 触发系统的定时采集任务 (Cron Job)
- **THEN** 系统会自动从预先白名单审核过的数据源（如指定的遵循 MIT/Apache 开源协议的 GitHub 题库）拉取最新内容，在确保**不侵犯版权、不爬取敏感及私有数据**的前提下分块并增量同步到火山方舟知识库中，AI 面试官在下一次面试中即可使用这些新题目。
