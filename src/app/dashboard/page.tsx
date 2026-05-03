"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.email === "admin@resumer.com";

  return (
    <section id="view-dashboard" className="view active" style={{ 
      marginTop: "4rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      textAlign: "center"
    }}>
      <h1 style={{ 
        fontSize: "3.5rem", 
        marginBottom: "1rem", 
        fontFamily: "var(--font-heading)", 
        color: "var(--text-dark)",
        letterSpacing: "-0.02em"
      }}>
        你好，开发者
      </h1>
      <p className="text-muted" style={{ 
        fontSize: "1.2rem", 
        marginBottom: "4rem", 
        fontFamily: "var(--font-ui)" 
      }}>
        今天想针对哪个岗位进行训练？
      </p>
      
      <div style={{ display: "flex", gap: "2rem", justifyContent: "center", flexWrap: "wrap", maxWidth: "1000px" }}>
        {/* 常规面试 */}
        <div 
          onClick={() => router.push("/setup")}
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "24px",
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.2rem",
            width: "280px"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-orange)";
            e.currentTarget.style.boxShadow = "0 12px 32px rgba(217, 119, 87, 0.12)";
            e.currentTarget.style.transform = "translateY(-6px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          <div style={{ 
            width: "72px", 
            height: "72px", 
            borderRadius: "50%", 
            backgroundColor: "rgba(217, 119, 87, 0.1)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            fontSize: "2.2rem"
          }}>
            🎯
          </div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.4rem", color: "var(--text-dark)" }}>模拟面试</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem", fontFamily: "var(--font-ui)", lineHeight: 1.5 }}>
            配置岗位方向与难度<br/>进行全流程实战模拟面试
          </p>
        </div>

        {/* 专项训练 */}
        <div 
          onClick={() => router.push("/practice")}
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "24px",
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.2rem",
            width: "280px"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#6a9bcc";
            e.currentTarget.style.boxShadow = "0 12px 32px rgba(106, 155, 204, 0.12)";
            e.currentTarget.style.transform = "translateY(-6px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          <div style={{ 
            width: "72px", 
            height: "72px", 
            borderRadius: "50%", 
            backgroundColor: "rgba(106, 155, 204, 0.1)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            fontSize: "2.2rem"
          }}>
            ⚡
          </div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.4rem", color: "var(--text-dark)" }}>专项训练</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem", fontFamily: "var(--font-ui)", lineHeight: 1.5 }}>
            一句话开启极简对话<br/>针对特定知识点进行强化训练
          </p>
        </div>

        {/* 复盘中心 */}
        <div 
          onClick={() => router.push("/review")}
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "24px",
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.2rem",
            width: "280px"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#788c5d";
            e.currentTarget.style.boxShadow = "0 12px 32px rgba(120, 140, 93, 0.12)";
            e.currentTarget.style.transform = "translateY(-6px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          <div style={{ 
            width: "72px", 
            height: "72px", 
            borderRadius: "50%", 
            backgroundColor: "rgba(120, 140, 93, 0.1)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            fontSize: "2.2rem"
          }}>
            📈
          </div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.4rem", color: "var(--text-dark)" }}>复盘中心</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem", fontFamily: "var(--font-ui)", lineHeight: 1.5 }}>
            查看完整历史记录与错题本<br/>打通学习闭环攻克薄弱项
          </p>
        </div>
        {/* 知识库管理 */}
        {isAdmin && (
        <div
          onClick={() => router.push("/admin/knowledge")}
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "24px",
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.2rem",
            width: "280px"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#9c27b0";
            e.currentTarget.style.boxShadow = "0 12px 32px rgba(156, 39, 176, 0.12)";
            e.currentTarget.style.transform = "translateY(-6px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          <div style={{ 
            width: "72px", 
            height: "72px", 
            borderRadius: "50%", 
            backgroundColor: "rgba(156, 39, 176, 0.1)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            fontSize: "2.2rem"
          }}>
            📚
          </div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.4rem", color: "var(--text-dark)" }}>知识库</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem", fontFamily: "var(--font-ui)", lineHeight: 1.5 }}>
            管理并录入前沿题库<br/>让面试官实时学习最新知识
          </p>
        </div>
        )}
      </div>
    </section>
  );
}
