# Learning Center CMS Spec

## Why
目前的学习中心前端展示虽然完美，但数据是硬编码的 Mock 数据。为了让平台真正可用，我们需要一个完整的后台内容管理系统（CMS）。管理员需要能够动态创建新的知识体系（如 Java、前端等），并通过上传文档或输入 GitHub 链接的方式，利用 AI 自动解析、提炼并丰富知识库内容，最终在前端动态展示给用户。

## What Changes
- **移除 Mock 数据**：清空前端与 API 中硬编码的 `KB_DATA`、`JAVA_TREE` 和 `JAVA_CONTENT`。
- **引入持久化存储**：使用本地 JSON 文件（如 `data/learning.json`）作为轻量级数据库，持久化存储知识库的元数据、体系树和内容详情。
- **后台管理 - 知识库管理**：
  - 支持新增知识库大类（如“Java 知识库”），设置名称、副标题、标签等。
  - 支持查看和管理现有的知识库列表。
- **后台管理 - 资料解析与录入**：
  - 在指定知识库下，支持输入 URL（如 GitHub 链接、博客链接）或直接粘贴长文本。
  - 后端提供专门的解析脚本/API，抓取网页内容或读取文本，随后调用现有的 AI 归纳引擎（`summarizer.ts`）生成体系化的知识树节点和内容。
  - 将 AI 生成的内容无缝追加到该知识库的 Tree 和 Content 中。
- **前台展示动态化**：前端学习中心完全读取真实的持久化数据。如果无数据，则展示友好的空状态提示。

## Impact
- Affected specs: 学习中心前端、后台管理端。
- Affected code: `src/app/learning/*`, `src/app/admin/learning/*`, `src/app/api/learning/*`, `src/app/api/admin/learning/*`。

## ADDED Requirements
### Requirement: Dynamic Knowledge Base Creation
Admins SHALL be able to create new Knowledge Base categories dynamically.

### Requirement: Automated Content Ingestion
The system SHALL accept a URL or raw text, parse the content, use the AI summarizer to extract structured topics, and append them to the selected Knowledge Base.

#### Scenario: Success case
- **WHEN** Admin creates a "前端知识库", then pastes a React tutorial link.
- **THEN** The backend fetches the URL, the AI summarizes it into "React 基础" -> "Hooks 原理" -> Content, and saves it. The user immediately sees this in the Learning Center.

## REMOVED Requirements
### Requirement: Hardcoded Mock Data
**Reason**: System is moving to production-like dynamic data.
**Migration**: All mock objects in `src/app/api/learning/route.ts` will be replaced with file-based database reads.