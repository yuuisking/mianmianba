"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import { isAdminRole } from "@/lib/permissions";

const dashboardCards = [
  {
    title: "模拟面试",
    description: "上传简历与岗位描述，生成画像后进入完整面试链路。",
    href: "/setup",
    accent: "var(--accent-orange)"
  },
  {
    title: "专项训练",
    description: "一句话指定训练主题，直接进入定点突破模式。",
    href: "/practice",
    accent: "var(--accent-blue)"
  },
  {
    title: "复盘中心",
    description: "查看历史记录、维度评分与下一步训练建议。",
    href: "/review",
    accent: "var(--accent-green)"
  }
] as const;

/**
 * 渲染用户登录后的控制台入口，并根据角色展示后台管理卡片。
 * @returns 控制台页面组件。
 */
export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const isAdmin = isAdminRole(session?.user?.role);
  const isAuthenticated = Boolean(session?.user?.id);

  /**
   * 统一处理工作台卡片点击，未登录时先要求完成认证。
   * @param href 目标地址。
   */
  function handleCardClick(href: string): void {
    if (isAuthenticated) {
      router.push(href);
      return;
    }

    requestAuth({
      title: "登录后继续使用",
      description: "登录后即可进入对应模块，并保存你的练习与复盘记录。",
      callbackUrl: href,
      onSuccess: () => router.push(href)
    });
  }

  return (
    <section
      id="view-dashboard"
      className="view active"
      style={{
        marginTop: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "2rem"
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
          gap: "1.5rem"
        }}
      >
        <div
          style={{
            padding: "2.5rem",
            borderRadius: "30px",
            border: "1px solid rgba(20, 20, 19, 0.08)",
            background:
              "radial-gradient(500px 260px at 6% 8%, rgba(217, 119, 87, 0.18), transparent 62%), radial-gradient(420px 220px at 92% 12%, rgba(106, 155, 204, 0.14), transparent 56%), rgba(255, 255, 255, 0.86)"
          }}
        >
          <span className="tag tag-primary">{isAuthenticated ? "My Workspace" : "面面吧 Workspace"}</span>
          <h1 style={{ marginTop: "1rem", marginBottom: "0.75rem" }}>
            {isAuthenticated
              ? `你好，${session?.user?.nickname || session?.user?.name || "候选人"}`
              : "你好，这里是你的练习工作台。"}
          </h1>
          <p style={{ maxWidth: "56ch", marginBottom: "1.5rem", color: "rgba(20, 20, 19, 0.72)" }}>
            {isAuthenticated
              ? "继续发起模拟面试、专项训练、查看复盘记录，或进入个人资料页维护你的账号信息。"
              : "从这里进入模拟面试、专项训练和复盘中心，登录后可以保留你的练习记录与报告结果。"}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={() => handleCardClick("/setup")}>
              开始模拟面试
            </button>
            <Link href="/home" className="btn btn-secondary">
              回到公开首页
            </Link>
          </div>
        </div>

        <div
          style={{
            padding: "1.5rem",
            borderRadius: "30px",
            background: "rgba(20, 20, 19, 0.92)",
            color: "white",
            display: "grid",
            gap: "0.9rem"
          }}
        >
          <h3 style={{ color: "white", marginBottom: 0 }}>工作台概览</h3>
          <p style={{ color: "rgba(255,255,255,0.72)", fontSize: "0.98rem", marginBottom: 0 }}>
            模拟面试、专项训练、复盘查看和个人资料都从这里进入，保持同一套简洁的使用体验。
          </p>
          <div style={{ display: "grid", gap: "0.7rem" }}>
            <div className="tag" style={{ background: "rgba(255,255,255,0.08)", color: "white" }}>
              模拟面试与岗位画像
            </div>
            <div className="tag" style={{ background: "rgba(255,255,255,0.08)", color: "white" }}>
              专项训练与复盘查看
            </div>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "fit-content", color: "white", borderColor: "rgba(255,255,255,0.28)" }}
                onClick={() => router.push("/admin/users")}
              >
                进入会员管理
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {dashboardCards.map((card) => (
          <button
            key={card.title}
            type="button"
            onClick={() => handleCardClick(card.href)}
            style={{
              textAlign: "left",
              padding: "1.6rem",
              borderRadius: "26px",
              border: "1px solid rgba(20, 20, 19, 0.08)",
              background: "rgba(255, 255, 255, 0.88)",
              cursor: "pointer",
              boxShadow: "0 16px 36px rgba(20, 20, 19, 0.05)"
            }}
          >
            <span
              style={{
                width: "40px",
                height: "4px",
                display: "block",
                borderRadius: "999px",
                background: card.accent,
                marginBottom: "1rem"
              }}
            />
            <h3 style={{ marginBottom: "0.55rem" }}>{card.title}</h3>
            <p style={{ fontSize: "0.96rem", color: "rgba(20, 20, 19, 0.7)", marginBottom: "1rem" }}>
              {card.description}
            </p>
            <span style={{ fontWeight: 700, color: "var(--text-dark)" }}>
              {isAuthenticated ? "立即进入" : "登录后继续"} →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
