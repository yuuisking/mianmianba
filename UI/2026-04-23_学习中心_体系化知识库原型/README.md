# 学习中心 UI 原型（体系化知识库）

## 目标
- 先列出“知识库大类”（例如 Java、后端通用、行为面）
- 点击进入后展示“体系树”（分类 → 知识点），而不是按“文档列表”浏览
- 知识点页面展示：**典型回答 / 扩展知识 / 常见追问 / 大纲**

## 文件
- `learning-center.html`：入口
- `assets/anthropic-ui.css`：品牌风格 CSS（Anthropic 配色/字体）
- `assets/learning-center.js`：演示数据 + hash 路由 + 树/大纲渲染

## 路由示例
- `#/`：知识库列表
- `#/kb/java`：Java 知识库（原型默认落到一个知识点）
- `#/kb/java/context-switch`：Java 并发 → 上下文切换

