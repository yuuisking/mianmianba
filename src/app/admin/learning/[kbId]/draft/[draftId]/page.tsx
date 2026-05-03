"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Mermaid from "@/components/Mermaid";

type QuickFact = { k: string; v: string };

type ContentSection = {
  id: string;
  h2: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: string;
};

type DraftSummaryData = {
  topic: string;
  content: {
    quickFacts?: QuickFact[];
    sections?: ContentSection[];
  };
};

type DraftRecord = {
  id: string;
  kbId: string;
  subject: string;
  summary: DraftSummaryData;
  createdAt: string;
  updatedAt: string;
};

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toLines(value: string[] | undefined) {
  return (value || []).join("\n");
}

function fromLines(value: string) {
  const items = value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function newSectionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminLearningDraftPreviewPage() {
  const router = useRouter();
  const params = useParams<{ kbId?: string | string[]; draftId?: string | string[] }>();

  const kbId = useMemo(() => {
    const raw = Array.isArray(params?.kbId) ? params.kbId[0] : params?.kbId;
    return safeDecodeURIComponent(raw || "");
  }, [params]);

  const draftId = useMemo(() => {
    const raw = Array.isArray(params?.draftId) ? params.draftId[0] : params?.draftId;
    return safeDecodeURIComponent(raw || "");
  }, [params]);

  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [summary, setSummary] = useState<DraftSummaryData | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      const res = await fetch(
        `/api/admin/learning/draft?kbId=${encodeURIComponent(kbId)}&draftId=${encodeURIComponent(draftId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "加载草稿失败");

      const d = json.draft as DraftRecord;
      setDraft(d);
      setSummary(d.summary);
      setLoading(false);
    };

    if (!kbId || !draftId) return;
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "加载草稿失败");
      setLoading(false);
    });
  }, [kbId, draftId]);

  const quickFacts = summary?.content?.quickFacts || [];
  const sections = summary?.content?.sections || [];

  const setQuickFact = (index: number, next: QuickFact) => {
    setSummary((prev) => {
      if (!prev) return prev;
      const list = [...(prev.content.quickFacts || [])];
      list[index] = next;
      return { ...prev, content: { ...prev.content, quickFacts: list } };
    });
  };

  const addQuickFact = () => {
    setSummary((prev) => {
      if (!prev) return prev;
      const list = [...(prev.content.quickFacts || []), { k: "", v: "" }];
      return { ...prev, content: { ...prev.content, quickFacts: list } };
    });
  };

  const removeQuickFact = (index: number) => {
    setSummary((prev) => {
      if (!prev) return prev;
      const list = [...(prev.content.quickFacts || [])];
      list.splice(index, 1);
      return { ...prev, content: { ...prev.content, quickFacts: list } };
    });
  };

  const setSection = (index: number, next: ContentSection) => {
    setSummary((prev) => {
      if (!prev) return prev;
      const list = [...(prev.content.sections || [])];
      list[index] = next;
      return { ...prev, content: { ...prev.content, sections: list } };
    });
  };

  const addSection = () => {
    setSummary((prev) => {
      if (!prev) return prev;
      const list = [
        ...(prev.content.sections || []),
        { id: newSectionId(), h2: "新小节", paragraphs: [], bullets: [], callout: "" },
      ];
      return { ...prev, content: { ...prev.content, sections: list } };
    });
  };

  const removeSection = (index: number) => {
    setSummary((prev) => {
      if (!prev) return prev;
      const list = [...(prev.content.sections || [])];
      list.splice(index, 1);
      return { ...prev, content: { ...prev.content, sections: list } };
    });
  };

  const handleSave = async () => {
    if (!summary) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/learning/draft/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, draftId, summary }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "保存失败");

      setDraft(json.draft as DraftRecord);
      setSummary((json.draft as DraftRecord).summary);
      setSuccess("已保存草稿。");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/learning/draft/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, draftId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "发布失败");

      router.push(`/admin/learning/${encodeURIComponent(kbId)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const markdownComponents: Components = {
    code({ node, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      if (match && match[1] === "mermaid") {
        return <Mermaid chart={String(children).replace(/\n$/, "")} />;
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
        <div className="panel">
          <div className="panel-body">
            <div className="notice">加载中...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!draft || !summary) {
    return (
      <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">草稿预览</div>
            <button className="btn" onClick={() => router.push(`/admin/learning/${encodeURIComponent(kbId)}`)}>
              返回
            </button>
          </div>
          <div className="panel-body">
            <div className="notice">{error || "草稿不存在或已发布。"}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
      <div className="shell" style={{ gridTemplateColumns: "420px minmax(0, 1fr)" }}>
        <aside className="panel">
          <div className="panel-header">
            <div className="panel-title">草稿编辑</div>
            <button className="btn" onClick={() => router.push(`/admin/learning/${encodeURIComponent(kbId)}`)}>
              返回
            </button>
          </div>
          <div className="panel-body">
            <div className="hero" style={{ marginBottom: "12px" }}>
              <div className="breadcrumbs">
                <span className="chip">Draft</span>
                <span>·</span>
                <span className="text-muted">{draft.subject || "默认分类"}</span>
              </div>
              <h1 style={{ marginBottom: "6px" }}>预览与发布</h1>
              <p className="text-muted" style={{ margin: 0 }}>
                编辑结构后点击“保存草稿”，确认无误点击“发布”进入学习中心。
              </p>
            </div>

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
              <div className="label">Topic（主题标题）</div>
              <input
                value={summary.topic}
                onChange={(e) => setSummary((prev) => (prev ? { ...prev, topic: e.target.value } : prev))}
              />
            </div>

            <div className="hr"></div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ fontWeight: 700 }}>QuickFacts</div>
              <button className="btn" onClick={addQuickFact}>
                添加
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
              {quickFacts.length ? (
                quickFacts.map((q, idx) => (
                  <div key={idx} className="panel" style={{ padding: "10px", borderRadius: "12px" }}>
                    <div className="field" style={{ marginBottom: "10px" }}>
                      <div className="label">Key</div>
                      <input value={q.k} onChange={(e) => setQuickFact(idx, { ...q, k: e.target.value })} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <div className="label">Value</div>
                      <input value={q.v} onChange={(e) => setQuickFact(idx, { ...q, v: e.target.value })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                      <button className="btn" onClick={() => removeQuickFact(idx)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="notice">暂无 QuickFacts，可点击“添加”。</div>
              )}
            </div>

            <div className="hr"></div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ fontWeight: 700 }}>Sections</div>
              <button className="btn" onClick={addSection}>
                添加
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
              {sections.length ? (
                sections.map((s, idx) => (
                  <div key={s.id || idx} className="panel" style={{ padding: "10px", borderRadius: "12px" }}>
                    <div className="field">
                      <div className="label">H2</div>
                      <input value={s.h2} onChange={(e) => setSection(idx, { ...s, h2: e.target.value })} />
                    </div>
                    <div className="field">
                      <div className="label">Paragraphs（每行一段）</div>
                      <textarea
                        rows={6}
                        value={toLines(s.paragraphs)}
                        onChange={(e) => setSection(idx, { ...s, paragraphs: fromLines(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Bullets（每行一条）</div>
                      <textarea
                        rows={6}
                        value={toLines(s.bullets)}
                        onChange={(e) => setSection(idx, { ...s, bullets: fromLines(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Callout</div>
                      <textarea
                        rows={4}
                        value={s.callout || ""}
                        onChange={(e) => setSection(idx, { ...s, callout: e.target.value })}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button className="btn" onClick={() => removeSection(idx)}>
                        删除小节
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="notice">暂无小节，可点击“添加”。</div>
              )}
            </div>

            <div className="hr"></div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn" onClick={handleSave} disabled={saving || publishing} style={{ opacity: saving ? 0.7 : 1 }}>
                {saving ? "保存中..." : "保存草稿"}
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePublish}
                disabled={publishing}
                style={{ opacity: publishing ? 0.7 : 1 }}
              >
                {publishing ? "发布中..." : "发布"}
              </button>
            </div>
          </div>
        </aside>

        <main className="panel" style={{ background: "var(--bg-surface)", overflow: "hidden" }}>
          <div className="panel-header" style={{ background: "var(--bg-main)" }}>
            <div className="panel-title">预览</div>
            <span className="chip">Preview</span>
          </div>
          <div className="panel-body yuque-main" style={{ padding: "40px", borderRadius: "0 0 14px 14px" }}>
            <div className="yuque-content">
              <h1 className="yuque-title">{summary.topic || "未命名主题"}</h1>
              
              {quickFacts.length > 0 && (
                <div className="yuque-quickfacts">
                  <div className="yuque-quickfacts-title">核心摘要</div>
                  {quickFacts.map((x, idx) => (
                    <div key={idx} className="yuque-quickfacts-item">
                      <div className="yuque-quickfacts-k">{x.k}</div>
                      <div className="yuque-quickfacts-v">{x.v}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="doc-body">
                {sections.map((s, idx) => (
                  <section key={s.id || idx} id={s.id}>
                    <h2 className="yuque-section-title">{s.h2}</h2>
                    {s.callout ? (
                      <div className="doc-callout">
                        <div className="doc-callout-icon">💡</div>
                        <div className="doc-callout-content markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {s.callout}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : null}
                    {s.paragraphs?.map((p, pIdx) => (
                      <div key={pIdx} className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{p}</ReactMarkdown>
                      </div>
                    ))}
                    {s.bullets?.length ? (
                      <div className="markdown-body" style={{ margin: "10px 0 20px 18px" }}>
                        <ul>
                          {s.bullets.map((b, bIdx) => (
                            <li key={bIdx}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{b}</ReactMarkdown>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ))}
                {sections.length === 0 ? (
                  <div className="notice" style={{ marginTop: "40px" }}>暂无内容小节。</div>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

