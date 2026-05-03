# Learning Center System Spec

## Why
目前平台只提供了“模拟面试”功能，但用户在面试前往往需要系统的复习。利用我们现有的知识库，通过构建一个“学习中心”，将零散的文档资料进行 AI 体系化归纳总结（如 Java -> Java 集合 -> HashMap 原理），能够打造“学+练（面试）”的一站式体验，极大提升平台的核心价值与用户粘性。

## What Changes
- **新增“学习中心”前端模块**：在导航栏增加入口，左侧展示体系化知识树（分类/目录），右侧展示知识点详情。
- **引入品牌 UI 设计（Brand Guidelines）**：学习中心界面将严格采用特定的排版和配色方案（背景色 `#faf9f5`，文字 `#141413`，主标题使用 `Poppins`，正文使用 `Lora`，并在交互元素上使用 `#d97757` 橙色点缀等），打造高端阅读体验。
- **新增后台管理系统（知识录入与归纳）**：
  - 允许管理员上传/录入原始文档资料。
  - **核心：AI 自动归纳引擎**。引入一个独立的后台 AI 模型任务，自动读取散乱的文档，生成结构化的体系大纲（JSON 树形结构），并提炼每个知识点的核心总结。
- **学练联动（一站式服务）**：在每个知识点或分类的底部，增加“针对该知识点进行模拟面试”的快速入口，直接跳转至 Targeted Practice 模式。

## Impact
- Affected specs: 平台导航架构、知识库管理机制。
- Affected code: `src/app/learning/*`（前端），`src/app/api/admin/learning/*`（后端管理），`src/lib/ai/summarizer.ts`（AI 归纳引擎）。

## ADDED Requirements
### Requirement: Structured Knowledge Presentation
The system SHALL display learning materials in a hierarchical, structured format (e.g., Domain -> Subject -> Topic) rather than as a flat list of documents.

#### Scenario: User studies a topic and starts a mock interview
- **WHEN** the user navigates to "学习中心" -> "Java" -> "集合框架" -> "HashMap".
- **THEN** the user sees a well-formatted, AI-summarized article explaining HashMap.
- **AND WHEN** the user clicks "测试一下" at the bottom.
- **THEN** the system launches a targeted mock interview session focused entirely on "Java HashMap".

### Requirement: AI Summarization Pipeline
The admin system SHALL use an LLM to parse raw uploaded documents and map them into the structured taxonomy.

## MODIFIED Requirements
### Requirement: Navigation
The main navigation bar SHALL include a prominent link to the "学习中心".