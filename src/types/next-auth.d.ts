import type { DefaultSession, DefaultUser } from "next-auth";
import type { UserRole, UserStatus } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

type ExtendedAuthUser = {
  id: string;
  role: UserRole;
  status: UserStatus;
  vipType: string;
  vipExpiresAt?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
};

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & ExtendedAuthUser;
  }

  interface User extends DefaultUser, ExtendedAuthUser {}
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    status: UserStatus;
    vipType: string;
    vipExpiresAt?: string | null;
    nickname?: string | null;
    avatarUrl?: string | null;
    lastLoginAt?: string | null;
  }
}
