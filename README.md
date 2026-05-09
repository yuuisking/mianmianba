# 面面吧本地开发说明

## 本地验证环境

为了完成管理员登录、学习后台自动建库和学习中心文档助手回归，本项目本地环境至少需要下面几项：

```env
# Prisma / NextAuth
DATABASE_URL=postgresql://<your-user>@127.0.0.1:54329/resumer_local?schema=public
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://127.0.0.1:3000

# 学习中心文档助手与其他 DeepSeek 能力
DEEPSEEK_API_KEY=<your-deepseek-api-key>

# 语音链路（按需）
VOLC_APP_ID=<your-volc-app-id>
VOLC_ACCESS_TOKEN=<your-volc-access-token>
```

注意：

- `Prisma` 当前只支持 PostgreSQL，`DATABASE_URL` 不能再使用 `file:./dev.db`。
- `DEEPSEEK_API_KEY` 是文档助手真实回归的硬前置；没有它时，`/api/learning/assistant` 会明确失败。
- Next.js 只会从项目根目录读取 `.env*` 文件，环境变量不要放到 `src/` 下。

## 一键准备本地验证

仓库已提供本地环境引导脚本，会自动完成下面的准备工作：

- 初始化项目内独立 PostgreSQL 数据目录 `tmp/local-postgres/`
- 启动本地 PostgreSQL 到 `127.0.0.1:54329`
- 自动生成合法的 `DATABASE_URL`、`NEXTAUTH_SECRET`、`NEXTAUTH_URL` 并写入 `.env.local`
- 执行 `prisma migrate deploy`
- 幂等补齐管理员账号 `admin@163.com / yy1741..`

首次执行：

```bash
npm run setup:local-validation
```

如果本机尚未安装 PostgreSQL，可先执行：

```bash
brew install postgresql@17
```

## 启动项目

本地验证环境准备完成后，启动开发服务：

```bash
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

如果你在执行 `npm run setup:local-validation` 之前已经启动过 `next dev`，请先重启开发服务。Next.js 运行中的进程不会自动重新读取刚写入的 `.env.local`。

## 本地回归路径

管理员登录：

```text
账号：admin@163.com
密码：yy1741..
```

建议按下面顺序回归：

1. 登录 `/login`，确认可进入 `/admin/learning`
2. 在 `/admin/learning` 输入 `Java` 或 `Vue`，验证自动建库
3. 给 `.env.local` 补入有效 `DEEPSEEK_API_KEY` 后，请求 `POST /api/learning/assistant`

## 停止本地 PostgreSQL

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D ./tmp/local-postgres/data stop
```
