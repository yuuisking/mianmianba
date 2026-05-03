# Tasks

- [x] Task 1: 完善真实数据落库
  - [x] SubTask 1.1: 检查并修改 `src/app/api/reports/generate/route.ts`，确保生成的报告和对应的面试会话记录（Session）真实保存到了 Prisma 数据库中。
  - [x] SubTask 1.2: 确保数据库记录关联到了当前登录的用户 (`userId`)。

- [x] Task 2: 移除控制台的 Mock 数据
  - [x] SubTask 2.1: 检查并修改 `/api/reviews` 接口（或新建 `/api/sessions/recent`），确保能返回当前用户真实的最近面试记录。
  - [x] SubTask 2.2: 修改 `src/app/dashboard/page.tsx`，发起真实网络请求获取列表，并渲染真实的“最近训练记录”。如果无记录，展示“暂无面试记录”的空状态。

- [x] Task 3: 为简历解析添加进度条
  - [x] SubTask 3.1: 在 `src/app/setup/page.tsx` 的加载状态中增加进度条组件。
  - [x] SubTask 3.2: 使用 `setInterval` 等方式实现百分比平滑增长的动画效果（如最高平滑增长到 90%-95%），当 `/api/parse` 请求成功后迅速置为 100% 并跳转。

- [x] Task 4: 为报告生成添加进度条
  - [x] SubTask 4.1: 在 `src/app/report/page.tsx` 的加载状态中增加进度条组件。
  - [x] SubTask 4.2: 使用 `setInterval` 等方式实现百分比平滑增长的动画效果，当 `/api/reports/generate` 请求成功后迅速置为 100% 并展示报告结果。

# Task Dependencies
- [Task 1] 独立执行
- [Task 2] depends on [Task 1]
- [Task 3] 独立执行
- [Task 4] 独立执行