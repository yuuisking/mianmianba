# 候选人画像与面试岗位确认 Spec

## Why
当前面试引擎在生成对话时，底层 Prompt 中被硬编码为了“前端开发面试官”，导致无论用户投递的是后端还是 Python 岗位，AI 都会问出前端相关问题。此外，“候选人画像确认”页面（`/profile`）目前信息过于杂乱、拥挤，且没有提供核心“面试岗位/方向”的确认与修改入口，不符合 Anthropic 品牌规范所追求的清晰与克制。

## What Changes
- **新增岗位方向解析**：修改 `/api/parse/route.ts` 的 Prompt 和 JSON 结构，要求大模型根据简历和 JD 提取出一个核心的 `role`（如：Java 后端开发、Python 研发、前端开发等）。
- **新增二次确认交互**：在 `/profile` 页面顶部最显眼的位置，增加一个可编辑的“面试岗位方向”输入框。允许用户核对 AI 提取的岗位，如果不准可以手动修改（如将“开发工程师”改为“Java 后端高级开发”）。
- **解除硬编码的 Prompt**：修改 `/api/chat/route.ts`，彻底移除硬编码的“前端开发面试官”。改为动态读取前端传来的 `profile.role` 组合 System Prompt。
- **页面视觉重构**：使用 `brand-guidelines` 对 `/profile` 页面进行彻底的视觉梳理和减法。简化杂乱的卡片，优化留白，统一字体（Poppins/Lora）与品牌色（暖橙、克制灰）。

## Impact
- Affected specs: 简历解析流程、面试官 Prompt 初始化、候选人画像确认页面交互。
- Affected code:
  - `src/app/api/parse/route.ts`
  - `src/app/api/chat/route.ts`
  - `src/app/profile/page.tsx`

## ADDED Requirements
### Requirement: 动态岗位匹配与确认
The system SHALL extract the candidate's target role from the parsed documents and present it to the user for confirmation or editing before the interview starts. The confirmed role SHALL be used to instruct the AI interviewer.

#### Scenario: Success case
- **WHEN** user uploads a Java Backend resume and JD.
- **THEN** the profile page shows "Java后端开发" as the target role.
- **WHEN** user edits it to "高并发架构师" and enters the room.
- **THEN** the AI interviewer introduces itself and asks questions from the perspective of a "高并发架构师".