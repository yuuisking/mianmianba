#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import nextEnv from "@next/env";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.dirname(SCRIPT_PATH);
const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, "..");
const { loadEnvConfig } = nextEnv;
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, ".env.local");
const LOCAL_POSTGRES_ROOT = path.join(PROJECT_ROOT, "tmp", "local-postgres");
const LOCAL_POSTGRES_DATA_DIR = path.join(LOCAL_POSTGRES_ROOT, "data");
const LOCAL_POSTGRES_SOCKET_DIR = path.join(LOCAL_POSTGRES_ROOT, "socket");
const LOCAL_POSTGRES_LOG_PATH = path.join(LOCAL_POSTGRES_ROOT, "postgres.log");
const LOCAL_POSTGRES_HOST = "127.0.0.1";
const LOCAL_POSTGRES_PORT = Number.parseInt(process.env.LOCAL_POSTGRES_PORT || "54329", 10);
const LOCAL_POSTGRES_DB = process.env.LOCAL_POSTGRES_DB || "resumer_local";
const DEFAULT_NEXTAUTH_URL = "http://127.0.0.1:3000";
const INIT_MIGRATION_PATH = path.join(
  PROJECT_ROOT,
  "prisma",
  "migrations",
  "20260503_init_postgresql",
  "migration.sql"
);
const EXPAND_AUTH_MIGRATION_PATH = path.join(
  PROJECT_ROOT,
  "prisma",
  "migrations",
  "20260503_expand_user_auth_model",
  "migration.sql"
);

/**
 * 统一输出脚本执行日志，便于本地排查环境准备过程。
 * @param {string} message 需要打印的日志内容。
 * @returns {void} 仅向标准输出写入日志。
 */
function log(message) {
  console.log(`[setup-local-validation] ${message}`);
}

/**
 * 抛出带固定前缀的错误，保证终端输出更容易扫描。
 * @param {string} message 失败原因。
 * @returns {never} 直接抛出异常，终止当前执行流程。
 */
function fail(message) {
  throw new Error(`[setup-local-validation] ${message}`);
}

/**
 * 将项目根目录的 `.env*` 文件按 Next.js 规则加载到当前进程。
 * @returns {void} 仅更新当前进程中的环境变量快照。
 */
function loadProjectEnv() {
  loadEnvConfig(PROJECT_ROOT);
}

/**
 * 确保目标目录存在，不存在时会递归创建。
 * @param {string} targetPath 需要创建的目录路径。
 * @returns {void} 创建成功后无返回值。
 */
function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

/**
 * 读取环境变量文件中的全部行，文件不存在时返回空数组。
 * @param {string} filePath 环境文件路径。
 * @returns {string[]} 原始文件行数组。
 */
function readEnvLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

/**
 * 将环境变量写回 `.env.local`，若键已存在则原位替换，否则追加到文件末尾。
 * @param {string} filePath 环境文件路径。
 * @param {string} key 环境变量名。
 * @param {string} value 环境变量值。
 * @returns {void} 写入完成后无返回值。
 */
