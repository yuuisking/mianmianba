# 移除 Mock 数据与添加加载进度条 Spec

## Why
目前控制台（Dashboard）中的“最近训练记录”部分仍在使用静态占位数据（Mock），违背了所有数据必须真实的原则。同时，AI 解析简历和生成报告的耗时较长，缺少带有百分比的直观进度条，导致用户体验不佳。

## What Changes
- **移除控制台 Mock**：更新 `src/app/dashboard/page.tsx`，通过调用真实的 API 接口（如 `/api/reviews` 或 `/api/sessions`）获取并展示当前登录用户的真实面试历史记录。
- **完善数据落库**：确保在面试结束后调用 `/api/reports/generate` 时，将面试会话（Session）与生成的报告（Report）真实写入到 Prisma 数据库中。
- **简历解析进度条**：在 `src/app/setup/page.tsx` 中增加带有百分比（0%~100%）的进度条。在等待 AI 接口响应期间，通过模拟进度的平滑增长，缓解用户等待焦虑。
- **报告生成进度条**：在 `src/app/report/page.tsx` 中同样增加带有百分比的进度条。

## Impact
- Affected specs: 控制台数据展示、简历解析交互、报告生成交互、数据库落库逻辑。
- Affected code:
  - `src/app/dashboard/page.tsx`
  - `src/app/setup/page.tsx`
  - `src/app/report/page.tsx`
  - `src/app/api/reports/generate/route.ts`

## ADDED Requirements
### Requirement: 真实数据与控制台展示
The system SHALL ensure that all recent training records on the dashboard are fetched from the database and reflect the user's actual past interview sessions. No hardcoded mock data is allowed.

### Requirement: 带有百分比的加载进度条
The system SHALL provide a visible progress bar with a percentage indicator during:
1. Resume and JD parsing.
2. Interview report generation.
The progress bar should increment smoothly while waiting for the AI response and jump to 100% upon completion.