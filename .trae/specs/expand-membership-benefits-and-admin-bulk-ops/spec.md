# 会员权益与 Admin 批量管理扩展 Spec

## Why
当前系统已经具备基础会员字段和用户后台，但“会员权益”还没有真正落成产品能力，admin 也缺少批量运营操作，无法支撑后续用户增长和会员管理。与此同时，首页和认证入口还有少量视觉细节不够自然，需要在继续做会员/admin 能力时顺手收敛到更舒服、更有品牌感但不过度设计的状态。

## What Changes
- 新增会员权益体系，明确不同会员类型对应的核心权益与前后台展示方式。
- 新增 admin 批量管理能力，支持批量调整用户会员状态、账号状态或角色。
- 在 admin 后台补齐会员权益视图，帮助管理员快速理解“当前用户拥有哪些权益”。
- 调整首页主标题文案与排版，使其更自然、更贴近产品介绍语气。
- 在首页四个功能卡片上引入更克制的品牌色点缀，避免当前黑白过于单调。
- 重新设计“登录”“注册”按钮，使其更符合 `brand-guidelines`，同时保持简洁克制。

## Impact
- Affected specs: `refactor-auth-and-user-management`、`refine-membership-admin-and-minimal-ui`
- Affected code: `src/app/home/page.tsx`、`src/app/globals.css`、`src/components/layout/Header.tsx`、`src/components/auth/AuthForm.tsx`、`src/app/admin/users/page.tsx`、`src/app/api/admin/users/route.ts`、`src/lib/userPresentation.ts`、`prisma/schema.prisma`

## ADDED Requirements
### Requirement: Membership Benefits Model
系统 SHALL 为会员类型定义清晰的权益模型，并在前台与后台都能看到当前会员可享有的核心权益。

#### Scenario: 用户查看自己的会员权益
- **WHEN** 已登录用户进入个人详情页或相关会员展示区域
- **THEN** 系统展示当前会员身份与对应权益摘要
- **AND** 免费用户与 VIP 用户的权益差异清晰可见

#### Scenario: 管理员查看会员权益
- **WHEN** admin 用户进入用户管理页
- **THEN** 系统可查看某个用户的会员类型、到期时间与权益摘要

### Requirement: Membership Benefit Tiers
系统 SHALL 至少支持免费用户、月度 VIP、季度 VIP、年度 VIP、终身 VIP 的权益分层，并允许后续继续扩展。

#### Scenario: 系统识别会员层级
- **WHEN** 用户会员类型发生变化
- **THEN** 系统根据会员类型匹配对应权益
- **AND** 前后台展示结果保持一致

### Requirement: Admin Bulk Operations
系统 SHALL 提供 admin 批量管理能力，用于对多个用户执行统一的运营动作。

#### Scenario: 管理员批量调整会员类型
- **WHEN** admin 在用户管理页选中多个用户并发起批量操作
- **THEN** 系统支持统一修改会员类型与到期时间
- **AND** 操作结果对每个用户分别返回成功或失败状态

#### Scenario: 管理员批量调整账号状态
- **WHEN** admin 在用户管理页选中多个用户并执行启用或停用
- **THEN** 系统批量更新用户账号状态
- **AND** 不应误伤未选中用户

### Requirement: Admin Bulk Operation Feedback
系统 SHALL 为批量操作提供明确、简洁的反馈，包括成功数量、失败数量与失败原因摘要。

#### Scenario: 批量操作完成
- **WHEN** admin 提交批量操作
- **THEN** 页面反馈本次操作的结果摘要
- **AND** 用户列表及时刷新为最新状态

### Requirement: Membership Benefit Preview In Admin
系统 SHALL 在 admin 用户详情编辑区域展示当前会员权益预览，帮助管理员理解不同会员类型对应的实际效果。

#### Scenario: 管理员切换会员类型
- **WHEN** admin 修改某个用户的会员类型或到期时间
- **THEN** 系统即时显示该用户前台会看到的会员标签和权益摘要

## MODIFIED Requirements
### Requirement: Home Hero Copy
系统 SHALL 调整首页主标题文案和排版，让文案更像自然的产品介绍语，而不是生硬的机制说明。

#### Scenario: 用户浏览首页首屏
- **WHEN** 用户访问 `/home`
- **THEN** 主标题文案采用更自然的一句话表达，例如“你好，开发者，这是……”
- **AND** 标题排版不应显得过于僵硬或平铺压迫

### Requirement: Home Feature Card Styling
系统 SHALL 为首页四个功能卡片加入克制的品牌色点缀，避免纯黑白导致整体过于单调。

#### Scenario: 用户浏览首页卡片
- **WHEN** 用户查看四个功能模块卡片
- **THEN** 卡片在边框、角标、背景或局部点缀上使用 `brand-guidelines` 中的品牌色
- **AND** 保持整体简洁，不出现夸张渐变、大面积高饱和块面或花哨装饰

### Requirement: Auth Button Styling
系统 SHALL 重新设计“登录”“注册”按钮，使其更符合 `brand-guidelines`，同时保持简洁、易读、舒适。

#### Scenario: 用户查看认证入口
- **WHEN** 用户查看头部或认证弹层中的登录/注册按钮
- **THEN** 按钮视觉层级清晰、品牌感明确
- **AND** 不出现生硬、厚重或廉价感强的按钮样式

## REMOVED Requirements
### Requirement: Minimal Monochrome Home Cards
**Reason**: 当前过于黑白一体的卡片虽然简洁，但缺少适度品牌识别度，整体观感偏单薄。
**Migration**: 保留极简结构，改为在局部引入克制的品牌色点缀，而不是回退到复杂装饰方案。
