"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Setup() {
  const router = useRouter();
  const [targetLevel, setTargetLevel] = useState("校招 / 应届生");
  const [language, setLanguage] = useState("中文");
  const [focus, setFocus] = useState("综合面试");
  const [mode, setMode] = useState("text");
  
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      // Mock file read: in a real app, parse PDF/Word to text here
      setResumeText(`[File: ${e.target.files[0].name}] ` + resumeText);
    }
  };

  const startAnalysis = async () => {
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

      const response = await fetch("/api/parse", {
        method: "POST",
        headers,
        body,
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          router.refresh();
          throw new Error("Unauthorized");
        }
        throw new Error("Failed to parse");
      }

      const data = await response.json();
      sessionStorage.setItem("parsedProfileData", JSON.stringify({
        ...data,
        targetLevel,
        language,
        focus,
        mode
      }));
      
      setProgress(100);
      success = true;
      
      // Wait a moment for the user to see 100% progress
      setTimeout(() => {
        router.push(`/profile?mode=${mode}`);
      }, 500);
    } catch (error) {
      console.error(error);
      if ((error as Error).message === "Unauthorized") {
        alert("登录已失效，请重新登录");
      } else {
        alert("解析失败，请重试");
      }
    } finally {
      clearInterval(interval);
      if (!success) {
        setIsAnalyzing(false);
      }
    }
  };

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
                <div className="mode-cards" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                  <div className={`mode-card ${mode === "text" ? "selected" : ""}`} onClick={() => setMode("text")} style={{ padding: "1rem", textAlign: "center" }}>
                    <div className="mode-icon" style={{ marginBottom: "0.5rem" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <div className="mode-title" style={{ fontSize: "0.9rem", marginBottom: 0 }}>文字</div>
                  </div>
                  
                  <div className={`mode-card ${mode === "voice" ? "selected" : ""}`} onClick={() => setMode("voice")} style={{ padding: "1rem", textAlign: "center" }}>
                    <div className="mode-icon" style={{ marginBottom: "0.5rem" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    </div>
                    <div className="mode-title" style={{ fontSize: "0.9rem", marginBottom: 0 }}>语音</div>
                  </div>

                  <div className={`mode-card ${mode === "video" ? "selected" : ""}`} onClick={() => setMode("video")} style={{ padding: "1rem", textAlign: "center" }}>
                    <div className="mode-icon" style={{ marginBottom: "0.5rem" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                    </div>
                    <div className="mode-title" style={{ fontSize: "0.9rem", marginBottom: 0 }}>视频</div>
                  </div>
                </div>
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
                  <span>个人履历 (Resume)</span>
                </label>
                <div 
                  className={`upload-area ${file ? "has-file" : ""}`} 
                  style={{ padding: "1.5rem 1rem" }} 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: file ? "var(--accent-green)" : "var(--accent-orange)", marginBottom: "0.5rem" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <div style={{ fontWeight: 500, fontSize: "0.9rem", marginBottom: "0.25rem", color: file ? "var(--accent-green)" : "inherit" }}>
                    {file ? `已选择文件: ${file.name}` : "点击上传简历文件，或直接粘贴文本"}
                  </div>
                  {!file && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>支持 PDF, Word, Markdown 格式</div>}
                  <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".pdf,.doc,.docx,.md" onChange={handleFileUpload} />
                </div>
                <textarea 
                  id="resume-text" 
                  className="input-control" 
                  style={{ minHeight: "100px", borderTop: "none", borderTopLeftRadius: 0, borderTopRightRadius: 0, display: "block", fontSize: "0.85rem" }} 
                  placeholder="系统将尝试解析上述文件。您也可以在此处直接粘贴或修改简历内容..."
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                ></textarea>
              </div>
              
              <div style={{ marginTop: "2.5rem", textAlign: "right" }}>
                <button className="btn btn-primary" style={{ width: "100%", fontSize: "1.05rem", padding: "0.85rem" }} onClick={startAnalysis}>
                  开始解析并生成画像
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
