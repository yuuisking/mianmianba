# 会员体系、Admin 后台与极简界面优化 Spec

## Why
上一轮已经完成认证与用户管理基础重构，但会员体系仍然偏基础，admin 后台也只具备最小管理能力。与此同时，首页、导航、头像区和未登录页面的文案与交互过重，不符合“简单、简洁、不花哨”的产品体验目标，需要继续做一次系统性收敛。

## What Changes
- 完善会员体系，补齐会员标识、会员展示、会员状态在前后台的一致呈现。
- 完善 admin 后台，围绕用户与会员运营补齐更完整的管理能力。
- 重构首页为极简产品介绍页，只保留产品定位与四个功能模块入口。
- **BREAKING** 移除首页当前所有 Visitor Preview、公开入口说明、动作级鉴权说明、步骤说明等解释性文案。
- **BREAKING** 移除顶部导航中的“工作台”菜单项。
- 优化登录/注册按钮样式，统一为简洁、克制、清晰的品牌化按钮。
- 重构复盘中心未登录态，改为展示少量 demo 内容与“登录体验完整功能”提醒。
- 收敛头像区交互：只展示一个名字；鼠标 hover 后再出现“查看个人详情”和“退出登录”；VIP 用户在头像旁展示“尊贵的VIP用户”。
- 全部界面视觉继续遵循 `brand-guidelines`，但以极简、低装饰、低说明负担为第一原则。

## Impact
- Affected specs: `refactor-auth-and-user-management`
- Affected code: `src/app/home`、`src/components/layout/Header.tsx`、`src/components/auth/AuthForm.tsx`、`src/app/review/page.tsx`、`src/app/admin/users`、`src/app/me`、`src/lib/userPresentation.ts`、相关会员展示逻辑与 admin 用户管理逻辑

## ADDED Requirements
### Requirement: Minimal Product Home
系统 SHALL 将 `/home` 重构为极简产品介绍页，只保留产品定位介绍与四个功能模块入口，不再向用户解释匿名浏览、公开入口或动作级鉴权机制。

#### Scenario: 用户访问首页
- **WHEN** 用户访问 `/home`
- **THEN** 页面只展示产品定位介绍
- **AND** 展示四个模块入口：模拟面试、专项训练、学习中心、复盘中心
- **AND** 点击模块入口可跳转到对应页面

### Requirement: Simplified Home Copy
系统 SHALL 移除首页中所有“Visitor Preview”“匿名可先浏览框架”“公开入口”“动作级鉴权”“品牌化体验”“步骤说明”等解释型内容，避免首页信息噪音。

#### Scenario: 首页内容收敛
- **WHEN** 用户浏览首页首屏与模块区
- **THEN** 页面不展示技术机制说明、访问机制说明或流程步骤说明
- **AND** 页面文案保持克制、简洁、产品导向

### Requirement: Membership Display Consistency
系统 SHALL 在用户前台与 admin 后台统一展示会员状态，并为 VIP 用户提供明确但克制的身份标识。

#### Scenario: VIP 用户查看顶部头像区
- **WHEN** 已登录 VIP 用户浏览顶部头像区域
- **THEN** 系统在头像旁展示“尊贵的VIP用户”
- **AND** 不使用夸张或花哨的视觉效果

#### Scenario: 管理员查看用户会员状态
- **WHEN** admin 用户进入后台用户管理
- **THEN** 系统可查看和管理用户会员类型、到期时间与当前展示状态

### Requirement: Minimal Admin Completion
系统 SHALL 在现有 admin 用户后台基础上继续补齐会员运营所需的核心管理能力，但保持页面结构简洁直观，不做复杂堆砌。

#### Scenario: 管理员管理会员信息
- **WHEN** admin 用户进入用户管理页
- **THEN** 系统可完成用户检索、会员状态查看、会员类型修改、到期时间修改与关键状态确认
- **AND** 页面信息层级清晰，不出现过多装饰性模块

### Requirement: Minimal Review Demo State
系统 SHALL 为复盘中心未登录态提供少量 demo 内容，用于说明页面用途，并提示登录后可体验完整功能。

#### Scenario: 未登录用户访问复盘中心
- **WHEN** 未登录用户访问 `/review`
- **THEN** 系统展示 demo 复盘内容或示例卡片
- **AND** 页面明确提示“登录体验完整功能”

### Requirement: Hover-Based Avatar Actions
系统 SHALL 将头像区的个人详情与退出登录操作改为 hover 后展示，默认状态仅保留必要信息。

#### Scenario: 已登录用户查看顶部头像区
- **WHEN** 用户未 hover 头像区
- **THEN** 系统只展示一个名称与必要身份信息
- **AND** 不直接展示“退出”按钮

#### Scenario: 用户 hover 头像区
- **WHEN** 用户将鼠标悬停在头像区
- **THEN** 系统展示“查看个人详情”和“退出登录”操作

## MODIFIED Requirements
### Requirement: Header Navigation
系统 SHALL 简化顶部导航，移除“工作台”菜单项，仅保留真正有价值的产品导航与头像区操作。

#### Scenario: 用户浏览顶部导航
- **WHEN** 用户查看全站头部导航
- **THEN** 系统不再展示“工作台”菜单项
- **AND** 导航内容保持简洁，避免冗余入口

### Requirement: Auth Entry Buttons
系统 SHALL 优化“登录”和“注册体验”按钮样式，使其更加简洁、统一、舒适，并符合 `brand-guidelines` 的克制表达。

#### Scenario: 用户查看认证按钮
- **WHEN** 用户查看首页或顶部的登录/注册按钮
- **THEN** 按钮视觉更加简洁、易读、统一
- **AND** 不使用明显过度设计的阴影、描边或装饰

### Requirement: Profile Identity Display
系统 SHALL 收敛头像区与个人资料相关名称展示，避免重复呈现同一用户名称。

#### Scenario: 用户已登录
- **WHEN** 顶部头像区展示当前用户信息
- **THEN** 只展示一个名字
- **AND** 不重复出现同一用户名称或邮箱前缀

## REMOVED Requirements
### Requirement: Explanatory Home Mechanism Blocks
**Reason**: 首页不应承担产品访问机制教育职责，这类解释会显著增加首屏噪音，削弱产品感。
**Migration**: 删除相关说明模块，仅保留产品介绍与四个模块入口；登录机制继续保留在真实交互中生效，不再以前台说明文案形式出现。
