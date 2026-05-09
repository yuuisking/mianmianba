# Admin 会员管理入口与测试账号 Spec

## Why
当前会员管理主要依赖直接访问后台 URL，管理员进入路径不直观，也不符合“只有 admin 才能看到并进入管理入口”的产品预期。为了便于你直接测试，还需要准备一个明确可用的 admin 测试账号。

## What Changes
- 将会员管理入口调整为管理员专属菜单项，由登录态 `admin` 用户在导航中可见并进入。
- 普通用户与未登录用户不显示该菜单入口，也不能通过菜单接触后台管理能力。
- 保留后台页面与接口的管理员鉴权，避免仅靠前端隐藏菜单。
- 增加或确保一个可用于联调测试的 admin 账号：`admin@163.com` / `yy1741..`

## Impact
- Affected specs: 后台入口可见性、管理员导航、会员管理测试准备
- Affected code: `src/components/layout/Header.tsx`、管理员导航/会话角色判断逻辑、`src/app/admin/users/page.tsx`、后台权限校验、用户初始化/种子数据或脚本

## ADDED Requirements
### Requirement: Admin 测试账号
系统 SHALL 提供一个可用于会员管理验证的管理员测试账号。

#### Scenario: 测试账号存在
- **WHEN** 开发完成并准备交付测试
- **THEN** 系统中存在邮箱为 `admin@163.com` 的账号
- **AND** 该账号角色为 `admin`
- **AND** 该账号可以使用密码 `yy1741..` 登录

## MODIFIED Requirements
### Requirement: 管理员后台入口
系统 SHALL 将会员管理能力作为管理员登录后的可见菜单项暴露在主导航或用户菜单中，而不是要求用户通过手动输入 URL 才能进入。

#### Scenario: Admin 用户看到会员管理菜单
- **WHEN** 一个角色为 `admin` 的用户登录成功
- **THEN** 导航区域显示“会员管理”菜单项
- **AND** 点击后可以进入会员管理页面

#### Scenario: 普通用户看不到会员管理菜单
- **WHEN** 一个普通用户登录成功
- **THEN** 导航区域不显示“会员管理”菜单项

#### Scenario: 未登录用户看不到会员管理菜单
- **WHEN** 用户处于未登录状态
- **THEN** 导航区域不显示“会员管理”菜单项

### Requirement: 管理员会员管理访问控制
系统 SHALL 继续通过服务端页面权限和后台接口权限保证只有 `admin` 可以使用会员管理能力，不能只依赖前端隐藏菜单。

#### Scenario: 非管理员绕过菜单访问后台
- **WHEN** 普通用户或未登录用户直接访问会员管理页面或接口
- **THEN** 系统拒绝访问
- **AND** 不返回管理员可操作内容

## REMOVED Requirements
### Requirement: 通过手动输入 URL 作为主要会员管理入口
**Reason**: 这种方式不符合后台功能的自然使用路径，也增加了测试和使用成本。
**Migration**: 会员管理页面和鉴权逻辑保留，但主要入口改为管理员登录后可见的菜单项。
