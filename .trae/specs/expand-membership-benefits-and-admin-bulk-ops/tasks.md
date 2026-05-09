# Tasks

- [x] Task 1: 设计会员权益模型
  - [x] SubTask 1.1: 明确免费用户、月度 VIP、季度 VIP、年度 VIP、终身 VIP 的权益差异。
  - [x] SubTask 1.2: 明确权益在前台和 admin 后台的展示结构，避免出现前后台信息不一致。
  - [x] SubTask 1.3: 明确会员到期后的权益处理规则与展示降级方式。

- [x] Task 2: 完善会员权益展示
  - [x] SubTask 2.1: 在用户侧页面补充会员身份与权益摘要展示。
  - [x] SubTask 2.2: 在 admin 用户详情区域补充会员权益预览。
  - [x] SubTask 2.3: 确认会员标签、权益摘要、到期信息的文案风格保持统一且简洁。

- [x] Task 3: 设计并补齐 admin 批量管理
  - [x] SubTask 3.1: 设计用户批量选择交互，明确可勾选、全选和取消选择规则。
  - [x] SubTask 3.2: 定义批量操作范围，至少覆盖会员类型、会员到期时间、账号状态，必要时再覆盖角色。
  - [x] SubTask 3.3: 设计批量操作完成后的反馈机制，包含成功数、失败数和失败原因摘要。

- [x] Task 4: 微调首页首屏文案与排版
  - [x] SubTask 4.1: 将首页主标题改成更自然的一句话表达，例如“你好，开发者，这是……”
  - [x] SubTask 4.2: 调整标题排版，使其不显得生硬或过度平铺。
  - [x] SubTask 4.3: 保持首页整体信息量克制，不重新引入机制说明文案。

- [x] Task 5: 微调首页卡片视觉
  - [x] SubTask 5.1: 基于 `brand-guidelines` 为四个卡片设计克制的品牌色点缀。
  - [x] SubTask 5.2: 控制色彩使用比例，避免过度设计或喧宾夺主。
  - [x] SubTask 5.3: 确保四个卡片之间在色彩与层级上统一且有区分。

- [x] Task 6: 重设计登录/注册按钮
  - [x] SubTask 6.1: 基于 `brand-guidelines` 重做登录与注册按钮样式。
  - [x] SubTask 6.2: 统一头部按钮与认证弹层内按钮的视觉语言。
  - [x] SubTask 6.3: 确保按钮在默认、hover、focus、disabled 状态下都足够自然和清晰。

- [x] Task 7: 验证会员权益、批量管理与样式调整
  - [x] SubTask 7.1: 验证会员权益前后台展示一致，且到期逻辑明确。
  - [x] SubTask 7.2: 验证 admin 批量管理链路可用，批量反馈清晰。
  - [x] SubTask 7.3: 验证首页标题、卡片和登录/注册按钮符合“简单简洁 + 品牌感”的目标。

- [x] Task 8: 收敛残余机制说明文案
  - [x] SubTask 8.1: 清理 `setup` 页面中“匿名浏览”“自动续接当前动作”等解释型文案。
  - [x] SubTask 8.2: 清理 `profile` 页面中“登录并继续当前动作”等机制说明，保留最小必要引导。
  - [x] SubTask 8.3: 清理 `dashboard` 页面中 `Visitor Workspace` 与匿名浏览说明，避免重新引入旧的机制表达。
  - [x] SubTask 8.4: 完成改动后重新验证 checklist 第 9 项，确认全站仍保持简洁风格。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1
- Task 5 depends on Task 4
- Task 6 depends on Task 5
- Task 7 depends on Task 2, Task 3, Task 4, Task 5, Task 6
- Task 8 depends on Task 7
