"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import {
  buildInterviewRoomKey,
  buildInterviewLimitStrategy,
  createInterviewLaunchId,
  normalizeInterviewMode,
  readStoredInterviewProfile,
  writeStoredInterviewProfile,
  type InterviewProfileState
} from "@/lib/interview/config";
import {
  findCompanyPlaybook,
  getCompanyExperienceThemes
} from "@/lib/interview-v2/companyPlaybooks";
import type { InterviewPlanCreationResultV2 } from "@/lib/interview-v2/domain";

/**
 * 从浏览器会话缓存中读取已解析的画像数据，避免刷新后丢失当前步骤上下文。
 * @returns 解析结果以及默认展示用的岗位与训练重点。
 */
function readStoredProfileState(input: {
  launchId: string;
  mode: InterviewProfileState["mode"];
}): {
  parsedData: InterviewProfileState | null;
  role: string;
  focus: string;
} {
  const parsed = input.launchId
    ? readStoredInterviewProfile(
        buildInterviewRoomKey({
          launchId: input.launchId,
          mode: input.mode,
        })
      )
    : null;
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
  const launchIdFromQuery = searchParams.get("launchId") || "";

  const initialState = readStoredProfileState({
    launchId: launchIdFromQuery,
    mode,
  });
  const [parsedData] = useState<InterviewProfileState | null>(initialState.parsedData);
  const [role, setRole] = useState(initialState.role);
  const [focus] = useState(initialState.focus || "综合面试");
  const [, setIsResolvingRole] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [planCreationError, setPlanCreationError] = useState("");
  const [roleAssistText, setRoleAssistText] = useState(
    initialState.role ? "已根据简历自动识别岗位，你可以继续修改。" : ""
  );
  const roleEditedRef = useRef(false);
  const roleResolvedRef = useRef(Boolean(initialState.role));
  const canEnterRoom = Boolean(parsedData && role.trim() && !isCreatingPlan);
  const launchFlowMode = parsedData?.launchFlowMode ?? "stage";
  const templateLabel = parsedData?.interviewTemplateLabel?.trim() || "未选择模板";
  const launchRoleName = parsedData?.targetRoleName?.trim() || role.trim();
  const flowSummary =
    launchFlowMode === "full_flow"
      ? "本次会先确认你的岗位画像，再按公司和岗位上下文生成多轮面试计划。"
      : "本次会先确认你的岗位画像，再进入单场高强度模拟。";
  const interviewModeLabel =
    parsedData?.displayInterviewModeLabel?.trim() ||
    (mode === "realtime"
      ? parsedData?.videoEnabled
        ? "视频面试"
        : "实时面试"
      : "文字面试");
  const matchedCompanyPlaybook = useMemo(
    () => findCompanyPlaybook(parsedData?.companyName || ""),
    [parsedData?.companyName]
  );
  const companyExperienceThemes = useMemo(
    () =>
      getCompanyExperienceThemes(
        parsedData?.companyName || "",
        parsedData?.targetRoleName || parsedData?.role || role
      ),
    [parsedData?.companyName, parsedData?.role, parsedData?.targetRoleName, role]
  );
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
   * 创建真实的 v2 面试计划，并把计划/轮次信息写回本地会话上下文。
   * @returns {Promise<void>} 创建完成后进入对应面试房间。
   */
  const createPlanAndEnterRoom = async (): Promise<void> => {
    if (!parsedData || !role.trim()) {
      return;
    }

    setIsCreatingPlan(true);
    setPlanCreationError("");

    try {
      const response = await fetch("/api/v2/interview-plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          launchId: parsedData.launchId || createInterviewLaunchId(),
          launchFlowMode,
          companyName: parsedData.companyName || "",
          roleName: role.trim(),
          targetLevel: parsedData.targetLevel || "",
          language: parsedData.language || "",
          focus,
          mode,
          interviewTemplateId: parsedData.interviewTemplateId || "",
          interviewTemplateLabel: parsedData.interviewTemplateLabel || "",
          interviewIntensity: parsedData.interviewIntensity || "",
          jdText: parsedData.jdText || "",
          resumeText: parsedData.resumeSummaryMarkdown || "",
          persona: parsedData.persona,
          projects: parsedData.projects || [],
          limitType: parsedData.limitType || "none",
          questionLimit: parsedData.questionLimit ?? null,
          durationLimitMinutes: parsedData.durationLimitMinutes ?? null
        })
      });

      const payload = (await response.json()) as {
        data?: InterviewPlanCreationResultV2;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "创建面试计划失败，请稍后重试。");
      }

      const launchId = parsedData.launchId || createInterviewLaunchId();
      const nextProfile = {
        ...parsedData,
        launchId,
        interviewPlanId: payload.data.planId,
        interviewStageId: payload.data.initialStageId || undefined,
        interviewRoundId: payload.data.initialRoundId || undefined,
        role: role.trim(),
        focus,
        mode
      };
      writeStoredInterviewProfile(
        nextProfile,
        buildInterviewRoomKey({
          planId: nextProfile.interviewPlanId,
          stageId: nextProfile.interviewStageId,
          roundId: nextProfile.interviewRoundId,
          launchId,
          mode,
        })
      );

      const actionPath =
        payload.data.initialActionPath || `/interview?mode=${mode}&planId=${payload.data.planId}`;
      const separator = actionPath.includes("?") ? "&" : "?";
      router.push(`${actionPath}${separator}mode=${mode}`);
    } catch (error) {
      console.error("Failed to create interview plan", error);
      setPlanCreationError(
        error instanceof Error ? error.message : "创建面试计划失败，请稍后重试。"
      );
      setIsCreatingPlan(false);
      return;
    }

    setIsCreatingPlan(false);
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
      void createPlanAndEnterRoom();
      return;
    }

    requestAuth({
      title: "登录后进入面试房间",
      description: "登录后即可继续进入当前面试流程。",
      callbackUrl: "/profile",
      onSuccess: () => {
        void createPlanAndEnterRoom();
      }
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

  const personaStrengths = (parsedData.persona?.strengths || []).filter(Boolean);
  const personaRisks = (parsedData.persona?.risks || []).filter(Boolean);
  const resumeImprovements = (parsedData.resumeImprovements || []).filter(Boolean);
  const projectHighlights = (parsedData.projects || []).filter((item) => item.name || item.points);
  const candidateName = session?.user?.name?.trim() || "候选人";
  const candidateSummaryParts = [
    launchRoleName || "待确认岗位",
    parsedData.targetLevel?.trim() || "待确认职级",
    parsedData.companyName?.trim() || "",
  ].filter(Boolean);
  const matchScore = Math.max(
    72,
    Math.min(
      88,
      80 +
        Math.min(personaStrengths.length, 4) * 2 -
        Math.min(personaRisks.length + resumeImprovements.length, 4)
    )
  );
  const coreTags = Array.from(
    new Set([
      ...personaStrengths,
      ...companyExperienceThemes.map((item) => item.label),
      parsedData.interviewIntensity?.trim() || "",
      interviewModeLabel,
    ].filter(Boolean))
  ).slice(0, 6);
  const advantageItems =
    (personaStrengths.length > 0
      ? personaStrengths.map((item) => ({
          title: item,
          desc: `系统已从真实简历和岗位语境中提取出这项优势，会在后续问答中优先验证其真实性与深度。`,
        }))
      : projectHighlights.map((item) => ({
          title: item.name,
          desc: item.points,
        }))).slice(0, 4);
  const riskItems = [...personaRisks, ...resumeImprovements].slice(0, 4);
  const strategyTags = [
    `重点模块：${focus || "综合评估"}`,
    `追问风格：${matchedCompanyPlaybook?.interviewStyle || "结构化追问"}`,
    `评估维度：${launchFlowMode === "full_flow" ? "多轮计划 / 阶段推进 / 岗位匹配" : "技术深度 / 工程实践 / 表达稳定度"}`,
  ];
  const candidatePortraitUrl = "/interview/reference-candidate.png";
  const analystPortraitUrl = "/interview/reference-analyst.png";
  const analysisSummary =
    parsedData.jdGapWarning?.strategy?.trim() ||
    "围绕岗位核心能力、工程实践与表达稳定度做画像确认，进入面试后继续用真实问答校验简历可信度。";
  const highlightModules =
    companyExperienceThemes.length > 0
      ? Array.from(new Set(companyExperienceThemes.map((item) => item.focus))).slice(0, 2).join(" / ")
      : focus || "综合评估";
  const strategyRows = [
    {
      label: "当前模板",
      value: templateLabel,
    },
    {
      label: "自动结束策略",
      value: limitStrategy.summary,
    },
    {
      label: "面试官风格",
      value: matchedCompanyPlaybook?.interviewStyle || "结构化追问",
    },
    {
      label: "重点模块",
      value: highlightModules,
    },
    {
      label: "评估维度",
      value:
        launchFlowMode === "full_flow"
          ? "多轮推进 / 岗位匹配 / 阶段表现"
          : "技术深度 / 工程实践 / 表达稳定度",
    },
  ];

  return (
    <section id="view-profile" className="view active launch-ref-profile-view">
      <div className="launch-ref-profile-page">
        <div className="launch-ref-profile-container">
          <div className="launch-ref-profile-steps" data-source="profile-stepper">
            {[
              { no: "✓", title: "面试配置", sub: "已完成", status: "done" },
              { no: "✓", title: "本场预览", sub: "已完成", status: "done" },
              { no: "3", title: "用户画像", sub: isCreatingPlan ? "正在创建计划..." : "AI 已完成画像", status: "active" },
              { no: "4", title: "进入面试间", sub: "待开始", status: "pending" },
            ].map((item, index) => (
              <div
                key={item.title}
                className={`launch-ref-profile-step launch-ref-profile-step--${item.status}`}
              >
                <span className="launch-ref-profile-step-circle">{item.no}</span>
                <div className="launch-ref-profile-step-copy">
                  <div className="launch-ref-profile-step-title">{item.title}</div>
                  <div className="launch-ref-profile-step-sub">{item.sub}</div>
                </div>
                {index < 3 ? <span className="launch-ref-profile-step-arrow">›</span> : null}
              </div>
            ))}
          </div>

          <div className="launch-ref-profile-layout" data-source="profile-content">
            <section className="launch-ref-profile-panel launch-ref-profile-panel--candidate">
              <div className="launch-ref-profile-panel-head">
                <h2>候选人画像 ✨</h2>
              </div>
              <div className="launch-ref-profile-hero">
                <div className="launch-ref-profile-hero-photo">
                  <Image
                    src={candidatePortraitUrl}
                    alt="候选人画像"
                    width={160}
                    height={160}
                    className="launch-ref-profile-hero-image"
                  />
                </div>
                <div className="launch-ref-profile-hero-copy">
                  <div className="launch-ref-profile-name-row">
                    <div className="launch-ref-profile-name">{candidateName}</div>
                    <span className="launch-ref-profile-name-badge">已识别</span>
                  </div>
                  <input
                    type="text"
                    value={role}
                    onChange={(event) => {
                      roleEditedRef.current = true;
                      setRole(event.target.value);
                      setRoleAssistText("岗位支持手动修改，进入面试时将以这里的内容为准。");
                    }}
                    className="launch-ref-profile-role-input"
                    placeholder="请输入目标岗位"
                  />
                  <p className="launch-ref-profile-meta-line">
                    {launchRoleName || "待确认岗位"}
                  </p>
                  <p className="launch-ref-profile-meta-line">
                    {candidateSummaryParts.join(" · ") || "待补充候选人信息"}
                  </p>
                  <p className="launch-ref-profile-meta-line">
                    {launchFlowMode === "full_flow" ? "全流程面试" : "阶段面试"} · {interviewModeLabel}
                  </p>
                  <p className="launch-ref-profile-meta-tip">
                    {roleAssistText || "系统会优先根据真实简历自动识别岗位。"}
                  </p>
                </div>
              </div>

              <div className="launch-ref-profile-score-card">
                <div className="launch-ref-profile-score-ring">
                  <div className="launch-ref-profile-score-ring-inner">
                    <strong>{matchScore}</strong>
                    <span>分</span>
                    <small>综合匹配度</small>
                  </div>
                </div>
                <div className="launch-ref-profile-score-copy">
                  <p>{flowSummary}</p>
                  <p>
                    {parsedData.jdGapWarning?.text?.trim()
                      ? `当前提醒：${parsedData.jdGapWarning.text.trim()}`
                      : "当前没有额外的岗位匹配风险提醒。"}
                  </p>
                </div>
              </div>

              <div className="launch-ref-profile-tag-section">
                <h3>核心标签</h3>
                <div className="launch-ref-profile-tag-list">
                  {coreTags.length > 0 ? (
                    coreTags.map((item) => (
                      <span key={item} className="launch-ref-profile-tag">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="launch-ref-profile-tag">综合评估</span>
                  )}
                </div>
              </div>
            </section>

            <section className="launch-ref-profile-panel launch-ref-profile-panel--highlights">
              <div className="launch-ref-profile-panel-head">
                <h2>👍 优势亮点</h2>
              </div>
              <div className="launch-ref-profile-highlight-list">
                {advantageItems.length > 0 ? (
                  advantageItems.map((item, index) => (
                    <div key={item.title} className="launch-ref-profile-highlight-item">
                      <span className="launch-ref-profile-highlight-icon">
                        {["<>", "▤", "⚡", "⌁"][index] || "⌘"}
                      </span>
                      <div>
                        <div className="launch-ref-profile-highlight-title">{item.title}</div>
                        <div className="launch-ref-profile-highlight-desc">{item.desc}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="launch-ref-profile-highlight-item">
                    <span className="launch-ref-profile-highlight-icon">⌘</span>
                    <div>
                      <div className="launch-ref-profile-highlight-title">等待更多亮点信息</div>
                      <div className="launch-ref-profile-highlight-desc">
                        当前已完成基础画像生成，进入面试后会继续结合真实问答补充优势判断。
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="launch-ref-profile-risk-block">
                <h2>⚠ 风险提醒 / 待补强点</h2>
                <div className="launch-ref-profile-risk-list">
                  {riskItems.length > 0 ? (
                    riskItems.map((item) => (
                      <div key={item} className="launch-ref-profile-risk-item">
                        <span>{item}</span>
                        <span className="launch-ref-profile-risk-status">待补强</span>
                      </div>
                    ))
                  ) : (
                    <div className="launch-ref-profile-risk-item">
                      <span>当前没有额外的补强风险，后续会继续根据真实问答动态判断。</span>
                      <span className="launch-ref-profile-risk-status">观察中</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="launch-ref-profile-side">
              <section className="launch-ref-profile-panel launch-ref-profile-panel--strategy">
                <div className="launch-ref-profile-panel-head">
                  <h2>🎯 本场策略</h2>
                </div>
                <div className="launch-ref-profile-strategy-table">
                  {strategyRows.map((item) => (
                    <div key={item.label} className="launch-ref-profile-strategy-row">
                      <div className="launch-ref-profile-strategy-label">{item.label}</div>
                      <div className="launch-ref-profile-strategy-value">{item.value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="launch-ref-profile-panel launch-ref-profile-panel--analysis">
                <div className="launch-ref-profile-panel-head">
                  <h2>✨ AI 解析结论</h2>
                </div>
                <div className="launch-ref-profile-analysis-card">
                  <Image
                    src={analystPortraitUrl}
                    alt="AI 分析师头像"
                    width={56}
                    height={56}
                    className="launch-ref-profile-analysis-image"
                  />
                  <div>
                    <strong>AI 分析师 · 小面</strong>
                    <div className="launch-ref-profile-analysis-subtitle">
                      基于候选人简历与岗位模型生成
                    </div>
                    <p>{analysisSummary}</p>
                  </div>
                </div>
                {companyExperienceThemes.length > 0 ? (
                  <div className="launch-ref-profile-analysis-topics">
                    {companyExperienceThemes.slice(0, 3).map((item) => (
                      <div
                        key={`${item.stageType}-${item.label}`}
                        className="launch-ref-profile-analysis-topic"
                      >
                        <div className="launch-ref-profile-analysis-topic-head">
                          <strong>{item.label}</strong>
                          <span className="launch-ref-profile-analysis-topic-badge">
                            {item.stageType}
                          </span>
                        </div>
                        <p>{item.focus}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          <footer className="launch-ref-profile-summary-bar" data-source="profile-footer">
            <div className="launch-ref-profile-summary-copy">
              <div className="launch-ref-profile-summary-title">策略摘要</div>
              <p>{planCreationError || analysisSummary}</p>
              <div className="launch-ref-profile-summary-tags">
                {strategyTags.map((item) => (
                  <span key={item} className="launch-ref-profile-summary-tag">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="launch-ref-profile-summary-actions">
              <button className="launch-ref-profile-btn launch-ref-profile-btn--ghost" onClick={() => router.push("/setup")}>
                返回修改
              </button>
              <button
                className="launch-ref-profile-btn launch-ref-profile-btn--primary"
                onClick={handleEnterRoom}
                disabled={!canEnterRoom}
              >
                {launchFlowMode === "full_flow" ? "确认画像并创建计划 →" : "确认画像并进入面试间 →"}
              </button>
            </div>
          </footer>
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
