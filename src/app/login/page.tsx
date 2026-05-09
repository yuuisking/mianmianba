import AuthForm from "@/components/auth/AuthForm";

type LoginPageSearchParams = Promise<{
  mode?: string | string[];
  callbackUrl?: string | string[];
}>;

/**
 * 渲染独立登录页，复用统一认证表单并支持来源页回流。
 * @param props 页面查询参数，按 Next 16 约定以异步方式读取。
 * @returns 登录注册入口页面。
 */
export default async function LoginPage({
  searchParams
}: {
  searchParams: LoginPageSearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const mode = Array.isArray(resolvedSearchParams.mode)
    ? resolvedSearchParams.mode[0]
    : resolvedSearchParams.mode;
  const callbackUrl = Array.isArray(resolvedSearchParams.callbackUrl)
    ? resolvedSearchParams.callbackUrl[0]
    : resolvedSearchParams.callbackUrl;
  const initialMode = mode === "register" ? "register" : "login";

  return (
    <section className="auth-page">
      <div className="auth-page__hero">
        <div>
          <span className="auth-page__eyebrow">
            <span className="logo-dot" />
            面面吧
          </span>
          <h1>登录后继续你的练习与报告。</h1>
          <p>
            保持同一个账号，连续完成模拟面试、专项训练与复盘查看。
          </p>
        </div>

        <div className="auth-page__grid">
          <div className="auth-page__metric">
            <strong>模拟面试</strong>
            <span>进入完整问答流程。</span>
          </div>
          <div className="auth-page__metric">
            <strong>专项训练</strong>
            <span>集中练习重点题型。</span>
          </div>
          <div className="auth-page__metric">
            <strong>复盘报告</strong>
            <span>查看评估结果与建议。</span>
          </div>
        </div>
      </div>

      <AuthForm
        initialMode={initialMode}
        callbackUrl={callbackUrl || "/home"}
        title="登录后继续"
        description="使用你的账号继续训练、面试与报告。"
      />
    </section>
  );
}
