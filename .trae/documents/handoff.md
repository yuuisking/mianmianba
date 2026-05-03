# 项目交接与多设备续写（Trae Solo）

## 目标
在公司电脑与家里电脑之间切换时，尽量做到：代码一致、数据一致、Trae 可读的上下文不丢失。

## 上下文资产（Trae 重点读取）
- 规格文档：`.trae/specs/`
- 计划文档：`.trae/documents/`
- 产品文档：`AI模拟面试平台_PRD.md`
- UI 原型：`UI/`

## 运行态数据（需要一起同步，否则“上下文”会断）
- 学习中心知识库：`data/learning-center.json`
- 本地 SQLite 数据库：`prisma/dev.db`
- 环境变量：`.env.local`（默认被 `.gitignore` 忽略，不建议进 Git）

## 两台电脑的推荐同步方式
### 1) GitHub 私有仓库（同步代码 + 文档上下文）
- 同步范围：`src/`、`prisma/schema.prisma`、`.trae/`、`UI/`、PRD 等
- 不同步范围：`node_modules/`、`.next/`、`.env*`

### 2) 拷贝文件（同步运行态数据）
每次换电脑前后，手动拷贝并覆盖：
- `.env.local`
- `data/learning-center.json`
- `prisma/dev.db`

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
- `DATABASE_URL`（SQLite/Prisma）
- `NEXTAUTH_SECRET`
- `DEEPSEEK_API_KEY`

