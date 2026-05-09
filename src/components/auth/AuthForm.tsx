"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type AuthFormMode = "login" | "register";

type AuthFormProps = {
  initialMode?: AuthFormMode;
  callbackUrl?: string;
  showClose?: boolean;
  title?: string;
  description?: string;
  onClose?: () => void;
  onSuccess?: () => void;
};

const SAVED_EMAILS_KEY = "resumer_saved_emails";

/**
 * 渲染统一的登录注册表单，支持独立页面与弹层两种场景复用。
 * @param props 表单初始化模式、关闭行为与成功回调等配置。
 * @returns 认证表单界面。
 */
export default function AuthForm({
  initialMode = "login",
  callbackUrl,
  showClose = false,
  title,
  description,
  onClose,
  onSuccess
}: AuthFormProps) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);

  const isLogin = mode === "login";

  const heading = useMemo(() => {
    if (title) {
      return title;
    }

    return isLogin ? "欢迎回来" : "创建账户";
  }, [isLogin, title]);

  const subheading = useMemo(() => {
    if (description) {
      return description;
    }

    return isLogin ? "登录后继续使用训练、记录与报告。" : "注册后即可开始练习与复盘。";
  }, [description, isLogin]);

  useEffect(() => {
    setMode(initialMode);
    setError("");
  }, [initialMode]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_EMAILS_KEY);
      if (stored) {
        setSavedEmails(JSON.parse(stored) as string[]);
      }
    } catch {
      setSavedEmails([]);
    }
  }, []);

  /**
   * 记录最近登录成功的邮箱，便于用户快速复用历史账号。
   * @param emailToSave 本次需要保存的邮箱。
   */
  function addSavedEmail(emailToSave: string): void {
    try {
      const normalized = emailToSave.trim().toLowerCase();
      if (!normalized) {
        return;
      }

      const next = [emailToSave.trim(), ...savedEmails.filter((item) => item.toLowerCase() !== normalized)]
        .slice(0, 5);
      localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify(next));
      setSavedEmails(next);
    } catch {
      setSavedEmails((current) => current);
    }
  }

  /**
   * 删除不再需要的历史邮箱，避免快捷列表过时。
   * @param emailToRemove 需要移除的邮箱。
   */
  function removeSavedEmail(emailToRemove: string): void {
    try {
      const normalized = emailToRemove.toLowerCase();
      const next = savedEmails.filter((item) => item.toLowerCase() !== normalized);
      localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify(next));
      setSavedEmails(next);
    } catch {
      setSavedEmails((current) => current.filter((item) => item !== emailToRemove));
    }
  }

  /**
   * 应用历史邮箱并自动聚焦密码输入框，加快再次登录。
   * @param selected 用户选择的历史邮箱。
   */
  function selectSavedEmail(selected: string): void {
    setEmail(selected);
    passwordRef.current?.focus();
  }

  /**
   * 在认证成功后执行统一回流逻辑，可继续当前动作或跳到指定页面。
   */
  function handleSuccess(): void {
    addSavedEmail(email);

    if (onSuccess) {
      onSuccess();
      router.refresh();
      return;
    }

    router.push(callbackUrl || "/home");
    router.refresh();
  }

  /**
   * 执行邮箱密码登录，并在成功后回到目标页面。
   */
  async function submitLogin(): Promise<void> {
    const result = await signIn("credentials", {
      redirect: false,
      email,
      password
    });

    if (result?.ok) {
      handleSuccess();
      return;
    }

    setError(result?.error || "登录失败，请检查邮箱或密码");
  }

  /**
   * 执行注册请求，并在成功后自动登录当前用户。
   */
  async function submitRegister(): Promise<void> {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        name,
        nickname: name
      })
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setError(data.message || "注册失败，请稍后再试");
      return;
    }

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password
    });

    if (result?.ok) {
      handleSuccess();
      return;
    }

    setError("注册成功，但自动登录失败，请直接使用新账号登录");
    setMode("login");
  }

  /**
   * 提交认证表单，并根据当前模式执行登录或注册。
   * @param event 表单提交事件。
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        await submitLogin();
      } else {
        await submitRegister();
      }
    } catch {
      setError("网络繁忙，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  /**
   * 切换登录与注册视图，并清理当前错误信息。
   * @param nextMode 目标模式。
   */
  function switchMode(nextMode: AuthFormMode): void {
    setMode(nextMode);
    setError("");
  }

  return (
    <div className="auth-card">
      <div className="auth-card__glow" aria-hidden />
      <div className="auth-card__content">
        <div className="auth-card__header">
          <div>
            <span className="auth-badge">面面吧</span>
            <h2 className="auth-card__title">{heading}</h2>
            <p className="auth-card__desc">{subheading}</p>
          </div>
          {showClose && (
            <button
              type="button"
              className="auth-close"
              onClick={onClose}
              aria-label="关闭认证弹层"
            >
              ×
            </button>
          )}
        </div>

        <div className="auth-switch auth-switch--tabs" role="tablist" aria-label="认证模式切换">
          <button
            type="button"
            className={`auth-switch__item ${isLogin ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={`auth-switch__item ${!isLogin ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-feedback auth-feedback--error">{error}</div>}

          {!isLogin && (
            <div className="input-group">
              <label className="input-label" htmlFor="auth-name">
                昵称
              </label>
              <input
                id="auth-name"
                type="text"
                required={!isLogin}
                className="input-control"
                value={name}
                placeholder="例如：阿阳"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}

          {isLogin && savedEmails.length > 0 && (
            <div className="input-group">
              <label className="input-label">最近使用</label>
              <div className="auth-saved-list">
                {savedEmails.map((saved) => (
                  <button
                    key={saved}
                    type="button"
                    className={`auth-saved-chip ${email === saved ? "active" : ""}`}
                    onClick={() => selectSavedEmail(saved)}
                  >
                    <span>{saved}</span>
                    <span
                      aria-label={`移除 ${saved}`}
                      className="auth-saved-chip__remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSavedEmail(saved);
                      }}
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label" htmlFor="auth-email">
              邮箱地址
            </label>
            <input
              id="auth-email"
              type="email"
              required
              className="input-control"
              value={email}
              placeholder="name@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="auth-password">
              密码
            </label>
            <input
              id="auth-password"
              ref={passwordRef}
              type="password"
              required
              className="input-control"
              value={password}
              placeholder="至少 8 位，包含字母与数字"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading ? "处理中..." : isLogin ? "登录并继续" : "注册并继续"}
          </button>
        </form>

        <div className="auth-card__footer">
          <div className="auth-card__stat">
            <strong>开始练习</strong>
            <span>登录后保存你的训练与面试记录。</span>
          </div>
          <div className="auth-card__stat">
            <strong>查看报告</strong>
            <span>在同一账号下持续查看历史复盘。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
