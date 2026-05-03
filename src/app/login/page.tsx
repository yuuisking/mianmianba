"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("resumer_saved_emails");
      if (stored) {
        setSavedEmails(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const addSavedEmail = (emailToSave: string) => {
    try {
      const normalized = emailToSave.trim().toLowerCase();
      if (!normalized) return;
      const stored = localStorage.getItem("resumer_saved_emails");
      const list: string[] = stored ? JSON.parse(stored) : [];
      const filtered = list.filter((e: string) => e.toLowerCase() !== normalized);
      filtered.unshift(emailToSave.trim());
      const next = filtered.slice(0, 5);
      localStorage.setItem("resumer_saved_emails", JSON.stringify(next));
      setSavedEmails(next);
    } catch {
      // ignore
    }
  };

  const removeSavedEmail = (emailToRemove: string) => {
    try {
      const normalized = emailToRemove.toLowerCase();
      const next = savedEmails.filter((e) => e.toLowerCase() !== normalized);
      localStorage.setItem("resumer_saved_emails", JSON.stringify(next));
      setSavedEmails(next);
    } catch {
      // ignore
    }
  };

  const selectSavedEmail = (selected: string) => {
    setEmail(selected);
    passwordRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (isLogin) {
      // Login
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password
      });

      if (res && res.ok) {
        addSavedEmail(email);
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(res?.error || "登录失败");
      }
    } else {
      // Register
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password, name }),
        });

        const data = await res.json();

        if (res.ok) {
          addSavedEmail(email);
          // Auto login after registration
          const loginRes = await signIn("credentials", {
            redirect: false,
            email,
            password
          });

          if (loginRes && loginRes.ok) {
            router.push("/dashboard");
            router.refresh();
          } else {
            setError("注册成功，但自动登录失败");
          }
        } else {
          setError(data.message || "注册失败");
        }
      } catch (err) {
        setError("网络错误，请稍后再试");
      }
    }
    setLoading(false);
  };

  return (
    <section style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <div className="login-wrapper" style={{ margin: "auto", width: "100%" }}>
        <h2 style={{ textAlign: "center", marginBottom: "0.5rem" }}>
          {isLogin ? "欢迎登录" : "注册账号"}
        </h2>
        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "2rem", fontFamily: "var(--font-ui)" }}>
          开启您的结构化模拟面试训练
        </p>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", marginBottom: "2rem" }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: "0.75rem 0",
              textAlign: "center",
              fontSize: "0.95rem",
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
              borderBottom: isLogin ? "2px solid var(--accent-orange)" : "2px solid transparent",
              color: isLogin ? "var(--accent-orange)" : "var(--text-muted)",
              background: "transparent",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              transition: "var(--transition)"
            }}
            onClick={() => {
              setIsLogin(true);
              setError("");
            }}
          >
            登录
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: "0.75rem 0",
              textAlign: "center",
              fontSize: "0.95rem",
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
              borderBottom: !isLogin ? "2px solid var(--accent-orange)" : "2px solid transparent",
              color: !isLogin ? "var(--accent-orange)" : "var(--text-muted)",
              background: "transparent",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              transition: "var(--transition)"
            }}
            onClick={() => {
              setIsLogin(false);
              setError("");
            }}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ backgroundColor: "rgba(217, 119, 87, 0.1)", color: "var(--accent-orange)", padding: "0.75rem", borderRadius: "4px", fontSize: "0.9rem", textAlign: "center", marginBottom: "1.5rem", fontFamily: "var(--font-ui)" }}>
              {error}
            </div>
          )}

          {!isLogin && (
            <div className="input-group">
              <label className="input-label">姓名</label>
              <input
                type="text"
                required={!isLogin}
                className="input-control"
                placeholder="您的姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          {isLogin && savedEmails.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <label className="input-label" style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem", display: "block" }}>
                历史账号
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {savedEmails.map((saved) => (
                  <div
                    key={saved}
                    onClick={() => selectSavedEmail(saved)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.35rem 0.75rem",
                      backgroundColor: "var(--bg-surface)",
                      border: `1px solid ${email === saved ? "var(--accent-orange)" : "var(--border-color)"}`,
                      borderRadius: "20px",
                      fontSize: "0.85rem",
                      fontFamily: "var(--font-ui)",
                      color: email === saved ? "var(--accent-orange)" : "var(--text-dark)",
                      cursor: "pointer",
                      transition: "var(--transition)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent-orange)";
                    }}
                    onMouseLeave={(e) => {
                      if (email !== saved) {
                        e.currentTarget.style.borderColor = "var(--border-color)";
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    {saved}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSavedEmail(saved);
                      }}
                      style={{
                        marginLeft: "0.25rem",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        transition: "var(--transition)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--border-color)";
                        e.currentTarget.style.color = "var(--text-dark)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">邮箱地址</label>
            <input
              type="email"
              required
              className="input-control"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">密码</label>
            <input
              ref={passwordRef}
              type="password"
              required
              className="input-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "1rem", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "处理中..." : isLogin ? "登录" : "注册"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "2rem", fontFamily: "var(--font-ui)" }}>
          {isLogin ? "登录即代表同意用户协议与隐私政策" : "注册即代表同意用户协议与隐私政策"}
        </p>
      </div>
    </section>
  );
}