function upsertEnvVar(filePath, key, value) {
  const lines = readEnvLines(filePath);
  const nextLine = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=`);
  const index = lines.findIndex((line) => matcher.test(line));

  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    if (lines.length > 0 && lines.at(-1)?.trim() !== "") {
      lines.push("");
    }
    lines.push(nextLine);
  }

  fs.writeFileSync(filePath, `${lines.join("\n").replace(/\n*$/, "\n")}`, "utf8");
}

/**
 * 判断给定值是否是 Prisma 可接受的 PostgreSQL 连接串。
 * @param {string | undefined} value 待判断的连接串。
 * @returns {boolean} 仅当协议为 `postgresql://` 或 `postgres://` 时返回 `true`。
 */
function isPostgresDatabaseUrl(value) {
  return Boolean(value && /^(postgresql|postgres):\/\//.test(value));
}

/**
 * 基于当前系统用户名生成默认的本地 PostgreSQL 连接串。
 * @returns {string} 指向项目内本地 PostgreSQL 实例的连接串。
 */
function buildDefaultDatabaseUrl() {
  const username = encodeURIComponent(os.userInfo().username);
  return `postgresql://${username}@${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT}/${LOCAL_POSTGRES_DB}?schema=public`;
}

/**
 * 生成一份可直接用于 NextAuth 的随机密钥。
 * @returns {string} 适合作为 `NEXTAUTH_SECRET` 的随机字符串。
 */
function createNextAuthSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * 在常见路径与系统 PATH 中定位 PostgreSQL 二进制文件。
 * @param {string} binaryName 需要查找的二进制名。
 * @returns {string} 找到的绝对路径。
 */
function resolveBinary(binaryName) {
  const candidates = [
    path.join("/opt/homebrew/opt/postgresql@17/bin", binaryName),
    path.join("/usr/local/opt/postgresql@17/bin", binaryName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const lookup = spawnSync("which", [binaryName], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });

  if (lookup.status === 0 && lookup.stdout.trim()) {
    return lookup.stdout.trim();
  }

  fail(`未找到 ${binaryName}，请先执行 \`brew install postgresql@17\`。`);
}

/**
 * 根据 PostgreSQL 可执行文件的真实路径推导 share 目录，兼容 Homebrew postinstall 未完成的场景。
 * @param {string} binaryPath PostgreSQL 二进制文件路径。
 * @returns {string} 对应的 share/postgresql 目录路径。
 */
function resolvePostgresShareDir(binaryPath) {
  const realBinaryPath = fs.realpathSync(binaryPath);
  const installPrefix = path.resolve(path.dirname(realBinaryPath), "..");
  return path.join(installPrefix, "share", "postgresql");
}

/**
 * 在 Homebrew 的 versioned formula 缺失 share 软链时自动补齐，避免 `initdb` 找不到时区资源。
 * @param {string} binaryPath PostgreSQL 二进制文件路径。
 * @returns {void} 链接已存在或创建成功后无返回值。
 */
function ensureHomebrewShareLink(binaryPath) {
  const realBinaryPath = fs.realpathSync(binaryPath);
  const installPrefix = path.resolve(path.dirname(realBinaryPath), "..");
  const cellarRoot = path.resolve(installPrefix, "..", "..");
  const formulaName = path.basename(cellarRoot);
  const homebrewRoot = path.resolve(path.dirname(path.dirname(installPrefix)), "..");
  const versionedSharePath = path.join(homebrewRoot, "share", formulaName);
  const actualSharePath = resolvePostgresShareDir(binaryPath);

  if (fs.existsSync(versionedSharePath)) {
    return;
  }

  ensureDirectory(path.dirname(versionedSharePath));
  fs.symlinkSync(actualSharePath, versionedSharePath);
}

/**
 * 在 Homebrew 的 versioned formula 缺失动态库软链时自动补齐，避免 `initdb` 找不到 `$libdir` 中的扩展库。
 * @param {string} binaryPath PostgreSQL 二进制文件路径。
 * @returns {void} 链接已存在或创建成功后无返回值。
 */
function ensureHomebrewLibLink(binaryPath) {
  const realBinaryPath = fs.realpathSync(binaryPath);
  const installPrefix = path.resolve(path.dirname(realBinaryPath), "..");
  const cellarRoot = path.resolve(installPrefix, "..", "..");
  const formulaName = path.basename(cellarRoot);
  const homebrewRoot = path.resolve(path.dirname(path.dirname(installPrefix)), "..");
  const versionedLibPath = path.join(homebrewRoot, "lib", formulaName);
  const actualLibPath = path.join(installPrefix, "lib", "postgresql");

  if (fs.existsSync(versionedLibPath)) {
    return;
  }

  ensureDirectory(path.dirname(versionedLibPath));
  fs.symlinkSync(actualLibPath, versionedLibPath);
}

/**
 * 执行本地命令，并在失败时返回带上下文的错误信息。
 * @param {string} command 要执行的命令。
 * @param {string[]} args 命令参数数组。
 * @param {{ env?: Record<string, string>, allowFailure?: boolean }} [options] 额外环境变量与失败容忍配置。
 * @returns {{ stdout: string, stderr: string, status: number | null }} 命令结果摘要。
 */
function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    encoding: "utf8",
  });

  if ((result.status ?? 1) !== 0 && !options.allowFailure) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    fail(
      [
        `命令执行失败：${[command, ...args].join(" ")}`,
        stderr || stdout || "没有输出更多错误信息。",
      ].join("\n")
    );
  }

  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    status: result.status,
  };
}

/**
 * 初始化项目内独立的 PostgreSQL 数据目录，避免依赖系统级服务配置。
 * @param {string} initdbPath `initdb` 二进制路径。
 * @returns {void} 初始化完成后无返回值。
 */
