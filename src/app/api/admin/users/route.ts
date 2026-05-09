import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";
import { VIP_TYPE_OPTIONS } from "@/lib/userPresentation";

const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  nickname: true,
  avatarUrl: true,
  role: true,
  status: true,
  vipType: true,
  vipExpiresAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
} as const;

type AdminUserRecord = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

type AdminUserPatchPayload = {
  id?: unknown;
  ids?: unknown;
  role?: unknown;
  status?: unknown;
  vipType?: unknown;
  vipExpiresAt?: unknown;
  name?: unknown;
  nickname?: unknown;
  avatarUrl?: unknown;
};

type AdminUserUpdateData = {
  role?: UserRole;
  status?: UserStatus;
  vipType?: string;
  vipExpiresAt?: Date | null;
  name?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
};

type BatchFailure = {
  id: string;
  email: string;
  reason: string;
};

const vipTypeValues = new Set<string>(VIP_TYPE_OPTIONS.map((option) => option.value));

/**
 * 清理字符串输入，避免将纯空格值写入数据库。
 * @param value 原始输入值。
 * @returns 清理后的字符串；若值不可用则返回 `null`。
 */
function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * 将客户端输入解析为合法的用户角色。
 * @param role 原始角色值。
 * @returns 匹配到的 Prisma 角色枚举；若不合法则返回 `null`。
 */
function parseRole(role: unknown): UserRole | null {
  if (typeof role !== "string") {
    return null;
  }

  const normalized = role.trim().toUpperCase();
  return normalized in UserRole
    ? UserRole[normalized as keyof typeof UserRole]
    : null;
}

/**
 * 将客户端输入解析为合法的账号状态。
 * @param status 原始状态值。
 * @returns 匹配到的 Prisma 状态枚举；若不合法则返回 `null`。
 */
function parseStatus(status: unknown): UserStatus | null {
  if (typeof status !== "string") {
    return null;
  }

  const normalized = status.trim().toUpperCase();
  return normalized in UserStatus
    ? UserStatus[normalized as keyof typeof UserStatus]
    : null;
}

/**
 * 将客户端输入解析为允许的会员类型，避免写入未知档位。
 * @param vipType 原始会员类型值。
 * @returns 合法会员类型或 `undefined`。
 */
function parseVipType(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return "none";
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "none";
  }

  return vipTypeValues.has(normalized) ? normalized : undefined;
}

/**
 * 解析会员到期时间，支持显式传空以清除到期日。
 * @param value 原始日期值。
 * @returns 有效日期、`null` 或 `undefined`。
 */
function parseVipExpiresAt(value: unknown): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

/**
 * 解析批量更新时传入的用户 id 列表，并去除空值和重复项。
 * @param value 原始 id 列表。
 * @returns 去重后的合法 id 集合；若结构非法则返回 `null`。
 */
function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeText(item))
        .filter((item): item is string => Boolean(item))
    )
  );
}

/**
 * 从请求体中构建管理员可写入的更新字段，并统一处理会员到期的兜底逻辑。
 * @param body 原始请求体。
 * @param mode 更新模式，决定是否允许编辑展示字段。
 * @returns 解析后的更新数据或错误信息。
 */
function buildAdminUserUpdateData(
  body: AdminUserPatchPayload,
  mode: "single" | "batch"
): { data?: AdminUserUpdateData; error?: string } {
  const role = body.role === undefined ? undefined : parseRole(body.role);
  const status = body.status === undefined ? undefined : parseStatus(body.status);
  const vipType = parseVipType(body.vipType);
  const vipExpiresAt = parseVipExpiresAt(body.vipExpiresAt);

  if (body.role !== undefined && !role) {
    return { error: "Invalid role value" };
  }

  if (body.status !== undefined && !status) {
    return { error: "Invalid status value" };
  }

  if (body.vipType !== undefined && vipType === undefined) {
    return { error: "Invalid vipType value" };
  }

  if (body.vipExpiresAt !== undefined && vipExpiresAt === undefined) {
    return { error: "Invalid vipExpiresAt value" };
  }

  const data: AdminUserUpdateData = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(vipType !== undefined ? { vipType } : {}),
    ...(vipExpiresAt !== undefined ? { vipExpiresAt } : {})
  };

  if (mode === "single") {
    const name = body.name === undefined ? undefined : normalizeText(body.name);
    const nickname =
      body.nickname === undefined ? undefined : normalizeText(body.nickname);
    const avatarUrl =
      body.avatarUrl === undefined ? undefined : normalizeText(body.avatarUrl);

    Object.assign(data, {
      ...(name !== undefined ? { name } : {}),
      ...(nickname !== undefined ? { nickname } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {})
    });
  }

  if (data.vipType === "none" || data.vipType === "lifetime") {
    data.vipExpiresAt = null;
  }

  if (Object.keys(data).length === 0) {
    return { error: "At least one update field is required" };
  }

  return { data };
}

