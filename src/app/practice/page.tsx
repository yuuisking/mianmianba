"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function PracticeSetup() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const isComposingRef = useRef(false);

  const isFormValid = prompt.trim().length > 0;

  const parseTrainingInput = (text: string) => {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    let role = "";
    if (lower.includes("后端")) role = "后端开发";
    else if (lower.includes("前端")) role = "前端开发";
    else if (lower.includes("python")) role = "Python工程师";
    else if (lower.includes("java")) role = "Java工程师";
    else if (lower.includes("golang") || lower.includes(" go ")) role = "Go工程师";
    else if (lower.includes("产品")) role = "产品经理";
    else if (lower.includes("测试")) role = "测试开发";
    else role = "开发工程师";

    const topicMatch =
      raw.match(/(?:训练主题|主题|训练|练习|专项训练|针对)\s*[:：]?\s*([^，。,.;；\n]+)/);
    const descMatch =
      raw.match(/(?:具体要求|要求|目标|重点)\s*[:：]?\s*([^。\n]+)/);

    const topic = (topicMatch?.[1] || raw).trim();
    const desc = (descMatch?.[1] || raw).trim();

    return { role, topic, desc };
  };

  const handleStart = () => {
    if (!isFormValid) return;

    const { role, topic, desc } = parseTrainingInput(prompt);
    sessionStorage.setItem("parsedProfileData", JSON.stringify({ role }));
    router.push(`/interview?mode=targeted&topic=${encodeURIComponent(topic)}&desc=${encodeURIComponent(desc)}`);
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
            无需简历，直接设定你想挑战的技术点，AI 将为你进行定点爆破。
          </p>
        </div>

        <div 
          style={{ 
            display: "flex", 
            alignItems: "center",
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
            placeholder="一句话描述你想练什么，例如：我想面试后端，训练主题 JVM 内存模型..."
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
            disabled={!isFormValid}
            style={{
              height: "56px",
              padding: "0 2rem",
              marginLeft: "1rem",
              borderRadius: "28px",
              backgroundColor: isFormValid ? "var(--accent-orange)" : "var(--border-strong)",
              color: "white",
              border: "none",
              fontWeight: 600,
              fontFamily: "var(--font-ui)",
              fontSize: "1.1rem",
              cursor: isFormValid ? "pointer" : "not-allowed",
              transition: "var(--transition)",
              boxShadow: isFormValid ? "0 4px 15px rgba(217, 119, 87, 0.25)" : "none",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              if (!isFormValid) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(217, 119, 87, 0.35)";
            }}
            onMouseLeave={(e) => {
              if (!isFormValid) return;
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(217, 119, 87, 0.25)";
            }}
          >
            开始
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>

      </div>
    </section>
  );
}
