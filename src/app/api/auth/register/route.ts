import { UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 32;

type RegisterPayload = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  nickname?: unknown;
};

/**
 * 规范化邮箱格式，统一为去空格的小写值。
 * @param email 原始邮箱输入。
 * @returns 规范化后的邮箱字符串。
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 清理昵称或姓名字段，避免写入空白字符串。
 * @param value 原始文本值。
 * @returns 清理后的文本，若为空则返回 `null`。
 */
function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * 校验注册参数是否满足最小安全要求。
 * @param email 规范化后的邮箱。
 * @param password 原始密码。
 * @param displayName 可选展示名。
 * @returns 返回首个校验失败消息；若通过则返回 `null`。
 */
function validateRegisterInput(
  email: string,
  password: string,
  displayName: string | null
): string | null {
  if (!EMAIL_PATTERN.test(email)) {
    return "请输入有效的邮箱地址";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `密码长度不能少于 ${MIN_PASSWORD_LENGTH} 位`;
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "密码需同时包含字母和数字";
  }

  if (displayName && displayName.length > MAX_NAME_LENGTH) {
    return `昵称长度不能超过 ${MAX_NAME_LENGTH} 个字符`;
  }

  return null;
}

/**
 * 创建默认展示名，保证新用户在 UI 与会话中可被识别。
 * @param email 用户邮箱。
 * @param name 用户姓名。
 * @param nickname 用户昵称。
 * @returns 最终可用的展示名称。
 */
function buildDisplayName(
  email: string,
  name: string | null,
  nickname: string | null
): string {
  return nickname ?? name ?? email.split("@")[0];
}

/**
 * 处理邮箱密码注册，并为新用户补齐默认角色、状态与会员信息。
 * @param request 注册请求对象。
 * @returns 注册成功后的安全用户信息或错误响应。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RegisterPayload;
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const name = normalizeOptionalText(body.name);
    const nickname = normalizeOptionalText(body.nickname);
    const displayName = buildDisplayName(email, name, nickname);

    if (!email || !password) {
      return NextResponse.json(
        { message: "邮箱和密码不能为空" },
        { status: 400 }
      );
    }

    const validationMessage = validateRegisterInput(email, password, nickname ?? name);
    if (validationMessage) {
      return NextResponse.json({ message: validationMessage }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "该邮箱已注册" },
        { status: 409 }
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name ?? displayName,
        nickname: nickname ?? name ?? displayName,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        vipType: "none"
      }
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          nickname: user.nickname,
          role: user.role,
          status: user.status,
          vipType: user.vipType,
          vipExpiresAt: user.vipExpiresAt
        },
        message: "注册成功"
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
