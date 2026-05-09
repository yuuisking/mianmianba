"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, Suspense } from "react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import { getInterviewModeLabel, type InterviewMode } from "@/lib/interview/config";

type ReportData = {
  noEffectiveInterview?: boolean;
  score: number | null;
  highlights: string[];
  risks: string[];
  evidence: string[];
  nextSteps: { title: string; desc: string }[];
  dimensions: { name: string; score: string }[];
  metadata: { role: string; questions: number };
};

function ReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const sessionId = searchParams.get("sessionId");

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const isGenerating = useRef(false);

  /**
   * 将服务端返回的模式字符串归一化为前端可展示的面试模式。
   * @param mode 服务端返回的模式值。
   * @returns 受控的面试模式枚举。
   */
  const normalizeMode = (mode: string): InterviewMode => {
    if (mode === "realtime" || mode === "targeted") {
      return mode;
    }

    return "text";
  };

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    async function loadOrGenerateReport() {
      // 1. If we are viewing an existing report from dashboard
      if (sessionId) {
        try {
          const res = await fetch(`/api/sessions/${sessionId}`);
          if (res.ok) {
            const json = await res.json();
            const sessionData = json.data;
            if (sessionData && sessionData.report) {
              setReport({
                score: sessionData.score ?? null,
                highlights: JSON.parse(sessionData.report.highlights || "[]"),
                risks: JSON.parse(sessionData.report.risks || "[]"),
                evidence: JSON.parse(sessionData.report.evidence || "[]"),
                nextSteps: JSON.parse(sessionData.report.nextSteps || "[]"),
                dimensions: JSON.parse(sessionData.report.dimensions || "[]"),
                metadata: {
                  role: getInterviewModeLabel(normalizeMode(sessionData.mode)),
                  questions: Math.floor((sessionData.messages?.length || 0) / 2)
                }
              });
              setLoading(false);
              return;
            } else if (sessionData) {
              sessionStorage.setItem("interviewHistory", JSON.stringify({
                sessionId: sessionData.id,
                mode: sessionData.mode,
                messages: (sessionData.messages || []).map((message: { role: string; content: string }) => ({
                  role: message.role === "assistant" ? "ai" : "user",
                  content: String(message.content || "").split("\n"),
                  time: "",
                  tag: ""
                })),
                elapsedTime: 0,
                questionCount: Math.floor((sessionData.messages?.length || 0) / 2)
              }));
            }
          }
        } catch (e) {
          console.error("Failed to fetch session", e);
        }
      }

      // 2. Generating a new report after interview
      if (isGenerating.current) return; // Prevent React 18 strict mode double-fetch
      
      const historyData = sessionStorage.getItem("interviewHistory");
      const history = historyData ? JSON.parse(historyData) : null;
      
      if (!history) {
        // No history to generate from (e.g. user refreshed the page after generating)
        const cached = sessionStorage.getItem("latestReport");
        if (cached) {
          setReport(JSON.parse(cached));
        }
        setLoading(false);
        return;
      }

      isGenerating.current = true;
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + (95 / 100);
          return next > 95 ? 95 : next;
        });
      }, 100);

      try {
        const profileData = sessionStorage.getItem("parsedProfileData");
        const profile = profileData ? JSON.parse(profileData) : null;
        
        const res = await fetch("/api/reports/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history, profile, sessionId: history.sessionId || sessionId })
        });

        if (res.ok) {
          const data = await res.json();
          setProgress(100);
          
          setTimeout(() => {
            setReport(data);
            sessionStorage.setItem("latestReport", JSON.stringify(data));
            sessionStorage.removeItem("interviewHistory");
            setLoading(false);
          }, 500);
        } else {
          console.error("Failed to generate report");
          setLoading(false);
        }
      } catch (error) {
        console.error("Error generating report", error);
        setLoading(false);
      } finally {
        clearInterval(interval);
      }
    }

    loadOrGenerateReport();
  }, [session?.user?.id, sessionId]);

  if (!session?.user?.id) {
    return (
      <section
        id="view-report"
        className="view active"
        style={{
          minHeight: "70vh",
          display: "grid",
          placeItems: "center"
        }}
      >
        <div
          style={{
            maxWidth: "840px",
            width: "100%",
            padding: "2.4rem",
            borderRadius: "28px",
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(20,20,19,0.08)",
            boxShadow: "0 18px 40px rgba(20,20,19,0.06)"
          }}
        >
          <span className="tag tag-primary">面面吧 Report</span>
          <h1 style={{ marginTop: "1rem" }}>登录后查看你的面试报告。</h1>
          <p style={{ color: "rgba(20, 20, 19, 0.72)", maxWidth: "54ch" }}>
            报告将展示亮点、风险、佐证与下一步训练建议。
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                requestAuth({
                  title: "登录后查看报告",
                  description: "继续查看当前面试的复盘结果。",
                  callbackUrl: sessionId ? `/report?sessionId=${sessionId}` : "/report"
                })
              }
            >
              登录查看报告
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => router.push("/home")}>
              返回首页
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section id="view-report" className="view active" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <div className="typing-indicator" style={{ marginBottom: '1rem' }}>
          <span>.</span><span>.</span><span>.</span>
        </div>
        <p style={{ color: 'var(--text-muted)' }}>正在生成结构化评估报告...</p>
        <div style={{ width: '80%', maxWidth: '400px', backgroundColor: 'var(--border-color)', height: '4px', borderRadius: '2px', marginTop: '1.5rem', overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, backgroundColor: 'var(--accent-green)', height: '100%', transition: 'width 0.1s linear' }}></div>
        </div>
        <style>{`
          .typing-indicator { font-weight: bold; font-size: 2rem; letter-spacing: 2px; color: var(--accent-orange); }
          .typing-indicator span { animation: blink 1.4s infinite both; }
          .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
          .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
          @keyframes blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }
        `}</style>
      </section>
    );
  }

  if (!report) {
    return (
      <section id="view-report" className="view active">
        <div style={{ textAlign: "center", padding: "4rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>无法加载报告</h2>
          <p className="text-muted" style={{ marginBottom: "2rem" }}>可能是由于刷新页面或报告已过期。</p>
          <button className="btn btn-primary" onClick={() => router.push("/dashboard")}>返回控制台</button>
        </div>
      </section>
    );
  }

  if (report.noEffectiveInterview) {
    return (
      <section
        id="view-report"
        className="view active"
        style={{
          padding: "3rem 1.5rem",
          backgroundColor: "var(--bg-main)",
          minHeight: "100vh",
          display: "grid",
          placeItems: "center"
        }}
      >
        <div
          style={{
            width: "min(92vw, 820px)",
            padding: "2.4rem",
            borderRadius: "28px",
            backgroundColor: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(20,20,19,0.08)",
            boxShadow: "0 20px 48px rgba(20,20,19,0.08)"
          }}
        >
          <span className="tag tag-primary" style={{ margin: 0 }}>
            本次未形成有效面试
          </span>
          <h1 style={{ marginTop: "1rem", marginBottom: "0.75rem" }}>
            本次不生成评分与正式报告
          </h1>
          <p style={{ color: "rgba(20,20,19,0.72)", lineHeight: 1.7, maxWidth: "56ch" }}>
            你这次几乎没有形成有效问答内容，所以系统不会伪造分数，也不会生成正式评估报告。重新开始一场有效面试后，再来查看复盘结果会更准确。
          </p>
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1rem 1.1rem",
              borderRadius: "18px",
              backgroundColor: "rgba(106, 155, 204, 0.06)",
              border: "1px solid rgba(106, 155, 204, 0.14)",
              color: "var(--text-dark)"
            }}
          >
            当前模式：{report.metadata?.role || "本场面试"}，有效问答轮次：{report.metadata?.questions || 0}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.75rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => router.push("/setup")}
            >
              重新开始面试
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push("/home")}
            >
              返回首页
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="view-report" className="view active" style={{ padding: "3rem 1.5rem", backgroundColor: "var(--bg-main)", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2.5rem" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "2rem", borderBottom: "1px solid var(--border-color)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span style={{ padding: "0.25rem 0.75rem", backgroundColor: "rgba(106, 155, 204, 0.1)", color: "var(--accent-blue)", borderRadius: "20px", fontSize: "0.85rem", fontWeight: 600, fontFamily: "var(--font-ui)" }}>
                面试评估报告
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontFamily: "var(--font-ui)" }}>
                {report.metadata?.role || "综合面试"} | 中文 | 共 {report.metadata?.questions || 0} 轮对话
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: "2.2rem", fontFamily: "var(--font-heading)", color: "var(--text-dark)" }}>结构化评估报告</h1>
          </div>
          
          <div style={{ textAlign: "right", backgroundColor: "var(--bg-surface)", padding: "1.25rem 2rem", borderRadius: "16px", border: "1px solid var(--border-color)", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.5rem", fontFamily: "var(--font-ui)" }}>综合岗位匹配度</div>
            <div style={{ fontSize: "3rem", fontWeight: 700, color: "var(--accent-orange)", lineHeight: 1, fontFamily: "var(--font-heading)" }}>
              {report.score ?? 0}<span style={{ fontSize: "1.2rem", color: "var(--text-muted)", marginLeft: "4px" }}>/100</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "2.5rem" }}>
          
          {/* Left Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            
            {/* Highlights & Risks */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontFamily: "var(--font-heading)", color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: "4px", height: "18px", backgroundColor: "var(--text-dark)", borderRadius: "2px" }}></span>
                总评摘要
              </h2>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                {/* Highlights */}
                <div style={{ backgroundColor: "rgba(120, 140, 93, 0.05)", padding: "1.5rem", borderRadius: "16px", border: "1px solid rgba(120, 140, 93, 0.2)" }}>
                  <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.05rem", color: "var(--accent-green)", fontFamily: "var(--font-heading)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    表现亮点
                  </h3>
                  {(!report.highlights || report.highlights.length === 0) ? (
                    <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.95rem" }}>暂无数据</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-dark)", fontSize: "0.95rem", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "0.5rem", fontFamily: "var(--font-body)" }}>
                      {report.highlights.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Risks */}
                <div style={{ backgroundColor: "rgba(217, 119, 87, 0.05)", padding: "1.5rem", borderRadius: "16px", border: "1px solid rgba(217, 119, 87, 0.2)" }}>
                  <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.05rem", color: "var(--accent-orange)", fontFamily: "var(--font-heading)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    风险与不足
                  </h3>
                  {(!report.risks || report.risks.length === 0) ? (
                    <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.95rem" }}>暂无数据</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-dark)", fontSize: "0.95rem", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "0.5rem", fontFamily: "var(--font-body)" }}>
                      {report.risks.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Evidence (If any) */}
            {report.evidence && report.evidence.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontFamily: "var(--font-heading)", color: "var(--text-dark)" }}>判定佐证</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {report.evidence.map((ev, idx) => (
                    <div key={idx} style={{ padding: "1rem 1.25rem", backgroundColor: "var(--bg-surface)", borderLeft: "3px solid var(--border-strong)", borderRadius: "0 8px 8px 0", fontSize: "0.95rem", color: "var(--text-dark)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                      {ev}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontFamily: "var(--font-heading)", color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: "4px", height: "18px", backgroundColor: "var(--text-dark)", borderRadius: "2px" }}></span>
                下一步训练计划
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {(!report.nextSteps || report.nextSteps.length === 0) ? (
                  <p style={{ color: "var(--text-muted)", margin: 0 }}>暂无数据</p>
                ) : (
                  report.nextSteps.map((step, idx) => (
                    <div key={idx} style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "1.5rem", 
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "16px",
                      transition: "var(--transition)"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "0 4px 15px rgba(0,0,0,0.03)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <div style={{ paddingRight: "2rem" }}>
                        <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "var(--text-dark)", fontFamily: "var(--font-heading)", marginBottom: "0.35rem" }}>{step.title}</div>
                        <div style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}>{step.desc}</div>
                      </div>
                      <button 
                        onClick={() => router.push(`/interview?mode=targeted&topic=${encodeURIComponent(step.title)}&desc=${encodeURIComponent(step.desc)}`)}
                        style={{
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.6rem 1.25rem",
                          backgroundColor: "transparent",
                          color: "var(--accent-orange)",
                          border: "1px solid var(--accent-orange)",
                          borderRadius: "20px",
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          fontFamily: "var(--font-ui)",
                          cursor: "pointer",
                          transition: "var(--transition)"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(217, 119, 87, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        去行动 <span style={{ fontSize: "1.1rem" }}>→</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.75rem", border: "1px solid var(--border-color)", borderRadius: "16px", position: "sticky", top: "2rem" }}>
              <h3 style={{ margin: "0 0 1.5rem 0", fontSize: "1.1rem", fontFamily: "var(--font-heading)", color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                维度评分
              </h3>
              
              {(!report.dimensions || report.dimensions.length === 0) ? (
                <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.95rem" }}>暂无数据</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {report.dimensions.map((dim, idx) => {
                    const score = parseFloat(dim.score);
                    const isLow = score < 6;
                    return (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1rem", borderBottom: idx === report.dimensions.length - 1 ? "none" : "1px solid var(--border-color)" }}>
                        <span style={{ fontSize: "0.95rem", color: "var(--text-dark)", fontFamily: "var(--font-body)", fontWeight: 500 }}>{dim.name}</span>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
                          <span style={{ fontSize: "1.2rem", fontWeight: 600, fontFamily: "var(--font-heading)", color: isLow ? "var(--accent-orange)" : "var(--text-dark)" }}>{dim.score}</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>/10</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <button 
                onClick={() => router.push("/dashboard")}
                style={{ 
                  width: "100%", 
                  marginTop: "2rem",
                  padding: "0.85rem",
                  backgroundColor: "var(--bg-main)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "30px",
                  color: "var(--text-dark)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  fontFamily: "var(--font-ui)",
                  cursor: "pointer",
                  transition: "var(--transition)"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--border-color)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-main)"; }}
              >
                返回控制台
              </button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

export default function Report() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReportContent />
    </Suspense>
  );
}
