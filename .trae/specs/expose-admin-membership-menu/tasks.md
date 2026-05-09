# Tasks

- [x] Task 1: 重新定义 admin 会员管理入口
  - [x] SubTask 1.1: 明确“会员管理”菜单应放在导航中的位置，并保持与当前简洁风格一致。
  - [x] SubTask 1.2: 明确菜单仅对 `admin` 登录态用户显示，普通用户与未登录用户完全不显示。
  - [x] SubTask 1.3: 明确菜单点击后的目标页面与文案，避免继续以手输 URL 作为主要使用方式。

- [x] Task 2: 收紧 admin 可见性与访问控制
  - [x] SubTask 2.1: 校对页面侧权限判断，确保非管理员无法通过页面进入会员管理内容。
  - [x] SubTask 2.2: 校对接口侧权限判断，确保非管理员即使直接请求接口也会被拒绝。
  - [x] SubTask 2.3: 确认前端隐藏菜单只是体验层，真实权限仍由服务端兜底。

- [x] Task 3: 准备测试 admin 账号
  - [x] SubTask 3.1: 规划 `admin@163.com` 账号的创建方式，优先采用可重复执行且不会破坏现有用户数据的方案。
  - [x] SubTask 3.2: 明确该账号角色为 `admin`，并设置密码为 `yy1741..`。
  - [x] SubTask 3.3: 确认若账号已存在时的处理规则，避免重复创建或覆盖无关用户数据。

- [x] Task 4: 完成验证与交付
  - [x] SubTask 4.1: 验证 admin 登录后能看到“会员管理”菜单并成功进入页面。
  - [x] SubTask 4.2: 验证普通用户与未登录用户看不到该菜单。
  - [x] SubTask 4.3: 验证普通用户和未登录用户直接访问后台页面或接口时仍被拒绝。
  - [x] SubTask 4.4: 验证 `admin@163.com / yy1741..` 可以成功登录并用于后台测试。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 1, Task 2, Task 3
