# 学习中心与后台管理 UI 升级计划

## 1. 目标与现状分析 (Summary & Current State Analysis)
- **现状**：目前的“学习中心” (`src/app/learning/page.tsx`) 和“后台管理” (`src/app/admin/learning/page.tsx`) 页面使用了基础的 Tailwind CSS 或全局样式，布局简单。同时，后端的 Mock 数据 (`src/app/api/learning/route.ts`) 结构单调且内容较少。
- **目标**：根据用户提供的 HTML 原型 (`2026-04-23_后台管理_资料录入预览原型` 和 `2026-04-23_学习中心_体系化知识库原型`)，全面升级这两个页面的 UI，使其符合 Anthropic Brand Guidelines。同时，将 API 的 Mock 数据替换为原型中提供的丰富体系化数据（如 Java 并发、上下文切换等）。

## 2. 计划更改内容 (Proposed Changes)

### Step 1: 注入原型 CSS 样式
- **文件**: `src/app/globals.css`
- **操作**: 将原型 `anthropic-ui.css` 中定义的核心组件样式（如 `.shell`, `.panel`, `.panel-header`, `.notice`, `.kvs`, `.callout`, `.tree`, `.tree-group`, `.outline` 等）整合到现有的 `globals.css` 中，复用已有的 CSS 变量（如 `--bg-main`, `--text-dark`, `--accent-orange` 等），确保品牌色彩和排版字体 (Poppins/Lora) 生效。

### Step 2: 升级 Mock 数据
- **文件**: `src/app/api/learning/route.ts`
- **操作**: 废弃原有的简陋 `learningData`。将原型中的 `JAVA_TREE` 和 `JAVA_CONTENT` 移植到该 API 中。接口返回结构变更为 `{ tree: JAVA_TREE, content: JAVA_CONTENT }`，提供丰富的、真实的体系化学习数据（包含 `quickFacts`, `sections`, `callout` 等结构）。

### Step 3: 重构学习中心前端页面
- **文件**: `src/app/learning/page.tsx`
- **操作**: 
  - 修改页面布局，采用原型中的三栏 `.shell` 布局：左侧树形目录 (`.sidebar`)，中间主内容区 (`.panel`)，右侧页面大纲 (`.outline`)。
  - 对接新的 API 数据结构，渲染复杂的章节内容（`sections`, `paragraphs`, `bullets`, `callout` 等）。
  - 保留底部的“开始模拟面试”按钮，并适配新的 UI 风格，确保原有的“学练一体化”逻辑不丢失。

### Step 4: 重构后台管理前端页面
- **文件**: `src/app/admin/learning/page.tsx`
- **操作**:
  - 修改页面布局，采用原型中的三栏 `.shell` 布局：左侧录入表单 (`.left`)，中间预览区 (`.panel`)，右侧队列区 (`.right` - 可作为静态展示或未来扩展的占位)。
  - 将表单元素（选择框、文本域、按钮）应用原型中的 `.field`, `.label`, `.btn` 样式。
  - 将通过 API (`/api/admin/learning/summarize`) 生成的摘要结果渲染到中间的“预览”区域，并使用规范的标题和样式展示。

## 3. 假设与决策 (Assumptions & Decisions)
- **CSS 整合策略**：考虑到项目已经使用了 Tailwind CSS 并且有自己的 `globals.css` 变量体系，原型的自定义 CSS 将会被适配并追加到 `globals.css` 中，而不是完全替换，以防破坏其他页面（如面试、登录页）的样式。
- **数据结构**：API 将直接输出类似原型中的 `sections` 结构，前端基于 `sections` 动态渲染 H2、段落和列表。

## 4. 验证步骤 (Verification Steps)
1. 访问 `/learning`，验证页面是否呈现三栏布局，左侧是否有可折叠的 Java 体系树，中间是否有高质量的排版（包含提示框、键值对等），右侧是否有大纲导航。
2. 访问 `/learning`，验证点击“开始模拟面试”按钮是否能正常跳转并携带正确的 topic 参数。
3. 访问 `/admin/learning`，验证页面是否呈现三栏布局，录入表单是否美观。
4. 提交测试文本进行 Summarize，验证生成的摘要是否正确渲染在中间的“预览”区域。