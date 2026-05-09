"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import {
  buildInterviewLimitStrategy,
  createInterviewLaunchId,
  DURATION_LIMIT_OPTIONS,
  normalizeCustomDurationLimit,
  QUESTION_LIMIT_OPTIONS,
  readStoredInterviewProfile,
  resolveInterviewLimits,
  type InterviewLimitType,
  type InterviewMode,
  type InterviewLimitValue
} from "@/lib/interview/config";

/**
 * 展示面试发起配置页，并在提交前收集真实简历内容用于后续解析。
 * @returns 发起面试所需的目标配置与简历上传界面。
 */
export default function Setup() {
  const router = useRouter();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const [targetLevel, setTargetLevel] = useState("校招 / 应届生");
  const [language, setLanguage] = useState("中文");
  const [focus, setFocus] = useState("综合面试");
  const [mode, setMode] = useState<InterviewMode>("text");
  const [limitType, setLimitType] = useState<InterviewLimitType>("question");
  const [questionLimit, setQuestionLimit] = useState<InterviewLimitValue>(5);
  const [durationLimitMinutes, setDurationLimitMinutes] =
    useState<InterviewLimitValue>(null);
  const [customDurationInput, setCustomDurationInput] = useState("");
  
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisRequestIdRef = useRef(0);

  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [submitError, setSubmitError] = useState("");

  /**
   * 判断当前错误是否属于适合自动重试的临时性失败。
   * @param error 当前请求抛出的异常对象。
   * @returns 是否建议立即自动重试一次。
   */
  function shouldRetryAnalysis(error: unknown): boolean {
    const message = error instanceof Error ? error.message : "";
    if (!message) {
      return false;
    }

    return (
      message.includes("Failed to fetch") ||
      message.includes("NetworkError") ||
      message.includes("Load failed") ||
      message.includes("The operation was aborted")
    );
  }

  /**
   * 在两次尝试内提交解析请求，优先兜底临时性网络中断。
   * @param headers 当前请求头。
   * @param body 当前请求体。
   * @returns 解析接口返回的 JSON 数据。
   */
  async function requestParseProfile(headers: HeadersInit, body: FormData | string): Promise<Record<string, unknown>> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch("/api/parse", {
          method: "POST",
          headers,
          body,
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Unauthorized");
          }

          let errorMessage = "解析失败，请重试。";
          try {
            const errorBody = (await response.json()) as { error?: string };
            if (errorBody.error) {
              errorMessage = errorBody.error;
            }
          } catch (parseError) {
            console.error("Failed to parse parse-api error body", parseError);
          }

          throw new Error(errorMessage);
        }

        return (await response.json()) as Record<string, unknown>;
      } catch (error) {
        lastError = error;

        if (!shouldRetryAnalysis(error) || attempt === 1) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("解析失败，请重试。");
  }

  /**
   * 记录用户上传的简历文件，不再在前端注入任何 mock 简历文本。
   * @param e 文件选择事件。
   * @returns 无返回值，仅更新当前选择的文件状态。
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResumeText("");
      setSubmitError("");
    }
  };

  /**
   * 在已登录状态下提交简历解析请求，并将结果写入会话缓存。
   * @returns 无返回值，成功后跳转到解析确认页。
   */
  const startAnalysis = async () => {
    if (isAnalyzing) {
      return;
    }

    if (!file && !resumeText.trim()) {
      setSubmitError("请先上传简历文件，或直接粘贴真实简历内容后再开始解析。");
      return;
    }

    const currentRequestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = currentRequestId;
    setSubmitError("");
    setIsAnalyzing(true);
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (95 / 150);
        return next > 95 ? 95 : next;
      });
    }, 100);

    let success = false;
    try {
      let body: FormData | string;
      let headers: HeadersInit = {};

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetLevel", targetLevel);
        formData.append("language", language);
        formData.append("focus", focus);
        formData.append("mode", mode);
        formData.append("jdText", jdText);
        formData.append("resumeText", resumeText);
        body = formData;
      } else {
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          targetLevel,
          language,
          focus,
          mode,
          jdText,
          resumeText,
        });
      }

      const data = await requestParseProfile(headers, body);
      if (analysisRequestIdRef.current !== currentRequestId) {
        return;
      }

      if (typeof data.resumeSummaryMarkdown === "string" && data.resumeSummaryMarkdown.trim()) {
        setResumeText(data.resumeSummaryMarkdown.trim());
      }
      const resolvedLimits = resolveInterviewLimits(
        limitType,
        questionLimit,
        durationLimitMinutes
      );
      sessionStorage.setItem("parsedProfileData", JSON.stringify({
        ...data,
        launchId: createInterviewLaunchId(),
        targetLevel,
        language,
        focus,
        mode,
        videoEnabled: false,
        limitType: resolvedLimits.limitType,
        questionLimit: resolvedLimits.questionLimit,
        durationLimitMinutes: resolvedLimits.durationLimitMinutes
      }));
      
      setProgress(100);
      success = true;
      
      // Wait a moment for the user to see 100% progress
      setTimeout(() => {
        router.push(`/profile?mode=${mode}`);
      }, 500);
    } catch (error) {
      console.error(error);
      if (analysisRequestIdRef.current !== currentRequestId) {
        return;
      }

      if ((error as Error).message === "Unauthorized") {
        requestAuth({
          title: "登录后继续解析简历",
          description: "登录后即可继续生成你的岗位画像。",
          callbackUrl: "/setup",
          onSuccess: startAnalysis
        });
      } else {
        const message = (error as Error).message || "解析失败，请重试。";
        setSubmitError(
          shouldRetryAnalysis(error)
            ? "网络波动导致本次解析未完成，请稍后再试。系统已避免并发重复提交。"
            : message
        );
      }
    } finally {
      clearInterval(interval);
      if (analysisRequestIdRef.current === currentRequestId && !success) {
        setIsAnalyzing(false);
      }
    }
  };

  /**
   * 处理“开始解析”动作，匿名用户先完成登录再继续提交。
   * @returns 无返回值，根据登录状态决定直接提交还是先唤起登录弹层。
   */
  const handleStartAnalysis = () => {
    if (isAnalyzing) {
      return;
    }

    if (!file && !resumeText.trim()) {
      setSubmitError("请先上传简历文件，或直接粘贴真实简历内容后再开始解析。");
      return;
    }

    if (session?.user?.id) {
      startAnalysis();
      return;
    }

    requestAuth({
      title: "登录后生成岗位画像",
      description: "登录后即可继续解析简历并生成画像。",
      callbackUrl: "/setup",
      onSuccess: startAnalysis
    });
  };

  /**
   * 切换自动结束限制类别，并保证数量与时长不会同时生效。
   * @param nextType 用户选中的限制类别。
   */
  const handleLimitTypeChange = (nextType: InterviewLimitType) => {
    setLimitType(nextType);

    if (nextType === "question") {
      setQuestionLimit((current) => current ?? QUESTION_LIMIT_OPTIONS[0]?.value ?? 5);
      setDurationLimitMinutes(null);
      return;
    }

    setQuestionLimit(null);
    setDurationLimitMinutes((current) => current ?? DURATION_LIMIT_OPTIONS[0]?.value ?? 10);
  };

  /**
   * 应用题量上限选择，并清空时长限制。
   * @param limit 题量枚举值。
   */
  const handleQuestionLimitSelect = (limit: InterviewLimitValue) => {
    setLimitType("question");
    setQuestionLimit(limit);
    setDurationLimitMinutes(null);
  };

  /**
   * 应用时长上限选择，并清空题量限制。
   * @param limit 时长枚举值。
   */
  const handleDurationLimitSelect = (limit: InterviewLimitValue) => {
    setLimitType("duration");
    setQuestionLimit(null);
    setDurationLimitMinutes(limit);
  };

  /**
   * 接收自定义时长输入，只允许正整数分钟写入限制配置。
   * @param value 输入中的分钟文本。
   */
  const handleCustomDurationChange = (value: string) => {
    setLimitType("duration");
    setQuestionLimit(null);
    setCustomDurationInput(value);
    setDurationLimitMinutes(normalizeCustomDurationLimit(value));
  };

  const isCustomDurationSelected =
    limitType === "duration" &&
    durationLimitMinutes !== null &&
    !DURATION_LIMIT_OPTIONS.some((option) => option.value === durationLimitMinutes);
  const isResumeMissingAlert = submitError.includes("请先上传简历文件");
  const currentLimitStrategy = buildInterviewLimitStrategy(
    limitType,
    questionLimit,
    durationLimitMinutes
  );

  /**
   * 当用户从画像确认页返回时，优先用最近一次解析得到的简历摘要回填文本框。
   */
  useEffect(() => {
    const parsedProfile = readStoredInterviewProfile();
    if (!parsedProfile?.resumeSummaryMarkdown?.trim()) {
      return;
    }

    setResumeText((current) =>
      current.trim() ? current : parsedProfile.resumeSummaryMarkdown!.trim()
    );
  }, []);

  return (
    <>
      <section id="view-setup" className="view active">
        <div style={{ width: "100%" }}>
          <div className="setup-grid" style={{ marginTop: "2rem" }}>
            {/* Left Column: Target Info */}
            <div className="setup-step" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
                设定目标
              </h3>
              
              <div className="input-group">
                <label className="input-label">目标层级</label>
                <div className="choice-group">
                  {["校招 / 应届生", "1-3 年经验", "资深 / 专家"].map(level => (
                    <button 
                      key={level}
                      className={`choice-btn ${targetLevel === level ? "selected" : ""}`} 
                      onClick={() => setTargetLevel(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">面试语言</label>
                <div className="choice-group">
                  {["中文", "英文 (English)"].map(lang => (
                    <button 
                      key={lang}
                      className={`choice-btn ${language === lang ? "selected" : ""}`} 
                      onClick={() => setLanguage(lang)}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">专项训练重点</label>
                <div className="choice-group">
                  {["综合面试", "项目深挖", "系统设计", "行为软技能"].map(f => (
                    <button 
                      key={f}
                      className={`choice-btn ${focus === f ? "selected" : ""}`} 
                      onClick={() => setFocus(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>面试模式</span>
                </label>
                <div className="mode-cards" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
                  <div className={`mode-card ${mode === "text" ? "selected" : ""}`} onClick={() => setMode("text")} style={{ padding: "1rem", textAlign: "center" }}>
                    <div className="mode-icon" style={{ marginBottom: "0.5rem" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <div className="mode-title" style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>文字面试</div>
                    <div className="mode-desc" style={{ marginBottom: 0 }}>适合更稳地展开项目、原理和表达结构。</div>
                  </div>
                  
                  <div className={`mode-card ${mode === "realtime" ? "selected" : ""}`} onClick={() => setMode("realtime")} style={{ padding: "1rem", textAlign: "center" }}>
                    <div className="mode-icon" style={{ marginBottom: "0.5rem" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    </div>
                    <div className="mode-title" style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>实时面试</div>
                    <div className="mode-desc" style={{ marginBottom: 0 }}>以音频交流为主，进入房间后可随时打开或关闭摄像头。</div>
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">自动结束方式</label>
                <div style={{ display: "grid", gap: "0.9rem" }}>
                  <div
                    style={{
                      padding: "1rem",
                      borderRadius: "16px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-main)"
                    }}
                  >
                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>先选择类别</div>
                    <div className="choice-group" style={{ marginBottom: 0, gap: "0.5rem" }}>
                      <button
                        type="button"
                        className={`choice-btn ${limitType === "question" ? "selected" : ""}`}
                        onClick={() => handleLimitTypeChange("question")}
                      >
                        数量
                      </button>
                      <button
                        type="button"
                        className={`choice-btn ${limitType === "duration" ? "selected" : ""}`}
                        onClick={() => handleLimitTypeChange("duration")}
                      >
                        时长
                      </button>
                    </div>
                  </div>
                  {limitType === "question" ? (
                    <div
                      style={{
                        padding: "1rem",
                        borderRadius: "16px",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "var(--bg-main)"
                      }}
                    >
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>数量上限</div>
                      <div className="choice-group" style={{ marginBottom: 0, gap: "0.5rem" }}>
                        {QUESTION_LIMIT_OPTIONS.map((option) => (
                          <button
                            key={`question-${option.label}`}
                            type="button"
                            className={`choice-btn ${questionLimit === option.value ? "selected" : ""}`}
                            onClick={() => handleQuestionLimitSelect(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "1rem",
                        borderRadius: "16px",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "var(--bg-main)"
                      }}
                    >
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>时长上限</div>
                      <div className="choice-group" style={{ marginBottom: 0, gap: "0.5rem" }}>
                        {DURATION_LIMIT_OPTIONS.map((option) => (
                          <button
                            key={`duration-${option.label}`}
                            type="button"
                            className={`choice-btn ${durationLimitMinutes === option.value ? "selected" : ""}`}
                            onClick={() => handleDurationLimitSelect(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={`choice-btn ${isCustomDurationSelected ? "selected" : ""}`}
                          onClick={() => handleCustomDurationChange(customDurationInput || "25")}
                        >
                          自定义
                        </button>
                      </div>
                      {isCustomDurationSelected ? (
                        <div style={{ marginTop: "0.85rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="input-control"
                            style={{ width: "160px", height: "44px" }}
                            value={customDurationInput}
                            onChange={(event) => handleCustomDurationChange(event.target.value)}
                            placeholder="分钟数"
                          />
                          <span style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                            仅支持正整数分钟。
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  当前策略：{currentLimitStrategy.summary}。本场只会按这一种方式自动结束。
                </p>
              </div>
            </div>

            {/* Right Column: Context Input */}
            <div className="setup-step" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>背景资料</h3>
              <div className="input-group">
                <label className="input-label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>目标岗位描述 (JD)</span>
                </label>
                <textarea 
                  className="input-control" 
                  style={{ minHeight: "80px", fontSize: "0.85rem" }} 
                  placeholder="粘贴目标岗位的职责与要求 (Must-have)..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                ></textarea>
              </div>
              
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>个人履历 (Resume，必填)</span>
                </label>
                <div 
                  className={`upload-area ${file ? "has-file" : ""}`} 
                  style={{
                    padding: "1.5rem 1rem",
                    borderColor: isResumeMissingAlert
                      ? "rgba(217, 119, 87, 0.55)"
                      : undefined,
                    backgroundColor: isResumeMissingAlert
                      ? "rgba(217, 119, 87, 0.05)"
                      : undefined,
                    boxShadow: isResumeMissingAlert
                      ? "0 0 0 1px rgba(217, 119, 87, 0.08)"
                      : undefined
                  }} 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: file ? "var(--accent-green)" : isResumeMissingAlert ? "var(--accent-orange)" : "var(--accent-orange)", marginBottom: "0.5rem" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <div style={{ fontWeight: 500, fontSize: "0.9rem", marginBottom: "0.25rem", color: file ? "var(--accent-green)" : isResumeMissingAlert ? "var(--accent-orange)" : "inherit" }}>
                    {file ? `已选择文件: ${file.name}` : "点击上传简历文件，或直接粘贴文本"}
                  </div>
                  {!file && (
                    <div style={{ fontSize: "0.75rem", color: isResumeMissingAlert ? "rgba(217, 119, 87, 0.88)" : "var(--text-muted)" }}>
                      支持 PDF / Markdown / TXT；Word 请先转为 PDF，或直接粘贴简历正文
                    </div>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept=".pdf,.md,.markdown,.txt,text/plain"
                    onChange={handleFileUpload}
                  />
                </div>
                <textarea 
                  id="resume-text" 
                  className="input-control" 
                  style={{
                    minHeight: "100px",
                    borderTop: "none",
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    display: "block",
                    fontSize: "0.85rem",
                    borderColor: isResumeMissingAlert
                      ? "rgba(217, 119, 87, 0.55)"
                      : undefined,
                    backgroundColor: isResumeMissingAlert
                      ? "rgba(217, 119, 87, 0.03)"
                      : undefined
                  }} 
                  placeholder="系统将尝试解析上述文件。您也可以在此处直接粘贴或修改简历内容..."
                  value={resumeText}
                  onChange={(e) => {
                    setResumeText(e.target.value);
                    setSubmitError("");
                  }}
                ></textarea>
                {submitError ? (
                  <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.8rem", color: "var(--accent-orange)", lineHeight: 1.6 }}>
                    {submitError}
                  </p>
                ) : (
                  <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    系统只基于你提供的真实简历内容生成画像；关键信息不足时会明确提示，不会自动补造。
                  </p>
                )}
              </div>
              
              <div style={{ marginTop: "2.5rem", textAlign: "right" }}>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", fontSize: "1.05rem", padding: "0.85rem", opacity: isAnalyzing ? 0.82 : 1 }}
                  onClick={handleStartAnalysis}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? "正在解析，请稍候..." : "开始解析并生成画像"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Loading Overlay */}
      <div id="loading-overlay" className={`loading-overlay ${isAnalyzing ? "active" : ""}`}>
        <div className="spinner"></div>
        <h3 style={{ marginBottom: "0.5rem" }}>正在解析简历与职位描述</h3>
        <p className="text-muted" style={{ fontFamily: "var(--font-ui)" }}>提取核心技能与项目经历...</p>
        <div style={{ width: '80%', maxWidth: '400px', backgroundColor: 'var(--border-color)', height: '4px', borderRadius: '2px', marginTop: '1.5rem', overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, backgroundColor: 'var(--accent-green)', height: '100%', transition: 'width 0.1s linear' }}></div>
        </div>
      </div>
    </>
  );
}
