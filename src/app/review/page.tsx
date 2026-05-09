"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import { getInterviewModeLabel, type InterviewMode } from "@/lib/interview/config";

interface Session {
  id: string;
  createdAt: string;
  status: string;
  score: number | null;
  mode: string;
  _count: {
    messages: number;
  };
  report: {
    dimensions: string | null;
    risks: string | null;
  } | null;
}

type Weakness = {
  name: string;
  desc: string;
  count: number;
  isRisk: boolean;
};

export default function Review() {
  const router = useRouter();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessionsForWeaknesses, setAllSessionsForWeaknesses] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 3;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Weaknesses pagination
  const [weaknessPage, setWeaknessPage] = useState(1);
  const WEAKNESS_LIMIT = 3;

  // Brand Guidelines
  const fontHeading = "'Poppins', Arial, sans-serif";
  const fontBody = "'Lora', Georgia, serif";
  const colorDark = "#141413";
  const colorLight = "#faf9f5";
  const colorMidGray = "#b0aea5";
  const colorLightGray = "#e8e6dc";
  const colorOrange = "#d97757";
  const colorBlue = "#6a9bcc";
  const colorGreen = "#788c5d";

  const fetchSessions = async (searchQuery = "", currentPage = 1) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sessions/recent?page=${currentPage}&limit=${limit}&search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const json = await res.json();
        setSessions(json.data || []);
        if (json.meta) {
          setTotal(json.meta.total);
        }
      }
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllSessionsForWeaknesses = async () => {
    try {
      // Fetch a larger amount of sessions to generate weaknesses properly regardless of current page
      const res = await fetch(`/api/sessions/recent?page=1&limit=50`);
      if (res.ok) {
        const json = await res.json();
        setAllSessionsForWeaknesses(json.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch all sessions for weaknesses", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!session?.user?.id) {
      setSessions([]);
      setAllSessionsForWeaknesses([]);
      setIsLoading(false);
      return;
    }
    fetchSessions(debouncedSearch, page);
  }, [debouncedSearch, page, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }
    fetchAllSessionsForWeaknesses();
  }, [session?.user?.id]);

  const executeDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessionToDelete(null);
        fetchSessions(debouncedSearch, page);
        fetchAllSessionsForWeaknesses();
      }
    } catch (error) {
      console.error("Failed to delete", error);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getModeLabel = (mode: string) => {
    const normalizedMode: InterviewMode =
      mode === "realtime" ? "realtime" : mode === "targeted" ? "targeted" : "text";
    return getInterviewModeLabel(normalizedMode);
  };

  const weaknesses = useMemo(() => {
    const map = new Map<string, Weakness>();
    allSessionsForWeaknesses.forEach(session => {
      if (session.report) {
        try {
          const dims = JSON.parse(session.report.dimensions || "[]");
          dims.forEach((dim: { name: string; score: string | number }) => {
            const scoreNum = typeof dim.score === 'string' ? parseFloat(dim.score) : dim.score;
            if (!isNaN(scoreNum) && scoreNum < 7) {
              const key = `dim-${dim.name}`;
              if (map.has(key)) {
                map.get(key)!.count += 1;
              } else {
                map.set(key, {
                  name: dim.name,
                  desc: `该维度近期评分较低 (最近一次: ${dim.score})，系统建议进行针对性训练。`,
                  count: 1,
                  isRisk: false
                });
              }
            }
          });

          const risks = JSON.parse(session.report.risks || "[]");
          risks.forEach((risk: string) => {
            const shortName = risk.length > 15 ? risk.substring(0, 15) + "..." : risk;
            const key = `risk-${shortName}`;
            if (map.has(key)) {
              map.get(key)!.count += 1;
            } else {
              map.set(key, {
                name: `高频风险: ${shortName}`,
                desc: risk,
                count: 1,
                isRisk: true
              });
            }
          });
        } catch (e) {
          console.error("Failed to parse report in weakness extraction", e);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allSessionsForWeaknesses]);

  const totalPages = Math.ceil(total / limit);

  const totalWeaknessPages = Math.ceil(weaknesses.length / WEAKNESS_LIMIT);
  const paginatedWeaknesses = weaknesses.slice((weaknessPage - 1) * WEAKNESS_LIMIT, weaknessPage * WEAKNESS_LIMIT);

  if (!session?.user?.id) {
    return (
      <section
        id="view-review"
        className="view active"
        style={{
          backgroundColor: colorLight,
          color: colorDark,
          minHeight: "70vh",
          padding: "2rem 0",
          fontFamily: fontBody
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 1rem", display: "grid", gap: "1.25rem" }}>
          <div style={{ padding: "2.25rem", borderRadius: "28px", background: "white", border: `1px solid ${colorLightGray}`, boxShadow: "0 14px 30px rgba(20,20,19,0.05)" }}>
            <h1 style={{ marginBottom: "0.8rem" }}>复盘中心</h1>
            <p style={{ color: colorMidGray, maxWidth: "48ch", marginBottom: "1.5rem" }}>
              这里会集中展示面试后的评分变化、常见薄弱项和后续训练建议，帮助你持续复盘和迭代。
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  requestAuth({
                    title: "登录后查看完整复盘",
                    description: "登录成功后将回到复盘中心，并加载你的历史记录与完整报告。",
                    callbackUrl: "/review"
                  })
                }
              >
                登录体验完整功能
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => router.push("/practice")}>
                去做专项训练
              </button>
            </div>
          </div>

          <div
            style={{
              padding: "1rem 1.15rem",
              borderRadius: "18px",
              border: `1px solid ${colorLightGray}`,
              background: "rgba(255,255,255,0.74)",
              color: colorDark
            }}
          >
            登录后可查看你自己的历史记录、薄弱维度和完整报告。
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="view-review" className="view active" style={{ 
      backgroundColor: colorLight, 
      color: colorDark,
      minHeight: "100vh",
      padding: "2rem 0",
      fontFamily: fontBody
    }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 1rem" }}>
        <h2 style={{ 
          fontFamily: fontHeading, 
          fontSize: "1.5rem", 
          borderBottom: `2px solid ${colorLightGray}`, 
          paddingBottom: "1rem", 
          marginBottom: "1.5rem" 
        }}>
          错题本 (高频薄弱维度)
        </h2>
        
        <div style={{ marginBottom: "4rem" }}>
          {weaknesses.length === 0 ? (
            <div style={{
              padding: "3rem",
              textAlign: "center",
              backgroundColor: "white",
              borderRadius: "12px",
              border: `1px dashed ${colorMidGray}`,
              color: colorMidGray
            }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>✨</div>
              <div style={{ fontSize: "1.2rem", fontFamily: fontHeading }}>太棒了！近期面试没有发现明显短板</div>
              <p style={{ marginTop: "0.5rem" }}>继续保持良好的面试状态吧</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {paginatedWeaknesses.map((weakness, index) => {
                const actualIndex = (weaknessPage - 1) * WEAKNESS_LIMIT + index;
                const accentColor = actualIndex % 3 === 0 ? colorOrange : (actualIndex % 3 === 1 ? colorBlue : colorGreen);
                return (
                  <div key={index} style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    padding: "1.5rem",
                    backgroundColor: "white",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                    border: `1px solid ${colorLightGray}`,
                    borderLeft: `4px solid ${accentColor}`
                  }}>
                    <div style={{ flex: 1, paddingRight: "2rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
                        <h3 style={{ margin: 0, fontFamily: fontHeading, fontSize: "1.2rem", color: colorDark }}>
                          #{actualIndex + 1} {weakness.name}
                        </h3>
                        {weakness.count > 1 && (
                          <span style={{ 
                            fontSize: "0.75rem", 
                            padding: "0.2rem 0.6rem", 
                            backgroundColor: colorLightGray, 
                            color: colorDark,
                            borderRadius: "12px",
                            fontFamily: fontHeading
                          }}>
                            出现 {weakness.count} 次
                          </span>
                        )}
                        {weakness.isRisk && (
                          <span style={{ 
                            fontSize: "0.75rem", 
                            padding: "0.2rem 0.6rem", 
                            backgroundColor: "rgba(217, 119, 87, 0.1)", 
                            color: colorOrange,
                            borderRadius: "12px",
                            fontFamily: fontHeading
                          }}>
                            高危风险
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, color: colorMidGray, lineHeight: 1.6 }}>
                        {weakness.desc}
                      </p>
                    </div>
                    <button 
                      onClick={() => router.push(`/interview?mode=targeted&topic=${encodeURIComponent(weakness.name)}&desc=${encodeURIComponent(weakness.desc)}`)}
                      style={{
                        padding: "0.6rem 1.5rem",
                        backgroundColor: accentColor,
                        color: "white",
                        border: "none",
                        borderRadius: "24px",
                        fontFamily: fontHeading,
                        fontSize: "0.95rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.filter = "brightness(0.9)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.filter = "none";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      专项突破
                    </button>
                  </div>
                );
              })}
              
              {totalWeaknessPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.5rem" }}>
                  <button
                    onClick={() => setWeaknessPage(p => Math.max(1, p - 1))}
                    disabled={weaknessPage === 1}
                    style={{
                      padding: "0.4rem 0.8rem",
                      borderRadius: "16px",
                      border: `1px solid ${weaknessPage === 1 ? colorLightGray : colorMidGray}`,
                      backgroundColor: "white",
                      color: weaknessPage === 1 ? colorMidGray : colorDark,
                      cursor: weaknessPage === 1 ? "not-allowed" : "pointer",
                      fontFamily: fontHeading,
                      fontSize: "0.85rem",
                      transition: "all 0.2s"
                    }}
                  >
                    上一页
                  </button>
                  <span style={{ fontFamily: fontHeading, color: colorMidGray, fontSize: "0.85rem" }}>
                    {weaknessPage} / {totalWeaknessPages}
                  </span>
                  <button
                    onClick={() => setWeaknessPage(p => Math.min(totalWeaknessPages, p + 1))}
                    disabled={weaknessPage === totalWeaknessPages}
                    style={{
                      padding: "0.4rem 0.8rem",
                      borderRadius: "16px",
                      border: `1px solid ${weaknessPage === totalWeaknessPages ? colorLightGray : colorMidGray}`,
                      backgroundColor: "white",
                      color: weaknessPage === totalWeaknessPages ? colorMidGray : colorDark,
                      cursor: weaknessPage === totalWeaknessPages ? "not-allowed" : "pointer",
                      fontFamily: fontHeading,
                      fontSize: "0.85rem",
                      transition: "all 0.2s"
                    }}
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: `2px solid ${colorLightGray}` }}>
          <h2 style={{ 
            fontFamily: fontHeading, 
            fontSize: "1.5rem",
            margin: 0
          }}>
            历史面试记录 {total > 0 && `(${total})`}
          </h2>
          <div>
            <input 
              type="text" 
              placeholder="检索面试类型..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "0.6rem 1.2rem",
                border: `1px solid ${colorLightGray}`,
                borderRadius: "24px",
                fontSize: "0.9rem",
                outline: "none",
                fontFamily: fontBody,
                width: "240px",
                backgroundColor: "white",
                transition: "border-color 0.2s"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = colorBlue}
              onBlur={(e) => e.currentTarget.style.borderColor = colorLightGray}
            />
          </div>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
          {isLoading && sessions.length === 0 ? (
            <div style={{ padding: "4rem", textAlign: "center", color: colorMidGray }}>
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: "4rem", textAlign: "center", color: colorMidGray, backgroundColor: "white", borderRadius: "12px", border: `1px dashed ${colorLightGray}` }}>
              {search ? "没有找到符合条件的记录" : "暂无历史面试记录"}
            </div>
          ) : (
            sessions.map((session) => {
              const rounds = Math.floor((session._count?.messages || 0) / 2);
              return (
                <div 
                  key={session.id}
                  style={{
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    padding: "1.5rem", 
                    backgroundColor: "white",
                    border: `1px solid ${colorLightGray}`,
                    borderRadius: "12px",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.borderColor = colorMidGray; 
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.02)"; 
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.borderColor = colorLightGray; 
                    e.currentTarget.style.boxShadow = "none"; 
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "1.1rem", color: colorDark, fontFamily: fontHeading, marginBottom: "0.25rem" }}>
                      {getModeLabel(session.mode)}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: colorMidGray }}>
                      {formatDate(session.createdAt)} • {rounds} 轮对话 {session.status !== "completed" ? "(提前结束)" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "2.5rem" }}>
                    <div style={{ textAlign: "right", minWidth: "80px" }}>
                      <div style={{ fontWeight: 600, fontSize: "1.25rem", color: session.score !== null ? (session.score >= 80 ? colorGreen : colorOrange) : colorMidGray }}>
                        {session.score !== null ? (
                          <>{session.score}<span style={{ fontSize: "0.8rem", color: colorMidGray }}>/100</span></>
                        ) : (
                          "--"
                        )}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: colorMidGray }}>{session.score !== null ? "综合评分" : "无评分"}</div>
                    </div>
                    
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      {session.report ? (
                        <button 
                          onClick={() => router.push(`/report?sessionId=${session.id}`)}
                          style={{
                            padding: "0.5rem 1.25rem",
                            backgroundColor: "transparent",
                            color: colorBlue,
                            border: `1px solid ${colorBlue}`,
                            borderRadius: "20px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            fontFamily: fontHeading,
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(106, 155, 204, 0.1)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          查看报告
                        </button>
                      ) : (
                        <button style={{
                          padding: "0.5rem 1.25rem",
                          backgroundColor: colorLightGray,
                          color: colorMidGray,
                          border: "none",
                          borderRadius: "20px",
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          fontFamily: fontHeading,
                          cursor: "not-allowed"
                        }} disabled>
                          报告未生成
                        </button>
                      )}
                      <button 
                        onClick={() => setSessionToDelete(session.id)}
                        style={{
                          padding: "0.5rem 1.25rem",
                          backgroundColor: "transparent",
                          color: colorMidGray,
                          border: "1px solid transparent",
                          borderRadius: "20px",
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          fontFamily: fontHeading,
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "#ef4444";
                          e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = colorMidGray;
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "2rem" }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "20px",
                border: `1px solid ${page === 1 ? colorLightGray : colorMidGray}`,
                backgroundColor: "white",
                color: page === 1 ? colorMidGray : colorDark,
                cursor: page === 1 ? "not-allowed" : "pointer",
                fontFamily: fontHeading
              }}
            >
              上一页
            </button>
            <span style={{ fontFamily: fontHeading, color: colorMidGray }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "20px",
                border: `1px solid ${page === totalPages ? colorLightGray : colorMidGray}`,
                backgroundColor: "white",
                color: page === totalPages ? colorMidGray : colorDark,
                cursor: page === totalPages ? "not-allowed" : "pointer",
                fontFamily: fontHeading
              }}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {sessionToDelete && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(20, 20, 19, 0.4)",
          backdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "white",
            padding: "2.5rem",
            borderRadius: "12px",
            width: "90%",
            maxWidth: "440px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
            border: `1px solid ${colorLightGray}`,
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem"
          }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontFamily: fontHeading, color: colorDark, fontSize: "1.25rem" }}>
                删除记录
              </h3>
              <p style={{ color: colorMidGray, margin: 0, fontSize: "0.95rem", lineHeight: 1.6 }}>
                确定要永久删除这条面试记录吗？此操作无法撤销。
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "0.5rem" }}>
              <button 
                onClick={() => setSessionToDelete(null)}
                style={{
                  padding: "0.6rem 1.5rem",
                  backgroundColor: "transparent",
                  border: `1px solid ${colorMidGray}`,
                  borderRadius: "20px",
                  color: colorDark,
                  cursor: "pointer",
                  fontFamily: fontHeading,
                  fontSize: "0.9rem",
                  fontWeight: 500
                }}
              >
                取消
              </button>
              <button 
                onClick={() => executeDelete(sessionToDelete)}
                style={{
                  padding: "0.6rem 1.5rem",
                  backgroundColor: "#ef4444",
                  border: "1px solid #ef4444",
                  borderRadius: "20px",
                  color: "white",
                  cursor: "pointer",
                  fontFamily: fontHeading,
                  fontSize: "0.9rem",
                  fontWeight: 500
                }}
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
