"use client";

import { SessionProvider } from "next-auth/react";
import AuthDialogProvider from "@/components/auth/AuthDialogProvider";

/**
 * 组合会话上下文与全站认证弹层上下文，供客户端页面统一使用。
 * @param props 包含应用子节点的 Provider 属性。
 * @returns 已接入认证能力的应用内容。
 */
export default function AuthProvider({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AuthDialogProvider>{children}</AuthDialogProvider>
    </SessionProvider>
  );
}
