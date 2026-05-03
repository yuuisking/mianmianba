# Tasks

- [ ] Task 1: 扩展用户数据模型以支持微信身份
  - [ ] SubTask 1.1: 更新 Prisma User 模型：新增 `wechatOpenId`、`wechatUnionId`（可选）字段，并为 openid/unionid 建立合理的唯一约束；保持现有邮箱密码登录兼容。
  - [ ] SubTask 1.2: 执行数据库迁移并验证旧用户邮箱密码登录不受影响。

- [ ] Task 2: 实现微信扫码登录（网站应用）
  - [ ] SubTask 2.1: 新增微信 OAuth 客户端封装（获取 access_token、openid、unionid、用户信息）。
  - [ ] SubTask 2.2: 新增微信登录路由（例如 `/api/auth/wechat/start` 生成授权链接、`/api/auth/wechat/callback` 处理 code + state 校验）。
  - [ ] SubTask 2.3: 与 NextAuth 集成：将 openid 映射到 user（自动创建或关联），并完成登录态写入。
  - [ ] SubTask 2.4: 登录页新增“微信扫码登录”入口；当环境变量未配置时隐藏或禁用。

- [ ] Task 3: 安全与可运营性
  - [ ] SubTask 3.1: 增加 OAuth state 校验与一次性使用策略，防 CSRF。
  - [ ] SubTask 3.2: 增加运维配置项与文档（env vars、回调域配置说明、常见报错排查）。

- [ ] Task 4: 验证与回归
  - [ ] SubTask 4.1: 回归测试邮箱密码注册/登录流程。
  - [ ] SubTask 4.2: 在具备微信资质与回调配置后，测试扫码登录全链路。

# Task Dependencies
- Task 2 depends on Task 1
- Task 4 depends on Task 2