function ensureLocalCluster(initdbPath) {
  if (fs.existsSync(path.join(LOCAL_POSTGRES_DATA_DIR, "PG_VERSION"))) {
    return;
  }

  ensureDirectory(LOCAL_POSTGRES_ROOT);
  const shareDir = resolvePostgresShareDir(initdbPath);
  log(`初始化本地 PostgreSQL 数据目录：${LOCAL_POSTGRES_DATA_DIR}`);
  runCommand(initdbPath, [
    "-D",
    LOCAL_POSTGRES_DATA_DIR,
    "-L",
    shareDir,
    "--username",
    os.userInfo().username,
    "--auth=trust",
    "--auth-host=trust",
    "--auth-local=trust",
    "--encoding=UTF8",
  ], {
    env: {
      TZ: "UTC",
      PGTZ: "UTC",
    },
  });
}

/**
 * 检查项目内 PostgreSQL 实例是否已经在目标端口可连接。
 * @param {string} pgIsReadyPath `pg_isready` 二进制路径。
 * @returns {boolean} 若实例已就绪则返回 `true`。
 */
function isLocalServerReady(pgIsReadyPath) {
  const result = runCommand(
    pgIsReadyPath,
    ["-h", LOCAL_POSTGRES_HOST, "-p", String(LOCAL_POSTGRES_PORT)],
    { allowFailure: true }
  );

  return result.status === 0;
}

/**
 * 启动项目内 PostgreSQL 实例，并在端口可连接前进行短暂轮询。
 * @param {string} pgCtlPath `pg_ctl` 二进制路径。
 * @param {string} pgIsReadyPath `pg_isready` 二进制路径。
 * @returns {Promise<void>} 启动完成后结束。
 */
