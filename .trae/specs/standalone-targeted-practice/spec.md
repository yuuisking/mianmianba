# 独立专项训练菜单 (Standalone Targeted Practice) Spec

## Why
目前专项训练的能力已经具备（AI Prompt 和 面试房间 UI 已隔离），但入口仅仅依赖于“面试报告的下一步计划”，导致用户无法主动发起特定技能（如：Redis、Vue3、并发编程）的练习。我们需要明确定义出“综合模拟面试（基于简历）”与“单点专项突破（基于自定义输入）”的边界。增加独立的“专项训练”入口，不仅能满足用户考前冲刺、定点爆破的需求，还能极大扩展产品的使用场景。

## What Changes
- **导航栏分流**：在顶部导航栏 (`src/components/layout/Header.tsx`) 中新增 `专项训练` 的入口，与 `发起面试` (综合面试) 并列。
- **新增独立页面**：创建 `/practice` (专项训练发起页)。页面提供简洁高级的表单输入（基于 `brand-guidelines`），允许用户输入：
  - **面试方向**（如：前端开发、Java 工程师）
  - **训练主题**（如：React Hooks 性能优化、JVM 垃圾回收）
  - **具体训练目标/描述**（可选，如：重点考察底层原理）
- **路由对接**：`/practice` 页面提交后，直接跳转到已有的 `/interview?mode=targeted&topic=xxx&desc=xxx` 房间，复用我们上一期做好的专属 Prompt 能力。

## Impact
- Affected specs: 顶部导航栏、专项训练发起页。
- Affected code:
  - `src/components/layout/Header.tsx`
  - `src/app/practice/page.tsx` (New)

## ADDED Requirements
### Requirement: 自定义专项训练入口
The system SHALL provide a dedicated entry point in the main navigation for "Targeted Practice". Users SHALL be able to freely define the target role, topic, and description, and start a targeted interview session immediately without uploading a resume.

#### Scenario: Success case
- **WHEN** user clicks "专项训练" in the navigation bar.
- **THEN** the system displays a clean form asking for "面试方向", "训练主题", and "具体要求".
- **WHEN** user inputs "前端", "Vue3 响应式原理", and "考察 Proxy 底层实现" and clicks "开始训练".
- **THEN** the system navigates to the interview room in `targeted` mode with the exact topic and description, and the AI begins the specific training session.