# 微信扫码登录（网站应用）Spec

## Why
当前系统仅支持邮箱+密码登录，不利于在国内场景推广与转化。引入微信扫码登录可以显著降低注册/登录门槛，并提升传播效率。

## What Changes
- 新增“微信扫码登录（网站应用）”能力（如具备资质则启用），包含回调处理与自动创建用户、登录。
- 在不破坏现有邮箱密码登录的前提下，为 User 增加微信身份字段（wechatOpenId / wechatUnionId 可选）。
- 登录页增加“微信扫码登录”入口；当未配置微信资质/环境变量时隐藏或展示不可用提示。
- 增加安全控制：OAuth state 校验、防 CSRF、回调域校验、基础审计记录（最小实现）。

## Impact
- Affected specs: `integrate-deepseek-auth`（认证体系延展）
- Affected code:
  - [authOptions.ts](file:///Users/didi/workplace/project/resumer/src/lib/authOptions.ts)
  - [login/page.tsx](file:///Users/didi/workplace/project/resumer/src/app/login/page.tsx)
  - [schema.prisma](file:///Users/didi/workplace/project/resumer/prisma/schema.prisma)
  - 新增：`src/app/api/auth/wechat/*`（start/callback）
  - 新增：`src/lib/auth/wechat.ts`（OAuth 客户端封装）

## ADDED Requirements
### Requirement: 微信扫码登录（网站应用）
系统 SHALL 支持微信扫码登录（微信开放平台“网站应用”）。当平台具备资质与配置后，用户可扫码登录；如未配置资质/环境变量，前端不展示入口或展示“暂不可用”。

#### Scenario: Success case
- **WHEN** 用户点击“微信扫码登录”并完成扫码确认
- **THEN** 系统创建或找到对应用户并完成登录，跳转到 /dashboard

### Requirement: 身份字段与账号绑定
系统 SHALL 支持用户身份字段（email/wechatOpenId/wechatUnionId）在同一用户记录上绑定，以便后续可从任意方式登录同一账号。

#### Scenario: Success case
- **WHEN** 用户先使用邮箱密码登录，后使用微信扫码登录并完成绑定（策略：管理员绑定或后续提供自助绑定入口）
- **THEN** 两种登录方式进入同一用户数据空间（同一个 user.id）

## MODIFIED Requirements
### Requirement: 邮箱密码登录
系统 SHALL 保持现有邮箱+密码登录能力不变；同时允许用户在不影响旧用户登录的前提下引入新身份字段。

## REMOVED Requirements
无

## 资质与准备清单（给个体开发者）
### 微信扫码登录（PC 网页/网站应用）
微信“扫码登录（网站应用）”通常要求微信开放平台创建 **网站应用** 并完成主体资质/验证。个体开发者在很多情况下会遇到资质限制。

你需要准备：
- 可公网访问的域名（建议 HTTPS；通常需要备案）
- 登录回调域名配置（微信开放平台配置“授权回调域”）
- 微信开放平台 AppID / AppSecret（网站应用）

如果你没有公司/主体资质但仍坚持微信体系，通常可选路径是：
- **微信小程序登录**（个人可注册小程序；用小程序承载登录，再把登录态/绑定信息同步到 Web 端）
- **找服务商/主体代申请网站应用**（成本更高，但能保留“扫码登录”的 Web 体验）
