import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser
} from "@/lib/permissions";

const userProfileSelect = {
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

type ProfilePayload = {
  name?: unknown;
  nickname?: unknown;
  avatarUrl?: unknown;
};

/**
 * 清理用户可编辑的文本字段，避免保存空白值。
 * @param value 原始字段值。
 * @returns 清理后的字符串，若为空则返回 `null`。
 */
function normalizeEditableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * 获取当前登录用户的个人资料。
 * @returns 当前用户的安全资料信息或鉴权错误响应。
 */
export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const profile = await prisma.user.findUnique({
      where: { id: authResult.user.id },
      select: userProfileSelect
    });

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ data: profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 更新当前登录用户的基础资料，仅允许修改个人展示信息。
 * @param request 包含姓名、昵称、头像等字段的请求对象。
 * @returns 更新后的个人资料或错误响应。
 */
export async function PATCH(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await request.json().catch(() => ({}))) as ProfilePayload;
    const name = normalizeEditableText(body.name);
    const nickname = normalizeEditableText(body.nickname);
    const avatarUrl = normalizeEditableText(body.avatarUrl);

    if (
      body.name === undefined &&
      body.nickname === undefined &&
      body.avatarUrl === undefined
    ) {
      return NextResponse.json(
        { error: "At least one editable field is required" },
        { status: 400 }
      );
    }

    const profile = await prisma.user.update({
      where: { id: authResult.user.id },
      data: {
        name,
        nickname,
        avatarUrl
      },
      select: userProfileSelect
    });

    return NextResponse.json({ data: profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
