# Tasks

- [x] Task 1: 提取与解析 `role`
  - [x] SubTask 1.1: 修改 `src/app/api/parse/route.ts` 里的 Prompt，让大模型在 JSON 结果中输出一个额外的 `role` 字段（不超过 15 字），代表当前面试最核心的岗位方向（如：Java 开发工程师、前端开发等）。

- [x] Task 2: 解除写死的 AI Prompt
  - [x] SubTask 2.1: 修改 `src/app/api/chat/route.ts` 里的 `systemPrompt`，不要再硬编码为“专业的前端开发面试官”，改为读取前端传入的 `profile.role`（或 fallback 为 `开发面试官`），组合为“你是一个专业的 ${profile.role} 面试官...”。

- [x] Task 3: 视觉重构与角色二次确认交互
  - [x] SubTask 3.1: 在 `src/app/profile/page.tsx` 中，读取 `parsedData.role` 作为 state 状态，并将其渲染在页面最显眼的位置（作为 `input` 或醒目的可编辑文本），让用户可以确认并修改。
  - [x] SubTask 3.2: 当点击“进入面试房间”时，确保将用户可能修改过的 `role` 更新到 `sessionStorage` 的 `parsedProfileData` 中，以便 `api/chat` 可以读取到最新的。
  - [x] SubTask 3.3: 引入 `brand-guidelines` 规范（如 `var(--font-heading)` 为 Poppins，`var(--font-body)` 为 Lora），将当前杂乱、拥挤的多列卡片重新排版，适当删减冗余视觉元素，提高留白，确保整体风格符合 Anthropic 克制、干净的设计语言。

# Task Dependencies
- [Task 1] 独立执行
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]