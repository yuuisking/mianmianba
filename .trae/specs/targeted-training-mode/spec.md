# 专项训练模式 (Targeted Training Mode) Spec

## Why
目前在“结构化评估报告”页面中，无论用户的“下一步训练计划”是什么具体薄弱点，点击“去行动”按钮都会直接跳回通用的 `/setup` 重新开始一场完整的综合面试。这种体验非常割裂，无法满足用户对特定薄弱项进行“定点爆破”的需求。需要引入独立的“专项训练”能力，让 AI 专门针对某一个技能点或项目进行定向提问和辅导。

## What Changes
- **动态传参**：修改 `/report` 页面中“去行动”按钮的路由跳转逻辑，将其改为跳转到 `/interview` 并通过 URL 参数携带具体的薄弱项标题 (`topic`) 和描述 (`desc`)。
- **面试房间适配**：修改 `/interview` 页面以支持新的 `mode=targeted`（专项训练模式）。页面顶部标题需动态展示正在训练的专项名称。
- **专属大模型 Prompt**：修改 `/api/chat` 接口，在检测到 `mode=targeted` 时，不再使用通用的结构化面试 Prompt，而是重构为“专项训练辅导官”，要求 AI 仅围绕传入的 `topic` 和 `desc` 进行深度追问与辅导。

## Impact
- Affected specs: 报告页操作流、面试房间展示、大模型对话生成。
- Affected code:
  - `src/app/report/page.tsx`
  - `src/app/interview/page.tsx`
  - `src/app/api/chat/route.ts`

## ADDED Requirements
### Requirement: 专项训练能力
The system SHALL support a "Targeted Training" mode where the AI interviewer focuses exclusively on a specific weakness identified in the evaluation report.

#### Scenario: Success case
- **WHEN** user clicks "去行动" on the "深化JVM原理与实践" card in the report.
- **THEN** the system navigates to the interview room directly, with the header showing "专项训练 (深化JVM原理与实践)".
- **WHEN** the AI sends the first message.
- **THEN** the AI asks a highly specific question related to JVM internals based on the description, rather than asking for a general self-introduction.