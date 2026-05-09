import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

/**
 * 规范化用户输入邮箱，避免因为空格或大小写导致同一账号匹配失败。
 * @param email 原始邮箱字符串。
 * @returns 清理后的邮箱地址。
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 生成会话内展示名，优先使用昵称，再回退为姓名或邮箱前缀。
 * @param email 用户邮箱。
 * @param name 用户姓名。
 * @param nickname 用户昵称。
 * @returns 适合展示在会话中的名称。
 */
function buildDisplayName(
  email: string,
  name?: string | null,
  nickname?: string | null
): string {
  return nickname?.trim() || name?.trim() || email.split("@")[0];
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "name@example.com" },
        password: { label: "Password", type: "password" }
      },
      // 校验账号密码，并将角色、状态等权限信息写入会话负载。
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const email = normalizeEmail(credentials.email);
        const user = await prisma.user.findUnique({
          where: { email }
        });

        if (!user) {
          throw new Error("User not found");
        }

        if (user.status !== UserStatus.ACTIVE) {
          throw new Error("Account is disabled");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Invalid password");
        }

        const lastLoginAt = new Date();

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt }
        });

        return {
          id: user.id,
          name: buildDisplayName(user.email, user.name, user.nickname),
          email: user.email,
          image: user.avatarUrl,
          role: user.role,
          status: user.status,
          vipType: user.vipType,
          vipExpiresAt: user.vipExpiresAt?.toISOString() ?? null,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          lastLoginAt: lastLoginAt.toISOString()
        };
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    // 在 JWT 中持久化用户身份与权限信息，供后续服务端和客户端复用。
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.vipType = user.vipType;
        token.vipExpiresAt = user.vipExpiresAt ?? null;
        token.nickname = user.nickname ?? null;
        token.avatarUrl = user.avatarUrl ?? null;
        token.lastLoginAt = user.lastLoginAt ?? null;
        token.picture = user.avatarUrl ?? user.image ?? null;
      }
      return token;
    },
    // 将 JWT 中的权限字段同步到 Session，便于页面与路由统一使用。
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as typeof session.user.role;
        session.user.status = token.status as typeof session.user.status;
        session.user.vipType = (token.vipType as string) ?? "none";
        session.user.vipExpiresAt = (token.vipExpiresAt as string | null) ?? null;
        session.user.nickname = (token.nickname as string | null) ?? null;
        session.user.avatarUrl = (token.avatarUrl as string | null) ?? null;
        session.user.lastLoginAt = (token.lastLoginAt as string | null) ?? null;
        session.user.image = (token.picture as string | null) ?? null;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login"
  }
};
