"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Suspense } from "react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import { isAdminRole } from "@/lib/permissions";
import {
  getUserInitials,
  getVipHonorLabel
} from "@/lib/userPresentation";

const primaryNavItems = [
  { href: "/home", label: "首页" },
  { href: "/setup", label: "发起面试" },
  { href: "/practice", label: "专项训练" },
  { href: "/learning", label: "学习中心" },
  { href: "/review", label: "复盘中心" }
] as const;

/**
 * 渲染全站顶部导航，并延迟到会话信息准备完成后再显示用户菜单。
 * @returns 顶部导航组件。
 */
export default function Header() {
  return (
    <Suspense fallback={<div className="h-16 bg-white border-b border-gray-200"></div>}>
      <HeaderContent />
    </Suspense>
  );
}

/**
 * 基于当前路由与会话状态渲染导航链接和用户操作区。
 * @returns 头部内容视图。
 */
function HeaderContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const { requestAuth } = useAuthDialog();
  const isLoginPage = pathname === "/login";

  const isAdmin = isAdminRole(session?.user?.role);
  const isTargetedInterview = pathname === "/interview" && searchParams.get("mode") === "targeted";
  const vipHonorLabel = getVipHonorLabel(session?.user?.vipType, session?.user?.vipExpiresAt);

  /**
   * 判断导航项是否应在当前路由高亮。
   * @param href 导航链接地址。
   * @returns 当前页面命中时返回 `true`。
   */
  function isNavActive(href: string): boolean {
    if (href === "/home") {
      return pathname === "/home";
    }

    if (href === "/setup") {
      return ["/setup", "/profile"].includes(pathname) && !isTargetedInterview;
    }

    if (href === "/practice") {
      return pathname === "/practice" || isTargetedInterview;
    }

    if (href === "/review") {
      return ["/review", "/report"].includes(pathname);
    }

    return pathname.startsWith(href);
  }

  /**
   * 打开登录弹层，用于匿名用户从头部快速进入认证流程。
   * @param mode 初始认证模式。
   */
  function openAuth(mode: "login" | "register"): void {
    requestAuth({
      mode,
      title: mode === "login" ? "登录后继续" : "注册后继续",
      description: "完成认证后即可继续当前操作。",
      callbackUrl: pathname
    });
  }

  /**
   * 执行退出登录，并将用户带回公开首页。
   */
  function handleSignOut(): void {
    signOut({ callbackUrl: "/home" });
  }

  return (
    <header>
      <div className="container nav-container">
        <Link href="/home" className="logo" aria-label="返回面面吧首页">
          <span className="logo-dot" />
          面面吧
        </Link>

        <nav className={`nav-links ${isLoginPage ? "hidden" : "active"}`} id="main-nav">
          {primaryNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link nav-link--pill ${isNavActive(item.href) ? "current" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <Link
                href="/admin/users"
                className={`nav-link nav-link--pill ${pathname.startsWith("/admin/users") ? "current" : ""}`}
              >
                会员管理
              </Link>
              <Link
                href="/admin/learning"
                className={`nav-link nav-link--pill ${pathname.startsWith("/admin/learning") || pathname.startsWith("/admin/knowledge") ? "current" : ""}`}
              >
                学习后台
              </Link>
            </>
          )}
        </nav>

        {!isLoginPage && (
          <div className={`user-menu ${status === "loading" ? "active" : "active"}`} id="user-menu">
            {session?.user?.id ? (
              <>
                <div className="header-profile-menu">
                  <button type="button" className="header-profile-trigger" aria-label="打开个人菜单">
                    <span className={`header-badge ${vipHonorLabel ? "header-badge--vip" : "header-badge--free"}`}>
                      {vipHonorLabel ?? "免费版"}
                    </span>
                    <span className="avatar">
                      {getUserInitials(session.user.nickname || session.user.name, session.user.email)}
                    </span>
                  </button>
                  <div className="header-profile-dropdown">
                    <Link href="/me" className="header-profile-dropdown__item">
                      查看个人详情
                    </Link>
                    <button type="button" className="header-profile-dropdown__item" onClick={handleSignOut}>
                      退出登录
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="auth-switch auth-switch--header">
                <button
                  type="button"
                  className="auth-switch__item auth-switch__item--secondary"
                  onClick={() => openAuth("login")}
                >
                  登录
                </button>
                <button
                  type="button"
                  className="auth-switch__item auth-switch__item--primary"
                  onClick={() => openAuth("register")}
                >
                  注册
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
