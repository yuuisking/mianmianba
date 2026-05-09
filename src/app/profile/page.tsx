"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import {
  buildInterviewLimitStrategy,
  createInterviewLaunchId,
  normalizeInterviewMode,
  readStoredInterviewProfile,
  writeStoredInterviewProfile,
  type InterviewProfileState
} from "@/lib/interview/config";

/**
 * 从浏览器会话缓存中读取已解析的画像数据，避免刷新后丢失当前步骤上下文。
 * @returns 解析结果以及默认展示用的岗位与训练重点。
 */
function readStoredProfileState(): {
  parsedData: InterviewProfileState | null;
  role: string;
  focus: string;
} {
  const parsed = readStoredInterviewProfile();
  return {
    parsedData: parsed,
    role: parsed?.role?.trim() || "",
    focus: parsed?.focus || ""
  };
}

/**
 * 基于已解析的真实摘要、技术优势和项目线索拼出岗位识别提示词。
 * @param parsedData 当前会话中的真实解析结果。
 * @returns 用于 AI 岗位识别的真实上下文文本。
 */
function buildRoleResolutionPrompt(parsedData: InterviewProfileState): string {
  const summary = parsedData.resumeSummaryMarkdown?.trim() || "";
  const strengths = (parsedData.persona?.strengths || []).filter(Boolean).join("、");
  const projects = (parsedData.projects || [])
    .map((project) => `${project.name}：${project.points}`)
    .join("\n");

  return [
    summary ? `简历摘要：\n${summary}` : "",
    strengths ? `技术优势：${strengths}` : "",
    projects ? `项目经历：\n${projects}` : "",
    parsedData.focus?.trim() ? `当前重点：${parsedData.focus.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * 渲染解析确认页主体，并在进入面试前完成岗位确认与重点补充。
 * @returns 解析结果确认页界面。
 */
function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const mode = normalizeInterviewMode(searchParams.get("mode") || "text");

  const initialState = readStoredProfileState();
  const [parsedData] = useState<InterviewProfileState | null>(initialState.parsedData);
  const [role, setRole] = useState(initialState.role);
  const [focus, setFocus] = useState(initialState.focus);
  const [isResolvingRole, setIsResolvingRole] = useState(false);
  const [roleAssistText, setRoleAssistText] = useState(
    initialState.role ? "已根据简历自动识别岗位，你可以继续修改。" : ""
  );
  const roleEditedRef = useRef(false);
  const roleResolvedRef = useRef(Boolean(initialState.role));
  const canEnterRoom = Boolean(parsedData && role.trim());
  const limitStrategy = useMemo(
    () =>
      buildInterviewLimitStrategy(
        parsedData?.limitType ?? "none",
        parsedData?.questionLimit ?? null,
        parsedData?.durationLimitMinutes ?? null
      ),
    [parsedData?.durationLimitMinutes, parsedData?.limitType, parsedData?.questionLimit]
  );

  /**
   * 当解析结果未直接给出岗位时，基于真实简历摘要补做一次 AI 岗位识别。
   */
  useEffect(() => {
    if (!parsedData || role.trim() || roleResolvedRef.current) {
      return;
    }

    const prompt = buildRoleResolutionPrompt(parsedData);
    if (!prompt) {
      setRoleAssistText("暂未自动识别到岗位，请手动补充本场面试岗位。");
      roleResolvedRef.current = true;
      return;
    }

    roleResolvedRef.current = true;
    setIsResolvingRole(true);
    setRoleAssistText("正在根据真实简历内容自动识别岗位...");

    void (async () => {
      try {
        const response = await fetch("/api/interview/resolve-targeted-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
          throw new Error("岗位识别失败");
        }

        const payload = (await response.json()) as {
          data?: { role?: string; needsClarification?: boolean };
        };
        const resolvedRole = payload.data?.role?.trim() || "";

        if (!roleEditedRef.current && resolvedRole) {
          setRole(resolvedRole);
        }

        setRoleAssistText(
          resolvedRole
            ? "已根据简历自动识别岗位，你可以继续修改。"
            : "暂未自动识别到岗位，请手动补充本场面试岗位。"
        );
      } catch (error) {
        console.error("Failed to resolve role on profile page", error);
        setRoleAssistText("暂未自动识别到岗位，请手动补充本场面试岗位。");
      } finally {
        setIsResolvingRole(false);
      }
    })();
  }, [parsedData, role]);

  /**
   * 在已登录状态下进入面试房间，并保留当前确认后的岗位与训练重点。
   * @returns 无返回值，成功后跳转到面试页。
   */
  const enterRoom = () => {
    if (!parsedData || !role.trim()) {
      return;
    }

    writeStoredInterviewProfile({
      ...parsedData,
      launchId: createInterviewLaunchId(),
      role: role.trim(),
      focus,
      mode
    });
    router.push(`/interview?mode=${mode}`);
  };

  /**
   * 处理进入面试动作，匿名用户会先完成登录。
   * @returns 无返回值，根据登录态决定后续流程。
   */
  const handleEnterRoom = () => {
    if (!role.trim()) {
      return;
    }

    if (session?.user?.id) {
      enterRoom();
      return;
    }

    requestAuth({
      title: "登录后进入面试房间",
      description: "登录后即可继续进入当前面试流程。",
      callbackUrl: "/profile",
      onSuccess: enterRoom
    });
  };

  if (!parsedData) {
    return (
      <section id="view-profile" className="view active">
        <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center", padding: "4rem" }}>
          <p>暂无解析数据，请先返回配置页重新解析真实简历。</p>
          <button className="btn btn-primary" onClick={() => router.push("/setup")} style={{ marginTop: "1rem" }}>
            返回配置页
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      id="view-profile"
      className="view active"
      style={{
        padding: "1.6rem 2rem",
        backgroundColor: "var(--bg-main)",
        minHeight: "calc(100vh - 70px)"
      }}
    >
      <div
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "1.35rem"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap"
          }}
        >
          <div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.6rem", color: "var(--text-dark)", margin: 0 }}>
              确认面试岗位
            </h1>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.95rem", margin: "0.25rem 0 0 0" }}>
              页面只保留本场真正有用的信息，简历摘要已经回到上传区文本框中维护。
            </p>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "30px",
              padding: "0.4rem 1rem",
              boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
              width: "320px"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <input
              type="text"
              value={role}
              onChange={(e) => {
                roleEditedRef.current = true;
                setRole(e.target.value);
                setRoleAssistText("岗位支持手动修改，进入面试时将以这里的内容为准。");
              }}
              placeholder="例如：Java 后端开发工程师"
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: "1rem",
                fontFamily: "var(--font-ui)",
                fontWeight: 500,
                color: "var(--accent-orange)",
                width: "100%",
                padding: "0 0.75rem",
                textAlign: "center"
              }}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </div>
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "flex-end"
            }}
          >
            <span
              style={{
                fontSize: "0.82rem",
                color: isResolvingRole ? "var(--accent-orange)" : "var(--text-muted)",
                lineHeight: 1.6
              }}
            >
              {roleAssistText || "系统会优先根据真实简历自动识别岗位，你也可以手动修改。"}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.08fr) minmax(320px, 0.92fr)",
            gap: "1.2rem",
            alignItems: "start"
          }}
        >
          <div style={{ display: "grid", gap: "1.2rem" }}>
            <div
              style={{
                backgroundColor: "rgba(217, 119, 87, 0.03)",
                padding: "1.35rem 1.45rem",
                borderRadius: "18px",
                border: "1px solid rgba(217, 119, 87, 0.16)"
              }}
            >
              <h3 style={{ margin: "0 0 0.9rem 0", fontFamily: "var(--font-heading)", fontSize: "1.05rem", color: "var(--accent-orange)" }}>
                岗位匹配提醒和优化建议
              </h3>
              <div style={{ display: "grid", gap: "0.8rem" }}>
                <p style={{ margin: 0, color: "var(--text-dark)", lineHeight: 1.8 }}>
                  {parsedData.jdGapWarning?.text?.trim() || "当前没有额外的岗位匹配风险提醒，后续会继续根据真实对话动态判断。"}
                </p>
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "14px",
                    backgroundColor: "rgba(255,255,255,0.84)",
                    border: "1px solid rgba(217, 119, 87, 0.1)",
                    color: "var(--text-muted)",
                    fontSize: "0.88rem",
                    lineHeight: 1.7
                  }}
                >
                  <strong style={{ color: "var(--accent-orange)" }}>优化建议：</strong>{" "}
                  {parsedData.jdGapWarning?.strategy?.trim() || "当前没有额外的匹配优化建议，你也可以用下方重点输入继续收口本场方向。"}
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "var(--bg-surface)",
                padding: "1.35rem 1.45rem",
                borderRadius: "18px",
                border: "1px solid var(--border-color)"
              }}
            >
              <h3 style={{ margin: "0 0 0.9rem 0", fontFamily: "var(--font-heading)", fontSize: "1.05rem", color: "var(--text-dark)" }}>
                简历可优化点
              </h3>
              {(parsedData.resumeImprovements || []).length > 0 ? (
                <div style={{ display: "grid", gap: "0.7rem" }}>
                  {(parsedData.resumeImprovements || []).map((item, index) => (
                    <div
                      key={`resume-improvement-${index}`}
                      style={{
                        padding: "0.9rem 1rem",
                        borderRadius: "14px",
                        backgroundColor: "rgba(106, 155, 204, 0.04)",
                        border: "1px solid rgba(106, 155, 204, 0.12)",
                        color: "var(--text-dark)",
                        lineHeight: 1.75
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  当前没有额外的简历可优化点，后续会继续结合真实问答补充建议。
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: "1.2rem" }}>
            <div
              style={{
                backgroundColor: "rgba(106, 155, 204, 0.04)",
                padding: "1.35rem 1.45rem",
                borderRadius: "18px",
                border: "1px solid rgba(106, 155, 204, 0.16)"
              }}
            >
              <h3 style={{ margin: "0 0 0.9rem 0", fontFamily: "var(--font-heading)", fontSize: "1.05rem", color: "var(--accent-blue)" }}>
                本场策略
              </h3>
              <div
                style={{
                  padding: "0.9rem 1rem",
                  borderRadius: "14px",
                  backgroundColor: "rgba(255,255,255,0.86)",
                  border: "1px solid rgba(106, 155, 204, 0.12)",
                  marginBottom: "0.85rem"
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>自动结束策略</div>
                <div style={{ fontWeight: 600, color: "var(--text-dark)" }}>{limitStrategy.summary}</div>
              </div>
              <div style={{ color: "var(--text-dark)", lineHeight: 1.8, fontSize: "0.9rem" }}>
                {mode === "targeted"
                  ? "当前将进入专项训练。本场会围绕你确认后的岗位和重点持续深挖，由你主动结束。"
                  : mode === "realtime"
                    ? "当前将进入实时面试。默认以音频开始，进入房间后可以随时打开或关闭视频。"
                    : "当前将进入文字面试。系统会按你设定的单一上限自然收束，不会额外扩大提问范围。"}
              </div>
            </div>

            <div
              style={{
                backgroundColor: "var(--bg-surface)",
                padding: "1rem 1.15rem",
                borderRadius: "16px",
                border: "1px dashed var(--border-strong)",
                display: "flex",
                flexDirection: "column",
                gap: "0.7rem"
              }}
            >
              <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1rem", color: "var(--text-dark)" }}>
                手动补充训练侧重点
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                这里可以补充你希望本场重点练的方向，AI 会优先围绕这些真实重点继续发问。
              </p>
              <textarea
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="例如：我想重点练项目深挖，或者请多追问系统设计取舍..."
                style={{
                  width: "100%",
                  minHeight: "110px",
                  fontSize: "0.92rem",
                  fontFamily: "var(--font-ui)",
                  backgroundColor: "var(--bg-main)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  color: "var(--text-dark)",
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.6
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent-orange)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-color)";
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap"
          }}
        >
          <div style={{ fontSize: "0.84rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
            当前确认页只保留对本场有用的关键信息。若你想回看摘要，可返回配置页查看上传区下方的文本框。
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
            <button
              onClick={() => router.push("/setup")}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border-color)",
                borderRadius: "30px",
                fontSize: "0.95rem",
                fontWeight: 500,
                fontFamily: "var(--font-ui)",
                cursor: "pointer",
                transition: "var(--transition)",
                height: "56px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                e.currentTarget.style.color = "var(--text-dark)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              返回修改
            </button>

            <button
              onClick={handleEnterRoom}
              style={{
                fontSize: "0.98rem",
                padding: "0 1.85rem",
                borderRadius: "30px",
                backgroundColor: canEnterRoom ? "var(--accent-orange)" : "var(--border-strong)",
                color: "white",
                border: "none",
                fontWeight: 600,
                fontFamily: "var(--font-ui)",
                boxShadow: canEnterRoom ? "0 4px 15px rgba(217, 119, 87, 0.25)" : "none",
                cursor: canEnterRoom ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "var(--transition)",
                height: "56px"
              }}
              disabled={!canEnterRoom}
              onMouseEnter={(e) => {
                if (!canEnterRoom) {
                  return;
                }
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(217, 119, 87, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = canEnterRoom
                  ? "0 4px 15px rgba(217, 119, 87, 0.25)"
                  : "none";
              }}
            >
              确认并进入面试
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 为解析确认页提供 Suspense 边界，兼容查询参数读取过程中的异步渲染。
 * @returns 带 Suspense 包裹的解析确认页组件。
 */
export default function Profile() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfileContent />
    </Suspense>
  );
}
