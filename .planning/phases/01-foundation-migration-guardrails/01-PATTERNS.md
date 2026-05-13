# Phase 1: 领域底座与迁移护栏 - Patterns

**Date:** 2026-05-13
**Purpose:** 为 Phase 1 后续 `PLAN.md` 提供现有代码中的可复用模式、参考文件和应避免复制的补丁模式。

## Recommended Reference Patterns

### 1. 领域类型与枚举定义
- **Reference:** `src/lib/interview-v2/domain.ts`
- **Why:** 已集中定义 `InterviewPlan/Stage/Round/CodingSession/AgentRole` 等枚举与 DTO，是 Phase 1 统一语义层的直接起点。
- **Reuse Rule:** 新增画像层、事件层、观测层类型时，优先延续同一命名与注释风格，不要另起一套 `v3` 风格文件。

### 2. 声明式状态迁移表
- **Reference:** `src/lib/interview-v2/stateMachine.ts`
- **Why:** 已用 `Record<Status, Status[]>` 维护合法迁移，适合作为 transition service 的规则源。
- **Reuse Rule:** 保留迁移表作为单一规则定义；新增 transition executor 时读取这里，而不是在 API 路由里重新 hardcode。

### 3. 计划创建与运行时画像恢复
- **Reference:** `src/lib/interview-v2/planService.ts`
- **Why:** 已集中承载计划创建、阶段草案、画像拼装、列表聚合与运行态恢复。
- **Reuse Rule:** 画像快照真源与运行时装配应继续收敛到这里或其相邻模块，不要散到页面组件里。

### 4. 房间身份规则
- **Reference:** `src/lib/interview/config.ts`
- **Why:** `buildInterviewRoomKey()` 已提供稳定的房间身份生成模式。
- **Reuse Rule:** 继续复用 `roomKey` 作为房间身份；但将业务真态从浏览器缓存中剥离，只保留 UI 态缓存。

### 5. 结构化评审与摘要落库
- **Reference:** `src/lib/interview-v2/reviewerPanel.ts`, `src/lib/interview-v2/lifecycle.ts`
- **Why:** 已能把阶段评审与生命周期结论写入 `InterviewAgentRun` 和 `planningSummary.orchestration`。
- **Reuse Rule:** 扩展聊天主链观测时沿用 `InterviewAgentRun` 摘要落库形式，不要再创建新的散装日志表。

## Migration Hotspots

### setup -> interview
- `src/app/setup/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/interview/page.tsx`
- `src/lib/interview/config.ts`
- `src/lib/interview-v2/planService.ts`

### interview -> report
- `src/app/interview/page.tsx`
- `src/app/api/sessions/[id]/route.ts`
- `src/app/api/reports/generate/route.ts`
- `src/app/report/page.tsx`
- `src/lib/interview-v2/reviewerPanel.ts`

### 状态机与观测
- `src/app/api/chat/route.ts`
- `src/lib/interview-v2/codingSessionService.ts`
- `src/lib/interview-v2/lifecycle.ts`
- `prisma/schema.prisma`

## Anti-Patterns To Avoid

### 1. 页面直接推演业务状态
- **Seen in:** `src/app/interview/page.tsx`, `src/lib/interview/config.ts`
- **Avoid:** 不再让前端缓存承担 `currentStageStatus/currentRoundStatus` 这类真态。

### 2. 报告生成接口顺带状态收口
- **Seen in:** `src/app/api/reports/generate/route.ts`
- **Avoid:** 报告页只读或做显式触发，不继续承担隐式编排副作用。

### 3. 绕开状态机直接 update DB
- **Seen in:** `chat/route.ts`, `reviewerPanel.ts`, `sessions/[id]/route.ts`, `lifecycle.ts`
- **Avoid:** 后续计划必须统一收敛到 transition service，不再散落多处 updateMany。

### 4. 浏览器缓存承担长期主链真相
- **Seen in:** `reportHistory:*`, `interviewHistory:*`, `InterviewProfileState`
- **Avoid:** 浏览器缓存仅保留 UI 辅助恢复，不再作为业务链唯一兜底。

## Planning Implications

- Phase 1 的 plan 应优先围绕上述参考文件展开，而不是新建大量平行目录。
- 计划必须显式区分“复用资产”与“淘汰补丁”；如果一项任务无法指出它要保留或移除什么，说明任务还不够具体。
- 所有计划至少要把 `domain.ts / stateMachine.ts / planService.ts / config.ts / schema.prisma` 纳入 `read_first`。
