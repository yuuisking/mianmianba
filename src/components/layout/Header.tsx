"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Suspense } from "react";

export default function Header() {
  return (
    <Suspense fallback={<div className="h-16 bg-white border-b border-gray-200"></div>}>
      <HeaderContent />
    </Suspense>
  );
}

function HeaderContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  // On login page, we don't show the nav links and user menu.
  const isLogin = pathname === "/login" || pathname === "/";

  // Check if user is admin
  const isAdmin = session?.user?.email?.toLowerCase().includes("admin") || session?.user?.name?.toLowerCase().includes("admin");

  return (
    <header>
      <div className="container nav-container flex items-center justify-between">
        <Link href="/dashboard" className="logo flex items-center gap-2">
          <div className="logo-dot w-3 h-3 bg-blue-500 rounded-full"></div> 面面吧
        </Link>
        
        <nav className={`nav-links flex gap-2 ${!isLogin && session ? "active" : "hidden"}`} id="main-nav">
          <Link 
            href="/dashboard" 
            className={`nav-link transition-all duration-200 px-4 py-2 rounded-full ${pathname === "/dashboard" ? "font-semibold text-gray-900 bg-gray-100/80 shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            控制台
          </Link>
          <Link 
            href="/setup" 
            className={`nav-link transition-all duration-200 px-4 py-2 rounded-full ${["/setup", "/profile", "/interview"].includes(pathname) && !searchParams.get("mode")?.includes("targeted") ? "font-semibold text-gray-900 bg-gray-100/80 shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            发起面试
          </Link>
          <Link 
            href="/practice" 
            className={`nav-link transition-all duration-200 px-4 py-2 rounded-full ${["/practice"].includes(pathname) || (pathname === "/interview" && searchParams.get("mode") === "targeted") ? "font-semibold text-gray-900 bg-gray-100/80 shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            专项训练
          </Link>
          <Link 
            href="/learning" 
            className={`nav-link transition-all duration-200 px-4 py-2 rounded-full ${["/learning"].includes(pathname) ? "font-semibold text-gray-900 bg-gray-100/80 shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            学习中心
          </Link>
          {isAdmin && (
            <Link 
              href="/admin/learning" 
              className={`nav-link transition-all duration-200 px-4 py-2 rounded-full ${["/admin/learning"].includes(pathname) ? "font-semibold text-gray-900 bg-gray-100/80 shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
            >
              后台管理
            </Link>
          )}
          <Link 
            href="/review" 
            className={`nav-link transition-all duration-200 px-4 py-2 rounded-full ${["/review", "/report"].includes(pathname) ? "font-semibold text-gray-900 bg-gray-100/80 shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            复盘中心
          </Link>
        </nav>

        <div className={`user-menu flex items-center gap-4 ${!isLogin && session ? "active" : "hidden"}`} id="user-menu">
          <span className="text-sm font-medium text-gray-600">免费版 (剩余 2 次)</span>
          <div className="flex items-center gap-3">
            <div className="avatar w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
              {session?.user?.name?.charAt(0) || "U"}
            </div>
            <button 
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              退出
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
