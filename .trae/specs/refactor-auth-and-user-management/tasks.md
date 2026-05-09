# Tasks

- [x] Task 1: 明确访问策略与信息架构
  - [x] SubTask 1.1: 梳理公开入口、可匿名浏览页面、受保护动作、仅管理员可访问页面与接口。
  - [x] SubTask 1.2: 定义 `/`、`/home`、`/login`、头像入口、后台入口之间的跳转与回流规则。
  - [x] SubTask 1.3: 明确登录/注册弹层的触发时机、关闭行为与登录成功后的原操作续接策略。

- [x] Task 2: 重构用户数据模型与权限模型
  - [x] SubTask 2.1: 扩展用户数据结构，补齐角色、账号状态、VIP 类型、VIP 到期时间、昵称、头像、最近登录时间等字段。
  - [x] SubTask 2.2: 设计管理员角色与普通用户角色的可见范围、可执行操作与接口鉴权规则。
  - [x] SubTask 2.3: 规划旧用户数据迁移策略，确保现有账号可平滑升级。

- [x] Task 3: 设计新的认证体验
  - [x] SubTask 3.1: 将 `/home` 设计为公开首页，并定义匿名用户在各功能页的浏览体验。
  - [x] SubTask 3.2: 设计按动作触发的登录/注册流程，覆盖训练开始、报告生成、记录保存、个人数据查看等场景。
  - [x] SubTask 3.3: 保留 `/login` 作为独立认证入口与兜底入口，明确与弹层模式的关系。

- [x] Task 4: 设计用户详情页
  - [x] SubTask 4.1: 明确头像入口位置、页面信息结构与最小可交付内容。
  - [x] SubTask 4.2: 明确用户可查看和可编辑字段，以及会员信息展示方式。
  - [x] SubTask 4.3: 明确未登录用户点击头像时的处理方式。

- [x] Task 5: 设计管理员后台用户管理系统
  - [x] SubTask 5.1: 设计后台用户列表页、筛选项、详情页与关键管理动作。
  - [x] SubTask 5.2: 明确管理员可管理的字段，包括角色、账号状态、VIP 类型、到期时间等。
  - [x] SubTask 5.3: 定义后台入口与后台接口的权限校验规则，确保仅 `admin` 可见与可用。

- [x] Task 6: 制定品牌化界面规范
  - [x] SubTask 6.1: 按 `brand-guidelines` 定义登录/注册弹层的视觉规范。
  - [x] SubTask 6.2: 按 `brand-guidelines` 定义用户详情页与后台用户页的视觉规范。
  - [x] SubTask 6.3: 明确颜色、排版、按钮、卡片、状态标签、空状态与反馈提示的统一规则。

- [x] Task 7: 制定运维安全基线
  - [x] SubTask 7.1: 规划 PostgreSQL 自动备份频率、保留策略、恢复验证流程与告警方式。
  - [x] SubTask 7.2: 规划数据库密码轮换与认证密钥轮换流程，明确步骤、影响面与回滚方案。
  - [x] SubTask 7.3: 明确哪些配置属于运行环境秘密，不能进入仓库，并补充部署更新要求。

- [x] Task 8: 验证方案完整性
  - [x] SubTask 8.1: 覆盖匿名访问、注册登录、个人资料查看、管理员管理用户、会员状态变化等关键场景。
  - [x] SubTask 8.2: 覆盖异常场景，包括未授权访问后台、登录态过期、VIP 到期、轮换期间服务不中断。
  - [x] SubTask 8.3: 确认本轮方案不破坏现有业务主数据与现有用户登录能力。
    - 说明：生产库现有普通用户 `yangyudei163@163.com` 与管理员 `admin@resumer.com` 均仍在库且状态正常；已使用用户提供凭证 `yangyudei163@163.com / yy1741..` 在线上首页弹层完成实登复核，登录后页面恢复到“杨宇”登录态，说明现有用户登录能力未被本轮重构破坏。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1, Task 2
- Task 4 depends on Task 2, Task 3
- Task 5 depends on Task 2
- Task 6 depends on Task 3, Task 4, Task 5
- Task 7 depends on Task 2
- Task 8 depends on Task 3, Task 4, Task 5, Task 7
