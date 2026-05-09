"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type ExitReason = "navigation" | "unload";

type ActiveGuard = {
  message: string;
  onConfirmExit: (reason: ExitReason) => Promise<void> | void;
};

type InterviewExitGuardContextValue = {
  registerExitGuard: (guard: ActiveGuard) => void;
  clearExitGuard: () => void;
  requestRouteChange: (href: string) => void;
  hasActiveGuard: boolean;
};

const InterviewExitGuardContext =
  createContext<InterviewExitGuardContextValue | null>(null);

/**
 * 为全站提供面试离开保护，统一拦截菜单跳转与页面卸载。
 * @param props Provider 属性。
 * @returns 带离开确认能力的应用子树。
 */
export default function InterviewExitGuardProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const guardRef = useRef<ActiveGuard | null>(null);
  const unloadConfirmedRef = useRef(false);
  const [hasActiveGuard, setHasActiveGuard] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMessage, setDialogMessage] = useState(
    "当前面试还在进行中，离开后会立即结束并记录本次面试。"
  );
  const [isConfirming, setIsConfirming] = useState(false);

  /**
   * 注册当前页面的离开保护逻辑。
   * @param guard 离开提示与确认后的结束动作。
   */
  const registerExitGuard = useCallback((guard: ActiveGuard) => {
    guardRef.current = guard;
    unloadConfirmedRef.current = false;
    setDialogMessage(guard.message);
    setHasActiveGuard(true);
  }, []);

  /**
   * 清理当前页面的离开保护状态。
   */
  const clearExitGuard = useCallback(() => {
    guardRef.current = null;
    unloadConfirmedRef.current = false;
    setPendingHref(null);
    setShowDialog(false);
    setHasActiveGuard(false);
  }, []);

  /**
   * 由导航菜单调用的路由跳转入口，必要时先弹出结束确认。
   * @param href 目标地址。
   */
  const requestRouteChange = useCallback(
    (href: string) => {
      if (!guardRef.current || href === pathname) {
        router.push(href);
        return;
      }

      setPendingHref(href);
      setDialogMessage(guardRef.current.message);
      setShowDialog(true);
    },
    [pathname, router]
  );

  /**
   * 取消当前离开操作并关闭确认弹层。
   */
  const handleCancel = useCallback(() => {
    setPendingHref(null);
    setShowDialog(false);
  }, []);

  /**
   * 在用户确认后执行真实结束逻辑，再完成页面跳转。
   */
  const handleConfirm = useCallback(async () => {
    if (!guardRef.current) {
      if (pendingHref) {
        router.push(pendingHref);
      }
      setPendingHref(null);
      setShowDialog(false);
      return;
    }

    setIsConfirming(true);
    try {
      await guardRef.current.onConfirmExit("navigation");
      const nextHref = pendingHref;
      clearExitGuard();
      if (nextHref) {
        router.push(nextHref);
      }
    } finally {
      setIsConfirming(false);
    }
  }, [clearExitGuard, pendingHref, router]);

  useEffect(() => {
    if (!hasActiveGuard) {
      return;
    }

    /**
     * 在浏览器尝试关闭、刷新或直接离开页面时触发原生确认框。
     * @param event 浏览器卸载事件。
     */
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guardRef.current) {
        return;
      }

      unloadConfirmedRef.current = true;
      event.preventDefault();
      event.returnValue = "";
    };

    /**
     * 在用户确认离开后，尽可能用 keepalive 请求补做会话结束。
     */
    const handlePageHide = () => {
      if (!guardRef.current || !unloadConfirmedRef.current) {
        return;
      }

      void guardRef.current.onConfirmExit("unload");
      guardRef.current = null;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [hasActiveGuard]);

  const contextValue = useMemo<InterviewExitGuardContextValue>(
    () => ({
      registerExitGuard,
      clearExitGuard,
      requestRouteChange,
      hasActiveGuard
    }),
    [clearExitGuard, hasActiveGuard, registerExitGuard, requestRouteChange]
  );

  return (
    <InterviewExitGuardContext.Provider value={contextValue}>
      {children}
      {showDialog ? (
        <div className="auth-modal" role="dialog" aria-modal="true" aria-label="结束当前面试确认">
          <button
            type="button"
            className="auth-modal__backdrop"
            aria-label="取消离开"
            onClick={handleCancel}
          />
          <div className="auth-modal__panel">
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: "28px",
                border: "1px solid rgba(20, 20, 19, 0.08)",
                background: "rgba(255, 255, 255, 0.96)",
                boxShadow: "0 28px 70px rgba(20, 20, 19, 0.12)",
                padding: "2rem"
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.72rem",
                  borderRadius: "999px",
                  background: "rgba(217, 119, 87, 0.1)",
                  color: "var(--accent-orange)",
                  border: "1px solid rgba(217, 119, 87, 0.18)",
                  fontSize: "0.8rem",
                  fontWeight: 600
                }}
              >
                面试进行中
              </div>
              <h2 style={{ margin: "1rem 0 0.75rem 0", fontSize: "1.7rem" }}>
                确认结束当前面试？
              </h2>
              <p style={{ marginBottom: "1.6rem", color: "rgba(20, 20, 19, 0.74)" }}>
                {dialogMessage}
              </p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancel}
                  disabled={isConfirming}
                >
                  继续当前面试
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  disabled={isConfirming}
                >
                  {isConfirming ? "正在结束..." : "结束并离开"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </InterviewExitGuardContext.Provider>
  );
}

/**
 * 读取全站面试离开保护上下文。
 * @returns 注册、清理和触发离开确认的能力。
 */
export function useInterviewExitGuard(): InterviewExitGuardContextValue {
  const context = useContext(InterviewExitGuardContext);

  if (!context) {
    throw new Error(
      "useInterviewExitGuard must be used within InterviewExitGuardProvider"
    );
  }

  return context;
}
