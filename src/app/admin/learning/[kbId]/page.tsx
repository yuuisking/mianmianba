"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type KbInfo = {
  id: string;
  name: string;
  subtitle: string;
  tags: string[];
  updatedAt: string;
  stats: { topics: number; paths: number };
};

type TreeData = {
  id: string;
  title: string;
  groups: Array<{
    id: string;
    title: string;
    children: Array<{
      id: string;
      title: string;
    }>;
  }>;
};

type DraftSummaryData = {
  topic: string;
  content: {
    quickFacts?: Array<{ k: string; v: string }>;
    sections?: Array<{
      id: string;
      h2: string;
      paragraphs?: string[];
      bullets?: string[];
      callout?: string;
    }>;
  };
};

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AdminLearningKbEditPage() {
  const router = useRouter();
  const params = useParams<{ kbId?: string | string[] }>();
  const kbId = useMemo(() => {
    const raw = Array.isArray(params?.kbId) ? params.kbId[0] : params?.kbId;
    return safeDecodeURIComponent(raw || "");
  }, [params]);

  const [kb, setKb] = useState<KbInfo | null>(null);
  const [tree, setTree] = useState<TreeData | null>(null);
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState("默认分类");
  const [text, setText] = useState("");
  const [draftId, setDraftId] = useState("");
  const [summary, setSummary] = useState<DraftSummaryData | null>(null);

  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // UI state for generating taxonomy
  const [generatingTaxonomy, setGeneratingTaxonomy] = useState(false);
  const [taxonomyDescription, setTaxonomyDescription] = useState("");

  // UI state for adding manual node
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);

  const [selectedSubjectIdForTopic, setSelectedSubjectIdForTopic] = useState("");
  const [newTopicId, setNewTopicId] = useState("");
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const res = await fetch("/api/learning");
    const data = await res.json().catch(() => ({}));
    const foundKb = Array.isArray(data.kbs) ? data.kbs.find((x: KbInfo) => x.id === kbId) : undefined;
    setKb(foundKb || null);
    setTree(data.trees?.[kbId] || null);
    setLoading(false);
  };

  useEffect(() => {
    if (!kbId) return;
    refresh().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId]);

  const [importing, setImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [githubUrl, setGithubUrl] = useState("");

  const handleParse = async () => {
    setError("");
    setSuccess("");
    setDraftId("");
    setSummary(null);
    setImportLogs([]);

    const payloadText = text.trim();
    const payloadSubject = subject.trim();
    if (!payloadText || !kbId || !payloadSubject) return;

    setParsing(true);
    try {
      const res = await fetch("/api/admin/learning/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, subject: payloadSubject, text: payloadText }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "解析失败");

      setDraftId(typeof json.draftId === "string" ? json.draftId : "");
      setSummary(json.summary as DraftSummaryData);
      setSuccess("解析完成：已生成草稿。");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      setParsing(false);
    }
  };

  const handleBatchImport = async () => {
    if (!githubUrl.trim() || !kbId) return;
    
    setError("");
    setSuccess("");
    setDraftId("");
    setSummary(null);
    setImportLogs([]);
    setImporting(true);

    try {
      const res = await fetch("/api/admin/learning/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, githubUrl: githubUrl.trim(), limit: 0 }), // 0 = no limit
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "导入失败");
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        
        // 保留最后一个可能不完整的行
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message) {
              if (data.message === "__DONE__") {
                setSuccess("批量导入完成！");
                refresh(); // refresh the tree data
              } else {
                setImportLogs(prev => [...prev, data.message]);
              }
            }
          } catch (e) {
            console.error("Failed to parse log line", line);
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "导入请求失败");
    } finally {
      setImporting(false);
    }
  };

  const handleTopicDelete = async (subjectId: string, topicId: string, topicTitle: string) => {
    if (!window.confirm(`确定要删除专题 "${topicTitle}" 吗？此操作不可恢复！`)) return;

    try {
      const res = await fetch(
        `/api/admin/learning/topic?kbId=${encodeURIComponent(kbId)}&subjectId=${encodeURIComponent(subjectId)}&topicId=${encodeURIComponent(topicId)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "删除失败");

      setSuccess(`已删除专题 "${topicTitle}"。`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleGenerateTaxonomy = async () => {
    if (!kbId) return;
    setError("");
    setSuccess("");
    setGeneratingTaxonomy(true);

    try {
      const res = await fetch("/api/admin/learning/taxonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, description: taxonomyDescription }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "生成大纲失败");

      setSuccess("大纲生成成功！");
      setTaxonomyDescription("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "生成大纲失败");
    } finally {
      setGeneratingTaxonomy(false);
    }
  };

  const handleAddSubject = async () => {
    if (!kbId || !newSubjectId.trim() || !newSubjectTitle.trim()) return;
    setError("");
    setSuccess("");
    setAddingSubject(true);

    try {
      const res = await fetch("/api/admin/learning/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subject",
          kbId,
          subjectId: newSubjectId.trim(),
          subjectTitle: newSubjectTitle.trim()
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "添加分类失败");

      setSuccess("分类添加成功！");
      setNewSubjectId("");
      setNewSubjectTitle("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "添加分类失败");
    } finally {
      setAddingSubject(false);
    }
  };

  const handleAddTopic = async () => {
    if (!kbId || !selectedSubjectIdForTopic || !newTopicId.trim() || !newTopicTitle.trim()) return;
    setError("");
    setSuccess("");
    setAddingTopic(true);

    try {
      const res = await fetch("/api/admin/learning/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "topic",
          kbId,
          subjectId: selectedSubjectIdForTopic,
          topicId: newTopicId.trim(),
          topicTitle: newTopicTitle.trim()
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "添加专题失败");

      setSuccess("专题添加成功！");
      setNewTopicId("");
      setNewTopicTitle("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "添加专题失败");
    } finally {
      setAddingTopic(false);
    }
  };

  return (
    <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">知识库编辑</div>
          <button className="btn" onClick={() => router.push("/admin/learning")}>
            返回
          </button>
        </div>

        <div className="panel-body">
          <div className="hero" style={{ marginBottom: "12px" }}>
            <div className="breadcrumbs">
              <span className="chip">KB</span>
              <span>·</span>
              <span className="text-muted">{kb?.name || kbId}</span>
            </div>
            <h1 style={{ marginBottom: "6px" }}>{kb?.name || "未命名知识库"}</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              输入来源并点击“解析”，生成草稿后进入预览页编辑并发布。
            </p>
          </div>

          {loading ? <div className="notice">加载中...</div> : null}
          {!loading && !kb ? (
            <div className="notice">未找到该 KB（{kbId}）。你仍可以继续解析与发布（会自动创建必要的数据结构）。</div>
          ) : null}

          {success ? (
            <div
              className="notice"
              style={{ borderColor: "rgba(120,140,93,0.8)", color: "var(--accent-green)", marginBottom: "12px" }}
            >
              {success}
            </div>
          ) : null}
          {error ? (
            <div
              className="notice"
              style={{ borderColor: "rgba(217,119,87,0.8)", color: "var(--accent-orange)", marginBottom: "12px" }}
            >
              {error}
            </div>
          ) : null}

          <div className="field">
            <div className="label">Subject（单篇分类）</div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="默认分类" />
          </div>

          <div className="field">
            <div className="label">Source（单篇URL/文本）</div>
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="例如：https://github.com/... 或 https://... 或直接粘贴文章/Markdown"
            />
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end", marginBottom: "20px" }}>
            {draftId ? (
              <button
                className="btn"
                onClick={() =>
                  router.push(`/admin/learning/${encodeURIComponent(kbId)}/draft/${encodeURIComponent(draftId)}`)
                }
              >
                单篇预览
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              onClick={handleParse}
              disabled={parsing || !text.trim() || !subject.trim() || importing}
              style={{ opacity: parsing || !text.trim() || !subject.trim() || importing ? 0.7 : 1 }}
            >
              {parsing ? "解析中..." : "单篇解析"}
            </button>
          </div>

          <div className="hr" style={{ margin: "20px 0" }}></div>

          <h2 style={{ fontSize: "16px", marginBottom: "12px", color: "var(--accent-blue)" }}>体系大纲：一键AI生成</h2>
          <div className="field">
            <div className="label">附加提示词（可选）</div>
            <textarea
              rows={3}
              value={taxonomyDescription}
              onChange={(e) => setTaxonomyDescription(e.target.value)}
              placeholder="例如：侧重于前端工程化，分为基础、进阶、实战三个阶段"
            />
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end", marginBottom: "20px" }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerateTaxonomy}
              disabled={generatingTaxonomy}
              style={{ opacity: generatingTaxonomy ? 0.7 : 1, background: "var(--accent-blue)" }}
            >
              {generatingTaxonomy ? "正在生成..." : "一键AI生成标准大纲"}
            </button>
          </div>

          <div className="hr" style={{ margin: "20px 0" }}></div>

          <h2 style={{ fontSize: "16px", marginBottom: "12px", color: "var(--text-dark)", fontFamily: "var(--font-heading)" }}>手动创建大纲节点</h2>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {/* 添加分类 */}
            <div style={{ flex: 1, minWidth: "280px", background: "var(--bg-subtle)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <h3 style={{ fontSize: "14px", marginBottom: "12px", fontWeight: 600 }}>添加分类 (Group/Subject)</h3>
              <div className="field" style={{ marginBottom: "8px" }}>
                <input value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value)} placeholder="分类ID (如 frontend-basic)" style={{ width: "100%", padding: "6px 10px", fontSize: "13px" }} />
              </div>
              <div className="field" style={{ marginBottom: "12px" }}>
                <input value={newSubjectTitle} onChange={(e) => setNewSubjectTitle(e.target.value)} placeholder="分类名称 (如 前端基础)" style={{ width: "100%", padding: "6px 10px", fontSize: "13px" }} />
              </div>
              <button
                className="btn"
                onClick={handleAddSubject}
                disabled={addingSubject || !newSubjectId.trim() || !newSubjectTitle.trim()}
                style={{ width: "100%", justifyContent: "center" }}
              >
                {addingSubject ? "添加中..." : "添加分类"}
              </button>
            </div>

            {/* 添加专题 */}
            <div style={{ flex: 1, minWidth: "280px", background: "var(--bg-subtle)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <h3 style={{ fontSize: "14px", marginBottom: "12px", fontWeight: 600 }}>添加空专题 (Topic)</h3>
              <div className="field" style={{ marginBottom: "8px" }}>
                <select
                  value={selectedSubjectIdForTopic}
                  onChange={(e) => setSelectedSubjectIdForTopic(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", fontSize: "13px", background: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "6px" }}
                >
                  <option value="">-- 选择所属分类 --</option>
                  {tree?.groups?.map(g => <option key={g.id} value={g.id}>{g.title} ({g.id})</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: "8px" }}>
                <input value={newTopicId} onChange={(e) => setNewTopicId(e.target.value)} placeholder="专题ID (如 html-intro)" style={{ width: "100%", padding: "6px 10px", fontSize: "13px" }} />
              </div>
              <div className="field" style={{ marginBottom: "12px" }}>
                <input value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} placeholder="专题名称 (如 HTML简介)" style={{ width: "100%", padding: "6px 10px", fontSize: "13px" }} />
              </div>
              <button
                className="btn"
                onClick={handleAddTopic}
                disabled={addingTopic || !selectedSubjectIdForTopic || !newTopicId.trim() || !newTopicTitle.trim()}
                style={{ width: "100%", justifyContent: "center" }}
              >
                {addingTopic ? "添加中..." : "添加空专题"}
              </button>
            </div>
          </div>

          <div className="hr" style={{ margin: "20px 0" }}></div>

          <h2 style={{ fontSize: "16px", marginBottom: "12px", color: "var(--accent-blue)" }}>高级：GitHub 目录自动批量导入</h2>
          <div className="field">
            <div className="label">GitHub 目录 URL (例如：https://github.com/Snailclimb/JavaGuide/tree/main/docs/java)</div>
            <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="输入 GitHub Tree URL" />
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end", marginBottom: "12px" }}>
            <button
              className="btn btn-primary"
              onClick={handleBatchImport}
              disabled={importing || !githubUrl.trim() || parsing}
              style={{ opacity: importing || !githubUrl.trim() || parsing ? 0.7 : 1, background: "var(--accent-blue)" }}
            >
              {importing ? "正在批量导入..." : "开始批量自动导入"}
            </button>
          </div>

          {importLogs.length > 0 && (
            <div style={{ background: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "12px", maxHeight: "300px", overflowY: "auto", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.5 }}>
              {importLogs.map((log, i) => (
                <div key={i} style={{ color: log.includes("❌") ? "var(--accent-orange)" : "var(--text-dark)" }}>{log}</div>
              ))}
              {importing && <div style={{ color: "var(--accent-blue)", marginTop: "8px" }}>加载中...</div>}
            </div>
          )}

          {summary?.topic && !importing ? <div className="notice" style={{ marginTop: "12px" }}>主题：{summary.topic}</div> : null}

          <div className="hr" style={{ margin: "20px 0" }}></div>

          <h2 style={{ fontSize: "16px", marginBottom: "12px", color: "var(--text-dark)", fontFamily: "var(--font-heading)" }}>已录入内容（大纲视图）</h2>
          {!tree || !tree.groups || tree.groups.length === 0 ? (
            <div className="notice">该知识库下暂无内容，请通过上方功能进行录入。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {tree.groups.map((group) => (
                <div key={group.id} style={{ background: "var(--bg-subtle)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <h3 style={{ fontSize: "15px", marginBottom: "12px", fontWeight: 600, color: "var(--text-dark)" }}>{group.title}</h3>
                  {group.children && group.children.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {group.children.map((child) => (
                        <div key={child.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-main)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(0,0,0,0.05)" }}>
                          <div style={{ fontSize: "14px", color: "var(--text-dark)" }}>{child.title}</div>
                          <button
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: "12px", color: "var(--accent-orange)", background: "rgba(217,119,87,0.1)", border: "none" }}
                            onClick={() => handleTopicDelete(group.id, child.id, child.title)}
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted" style={{ fontSize: "13px" }}>无专题</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
