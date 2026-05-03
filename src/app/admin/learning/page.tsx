"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type KbInfo = {
  id: string;
  name: string;
  subtitle: string;
  tags: string[];
  updatedAt: string;
  stats: { topics: number; paths: number };
};

type LearningData = {
  kbs: KbInfo[];
};

function normalizeTagsInput(input: string) {
  const tags = input
    .split(/[,，]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return Array.from(new Set(tags));
}

export default function AdminLearningPage() {
  const router = useRouter();
  const [kbs, setKbs] = useState<KbInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const tags = useMemo(() => normalizeTagsInput(tagsRaw), [tagsRaw]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = async () => {
    const res = await fetch("/api/learning");
    const data = (await res.json().catch(() => ({}))) as LearningData;
    setKbs(Array.isArray(data.kbs) ? data.kbs : []);
    setLoading(false);
  };

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    const kbName = name.trim();
    if (!kbName) return;

    setCreating(true);
    try {
      const res = await fetch("/api/admin/learning/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: kbName, tags }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "创建失败");

      await refresh();
      setOpen(false);
      setName("");
      setTagsRaw("");
      setSuccess("已创建知识库。");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (kbId: string, name: string) => {
    if (!window.confirm(`确定要删除知识库 "${name}" 吗？此操作不可恢复！`)) return;

    try {
      const res = await fetch(`/api/admin/learning/kb?kbId=${encodeURIComponent(kbId)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "删除失败");

      setSuccess("已删除知识库。");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">知识库管理</div>
          <button className="btn btn-primary" onClick={() => { setOpen(true); setError(""); setSuccess(""); }}>
            新建
          </button>
        </div>

        <div className="panel-body">
          <div className="hero" style={{ marginBottom: "12px" }}>
            <div className="breadcrumbs">
              <span className="chip">Admin</span>
              <span>·</span>
              <span className="text-muted">学习中心 CMS</span>
            </div>
            <h1 style={{ marginBottom: "6px" }}>知识库列表</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              新建知识库后，进入“编辑”页面，解析 URL / 文本生成预览，并确认入库。
            </p>
          </div>

          {success && (
            <div className="notice" style={{ borderColor: "rgba(120,140,93,0.8)", color: "var(--accent-green)", marginBottom: "12px" }}>
              {success}
            </div>
          )}
          {error && (
            <div className="notice" style={{ borderColor: "rgba(217,119,87,0.8)", color: "var(--accent-orange)", marginBottom: "12px" }}>
              {error}
            </div>
          )}

          {loading ? (
            <div className="notice">加载中...</div>
          ) : kbs.length === 0 ? (
            <div className="notice">暂无知识库，点击右上角“新建”。</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
              {kbs.map((kb) => (
                <div key={kb.id} className="panel" style={{ margin: 0, padding: "20px", display: "flex", flexDirection: "column", background: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                    <div style={{ fontWeight: 700, fontSize: "18px", wordBreak: "break-word", color: "var(--text-dark)", fontFamily: "var(--font-heading)" }}>
                      {kb.name}
                    </div>
                    <button
                      className="btn"
                      style={{ padding: "4px 8px", fontSize: "12px", color: "var(--accent-orange)", background: "rgba(217,119,87,0.1)", border: "none" }}
                      onClick={() => handleDelete(kb.id, kb.name)}
                    >
                      删除
                    </button>
                  </div>
                  
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                    <span className="chip" style={{ fontSize: "12px", background: "var(--bg-subtle)", color: "var(--text-muted)" }}>ID: {kb.id}</span>
                    <span className="chip" style={{ fontSize: "12px", background: "var(--bg-subtle)", color: "var(--text-muted)" }}>主题: {kb.stats?.topics ?? 0}</span>
                    <span className="chip" style={{ fontSize: "12px", background: "var(--bg-subtle)", color: "var(--text-muted)" }}>更新: {kb.updatedAt}</span>
                  </div>
                  
                  {kb.tags?.length ? (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, alignItems: "flex-start" }}>
                      {kb.tags.map((t) => (
                        <span key={t} className="chip" style={{ fontSize: "11px", background: "rgba(106, 155, 204, 0.1)", color: "var(--accent-blue)" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ flex: 1 }}></div>
                  )}

                  <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => router.push(`/admin/learning/${encodeURIComponent(kb.id)}`)}
                    >
                      编辑录入
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 20, 19, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
            zIndex: 60,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="panel" style={{ width: "min(560px, 100%)", maxHeight: "85vh" }}>
            <div className="panel-header">
              <div className="panel-title">新建知识库</div>
              <button className="btn" onClick={() => setOpen(false)} disabled={creating}>
                关闭
              </button>
            </div>
            <div className="panel-body">
              <div className="field">
                <div className="label">知识库名称</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：前端面试知识库" />
              </div>
              <div className="field">
                <div className="label">知识库标签（逗号分隔）</div>
                <input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="例如：前端, React, 面试" />
              </div>

              {tags.length ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                  {tags.map((t) => (
                    <span key={t} className="chip" style={{ fontSize: "12px", background: "rgba(232,230,220,0.35)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setOpen(false)} disabled={creating}>
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                  style={{ opacity: creating || !name.trim() ? 0.7 : 1 }}
                >
                  {creating ? "创建中..." : "创建"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
