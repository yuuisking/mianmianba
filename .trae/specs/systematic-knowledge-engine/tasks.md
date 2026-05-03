# Tasks

- [x] Task 1: **内容沉淀与深度图解引擎升级 (Content Enrichment & Mermaid Support)**
  - [x] SubTask 1.1: 优化 `summarizer.ts` 中的 Prompt，强制输出“核心摘要”、“深度图解 (Mermaid 流程图/架构图)”、“底层原理剖析”以及“高频面试题”。
  - [x] SubTask 1.2: 在 `react-markdown` 中引入 `rehype-mermaid`、`mermaid`，并在前端（学习中心和预览页）完美支持并渲染 Markdown 中的 Mermaid 图表。
- [x] Task 2: **体系大纲骨架先行 (Taxonomy-First Structure)**
  - [x] SubTask 2.1: 在后台知识库管理界面，允许管理员手工创建、编辑分类和专题结构（哪怕没有内容，也可以先建立空骨架）。
  - [x] SubTask 2.2: 提供一个“一键生成标准大纲”按钮，调用大模型（比如给定“Java后端”，直接生成一套经典的从基础到微服务的树状菜单）。
- [x] Task 3: **智能路由与多源知识融合 (Intelligent Routing & Merging)**
  - [x] SubTask 3.1: 新增一个路由分类的大模型请求：当导入一篇新文章或目录时，先判断它属于我们现有“骨架大纲”中的哪个节点。
  - [x] SubTask 3.2: 升级归纳逻辑：如果该节点已有内容，不再直接覆盖，而是将新文章作为补充材料，进行“二次摘要融合（Merge）”，丰富原有知识的广度和深度。
- [x] Task 4: **导入流程改造 (Batch Import Overhaul)**
  - [x] SubTask 4.1: 修改 `import-github.ts` 脚本和网页端的批量导入逻辑，先拉取知识大纲，针对每篇文章进行路由匹配和智能合并。

# Task Dependencies
- [Task 1] 是最基础的体验提升，必须优先完成。
- [Task 3] depends on [Task 2] (先有骨架，才能路由)。
- [Task 4] depends on [Task 3]。