"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import {
  createInterviewLaunchId,
  writeStoredInterviewProfile,
} from "@/lib/interview/config";

/**
 * 渲染专项训练配置主体，支持从查询参数预填训练主题。
 * @returns 专项训练配置界面。
 */
function PracticeSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const [prompt, setPrompt] = useState(() => {
    const topic = searchParams.get("topic");
    const summary = searchParams.get("summary");
    const focus = searchParams.get("focus");
    const issueName = searchParams.get("issueName");
    const role = searchParams.get("role");
    const company = searchParams.get("company");
    const level = searchParams.get("level");
    const goal = searchParams.get("goal");

    if (topic) {
      const segments = [`我想做专项训练，训练主题：${topic}`];
      if (summary) {
        segments.push(`当前文档摘要：${summary}`);
      }
      if (focus) {
        segments.push(`希望重点追问：${focus}`);
      }

      return segments.join("；");
    }

    if (!issueName && !goal) {
      return "";
    }

    const reviewSegments = ["我想做专项训练"];
    if (role) {
      reviewSegments.push(`目标岗位：${role}`);
    }
    if (company) {
      reviewSegments.push(`目标公司：${company}`);
    }
    if (level) {
      reviewSegments.push(`当前职级：${level}`);
    }
    if (issueName) {
      reviewSegments.push(`当前要重点解决的问题：${issueName}`);
    }
    if (goal) {
      reviewSegments.push(`训练目标：${goal}`);
    }

    return reviewSegments.join("；");
  });
  const [submitError, setSubmitError] = useState("");
  const [isResolvingRole, setIsResolvingRole] = useState(false);
  const isComposingRef = useRef(false);

  const isFormValid = prompt.trim().length > 0;

  /**
   * 调用服务端岗位识别接口，从用户真实输入中提取岗位、主题与训练重点。
   * @param text 用户输入的训练文本。
   * @returns 结构化后的训练元信息；若岗位仍不明确则抛出明确提示。
   */
  const resolveTrainingContext = async (text: string) => {
    const response = await fetch("/api/interview/resolve-targeted-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text.trim() })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      data?: {
        role?: string;
        topic?: string;
        desc?: string;
        focus?: string;
        needsClarification?: boolean;
        clarificationPrompt?: string;
      };
    };

    if (!response.ok) {
      throw new Error(payload.error || "专项训练岗位识别失败，请稍后重试。");
    }

    const role = payload.data?.role?.trim() || "";
    const topic = payload.data?.topic?.trim() || text.trim();
    const desc = payload.data?.desc?.trim() || text.trim();
    const focus = payload.data?.focus?.trim() || topic;

    if (!role || payload.data?.needsClarification) {
      throw new Error(
        payload.data?.clarificationPrompt?.trim() ||
          "当前还不能可靠判断目标岗位，请补充更明确的岗位信息后再开始训练。"
      );
    }

    return { role, topic, desc, focus };
  };

  /**
   * 在已登录状态下真正发起专项训练，并跳转到面试房间。
   */
  const startTraining = async () => {
    if (!isFormValid || isResolvingRole) return;

    setSubmitError("");
    setIsResolvingRole(true);
    try {
      const { role, topic, desc, focus } = await resolveTrainingContext(prompt);
      writeStoredInterviewProfile({
        launchId: createInterviewLaunchId(),
        role,
        mode: "targeted",
        topic,
        desc,
        focus,
        limitType: "none",
        questionLimit: null,
        durationLimitMinutes: null,
        videoEnabled: false
      });
      router.push(
        `/interview?mode=targeted&topic=${encodeURIComponent(topic)}&desc=${encodeURIComponent(desc)}`
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "专项训练岗位识别失败，请补充更明确的信息后重试。"
      );
    } finally {
      setIsResolvingRole(false);
    }
  };

  /**
   * 处理用户点击开始训练的动作，匿名用户先触发登录弹层。
   */
  const handleStart = () => {
    if (!isFormValid) {
      return;
    }

    if (session?.user?.id) {
      void startTraining();
      return;
    }

    requestAuth({
      title: "登录后开始专项训练",
      description: "你已经可以先浏览专项训练页；真正开始训练时，我们会先为你完成登录并继续当前输入。",
      callbackUrl: "/practice",
      onSuccess: () => {
        void startTraining();
      }
    });
  };

  return (
    <section id="view-practice" className="view active" style={{ padding: "4rem 1.5rem", backgroundColor: "var(--bg-main)", minHeight: "calc(100vh - 70px)", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      <div style={{ width: "100%", maxWidth: "800px", marginTop: "4rem" }}>
        
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "56px", height: "56px", borderRadius: "50%", backgroundColor: "rgba(217, 119, 87, 0.1)", color: "var(--accent-orange)", marginBottom: "1rem" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "2.2rem", color: "var(--text-dark)", marginBottom: "0.75rem", fontWeight: 700 }}>
            发起专项训练
          </h1>
          <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "1.1rem", margin: 0 }}>
            {session?.user?.id
              ? "一句话描述训练目标，系统会先基于你的原话识别真实岗位，再进入专项追问。"
              : "匿名可先浏览训练框架；点击开始时会弹出登录注册，成功后自动继续当前动作。"}
          </p>
        </div>

        <div 
          style={{ 
            display: "flex", 
            alignItems: "center",
            flexWrap: "wrap",
            backgroundColor: "var(--bg-surface)", 
            borderRadius: "32px", 
            border: "1px solid var(--border-color)", 
            boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
            padding: "0.5rem 0.5rem 0.5rem 1.5rem",
            transition: "var(--transition)",
            width: "100%"
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent-orange)"}
          onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { setTimeout(() => { isComposingRef.current = false; }, 300); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isFormValid) {
                if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
                  return;
                }
                handleStart();
              }
            }}
            placeholder="一句话描述你想练什么，例如：我想练 Java 后端的 JVM 内存模型"
            style={{
              flex: 1,
              height: "56px",
              fontSize: "1.05rem",
              fontFamily: "var(--font-ui)",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--text-dark)",
              outline: "none",
              width: "100%"
            }}
          />

          <button
            onClick={handleStart}
            disabled={!isFormValid || isResolvingRole}
            style={{
              height: "56px",
              padding: "0 2rem",
              marginLeft: "1rem",
              borderRadius: "28px",
              backgroundColor:
                isFormValid && !isResolvingRole
                  ? "var(--accent-orange)"
                  : "var(--border-strong)",
              color: "white",
              border: "none",
              fontWeight: 600,
              fontFamily: "var(--font-ui)",
              fontSize: "1.1rem",
              cursor:
                isFormValid && !isResolvingRole ? "pointer" : "not-allowed",
              transition: "var(--transition)",
              boxShadow:
                isFormValid && !isResolvingRole
                  ? "0 4px 15px rgba(217, 119, 87, 0.25)"
                  : "none",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              if (!isFormValid || isResolvingRole) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(217, 119, 87, 0.35)";
            }}
            onMouseLeave={(e) => {
              if (!isFormValid || isResolvingRole) return;
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(217, 119, 87, 0.25)";
            }}
          >
            {isResolvingRole ? "识别中..." : "开始"}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>

        {submitError ? (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.95rem 1.1rem",
              borderRadius: "18px",
              border: "1px solid rgba(217, 119, 87, 0.22)",
              backgroundColor: "rgba(217, 119, 87, 0.06)",
              color: "var(--text-dark)",
              fontSize: "0.92rem",
              lineHeight: 1.7
            }}
          >
            {submitError}
          </div>
        ) : null}

      </div>
    </section>
  );
}

/**
 * 为专项训练配置页提供 Suspense 边界，满足查询参数在构建期的读取约束。
 * @returns 包含 Suspense 边界的专项训练配置页。
 */
export default function PracticeSetup() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PracticeSetupContent />
    </Suspense>
  );
}
