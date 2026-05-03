# 重构复盘中心与控制台边界 (Refactor Review Center) Spec

## Why
目前 `/review`（复盘中心）使用的是完全写死的 Mock 数据，且与 `/dashboard`（控制台）的“训练记录”功能高度重合，导致用户心智混乱。我们需要明确两者的产品边界：
- **控制台 (Dashboard)**：作为“驾驶舱”，用于快速发起面试/专项训练，仅提供最宏观的数据概览。
- **复盘中心 (Review)**：作为“核心武器库”，集中管理所有历史记录，并通过“错题本”暴露薄弱点，形成“发现问题 -> 专项训练”的闭环。

## What Changes
- **重新定义“错题本 (Error Book)”**：错题本是指系统从用户历史的真实面试报告中，自动提取出**评分较低的维度（如 < 7分）**或**高频的风险不足（Risks）**。它帮助用户一眼看清自己总是挂在什么地方。
- **打通错题本与专项训练**：错题本卡片上的“专项突破”按钮，点击后将直接读取该薄弱项的名称和建议，通过 URL 参数跳转到 `/interview?mode=targeted&topic=xxx&desc=xxx`，实现无缝的定点爆破。
- **复盘中心接管历史数据**：彻底删除 `/review` 的 Mock 数据，将 `/dashboard` 中现有的“全量分页训练记录、搜索、删除功能”完整迁移到 `/review` 页面的下半部分。
- **控制台 (Dashboard) 减负**：大幅精简 `/dashboard` 的历史记录区块，仅展示最近的 2-3 条动态，并增加一个醒目的“查看全部历史记录 & 错题本 ➔”按钮，引导用户前往复盘中心。

## Impact
- Affected specs: 控制台展示逻辑、复盘中心数据流、错题本生成逻辑。
- Affected code:
  - `src/app/dashboard/page.tsx`
  - `src/app/review/page.tsx`
  - `src/app/api/sessions/recent/route.ts` (可能需要确保存储了错题本所需的数据)

## ADDED Requirements
### Requirement: 真实的错题本与训练闭环
The system SHALL aggregate low-scoring dimensions or identified risks from the user's recent real interview reports to form an "Error Book" in the Review Center. Users SHALL be able to click a button on any error book entry to immediately start a targeted practice session for that specific weakness.

#### Scenario: Success case
- **WHEN** a user visits the Review Center.
- **THEN** the system displays their real interview history and dynamically generated weak points (e.g., "系统设计" scored 5/10 recently).
- **WHEN** the user clicks "专项突破" on the "系统设计" weakness.
- **THEN** the system navigates to the targeted interview room to exclusively practice "系统设计".