/**
 * 获取管理员视角的用户列表，支持按角色、状态和关键词筛选。
 * @param request 包含查询参数的请求对象。
 * @returns 安全用户列表或鉴权失败响应。
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const keyword = request.nextUrl.searchParams.get("keyword")?.trim() ?? "";
    const role = parseRole(request.nextUrl.searchParams.get("role"));
    const status = parseStatus(request.nextUrl.searchParams.get("status"));

    const users = await prisma.user.findMany({
      where: {
        ...(keyword
          ? {
              OR: [
                { email: { contains: keyword, mode: "insensitive" } },
                { name: { contains: keyword, mode: "insensitive" } },
                { nickname: { contains: keyword, mode: "insensitive" } }
              ]
            }
          : {}),
        ...(role ? { role } : {}),
        ...(status ? { status } : {})
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: adminUserSelect
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 更新用户的角色、状态和会员信息，供管理员后台调用。
 * @param request 包含用户更新数据的请求对象。
 * @returns 更新后的用户信息或错误响应。
 */
export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await request.json().catch(() => ({}))) as AdminUserPatchPayload;
    const ids = body.ids === undefined ? undefined : parseIds(body.ids);

    if (body.ids !== undefined) {
      if (!ids) {
        return NextResponse.json({ error: "Invalid ids value" }, { status: 400 });
      }

      if (ids.length === 0) {
        return NextResponse.json({ error: "At least one user id is required" }, { status: 400 });
      }

      const parsedBatch = buildAdminUserUpdateData(body, "batch");
      const batchData = parsedBatch.data;
      if (!batchData) {
        return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
      }

      const existingUsers = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: adminUserSelect
      });
      const existingUserMap = new Map(existingUsers.map((user) => [user.id, user]));
      const missingFailures: BatchFailure[] = ids
        .filter((id) => !existingUserMap.has(id))
        .map((id) => ({
          id,
          email: "未知用户",
          reason: "用户不存在或已被删除"
        }));

      const updateResults: Array<
        | { ok: true; user: AdminUserRecord }
        | { ok: false; failure: BatchFailure }
      > = await Promise.all(
        existingUsers.map(async (user) => {
          try {
            const updatedUser = await prisma.user.update({
              where: { id: user.id },
              data: batchData,
              select: adminUserSelect
            });

            return { ok: true as const, user: updatedUser };
          } catch (error) {
            return {
              ok: false as const,
              failure: {
                id: user.id,
                email: user.email,
                reason: error instanceof Error ? error.message : "更新失败"
              }
            };
          }
        })
      );

      const updatedUsers = updateResults
        .filter((result): result is { ok: true; user: AdminUserRecord } => result.ok)
        .map((result) => result.user);
      const failures = [
        ...missingFailures,
        ...updateResults
          .filter((result): result is { ok: false; failure: BatchFailure } => !result.ok)
          .map((result) => result.failure)
      ];

      return NextResponse.json({
        data: {
          totalRequested: ids.length,
          successCount: updatedUsers.length,
          failureCount: failures.length,
          failures,
          users: updatedUsers
        }
      });
    }

    const id = normalizeText(body.id);
    const parsedSingle = buildAdminUserUpdateData(body, "single");
    const singleData = parsedSingle.data;

    if (!id) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    if (!singleData) {
      return NextResponse.json({ error: parsedSingle.error }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: singleData,
      select: adminUserSelect
    });

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
