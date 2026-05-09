/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { PrismaClient, UserRole, UserStatus } = require("@prisma/client");

const ADMIN_EMAIL = "admin@163.com";
const ADMIN_PASSWORD = "yy1741..";

/**
 * 规范化邮箱，避免重复账号因大小写或空格造成误判。
 * @param {string} email 原始邮箱字符串。
 * @returns {string} 清理后的邮箱地址。
 */
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * 从项目根目录加载环境变量文件，优先保留外部已注入的值。
 * @param {string[]} filenames 需要按顺序尝试加载的文件名列表。
 * @returns {void} 仅向 `process.env` 注入缺失变量。
 */
function loadEnvFiles(filenames) {
  for (const filename of filenames) {
    const fullPath = path.join(process.cwd(), filename);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * 校验当前数据库连接串是否为 Prisma PostgreSQL 所需格式。
 * @returns {string} 可直接使用的数据库连接串。
 * @throws {Error} 当连接串缺失或协议不合法时抛错。
 */
function getValidatedDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("缺少 DATABASE_URL，无法连接数据库。");
  }

  if (
    !databaseUrl.startsWith("postgresql://") &&
    !databaseUrl.startsWith("postgres://")
  ) {
    throw new Error(
      "当前 DATABASE_URL 不是 PostgreSQL 连接串，请在目标环境提供 postgresql:// 或 postgres://。"
    );
  }

  return databaseUrl;
}

/**
 * 判断现有密码散列是否已匹配目标管理员密码。
 * @param {string} hashedPassword 数据库中的密码散列。
 * @returns {Promise<boolean>} 若已匹配目标密码则返回 `true`。
 */
async function isTargetPassword(hashedPassword) {
  if (!hashedPassword) {
    return false;
  }

  return bcrypt.compare(ADMIN_PASSWORD, hashedPassword);
}

/**
 * 以幂等方式确保管理员账号存在且具备正确角色、状态和密码。
 * @param {PrismaClient} prisma Prisma 客户端实例。
 * @returns {Promise<{action: string, changedFields: string[], user: {id: string, email: string, role: string, status: string}}>} 执行结果摘要。
 */
async function ensureAdminUser(prisma) {
  const email = normalizeEmail(ADMIN_EMAIL);
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
      status: true
    }
  });

  if (!existingUser) {
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const createdUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: "Admin",
        nickname: "Admin",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        vipType: "none"
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true
      }
    });

    return {
      action: "created",
      changedFields: ["email", "password", "role", "status", "name", "nickname"],
      user: createdUser
    };
  }

  const changedFields = [];
  const data = {};

  if (existingUser.role !== UserRole.ADMIN) {
    data.role = UserRole.ADMIN;
    changedFields.push("role");
  }

  if (existingUser.status !== UserStatus.ACTIVE) {
    data.status = UserStatus.ACTIVE;
    changedFields.push("status");
  }

  if (!(await isTargetPassword(existingUser.password))) {
    data.password = await bcrypt.hash(ADMIN_PASSWORD, 10);
    changedFields.push("password");
  }

  if (changedFields.length === 0) {
    return {
      action: "unchanged",
      changedFields,
      user: {
        id: existingUser.id,
        email: existingUser.email,
        role: existingUser.role,
        status: existingUser.status
      }
    };
  }

  const updatedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data,
    select: {
      id: true,
      email: true,
      role: true,
      status: true
    }
  });

  return {
    action: "updated",
    changedFields,
    user: updatedUser
  };
}

/**
 * 作为脚本入口，完成环境加载、账号补齐和结果输出。
 * @returns {Promise<void>} 执行成功时输出 JSON 结果，失败时返回非零状态码。
 */
async function main() {
  loadEnvFiles([".env.local", ".env"]);
  getValidatedDatabaseUrl();

  const prisma = new PrismaClient();
  try {
    const result = await ensureAdminUser(prisma);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
