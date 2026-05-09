import { UserRole, UserStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";

export type AuthenticatedSessionUser = NonNullable<Session["user"]>;

type AuthorizedSession = {
  session: Session;
  user: AuthenticatedSessionUser;
};

type AuthorizationFailure = {
  response: NextResponse;
};

export type AuthorizationResult = AuthorizedSession | AuthorizationFailure;

/**
 * 判断当前角色是否为管理员。
 * @param role 要判断的用户角色。
 * @returns 若角色为 `ADMIN` 则返回 `true`，否则返回 `false`。
 */
export function isAdminRole(role?: UserRole | null): boolean {
  return role === UserRole.ADMIN;
}

/**
 * 检查用户角色是否有指定权限。
 * @param role 用户角色。
 * @param permission 要检查的权限。
 * @returns 是否有权限。
 */
export function checkPermission(role: UserRole | null | undefined, permission: "admin" | "user"): boolean {
  if (permission === "admin") {
    return role === UserRole.ADMIN;
  }
  return role === UserRole.ADMIN || role === UserRole.USER;
}

/**
 * 判断当前账号状态是否允许继续访问受保护资源。
 * @param status 要判断的账号状态。
 * @returns 若状态为 `ACTIVE` 则返回 `true`，否则返回 `false`。
 */
export function isActiveStatus(status?: UserStatus | null): boolean {
  return status === UserStatus.ACTIVE;
}

/**
 * 判断权限校验结果是否为失败分支。
 * @param result 权限校验结果对象。
 * @returns 若包含响应对象则返回 `true`，表示应直接返回该响应。
 */
export function isAuthorizationFailure(
  result: AuthorizationResult
): result is AuthorizationFailure {
  return "response" in result;
}

/**
 * 构造统一的鉴权失败响应，避免各路由重复拼接状态码与消息。
 * @param status HTTP 状态码。
 * @param message 返回给客户端的错误消息。
 * @returns 一个 JSON 格式的 `NextResponse`。
 */
function createAuthorizationResponse(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 校验当前请求是否带有有效登录会话，且账号状态为启用。
 * @returns 成功时返回会话与用户信息；失败时返回可直接透传的错误响应。
 */
export async function requireAuthenticatedUser(): Promise<AuthorizationResult> {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!session || !user?.id) {
    return { response: createAuthorizationResponse(401, "Unauthorized") };
  }

  if (!isActiveStatus(user.status)) {
    return { response: createAuthorizationResponse(403, "Account is disabled") };
  }

  return { session, user };
}

/**
 * 校验当前请求是否来自管理员账号。
 * @returns 成功时返回管理员会话；失败时返回可直接透传的错误响应。
 */
export async function requireAdminUser(): Promise<AuthorizationResult> {
  const authResult = await requireAuthenticatedUser();

  if (isAuthorizationFailure(authResult)) {
    return authResult;
  }

  if (!isAdminRole(authResult.user.role)) {
    return { response: createAuthorizationResponse(403, "Forbidden: Admins only") };
  }

  return authResult;
}
