"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import AuthForm from "@/components/auth/AuthForm";

type AuthMode = "login" | "register";

type RequestAuthOptions = {
  mode?: AuthMode;
  title?: string;
  description?: string;
  callbackUrl?: string;
  onSuccess?: () => void;
};

type AuthDialogContextValue = {
  requestAuth: (options?: RequestAuthOptions) => void;
  closeAuth: () => void;
};

type DialogState = {
  isOpen: boolean;
  mode: AuthMode;
  title?: string;
  description?: string;
  callbackUrl?: string;
};

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

/**
 * 为全站提供统一的认证弹层上下文，并处理登录成功后的动作续接。
 * @param props 包含子节点的 Provider 属性。
 * @returns 包裹应用的上下文节点与认证弹层。
 */
export default function AuthDialogProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pendingSuccessRef = useRef<(() => void) | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    mode: "login"
  });

  /**
   * 打开认证弹层，并记录登录成功后的续接动作。
   * @param options 弹层模式、文案与回流目标等配置。
   */
  const requestAuth = useCallback((options?: RequestAuthOptions) => {
    pendingSuccessRef.current = options?.onSuccess ?? null;
    setDialogState({
      isOpen: true,
      mode: options?.mode ?? "login",
      title: options?.title,
      description: options?.description,
      callbackUrl: options?.callbackUrl
    });
  }, []);

  /**
   * 关闭当前认证弹层，并清理残留的续接动作。
   */
  const closeAuth = useCallback(() => {
    pendingSuccessRef.current = null;
    setDialogState((current) => ({
      ...current,
      isOpen: false
    }));
  }, []);

  /**
   * 在认证成功后执行原始动作，若无动作则回流到指定目标页。
   */
  const handleAuthSuccess = useCallback(() => {
    const pendingSuccess = pendingSuccessRef.current;
    const fallbackUrl = dialogState.callbackUrl;

    pendingSuccessRef.current = null;
    setDialogState((current) => ({
      ...current,
      isOpen: false
    }));

    if (pendingSuccess) {
      pendingSuccess();
      return;
    }

    if (fallbackUrl && fallbackUrl !== pathname) {
      router.push(fallbackUrl);
      router.refresh();
      return;
    }

    router.refresh();
  }, [dialogState.callbackUrl, pathname, router]);

  const contextValue = useMemo<AuthDialogContextValue>(
    () => ({
      requestAuth,
      closeAuth
    }),
    [closeAuth, requestAuth]
  );

  return (
    <AuthDialogContext.Provider value={contextValue}>
      {children}
      {dialogState.isOpen && (
        <div
          className="auth-modal"
          role="dialog"
          aria-modal="true"
          aria-label="登录或注册"
        >
          <button
            type="button"
            className="auth-modal__backdrop"
            aria-label="关闭认证弹层"
            onClick={closeAuth}
          />
          <div className="auth-modal__panel">
            <AuthForm
              initialMode={dialogState.mode}
              title={dialogState.title}
              description={dialogState.description}
              callbackUrl={dialogState.callbackUrl}
              showClose
              onClose={closeAuth}
              onSuccess={handleAuthSuccess}
            />
          </div>
        </div>
      )}
    </AuthDialogContext.Provider>
  );
}

/**
 * 读取统一认证弹层上下文，供各页面在受保护动作时调用。
 * @returns 认证弹层的打开与关闭能力。
 */
export function useAuthDialog(): AuthDialogContextValue {
  const context = useContext(AuthDialogContext);

  if (!context) {
    throw new Error("useAuthDialog must be used within AuthDialogProvider");
  }

  return context;
}
