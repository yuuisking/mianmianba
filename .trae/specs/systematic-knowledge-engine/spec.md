# 体系化知识引擎与内容沉淀重构设计 (Systematic Knowledge Engine)

## Why
目前学习中心的知识库依赖于直接抓取外部（如 GitHub）目录结构和内容。这种方式虽然效率高，但导致了几个致命问题：
1. **内容碎片化与低信息密度**：单篇文章缺乏统一的“摘要+深度解析+面试考点”的结构，用户找不到重点。
2. **知识不成体系**：外部英文目录直接映射为内部菜单，导致知识结构混乱，无法形成我们自己可控的“知识图谱”。
3. **缺乏沉淀与深度图解**：纯粹的搬运无法体现平台的专业性。复杂的底层原理（如多线程、JVM、HashMap）缺乏流程图和架构图辅助理解。

作为一款“学习+模拟面试”一站式的高端产品，**知识库不能是互联网垃圾的回收站，而应该是一本精心编排的“教科书”**。因此，我们需要采用 **“骨架先行，智能路由，多源融合，图文并茂”** 的全新架构思路（即用户的思路二的进阶版）。

## 架构与产品设计思路 (Architecture & Product Design)

### 1. 骨架先行 (Taxonomy-First)
我们不再被动接受网上的目录。系统必须允许管理员（或让大模型一次性生成）一个极其标准的、中文的、结构化的**知识大纲（骨架）**。
例如：`Java知识库 -> Java集合 -> HashMap源码分析`。
这个树状结构是预先存在的。

### 2. 智能路由与碎片拼图 (Intelligent Routing & Merging)
当导入任何外部资料（如一整片 GitHub、博客文章）时：
- AI 首先提取文章的核心主题。
- AI 搜索我们预先定义好的“知识大纲”，找到最匹配的节点（如路由到 `HashMap源码分析` 节点）。
- 如果该节点已经有内容，AI 会将新知识与老知识进行**智能融合（Merge）**，补充细节、填补盲区，而不是简单覆盖或新建。

### 3. 结构化与图文沉淀 (Structured Enrichment & Diagrams)
大模型在归纳单个节点内容时，必须遵循极其严苛且饱满的结构：
- **核心摘要 (Quick Facts)**：一句话总结、底层数据结构、线程安全性等。
- **深度解析 (Deep Dive)**：包含源码或核心原理的详细推演。
- **架构图与流程图 (Diagrams)**：强制大模型在讲解复杂逻辑时，使用 `Mermaid` 语法生成流程图或时序图。
- **面试高频考点 (Interview Q&A)**：从面试官视角，抛出几个常见问题并作答。

## What Changes
- **新增** 知识库大纲/专题（Taxonomy）预设管理功能。
- **修改** AI 解析引擎 (`summarizer.ts`)：
  - 升级 Prompt，要求按 `摘要 -> 图解 (Mermaid) -> 深度解析 -> 面试题` 结构输出。
  - 支持多篇输入文本的**智能融合 (Content Merging)**。
- **新增** 大模型自动路由（Classification/Routing）能力，决定一篇外部文章属于哪个预设专题。
- **修改** 前端展示 (`react-markdown`)，集成 `remark-mermaid` 插件或自定义组件以支持流程图和架构图的完美渲染。
- ****BREAKING**修改** 数据库结构，将树状大纲从自动生成改为独立维护。

## Impact
- Affected specs: `learning-center-cms`, `intelligent-kb-routing`
- Affected code:
  - `src/lib/ai/summarizer.ts`
  - `scripts/import-github.ts`
  - `src/lib/db/learningDb.ts`
  - `src/app/learning/page.tsx`
  - `src/app/admin/learning/[kbId]/page.tsx`

## ADDED Requirements
### Requirement: Mermaid Diagram Support
系统**必须**支持在 Markdown 中渲染 `mermaid` 语法，以便展示架构图、流程图和时序图。

#### Scenario: Success case
- **WHEN** 大模型返回包含 ```mermaid ... ``` 的 Markdown 内容时
- **THEN** 前端（学习中心及预览页）应将其渲染为 SVG 图表。

### Requirement: Taxonomy-First Routing
系统**必须**允许内容按照预设的大纲进行分类归纳。

#### Scenario: Success case
- **WHEN** 导入一篇外部文档
- **THEN** 大模型判断其所属预设分类，并将其精粹知识融合进该分类的内容中，而不是盲目新建英文目录。