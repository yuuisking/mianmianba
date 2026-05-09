# Tasks

- [x] Task 1: 收敛首页信息结构与文案
  - [x] SubTask 1.1: 移除首页现有的 Visitor Preview、公开入口、动作级鉴权、步骤说明等所有解释型区块。
  - [x] SubTask 1.2: 将首页重构为极简产品介绍页，只保留产品定位与四个功能模块入口。
  - [x] SubTask 1.3: 确认四个入口分别跳转到模拟面试、专项训练、学习中心、复盘中心。

- [x] Task 2: 简化顶部导航与认证入口
  - [x] SubTask 2.1: 移除顶部导航中的“工作台”菜单项。
  - [x] SubTask 2.2: 优化“登录”“注册体验”按钮样式，确保简洁、统一、舒适。
  - [x] SubTask 2.3: 保持 `brand-guidelines` 基础下的极简风格，避免过度设计。

- [x] Task 3: 收敛头像区交互与身份展示
  - [x] SubTask 3.1: 调整头像区信息，只保留一个名称展示。
  - [x] SubTask 3.2: 将“查看个人详情”和“退出登录”改为 hover 后展示。
  - [x] SubTask 3.3: 为 VIP 用户在头像旁展示“尊贵的VIP用户”，并保持视觉克制。

- [x] Task 4: 完善复盘中心未登录态
  - [x] SubTask 4.1: 为未登录用户提供少量 demo 复盘内容，体现页面用途。
  - [x] SubTask 4.2: 在 demo 下方补充“登录体验完整功能”提醒。
  - [x] SubTask 4.3: 确保未登录态页面结构与已登录态风格一致，但不过度堆叠说明文案。

- [x] Task 5: 完善会员体系前后台展示
  - [x] SubTask 5.1: 梳理前台会员展示规则，统一头像区、个人详情页等位置的会员标识。
  - [x] SubTask 5.2: 补齐 admin 后台对会员类型、到期时间和状态展示的完整性。
  - [x] SubTask 5.3: 明确会员展示与管理在前后台的一致性，不出现信息冲突。

- [x] Task 6: 完善 admin 后台完整性
  - [x] SubTask 6.1: 在现有用户管理基础上补齐更完整的会员运营管理体验。
  - [x] SubTask 6.2: 收敛后台页面层级与视觉，确保简洁、清晰、可快速操作。
  - [x] SubTask 6.3: 确认后台入口、关键操作与状态反馈都足够明确但不冗余。

- [x] Task 7: 验证极简体验与会员/admin 方案
  - [x] SubTask 7.1: 验证首页已删除所有不必要解释文案，并保留四个功能入口。
  - [x] SubTask 7.2: 验证导航、按钮、头像 hover、VIP 展示、复盘中心未登录态是否符合“简单简洁”要求。
  - [x] SubTask 7.3: 验证会员体系与 admin 后台的关键展示和管理链路可用。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2
- Task 5 depends on Task 3
- Task 6 depends on Task 5
- Task 7 depends on Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
