"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface ParsedData {
  role?: string;
  skills: { name: string; level: string }[];
  jdGapWarning: { text: string; strategy: string };
  projects: { name: string; points: string }[];
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "text";
  
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [role, setRole] = useState("");
  const [focus, setFocus] = useState("");

  useEffect(() => {
    const data = sessionStorage.getItem("parsedProfileData");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setParsedData(parsed);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRole(parsed.role || "开发工程师");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFocus(parsed.focus || "");
      } catch (e) {
        console.error("Failed to parse profile data from sessionStorage", e);
      }
    }
  }, []);

  const handleEnterRoom = () => {
    if (parsedData) {
      sessionStorage.setItem("parsedProfileData", JSON.stringify({ ...parsedData, role, focus }));
    }
    router.push(`/interview?mode=${mode}`);
  };

  if (!parsedData) {
    return (
      <section id="view-profile" className="view active">
        <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center", padding: "4rem" }}>
          <p>暂无解析数据，请先配置面试参数。</p>
          <button className="btn btn-primary" onClick={() => router.push("/setup")} style={{ marginTop: "1rem" }}>
            返回配置页
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="view-profile" className="view active" style={{ padding: "1.5rem 2rem", backgroundColor: "var(--bg-main)", height: "calc(100vh - 70px)", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", height: "100%" }}>
        
        {/* Header & Role Confirmation (Compact) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexShrink: 0 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.6rem", color: "var(--text-dark)", margin: 0 }}>
              确认面试岗位
            </h1>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.95rem", margin: "0.25rem 0 0 0" }}>
              系统已完成信息解析，请确认您的目标面试方向。
            </p>
          </div>
          
          <div style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            backgroundColor: "var(--bg-surface)", 
            border: "1px solid var(--border-color)", 
            borderRadius: "30px", 
            padding: "0.4rem 1rem",
            boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
            transition: "var(--transition)",
            width: "320px"
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent-orange)"}
          onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
            </svg>
            <input 
              type="text" 
              value={role}
              onChange={(e) => setRole(e.target.value)}
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, cursor: "pointer" }}>
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </div>
        </div>

        {/* Main Content Grid (Takes remaining height) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "1.5rem", flex: 1, minHeight: 0 }}>
          
          {/* Top Left: Skills */}
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "16px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <h3 style={{ margin: "0 0 1rem 0", fontFamily: "var(--font-heading)", fontSize: "1.05rem", color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-blue)" }}></span>
              核心技能栈
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", overflowY: "auto", paddingRight: "0.5rem" }}>
              {parsedData.skills.map((skill, index) => (
                <span key={index} style={{ 
                  fontSize: "0.85rem", 
                  padding: "0.3rem 0.75rem", 
                  backgroundColor: "var(--bg-main)", 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "20px",
                  color: "var(--text-dark)",
                  fontFamily: "var(--font-ui)"
                }}>
                  {skill.name} 
                  {skill.level && <span style={{ color: "var(--text-muted)", marginLeft: "6px" }}>{skill.level}</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Top Right: Projects */}
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "16px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", minHeight: 0, gridRow: "span 2" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontFamily: "var(--font-heading)", fontSize: "1.05rem", color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-green)" }}></span>
              高优可追问项目
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", overflowY: "auto", paddingRight: "0.5rem", flex: 1 }}>
              {parsedData.projects.map((project, index) => (
                <div key={index} style={{ padding: "1rem", border: "1px solid var(--border-color)", borderRadius: "12px", background: "var(--bg-main)" }}>
                  <div style={{ fontWeight: 600, fontFamily: "var(--font-heading)", color: "var(--text-dark)", marginBottom: "0.4rem", fontSize: "0.95rem" }}>{project.name}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}>
                    {project.points}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Left: JD Gap */}
          <div style={{ backgroundColor: "rgba(217, 119, 87, 0.03)", padding: "1.5rem", borderRadius: "16px", border: "1px solid rgba(217, 119, 87, 0.2)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <h3 style={{ margin: "0 0 1rem 0", fontFamily: "var(--font-heading)", fontSize: "1.05rem", color: "var(--accent-orange)", display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              JD 差距预警
            </h3>
            <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.9rem", margin: 0, lineHeight: 1.6, color: "var(--text-dark)" }}>
                <span dangerouslySetInnerHTML={{ __html: parsedData.jdGapWarning.text }} />
              </p>
              <div style={{ padding: "0.75rem 1rem", backgroundColor: "white", borderRadius: "8px", border: "1px solid rgba(217, 119, 87, 0.1)", fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-ui)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--accent-orange)" }}>策略建议：</strong> {parsedData.jdGapWarning.strategy}
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar: Manual Focus & Actions */}
        <div style={{ display: "flex", gap: "1.5rem", marginTop: "1.5rem", flexShrink: 0 }}>
          
          {/* Manual Focus */}
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "1rem 1.5rem", borderRadius: "16px", border: "1px dashed var(--border-strong)", flex: 1, display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ flexShrink: 0, width: "240px" }}>
              <h3 style={{ margin: "0 0 0.25rem 0", fontFamily: "var(--font-heading)", fontSize: "1.05rem", color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                手动补充训练侧重点
              </h3>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                除了上述关键点，您还可以告诉 AI 本次想要重点考核或回避的方向 (可选)。
              </p>
            </div>
            <textarea 
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="例如：我想重点练习如何回答离职原因；或者，请多问一些底层原理..."
              style={{ 
                flex: 1,
                height: "60px", 
                fontSize: "0.9rem", 
                fontFamily: "var(--font-ui)",
                backgroundColor: "var(--bg-main)", 
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                padding: "0.75rem",
                color: "var(--text-dark)",
                outline: "none",
                resize: "none"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent-orange)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
            ></textarea>
          </div>

          {/* Action Buttons */}
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
                height: "60px"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-surface)"; e.currentTarget.style.color = "var(--text-dark)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              返回修改
            </button>
            
            <button 
              onClick={handleEnterRoom}
              style={{ 
                fontSize: "1rem", 
                padding: "0 2rem", 
                borderRadius: "30px", 
                backgroundColor: "var(--accent-orange)", 
                color: "white", 
                border: "none", 
                fontWeight: 600,
                fontFamily: "var(--font-ui)",
                boxShadow: "0 4px 15px rgba(217, 119, 87, 0.25)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "var(--transition)",
                height: "60px"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(217, 119, 87, 0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 15px rgba(217, 119, 87, 0.25)"; }}
            >
              确认并进入面试
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}

export default function Profile() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfileContent />
    </Suspense>
  );
}
