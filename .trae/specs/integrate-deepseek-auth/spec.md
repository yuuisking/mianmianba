# 接入 Deepseek 及真实用户认证系统 Spec

## Why
目前系统为静态原型（Mock），缺乏真实的用户身份认证、数据隔离机制以及真实的 AI 交互能力。同时，为了避免 AI 接口超时影响体验，必须针对性能（响应速度、流式输出、Prompt优化）进行重点建设。

## What Changes
- **真实用户系统**：引入密码加密存储（如 bcrypt），完善注册、登录、登出流程，实现用户间数据完全隔离。
- **PDF 解析支持**：集成 PDF 文本提取能力（如 `pdf-parse`），支持解析用户上传的真实简历（如 `杨宇-四年工作经验-高级Java研发工程师.pdf`）。
- **接入 Deepseek API**：替换现有 Mock，在简历/JD 解析（`/api/parse`）、对话出题（`/api/chat`）和报告生成（`/api/reports/generate`）环节使用真实的 Deepseek 接口。
- **性能优化**：
  - 会话接口改造为 Server-Sent Events (SSE) 或 Next.js 的流式响应 (Streaming)，解决审题/出题超时问题。
  - 对 Prompt 进行压缩和约束，要求输出高效解析的 JSON。
- 移除所有业务代码中的模拟数据。

## Impact
- Affected specs: 认证体系、API 数据解析、API 会话出题、API 报告生成。
- Affected code:
  - `src/app/api/auth/[...nextauth]/route.ts` 及前端鉴权组件
  - `src/app/api/parse/route.ts`
  - `src/app/api/chat/route.ts`
  - `src/app/api/reports/generate/route.ts`
  - `src/app/interview/page.tsx` (需适配真实流式输出)

## ADDED Requirements
### Requirement: 真实用户数据隔离
The system SHALL provide 注册、登录、退出功能，且用户只能访问自己的面试会话和复盘数据。

#### Scenario: Success case
- **WHEN** 用户A和用户B分别登录
- **THEN** 双方的数据（会话记录、报告）互相不可见

### Requirement: 真实 Deepseek API 接入与性能保障
The system SHALL provide 基于 Deepseek 的实时解析和交互，且在 5 秒内返回首字，防止响应超时。

#### Scenario: Success case
- **WHEN** 用户发送面试回答
- **THEN** AI 在极短时间内以流式 (Streaming) 的方式返回追问，杜绝页面卡死或超时报错。