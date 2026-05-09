# 认证与用户管理系统重构 Spec

## Why
当前系统只有基础的邮箱密码登录与会话隔离，缺少成熟产品必须具备的访问策略、用户分层、后台管理、会员信息与运维安全基线。与此同时，首页与功能页的访问体验也不符合产品预期，需要系统性重构认证与用户管理能力。

## What Changes
- 将站点默认入口调整为 `/home`，作为公开可访问的产品首页/控制台入口。
- 重构访问策略：未登录用户可以浏览站点与页面框架，但在触发需要身份的具体功能时才校验登录状态，并弹出登录/注册界面。
- 扩展用户模型，补齐角色、账号状态、会员/VIP 类型、到期时间、头像、昵称等基础字段。
- 新增用户详情页，支持用户从头像入口查看与维护个人基础信息。
- 新增仅 `admin` 可见的用户后台管理系统，统一管理用户、角色、会员状态、账号启停等。
- 为登录、注册、用户资料页与后台管理页定义统一品牌化界面规范，视觉设计遵循 `brand-guidelines`。
- 追加运维安全基线：规划数据库自动备份与密码轮换机制，避免认证与用户主数据单点风险。

## Impact
- Affected specs: `integrate-deepseek-auth`、`add-wechat-and-sms-login`
- Affected code: `src/app/login`、`src/app/page.tsx`、`src/app/home`、`src/app/practice`、`src/components/layout/Header.tsx`、`src/components/providers/AuthProvider.tsx`、`src/lib/authOptions.ts`、`src/app/api/auth`、`prisma/schema.prisma`、未来新增 `src/app/admin/users`、未来新增 `src/app/profile`

## ADDED Requirements
### Requirement: Public Home Entry
系统 SHALL 提供 `/home` 作为网站默认公开入口，用户无需登录即可访问首页内容与全站基础导航。

#### Scenario: 未登录用户访问首页
- **WHEN** 未登录用户访问 `/home`
- **THEN** 系统展示首页内容、顶部导航和功能入口
- **AND** 不强制重定向到 `/login`

### Requirement: Deferred Authentication Gating
系统 SHALL 仅在用户触发需要身份才能执行的具体功能时校验登录状态；若用户未登录，系统需以弹窗或抽屉方式展示登录/注册，而不是在页面首次访问时强制阻断。

#### Scenario: 未登录用户进入功能页但尚未执行动作
- **WHEN** 未登录用户直接访问如 `/practice`、`/interview`、`/learning` 等功能页面
- **THEN** 系统允许其查看页面框架、介绍信息与非私有内容
- **AND** 不立即报错或强制跳转登录页

#### Scenario: 未登录用户触发受保护动作
- **WHEN** 未登录用户点击“开始训练”“保存记录”“生成报告”“进入个人数据”等受保护动作
- **THEN** 系统弹出登录/注册界面
- **AND** 登录成功后返回原页面并继续用户原始操作

### Requirement: User Domain Model
系统 SHALL 为用户建立可运营的数据模型，至少包含角色、账号状态、会员类型、会员到期时间、昵称、头像、最近登录时间与创建更新时间等字段。

#### Scenario: 创建普通用户
- **WHEN** 用户完成注册
- **THEN** 系统创建默认角色为普通用户的账号
- **AND** 会员状态默认为非 VIP
- **AND** 账号状态默认为启用

#### Scenario: 更新会员信息
- **WHEN** 管理员为用户设置会员类型与到期时间
- **THEN** 系统保存新的会员信息
- **AND** 前台能够基于最新状态展示用户权益标识

### Requirement: Role-Based Admin Visibility
系统 SHALL 提供 `admin` 角色，并确保后台管理入口、后台页面与后台接口仅对 `admin` 用户可见和可用。

#### Scenario: 普通用户访问后台
- **WHEN** 非 `admin` 用户访问后台管理页面或接口
- **THEN** 系统拒绝访问
- **AND** 不展示后台入口

#### Scenario: 管理员管理用户
- **WHEN** `admin` 用户进入后台用户管理页面
- **THEN** 系统展示用户列表、筛选、详情、角色、状态、会员信息与更新时间

### Requirement: User Profile Page
系统 SHALL 提供用户详情页，用户可通过头像入口进入，并查看自己的基础资料、会员信息与账号状态。

#### Scenario: 用户查看个人详情
- **WHEN** 已登录用户点击头像
- **THEN** 系统打开用户详情页
- **AND** 展示昵称、邮箱、头像、会员类型、到期时间、账号创建时间等基础信息

### Requirement: Brand-Guided Auth and User Interfaces
系统 SHALL 按 `brand-guidelines` 统一登录/注册弹层、用户详情页与后台管理界面的视觉风格，确保品牌一致性。

#### Scenario: 品牌化界面呈现
- **WHEN** 用户打开登录注册弹层、个人详情页或后台用户页
- **THEN** 页面在色彩、排版、层级与组件风格上符合 `brand-guidelines`

### Requirement: Backup and Credential Rotation Baseline
系统 SHALL 为用户主数据与认证配置建立自动备份与密码轮换基线，至少定义 PostgreSQL 自动备份计划、恢复检查方式、数据库密码轮换流程与影响范围。

#### Scenario: 运维安全基线落地
- **WHEN** 系统进入生产运维阶段
- **THEN** 运维方案能够说明备份频率、保留周期、恢复验证方式与密码轮换步骤
- **AND** 不得破坏当前应用可用性

## MODIFIED Requirements
### Requirement: Authentication Entry Behavior
系统 SHALL 将认证入口从“默认首屏阻断式登录”改为“按动作触发式登录”，并保留独立 `/login` 页面作为显式登录入口与兜底入口。

#### Scenario: 用户主动进入登录页
- **WHEN** 用户直接访问 `/login`
- **THEN** 系统仍展示完整登录/注册界面
- **AND** 登录成功后跳转回来源页或 `/home`

### Requirement: Default Site Route
系统 SHALL 将默认首页从登录页切换为 `/home`，并保证首页可作为产品外部访问入口。

#### Scenario: 用户访问根路径
- **WHEN** 用户访问 `/`
- **THEN** 系统跳转至 `/home` 或直接呈现与 `/home` 等价的首页内容

## REMOVED Requirements
### Requirement: Login-First Site Access
**Reason**: 现有“进入系统即先登录”的访问模式会阻断用户浏览产品，不符合新的首页与认证策略。
**Migration**: 将原先依赖页面级强拦截的逻辑迁移为动作级鉴权，并保留 `/login` 作为显式认证入口。
