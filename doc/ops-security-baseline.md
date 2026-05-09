# 运维安全基线

## 目标
- 为生产环境的 PostgreSQL 主数据建立自动备份与恢复校验基线。
- 为数据库连接密码与认证密钥建立可执行的轮换脚本，避免人工修改遗漏。
- 明确哪些配置属于运行环境秘密，不能进入仓库。

## 新增脚本
- `scripts/ops/backup-postgres.sh`
  - 从 `/srv/resumer/.env` 与 `/srv/resumer/.env.local` 读取 `DATABASE_URL`
  - 生成 PostgreSQL 自定义格式备份、清单文件与 SHA-256 校验文件
  - 默认保留 7 天，产物落在 `/var/backups/resumer/postgres`
- `scripts/ops/verify-postgres-backup.sh`
  - 默认执行 `pg_restore --list` 校验备份可读性
  - 加 `--restore-check` 时，会临时创建数据库并执行一次完整恢复演练
- `scripts/ops/rotate-db-password.sh`
  - 轮换应用数据库用户密码
  - 同步更新 `.env` 与 `.env.local` 中的 `DATABASE_URL`
  - 默认重启 `resumer` 服务并验证数据库连接
  - 支持 `--dry-run`
- `scripts/ops/rotate-auth-secrets.sh`
  - 轮换 `NEXTAUTH_SECRET` 与 `CRON_SECRET`
  - 同步更新 `.env` 与 `.env.local`
  - 默认重启 `resumer` 服务并验证 `/api/auth/providers`
  - 支持 `--dry-run`
- `scripts/ops/install-backup-cron.sh`
  - 以 `/etc/cron.d/resumer-postgres-backup` 方式安装定时备份任务
  - 默认每天 `03:17` 执行
- `scripts/ops/deploy-local-build-to-ecs.sh`
  - 从当前本地工作区直接打包发布，而不是只依赖 Git 已跟踪文件
  - 会连同本地已验证的 `.next` 构建产物一起同步到 ECS，规避远端 `next build` 资源不足
  - 默认执行远端 PostgreSQL 备份、替换 `/srv/resumer/.next`、清理 `._*` 苹果元数据并重启 `resumer`

## 生产接入步骤
1. 将本仓库同步到服务器 `/srv/resumer`
2. 为脚本增加执行权限
3. 安装备份 cron
4. 立刻执行一次手工备份
5. 立刻执行一次恢复校验

```bash
cd /srv/resumer
chmod +x scripts/ops/*.sh
./scripts/ops/install-backup-cron.sh
./scripts/ops/backup-postgres.sh
./scripts/ops/verify-postgres-backup.sh --restore-check
```

## 告警与巡检
- 定时备份日志统一写入 `/var/log/resumer/postgres-backup.log`
- 备份是否按时产出，以上一次 `.dump` 文件时间与 `latest.dump` 链接为准
- 失败信号以脚本非零退出码和日志中的 `ERROR` 关键字为准
- 当前阶段先采用日志巡检方案，不额外引入第三方告警服务，避免超出本轮范围
- 若后续接入监控平台，只需要继续消费同一日志文件与最近备份文件时间即可

## 轮换命令

### 数据库密码轮换
先演练，再正式执行：

```bash
cd /srv/resumer
./scripts/ops/rotate-db-password.sh --dry-run
./scripts/ops/rotate-db-password.sh
```

### 认证密钥轮换
可同时轮换，也可按需只轮换一个：

```bash
cd /srv/resumer
./scripts/ops/rotate-auth-secrets.sh --dry-run
./scripts/ops/rotate-auth-secrets.sh
./scripts/ops/rotate-auth-secrets.sh --nextauth-only
./scripts/ops/rotate-auth-secrets.sh --cron-only
```

## 回滚方案
- 环境文件回滚：每次轮换前会自动生成 `.env.bak_时间戳` 与 `.env.local.bak_时间戳`
- 数据库密码回滚：
  - 从最近的环境备份中取回旧 `DATABASE_URL`
  - 用 PostgreSQL 管理员执行一次反向 `ALTER ROLE ... PASSWORD ...`
- 认证密钥回滚：
  - 恢复最近的 `.env*` 备份
  - 重启 `resumer` 服务
- 数据恢复回滚：
  - 先保留当前库快照
  - 再从最新 `.dump` 恢复到临时库校验
  - 确认后再覆盖正式库

## 运行环境秘密清单
以下变量不得进入仓库，不得写入示例值之外的真实内容：
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `DEEPSEEK_API_KEY`
- `VOLC_APP_ID`
- `VOLC_ACCESS_TOKEN`
- `VOLC_ARK_API_KEY`
- `VOLC_KB_ID`
- 任何未来新增的第三方密钥、对象存储密钥、短信密钥、支付密钥

## 部署更新要求
- 所有秘密只允许保存在服务器 `.env` / `.env.local` 或受控密钥系统中
- 学习中心等新增路由上线时，优先使用 `scripts/ops/deploy-local-build-to-ecs.sh`，避免只同步 Git 已跟踪文件导致新目录或新路由漏发
- 部署前必须先在本地完成 `node ./node_modules/typescript/bin/tsc --noEmit`、聚焦改动的 `eslint` 与 `npm run build`
- 部署后至少验证目标页面或接口已经命中新运行态，不能只看 `systemctl is-active resumer`
- 轮换完成后必须至少验证：
  - `systemctl is-active resumer`
  - `curl http://127.0.0.1:3000/api/auth/providers`
  - 数据库连接可用
- 任何轮换都先执行 `--dry-run`
- 任何备份策略变更都要同步更新 `说明文档.md`
