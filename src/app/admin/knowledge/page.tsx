"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface KBDocument {
  id: string;
  name: string;
  size: number;
  status: string;
  uploadTime: string;
}

export default function KnowledgeAdminPage() {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"file" | "github">("file");
  const router = useRouter();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchDocs = async () => {
    try {
      const res = await fetch("/api/admin/kb");
      if (res.status === 401) {
        // router.push("/login"); // Don't auto redirect just show error or let user know
        throw new Error("无权限访问：只有 admin@resumer.com 可查看");
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch documents");
      }
      const data = await res.json();
      setDocuments(data.data);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    setError("");

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/kb", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      await fetchDocs();
      e.target.value = ''; // clear input
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setUploading(false);
    }
  };

  const handleGithubImport = async () => {
    if (!githubUrl.trim()) {
      setError("请输入 GitHub 文件链接");
      return;
    }
    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("githubUrl", githubUrl.trim());

    try {
      const res = await fetch("/api/admin/kb", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "导入失败");
      }
      await fetchDocs();
      setGithubUrl("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm("确认删除这条知识库文档吗？");
    if (!ok) return;
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/kb", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "删除失败");
      }
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setUploading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = window.confirm(`确认要删除选中的 ${selectedIds.size} 条知识库文档吗？此操作不可恢复！`);
    if (!ok) return;
    
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/kb", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: true, ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "批量删除失败");
      }
      setDocuments((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setUploading(false);
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(documents.map(d => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  return (
    <div style={{ maxWidth: "800px", margin: "4rem auto", padding: "2rem", fontFamily: "var(--font-ui)", backgroundColor: "#faf9f5", color: "#141413", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
      <h1 style={{ fontFamily: "var(--font-heading)", color: "#141413", marginBottom: "0.5rem", fontSize: "2rem" }}>
        知识库管理
      </h1>
      <p style={{ color: "#b0aea5", marginBottom: "2rem", fontSize: "0.95rem" }}>
        支持上传本地 Markdown 题库，或直接通过 GitHub 链接抓取开源内容。
      </p>
      
      {error && (
        <div style={{ padding: "1rem", backgroundColor: "rgba(217, 119, 87, 0.1)", color: "#d97757", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.95rem", border: "1px solid rgba(217, 119, 87, 0.2)" }}>
          {error}
        </div>
      )}

      {/* Tabs for Upload Methods */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <button 
          onClick={() => setActiveTab("file")}
          style={{
            flex: 1, padding: "1rem", borderRadius: "8px", fontSize: "1rem", fontWeight: 500, cursor: "pointer", transition: "all 0.2s",
            backgroundColor: activeTab === "file" ? "#141413" : "transparent",
            color: activeTab === "file" ? "#faf9f5" : "#b0aea5",
            border: activeTab === "file" ? "1px solid #141413" : "1px solid #e8e6dc"
          }}
        >
          📁 本地文件上传
        </button>
        <button 
          onClick={() => setActiveTab("github")}
          style={{
            flex: 1, padding: "1rem", borderRadius: "8px", fontSize: "1rem", fontWeight: 500, cursor: "pointer", transition: "all 0.2s",
            backgroundColor: activeTab === "github" ? "#141413" : "transparent",
            color: activeTab === "github" ? "#faf9f5" : "#b0aea5",
            border: activeTab === "github" ? "1px solid #141413" : "1px solid #e8e6dc"
          }}
        >
          🌐 GitHub 链接导入
        </button>
      </div>

      <div style={{ marginBottom: "3rem", padding: "2rem", background: "#ffffff", borderRadius: "12px", border: "1px solid #e8e6dc", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        {activeTab === "file" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div style={{ color: "#b0aea5", marginBottom: "1rem" }}>支持 .md 或 .txt 格式文件</div>
            <label style={{
              display: "inline-block", padding: "0.8rem 2rem", backgroundColor: "#d97757", color: "white", borderRadius: "30px", cursor: "pointer", fontWeight: 500, transition: "background 0.2s"
            }}>
              {uploading ? "正在上传..." : "选择文件"}
              <input 
                type="file" 
                accept=".md,.txt"
                onChange={handleFileUpload} 
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <label style={{ fontSize: "0.9rem", color: "#141413", fontWeight: 500 }}>
              输入 GitHub 链接 (支持整个仓库 或 具体 .md 文件)
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input 
                type="text" 
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="例如: https://github.com/fe-interview/react-questions"
                disabled={uploading}
                style={{ flex: 1, padding: "0.8rem 1rem", borderRadius: "8px", border: "1px solid #b0aea5", fontSize: "0.95rem", outline: "none", color: "#141413" }}
              />
              <button 
                onClick={handleGithubImport}
                disabled={uploading}
                style={{
                  padding: "0 2rem", backgroundColor: "#d97757", color: "white", border: "none", borderRadius: "8px", fontWeight: 500, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.7 : 1
                }}
              >
                {uploading ? "导入中..." : "一键导入"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #e8e6dc", paddingBottom: "0.5rem", marginBottom: "1.5rem" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", color: "#141413", margin: 0 }}>
            已收录文档 ({documents.length})
          </h3>
          {documents.length > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={uploading || selectedIds.size === 0}
              style={{
                padding: "0.4rem 1rem",
                borderRadius: "8px",
                border: selectedIds.size === 0 ? "1px solid #e8e6dc" : "1px solid rgba(217, 119, 87, 0.5)",
                background: selectedIds.size === 0 ? "#f5f4ef" : "transparent",
                color: selectedIds.size === 0 ? "#b0aea5" : "#d97757",
                cursor: (uploading || selectedIds.size === 0) ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: "0.9rem",
                transition: "all 0.2s"
              }}
            >
              删除选中 ({selectedIds.size})
            </button>
          )}
        </div>
        
        {loading ? (
          <div style={{ color: "#b0aea5", textAlign: "center", padding: "2rem" }}>加载中...</div>
        ) : documents.length === 0 ? (
          <div style={{ color: "#b0aea5", textAlign: "center", padding: "3rem", background: "#f5f4ef", borderRadius: "8px" }}>
            知识库空空如也，快去上传吧。
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.95rem" }}>
              <thead>
                <tr style={{ color: "#b0aea5", borderBottom: "1px solid #e8e6dc" }}>
                  <th style={{ padding: "1rem 0.5rem", width: "40px" }}>
                    <input 
                      type="checkbox" 
                      checked={documents.length > 0 && selectedIds.size === documents.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ padding: "1rem 0.5rem", fontWeight: 500 }}>文件名</th>
                  <th style={{ padding: "1rem 0.5rem", fontWeight: 500 }}>大小</th>
                  <th style={{ padding: "1rem 0.5rem", fontWeight: 500 }}>状态</th>
                  <th style={{ padding: "1rem 0.5rem", fontWeight: 500 }}>上传时间</th>
                  <th style={{ padding: "1rem 0.5rem", fontWeight: 500, textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, index) => (
                  <tr key={doc.id} style={{ borderBottom: "1px solid #e8e6dc", backgroundColor: index % 2 === 0 ? "transparent" : "#fbfaf7" }}>
                    <td style={{ padding: "1rem 0.5rem" }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                      />
                    </td>
                    <td style={{ padding: "1rem 0.5rem", color: "#141413", fontWeight: 500 }}>
                      <span style={{ marginRight: "0.5rem" }}>📄</span>{doc.name}
                    </td>
                    <td style={{ padding: "1rem 0.5rem", color: "#b0aea5" }}>{(doc.size / 1024).toFixed(1)} KB</td>
                    <td style={{ padding: "1rem 0.5rem" }}>
                      <span style={{ padding: "0.2rem 0.6rem", backgroundColor: "rgba(120, 140, 93, 0.1)", color: "#788c5d", borderRadius: "20px", fontSize: "0.85rem", fontWeight: 500 }}>
                        {doc.status === 'ready' ? '就绪' : doc.status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 0.5rem", color: "#b0aea5" }}>
                      {new Date(doc.uploadTime).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: "1rem 0.5rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={uploading}
                        style={{
                          padding: "0.35rem 0.8rem",
                          borderRadius: "999px",
                          border: "1px solid rgba(217, 119, 87, 0.35)",
                          background: "rgba(217, 119, 87, 0.08)",
                          color: "#d97757",
                          cursor: uploading ? "not-allowed" : "pointer",
                          fontWeight: 500,
                        }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