async function ensureLocalServer(pgCtlPath, pgIsReadyPath) {
  ensureDirectory(LOCAL_POSTGRES_SOCKET_DIR);

  if (isLocalServerReady(pgIsReadyPath)) {
    return;
  }

  log(`启动本地 PostgreSQL 实例，监听 ${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT}`);
  runCommand(pgCtlPath, [
    "-D",
    LOCAL_POSTGRES_DATA_DIR,
    "-l",
    LOCAL_POSTGRES_LOG_PATH,
    "-o",
    `-p ${LOCAL_POSTGRES_PORT} -k ${LOCAL_POSTGRES_SOCKET_DIR} -h ${LOCAL_POSTGRES_HOST}`,
    "start",
  ]);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (isLocalServerReady(pgIsReadyPath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  fail(`本地 PostgreSQL 启动后仍不可用，请检查日志：${LOCAL_POSTGRES_LOG_PATH}`);
}

/**
 * 将普通字符串转为 SQL 单引号字面量，避免数据库名查询时破坏 SQL 结构。
 * @param {string} value 原始字符串。
 * @returns {string} 可安全嵌入 SQL 的单引号字面量。
 */
function toSqlLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 基于本地实例确保业务数据库存在，不存在时自动创建。
 * @param {string} psqlPath `psql` 二进制路径。
 * @param {string} createdbPath `createdb` 二进制路径。
 * @returns {void} 数据库存在后无返回值。
 */
function ensureDatabaseExists(psqlPath, createdbPath) {
  const username = os.userInfo().username;
  const query = `SELECT 1 FROM pg_database WHERE datname = ${toSqlLiteral(LOCAL_POSTGRES_DB)};`;
  const lookup = runCommand(psqlPath, [
    "-h",
    LOCAL_POSTGRES_HOST,
    "-p",
    String(LOCAL_POSTGRES_PORT),
    "-U",
    username,
    "-d",
    "postgres",
    "-tAc",
    query,
  ]);

  if (lookup.stdout.trim() === "1") {
    return;
  }

  log(`创建本地数据库：${LOCAL_POSTGRES_DB}`);
  runCommand(createdbPath, [
    "-h",
    LOCAL_POSTGRES_HOST,
    "-p",
    String(LOCAL_POSTGRES_PORT),
    "-U",
    username,
    LOCAL_POSTGRES_DB,
  ]);
}

/**
 * 将 PostgreSQL 连接串中的 Prisma 查询参数剥离成 `psql` 可接受的标准连接串。
 * @param {string} databaseUrl Prisma 风格数据库连接串。
 * @returns {string} 适用于 `psql` / `createdb` / `dropdb` 的连接串。
 */
function sanitizeDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.search = "";
  return url.toString();
}

/**
 * 执行一条 SQL 查询并返回 `psql -tAc` 的标准输出。
 * @param {string} psqlPath `psql` 二进制路径。
 * @param {string} sql 待执行的 SQL。
 * @param {string} databaseUrl 目标数据库连接串。
 * @returns {string} 查询输出的文本结果。
 */
function runSql(psqlPath, sql, databaseUrl) {
  return runCommand(psqlPath, [sanitizeDatabaseUrl(databaseUrl), "-tAc", sql]).stdout.trim();
}

/**
 * 判断业务主表是否已经存在，用于区分“空库”与“已完成本地初始化”。
 * @param {string} psqlPath `psql` 二进制路径。
 * @param {string} databaseUrl 目标数据库连接串。
 * @returns {boolean} 若 `User` 表已存在则返回 `true`。
 */
function hasBusinessTables(psqlPath, databaseUrl) {
  const result = runSql(
    psqlPath,
    "SELECT to_regclass('public.\"User\"') IS NOT NULL;",
    databaseUrl
  );
  return result === "t";
}

/**
 * 重新创建本地验证数据库，确保后续手动应用迁移 SQL 时处于干净状态。
 * @param {string} psqlPath `psql` 二进制路径。
 * @param {string} createdbPath `createdb` 二进制路径。
 * @param {string} dropdbPath `dropdb` 二进制路径。
 * @returns {void} 重建完成后无返回值。
 */
function resetLocalDatabase(psqlPath, createdbPath, dropdbPath) {
  const username = os.userInfo().username;
  log(`重建本地验证数据库：${LOCAL_POSTGRES_DB}`);
  runCommand(
    psqlPath,
    [
      `postgresql://${username}@${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT}/postgres`,
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${toSqlLiteral(LOCAL_POSTGRES_DB)} AND pid <> pg_backend_pid();`,
    ],
    { allowFailure: true }
  );
  runCommand(
    dropdbPath,
    ["-h", LOCAL_POSTGRES_HOST, "-p", String(LOCAL_POSTGRES_PORT), "-U", username, "--if-exists", LOCAL_POSTGRES_DB],
    { allowFailure: true }
  );
  runCommand(createdbPath, [
    "-h",
    LOCAL_POSTGRES_HOST,
    "-p",
    String(LOCAL_POSTGRES_PORT),
    "-U",
    username,
    LOCAL_POSTGRES_DB,
  ]);
}

/**
 * 按显式顺序应用仓库中的 PostgreSQL 迁移 SQL，规避当前迁移目录命名顺序导致的本地初始化阻断。
 * @param {string} psqlPath `psql` 二进制路径。
 * @param {string} databaseUrl 目标数据库连接串。
 * @returns {void} SQL 全部执行完成后无返回值。
 */
function applyLocalMigrations(psqlPath, databaseUrl) {
  const sanitizedDatabaseUrl = sanitizeDatabaseUrl(databaseUrl);
  log("按仓库迁移 SQL 初始化本地数据库结构");
  runCommand(psqlPath, [sanitizedDatabaseUrl, "-v", "ON_ERROR_STOP=1", "-f", INIT_MIGRATION_PATH]);
  runCommand(psqlPath, [sanitizedDatabaseUrl, "-v", "ON_ERROR_STOP=1", "-f", EXPAND_AUTH_MIGRATION_PATH]);
}

/**
 * 确保本地数据库结构已完成初始化；若 Prisma 迁移因目录顺序阻断，会自动回退到手动迁移方案。
 * @param {string} psqlPath `psql` 二进制路径。
 * @param {string} createdbPath `createdb` 二进制路径。
 * @param {string} dropdbPath `dropdb` 二进制路径。
 * @param {string} databaseUrl 目标数据库连接串。
 * @returns {void} 数据库结构准备完成后无返回值。
 */
function ensureDatabaseSchema(psqlPath, createdbPath, dropdbPath, databaseUrl) {
  if (hasBusinessTables(psqlPath, databaseUrl)) {
    return;
  }

  resetLocalDatabase(psqlPath, createdbPath, dropdbPath);
  applyLocalMigrations(psqlPath, databaseUrl);
}

/**
 * 将本地验证所需的关键环境变量写入 `.env.local`，并同步更新当前进程。
 * @returns {{ changes: string[], deepseekReady: boolean, databaseUrl: string }} 实际更新项、DeepSeek 配置状态与数据库连接串。
 */
function ensureLocalEnvFile() {
  const changes = [];
  const resolvedDatabaseUrl = isPostgresDatabaseUrl(process.env.DATABASE_URL)
    ? process.env.DATABASE_URL
    : buildDefaultDatabaseUrl();

  if (process.env.DATABASE_URL !== resolvedDatabaseUrl) {
    upsertEnvVar(ENV_LOCAL_PATH, "DATABASE_URL", resolvedDatabaseUrl);
    process.env.DATABASE_URL = resolvedDatabaseUrl;
    changes.push(`DATABASE_URL -> ${resolvedDatabaseUrl}`);
  }

  if (!process.env.NEXTAUTH_SECRET) {
    const secret = createNextAuthSecret();
    upsertEnvVar(ENV_LOCAL_PATH, "NEXTAUTH_SECRET", secret);
    process.env.NEXTAUTH_SECRET = secret;
    changes.push("NEXTAUTH_SECRET -> generated");
  }

  if (!process.env.NEXTAUTH_URL) {
    upsertEnvVar(ENV_LOCAL_PATH, "NEXTAUTH_URL", DEFAULT_NEXTAUTH_URL);
    process.env.NEXTAUTH_URL = DEFAULT_NEXTAUTH_URL;
    changes.push(`NEXTAUTH_URL -> ${DEFAULT_NEXTAUTH_URL}`);
  }

  return {
    changes,
    deepseekReady: Boolean(process.env.DEEPSEEK_API_KEY),
    databaseUrl: resolvedDatabaseUrl,
  };
}

/**
 * 补齐管理员账号，确保本地可直接使用既定管理员凭证登录后台。
 * @returns {void} 管理员账号创建或更新完成后无返回值。
 */
function ensureAdminUser() {
  log("补齐本地管理员账号 admin@163.com");
  runCommand("node", ["scripts/ensure-admin-user.js"]);
}

/**
 * 打印最终的本地验证指引，帮助继续完成页面和接口回归。
 * @param {{ changes: string[], deepseekReady: boolean }} summary 环境准备摘要。
 * @returns {void} 仅输出汇总信息。
 */
function printSummary(summary) {
  if (summary.changes.length > 0) {
    log("已写入 .env.local：");
    for (const change of summary.changes) {
      log(`  - ${change}`);
    }
  } else {
    log(".env.local 中的关键项已可直接复用，无需改写。");
  }

  log("下一步命令：");
  log("  - 如果当前已有 next dev 在运行，请先重启它，再继续下面的登录与接口回归。");
  log("  - npm run dev");
  log("  - 登录：admin@163.com / yy1741..");
  log("  - 管理后台自动建库：进入 /admin/learning 后输入课题进行验证");
  log("  - 文档助手：在 .env.local 写入有效 DEEPSEEK_API_KEY 后，再请求 POST /api/learning/assistant");

  if (!summary.deepseekReady) {
    log("检测结果：缺少 DEEPSEEK_API_KEY，管理员登录与自动建库已具备本地运行前提，文档助手回归仍需补入真实密钥。");
  } else {
    log("检测结果：DEEPSEEK_API_KEY 已存在，可继续验证文档助手回归。");
  }

  log(`停止本地 PostgreSQL：/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D ${LOCAL_POSTGRES_DATA_DIR} stop`);
}

/**
 * 作为脚本入口，串联本地 PostgreSQL、环境变量、迁移与管理员初始化流程。
 * @returns {Promise<void>} 整个环境准备过程结束后返回。
 */
async function main() {
  loadProjectEnv();
  ensureDirectory(LOCAL_POSTGRES_ROOT);

  const initdbPath = resolveBinary("initdb");
  const pgCtlPath = resolveBinary("pg_ctl");
  const pgIsReadyPath = resolveBinary("pg_isready");
  const psqlPath = resolveBinary("psql");
  const createdbPath = resolveBinary("createdb");
  const dropdbPath = resolveBinary("dropdb");

  ensureHomebrewShareLink(initdbPath);
  ensureHomebrewLibLink(initdbPath);
  const summary = ensureLocalEnvFile();

  if (!isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    fail("未能生成合法的 PostgreSQL DATABASE_URL。");
  }

  ensureLocalCluster(initdbPath);
  await ensureLocalServer(pgCtlPath, pgIsReadyPath);
  ensureDatabaseExists(psqlPath, createdbPath);
  ensureDatabaseSchema(psqlPath, createdbPath, dropdbPath, summary.databaseUrl);
  ensureAdminUser();
  printSummary(summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
