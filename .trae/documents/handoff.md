# 项目交接与多设备续写（Trae Solo）

## 目标
在公司电脑与家里电脑之间切换时，尽量做到：代码一致、数据一致、Trae 可读的上下文不丢失。

## 上下文资产（Trae 重点读取）
- 规格文档：`.trae/specs/`
- 计划文档：`.trae/documents/`
- 产品文档：`AI模拟面试平台_PRD.md`
- UI 原型：`UI/`

## 当前部署状态（2026-05-03）
- GitHub 仓库：`https://github.com/yuuisking/mianmianba.git`
- ECS 公网入口：`http://47.95.233.109`
- 应用目录：`/srv/resumer`
- 应用服务：`systemctl status resumer`
- 反向代理：`systemctl status nginx`
- 数据库：PostgreSQL（本机 127.0.0.1:5432，数据库名 `resumer_prod`，业务用户 `resumer`）
- 登录状态：已恢复；2026-05-03 已修复 NextAuth `NO_SECRET`

## 运行态数据（需要一起同步，否则“上下文”会断）
- 学习中心知识库：`data/learning-center.json`
- PostgreSQL 业务数据：`resumer_prod`（已替代服务器上的 SQLite 运行态）
- SQLite 备份：服务器保留 `prisma/dev.db` 与 `prisma/dev.db.bak_*`，用于回滚与核对
- 环境变量：`.env.local`（默认被 `.gitignore` 忽略，不建议进 Git）

## 两台电脑的推荐同步方式
### 1) GitHub 私有仓库（同步代码 + 文档上下文）
- 同步范围：`src/`、`prisma/schema.prisma`、`.trae/`、`UI/`、PRD 等
- 不同步范围：`node_modules/`、`.next/`、`.env*`

### 2) 拷贝文件（同步运行态数据）
每次换电脑前后，手动拷贝并覆盖：
- `.env.local`
- `data/learning-center.json`

### 3) 服务器运行态（当前线上）
- 业务主库已经切到 PostgreSQL，不再依赖线上 SQLite 作为主运行库
- 如需核对迁移结果，可对比：
  - SQLite：`/srv/resumer/prisma/dev.db`
  - PostgreSQL：`resumer_prod`
- 迁移脚本：`scripts/migrate_sqlite_to_postgres.py`
- Prisma 初始化迁移：`prisma/migrations/20260503_init_postgresql/migration.sql`

## 常用入口
- 登录页：`/login`
- 学习中心：`/learning`
- 后台知识库管理（admin）：`/admin/learning`

## 关键代码位置（便于 Trae 接续）
- NextAuth 配置：[authOptions.ts](file:///Users/didi/workplace/project/resumer/src/lib/authOptions.ts)
- NextAuth 路由：[route.ts](file:///Users/didi/workplace/project/resumer/src/app/api/auth/[...nextauth]/route.ts)
- 学习中心数据源：[learning-center.json](file:///Users/didi/workplace/project/resumer/data/learning-center.json)
- 学习中心 DB 读写：[learningDb.ts](file:///Users/didi/workplace/project/resumer/src/lib/db/learningDb.ts)
- 学习中心前台页：[page.tsx](file:///Users/didi/workplace/project/resumer/src/app/learning/page.tsx)
- 后台导入页：[page.tsx](file:///Users/didi/workplace/project/resumer/src/app/admin/learning/%5BkbId%5D/page.tsx)

## 环境变量（示例）
说明：不要把真实值写进仓库；两台电脑保持一致即可。
- `DATABASE_URL`（当前生产为 PostgreSQL）
- `NEXTAUTH_SECRET`
- `DEEPSEEK_API_KEY`
- `CRON_SECRET`

## 2026-05-03 登录故障修复记录
- 用户反馈登录页点击“登录”后报错：`Server error / There is a problem with the server configuration`
- 排查结论：
  - NextAuth 配置读取 `process.env.NEXTAUTH_SECRET`
  - 线上 `resumer.service` 原配置未加载 `/srv/resumer/.env` 和 `/srv/resumer/.env.local`
  - 两份环境文件中的 `NEXTAUTH_SECRET` 还被写成了空字符串 `""`
- 已执行修复：
  - 更新 `/etc/systemd/system/resumer.service`
  - 增加：
    - `EnvironmentFile=-/srv/resumer/.env`
    - `EnvironmentFile=-/srv/resumer/.env.local`
  - 重新生成有效 `NEXTAUTH_SECRET`
  - `systemctl daemon-reload && systemctl restart resumer`
- 验证结果：
  - `curl http://127.0.0.1:3000/api/auth/providers` 返回 `200 OK`
  - 使用账号 `yangyudei163@163.com` 已成功登录并进入 `/dashboard`
