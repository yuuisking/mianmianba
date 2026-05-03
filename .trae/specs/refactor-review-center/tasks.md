# Tasks

- [x] Task 1: Dashboard (控制台) 减负
  - [x] SubTask 1.1: 修改 `src/app/dashboard/page.tsx`。将 `fetchSessions` 的 limit 参数改为 3（仅展示最近 3 条记录）。
  - [x] SubTask 1.2: 移除底部的分页控件（Pagination）。
  - [x] SubTask 1.3: 在“训练记录”列表的底部，新增一个宽按钮/链接：“查看完整历史记录与错题本 ➔”，点击跳转至 `/review`。

- [x] Task 2: 复盘中心接管全量历史记录
  - [x] SubTask 2.1: 将 Dashboard 原本的全量拉取记录逻辑（包括分页 `page`、搜索 `search`、删除功能 `deleteSession`）完整迁移到 `src/app/review/page.tsx`。
  - [x] SubTask 2.2: 在 `/review` 页面下半部分，使用 `brand-guidelines` 风格渲染“历史面试记录”列表及分页控件。

- [x] Task 3: 错题本 (Error Book) 动态提取逻辑
  - [x] SubTask 3.1: 在 `/review` 中，基于拉取到的 `sessions` 数据，解析每条记录的 `report.dimensions` (JSON字符串) 和 `report.risks` (JSON字符串)。
  - [x] SubTask 3.2: 过滤出评分低于 7 分的维度（或高频出现的 Risk），聚合成一个 `weaknesses` 数组（去重或按最近出现排序），展示在“错题本 (高频薄弱维度)”板块。
  - [x] SubTask 3.3: 如果没有薄弱项，展示友好的空状态提示（“太棒了！近期面试没有发现明显短板”）。

- [x] Task 4: 错题本 -> 专项训练 闭环打通
  - [x] SubTask 4.1: 修改“错题本”卡片右侧的“专项突破”按钮。
  - [x] SubTask 4.2: 点击时，执行 `router.push(\`/interview?mode=targeted&topic=\${encodeURIComponent(weakness.name)}&desc=\${encodeURIComponent(weakness.desc)}\`)`，直接携带该薄弱点名称和描述进入专项训练房间。

# Task Dependencies
- [Task 1] 独立执行
- [Task 2] 独立执行
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]