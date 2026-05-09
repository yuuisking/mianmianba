"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import {
  formatDateTime,
  getEffectiveVipLabel,
  getMembershipPresentation,
  getRoleLabel,
  getStatusLabel,
  getUserInitials
} from "@/lib/userPresentation";

type ProfileData = {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  vipType: string;
  vipExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * 渲染用户头像详情页，支持查看并维护当前账号基础资料。
 * @returns 用户个人资料页。
 */
export default function MePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    nickname: "",
    avatarUrl: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /**
   * 将接口返回的资料同步到可编辑表单中。
   * @param data 当前用户资料。
   */
  function syncFormState(data: ProfileData): void {
    setFormState({
      name: data.name ?? "",
      nickname: data.nickname ?? "",
      avatarUrl: data.avatarUrl ?? ""
    });
  }

  /**
   * 获取当前登录用户资料；若尚未登录则仅展示受保护说明。
   */
  const loadProfile = useCallback(async (): Promise<void> => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/user/profile");
      const payload = (await response.json().catch(() => ({}))) as {
        data?: ProfileData;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "个人资料加载失败");
      }

      setProfile(payload.data);
      syncFormState(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "个人资料加载失败");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const membership = useMemo(
    () => getMembershipPresentation(profile?.vipType, profile?.vipExpiresAt),
    [profile?.vipExpiresAt, profile?.vipType]
  );
  const effectiveVipLabel = useMemo(
    () => getEffectiveVipLabel(profile?.vipType, profile?.vipExpiresAt),
    [profile?.vipExpiresAt, profile?.vipType]
  );

  /**
   * 更新本地表单值，避免每个输入框重复拼接状态逻辑。
   * @param field 需要更新的字段名。
   * @param value 新的字段值。
   */
  function updateField(field: keyof typeof formState, value: string): void {
    setFormState((current) => ({
      ...current,
      [field]: value
    }));
    setSuccess("");
  }

  /**
   * 提交个人资料更新，仅修改允许前台用户维护的展示字段。
   * @param event 表单提交事件。
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formState)
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: ProfileData;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "资料更新失败");
      }

      setProfile(payload.data);
      syncFormState(payload.data);
      setSuccess("资料已更新");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "资料更新失败");
    } finally {
      setSaving(false);
    }
  }

  if (!session?.user?.id) {
    return (
      <section className="view active" style={{ maxWidth: "1080px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)",
            gap: "1.5rem"
          }}
        >
          <div
            style={{
              padding: "2.5rem",
              borderRadius: "32px",
              border: "1px solid rgba(20, 20, 19, 0.08)",
              background:
                "radial-gradient(460px 220px at 8% 12%, rgba(217, 119, 87, 0.16), transparent 58%), rgba(255,255,255,0.9)"
            }}
          >
            <span className="tag tag-primary">Avatar Detail</span>
            <h1 style={{ marginTop: "1rem" }}>头像入口已就绪，但个人资料属于私有信息。</h1>
            <p style={{ color: "rgba(20, 20, 19, 0.72)", maxWidth: "54ch" }}>
              现在你可以先浏览资料页框架、字段结构和会员信息布局。当你真正查看自己的昵称、头像、会员与账号状态时，再通过统一认证弹层完成登录。
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  requestAuth({
                    title: "登录后查看个人资料",
                    description: "登录成功后将直接进入你的头像详情页。",
                    callbackUrl: "/me"
                  })
                }
              >
                登录查看我的资料
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => router.push("/home")}>
                返回首页
              </button>
            </div>
          </div>

          <div
            style={{
              padding: "2rem",
              borderRadius: "32px",
              background: "rgba(20, 20, 19, 0.92)",
              color: "white"
            }}
          >
            <h3 style={{ color: "white" }}>资料页将展示</h3>
            <ul style={{ paddingLeft: "1.1rem", lineHeight: 1.8, color: "rgba(255,255,255,0.78)" }}>
              <li>昵称、邮箱、头像与账号标识</li>
              <li>角色、账号状态、会员类型与到期时间</li>
              <li>创建时间、最后登录时间与可编辑字段</li>
            </ul>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="view active" style={{ display: "flex", justifyContent: "center", paddingTop: "6rem" }}>
        <div className="spinner" />
      </section>
    );
  }

  return (
    <section className="view active" style={{ maxWidth: "1120px", margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px minmax(0, 1fr)",
          gap: "1.5rem"
        }}
      >
        <aside
          style={{
            padding: "2rem",
            borderRadius: "32px",
            background: "rgba(20, 20, 19, 0.92)",
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          <div
            style={{
              width: "84px",
              height: "84px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.4rem",
              fontWeight: 700
            }}
          >
            {getUserInitials(profile?.nickname || profile?.name, profile?.email)}
          </div>
          <div>
            <h2 style={{ color: "white", marginBottom: "0.35rem" }}>
              {profile?.nickname || profile?.name || "未设置昵称"}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.72)", marginBottom: 0 }}>{profile?.email}</p>
          </div>
          <div className="divider" style={{ margin: "0.5rem 0", background: "rgba(255,255,255,0.12)" }} />
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <div className="tag" style={{ background: "rgba(255,255,255,0.08)", color: "white" }}>
              {getRoleLabel(profile?.role)}
            </div>
            <div className="tag" style={{ background: "rgba(255,255,255,0.08)", color: "white" }}>
              {getStatusLabel(profile?.status)}
            </div>
            <div className="tag" style={{ background: "rgba(255,255,255,0.08)", color: "white" }}>
              {effectiveVipLabel}
            </div>
          </div>
        </aside>

        <div
          style={{
            padding: "2rem",
            borderRadius: "32px",
            background: "rgba(255,255,255,0.88)",
            border: "1px solid rgba(20, 20, 19, 0.08)",
            boxShadow: "0 18px 40px rgba(20, 20, 19, 0.06)"
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <span className="tag tag-primary">Task 4 / 6</span>
            <h1 style={{ marginTop: "1rem", marginBottom: "0.6rem" }}>个人详情页</h1>
            <p style={{ color: "rgba(20, 20, 19, 0.72)" }}>
              从头像入口进入，查看你的基础资料、会员信息与账号状态，并维护昵称、姓名和头像地址。
            </p>
          </div>

          {error && <div className="auth-feedback auth-feedback--error">{error}</div>}
          {success && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.9rem 1rem",
                borderRadius: "14px",
                background: "rgba(120, 140, 93, 0.1)",
                color: "var(--accent-green)"
              }}
            >
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="row" style={{ marginBottom: "1rem" }}>
              <div className="field">
                <label className="label" htmlFor="me-name">
                  姓名
                </label>
                <input
                  id="me-name"
                  className="input-control"
                  value={formState.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="用于完整身份展示"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="me-nickname">
                  昵称
                </label>
                <input
                  id="me-nickname"
                  className="input-control"
                  value={formState.nickname}
                  onChange={(event) => updateField("nickname", event.target.value)}
                  placeholder="用于头像和导航展示"
                />
              </div>
            </div>

            <div className="field" style={{ marginBottom: "1.5rem" }}>
              <label className="label" htmlFor="me-avatar">
                头像地址
              </label>
              <input
                id="me-avatar"
                className="input-control"
                value={formState.avatarUrl}
                onChange={(event) => updateField("avatarUrl", event.target.value)}
                placeholder="输入可公开访问的头像 URL"
              />
            </div>

            <div className="kvs" style={{ marginBottom: "1.5rem" }}>
              <div className="kv">
                <div className="k">账号状态</div>
                <div className="v">{getStatusLabel(profile?.status)}</div>
              </div>
              <div className="kv">
                <div className="k">当前生效会员</div>
                <div className="v">{effectiveVipLabel}</div>
              </div>
              <div className="kv">
                <div className="k">最近登录</div>
                <div className="v">{formatDateTime(profile?.lastLoginAt)}</div>
              </div>
              <div className="kv">
                <div className="k">账号创建</div>
                <div className="v">{formatDateTime(profile?.createdAt)}</div>
              </div>
            </div>

            <div
              style={{
                marginBottom: "1.5rem",
                padding: "1.1rem 1.15rem",
                borderRadius: "18px",
                background: "rgba(20, 20, 19, 0.035)",
                border: "1px solid rgba(20, 20, 19, 0.06)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "0.6rem"
                }}
              >
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>当前生效权益</div>
                <span className="tag">{membership.effectiveLabel}</span>
              </div>
              <div style={{ fontWeight: 600, color: "var(--text-dark)", marginBottom: "0.45rem" }}>
                {membership.summary}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginBottom: "0.8rem" }}>
                {membership.expiresText}
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.15rem", lineHeight: 1.75, color: "rgba(20, 20, 19, 0.82)" }}>
                {membership.benefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
              <div style={{ marginTop: "0.85rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {membership.downgradeText}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "保存中..." : "保存资料"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={loadProfile}>
                重新加载
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
