"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";
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
  status?: string;
  createdAt: string;
  updatedAt: string;
  reviewNotes?: string[];
  diffSummary?: string[];
  pipeline?: Array<{
    key: string;
    label: string;
    status: string;
    updatedAt: string;
    detail?: string;
  }>;
  summary: DraftSummaryData;
};

type ArtifactRequirement = {
  key: "flowchart" | "architecture" | "codeExample";
  label: string;
  required: boolean;
  reason: string;
};

type DraftQualityChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

type DraftQualityCheck = {
  publishReady: boolean;
  blockingIssues: string[];
  checklist: DraftQualityChecklistItem[];
  artifactRequirements: ArtifactRequirement[];
  purityRiskKeywords: string[];
};

type SourceRecord = {
  id: string;
  type: string;
  mode: string;
  status: string;
  title: string;
  url: string;
  subject: string;
  whitelist: boolean;
  updatedAt: string;
};

/**
 * Decodes dynamic route params without throwing on malformed encodings.
 * @param {string} value Raw route param value.
 * @returns {string} Decoded string or the original fallback value.
 */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Converts a string array into editable textarea content.
 * @param {string[] | undefined} value Optional text list.
 * @returns {string} Multiline textarea value.
 */
function toLines(value: string[] | undefined): string {
  return (value || []).join("\n");
}

/**
 * Splits textarea content back into a compact text array.
 * @param {string} value Raw textarea content.
 * @returns {string[] | undefined} Trimmed line array or `undefined` when empty.
 */
function fromLines(value: string): string[] | undefined {
  const items = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Builds a unique section id for newly inserted draft blocks.
 * @returns {string} Stable-enough client-generated section identifier.
 */
function newSectionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Formats nullable timestamps for review metadata cards.
 * @param {string | null | undefined} value Raw timestamp string.
 * @returns {string} Display-safe time string.
 */
function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }
  return value.replace("T", " ").slice(0, 16);
}

/**
 * Renders the draft review workspace with source tracing, pipeline state, and publish action.
 * @returns {JSX.Element} Draft review page.
 */
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
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [reviewNotesText, setReviewNotesText] = useState("");
  const [diffSummaryText, setDiffSummaryText] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("reviewing");
  const [qualityCheck, setQualityCheck] = useState<DraftQualityCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /**
   * Loads the current draft review payload from the admin API.
   * @returns {Promise<void>} Fetch completion promise.
   */
  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    const res = await fetch(
      `/api/admin/learning/draft?kbId=${encodeURIComponent(kbId)}&draftId=${encodeURIComponent(draftId)}`
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      draft?: DraftRecord;
      qualityCheck?: DraftQualityCheck;
      sources?: SourceRecord[];
    };
    if (!res.ok || !json.draft) {
      throw new Error(json.error || "加载草稿失败");
    }
    setDraft(json.draft);
    setSummary(json.draft.summary);
    setSources(Array.isArray(json.sources) ? json.sources : []);
    setQualityCheck(json.qualityCheck ?? null);
    setReviewNotesText((json.draft.reviewNotes || []).join("\n"));
    setDiffSummaryText((json.draft.diffSummary || []).join("\n"));
    setWorkflowStatus(json.draft.status || "reviewing");
    setLoading(false);
  }, [draftId, kbId]);

  useEffect(() => {
    if (!kbId || !draftId) {
      return;
    }
    refresh().catch((fetchError: unknown) => {
      setLoading(false);
      setError(fetchError instanceof Error ? fetchError.message : "加载草稿失败");
    });
  }, [draftId, kbId, refresh]);

  const quickFacts = summary?.content.quickFacts || [];
  const sections = summary?.content.sections || [];

  /**
   * Replaces one quick-fact row in the current draft summary state.
   * @param {number} index Quick-fact row index.
   * @param {QuickFact} next Next quick-fact value.
   * @returns {void} Updates the local summary state.
   */
  const setQuickFact = (index: number, next: QuickFact): void => {
    setSummary((prev) => {
      if (!prev) {
        return prev;
      }
      const list = [...(prev.content.quickFacts || [])];
      list[index] = next;
      return { ...prev, content: { ...prev.content, quickFacts: list } };
    });
  };

  /**
   * Appends one empty quick-fact row to the current draft summary state.
   * @returns {void} Updates the local summary state.
   */
  const addQuickFact = (): void => {
    setSummary((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        content: {
          ...prev.content,
          quickFacts: [...(prev.content.quickFacts || []), { k: "", v: "" }],
        },
      };
    });
  };

  /**
   * Removes one quick-fact row from the current draft summary state.
   * @param {number} index Quick-fact row index.
   * @returns {void} Updates the local summary state.
   */
  const removeQuickFact = (index: number): void => {
    setSummary((prev) => {
      if (!prev) {
        return prev;
      }
      const list = [...(prev.content.quickFacts || [])];
      list.splice(index, 1);
      return { ...prev, content: { ...prev.content, quickFacts: list } };
    });
  };

  /**
   * Replaces one section block in the current draft summary state.
   * @param {number} index Section index.
   * @param {ContentSection} next Next section value.
   * @returns {void} Updates the local summary state.
   */
  const setSection = (index: number, next: ContentSection): void => {
    setSummary((prev) => {
      if (!prev) {
        return prev;
      }
      const list = [...(prev.content.sections || [])];
      list[index] = next;
      return { ...prev, content: { ...prev.content, sections: list } };
    });
  };

  /**
   * Appends one empty content section to the current draft summary state.
   * @returns {void} Updates the local summary state.
   */
  const addSection = (): void => {
    setSummary((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        content: {
          ...prev.content,
          sections: [
            ...(prev.content.sections || []),
            { id: newSectionId(), h2: "新小节", paragraphs: [], bullets: [], callout: "" },
          ],
        },
      };
    });
  };

  /**
   * Removes one section block from the current draft summary state.
   * @param {number} index Section index.
   * @returns {void} Updates the local summary state.
   */
  const removeSection = (index: number): void => {
    setSummary((prev) => {
      if (!prev) {
        return prev;
      }
      const list = [...(prev.content.sections || [])];
      list.splice(index, 1);
      return { ...prev, content: { ...prev.content, sections: list } };
    });
  };

  /**
   * Saves the current draft review edits and workflow metadata.
   * @returns {Promise<void>} Save completion promise.
   */
  const handleSave = async (): Promise<void> => {
    if (!summary) {
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/learning/draft/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId,
          draftId,
          summary,
          status: workflowStatus,
          reviewNotes: fromLines(reviewNotesText) || [],
          diffSummary: fromLines(diffSummaryText) || [],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        draft?: DraftRecord;
        qualityCheck?: DraftQualityCheck;
        sources?: SourceRecord[];
      };
      if (!res.ok || !json.draft) {
        setQualityCheck(json.qualityCheck ?? null);
        throw new Error(json.error || "保存草稿失败");
      }
      setDraft(json.draft);
      setSummary(json.draft.summary);
      setSources(Array.isArray(json.sources) ? json.sources : []);
      setQualityCheck(json.qualityCheck ?? null);
      setSuccess("已保存审核结果。");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "保存草稿失败");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Publishes the current draft into the public learning center after final confirmation.
   * @returns {Promise<void>} Publish completion promise.
   */
  const handlePublish = async (): Promise<void> => {
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/learning/draft/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, draftId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        qualityCheck?: DraftQualityCheck;
      };
      if (!res.ok) {
        setQualityCheck(json.qualityCheck ?? null);
        throw new Error(json.error || "发布失败");
      }
      router.push(`/admin/learning/${encodeURIComponent(kbId)}`);
    } catch (publishError: unknown) {
      setError(publishError instanceof Error ? publishError.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const markdownComponents: Components = {
    /**
     * Renders fenced Mermaid blocks as diagrams and keeps other code blocks untouched.
     * @param {Parameters<NonNullable<Components["code"]>>[0]} props React Markdown code renderer props.
     * @returns {JSX.Element} Diagram or regular code element.
     */
    code(props) {
      const { className, children, ...rest } = props;
      const languageMatch = /language-(\w+)/.exec(className || "");
      if (languageMatch && languageMatch[1] === "mermaid") {
        return <Mermaid chart={String(children).replace(/\n$/, "")} />;
      }
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    },
  };

  /**
   * 将审核结论格式化成“必需 / 可选”的可读文本。
   * @param {ArtifactRequirement} requirement 图例或代码块要求。
   * @returns {string} 审核说明文本。
   */
  function formatRequirement(requirement: ArtifactRequirement): string {
    return `${requirement.required ? "必需" : "可选"}：${requirement.reason}`;
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
        <div className="panel">
          <div className="panel-body">
            <div className="notice">加载草稿中...</div>
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
            <div className="panel-title">草稿审核</div>
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
      <div className="shell" style={{ gridTemplateColumns: "460px minmax(0, 1fr)" }}>
        <aside className="panel">
          <div className="panel-header">
            <div className="panel-title">审核台</div>
            <button className="btn" onClick={() => router.push(`/admin/learning/${encodeURIComponent(kbId)}`)}>
              返回工作台
            </button>
          </div>
          <div className="panel-body">
            <div className="hero" style={{ marginBottom: "14px" }}>
              <div className="breadcrumbs">
                <span className="chip">Draft Review</span>
                <span>·</span>
                <span className="text-muted">{draft.subject || "默认分类"}</span>
              </div>
              <h1 style={{ marginBottom: "8px" }}>草稿审核与发布</h1>
              <p className="text-muted" style={{ margin: 0 }}>
                在这里查看来源、核对 AI 流水线、补齐结构化内容，并决定是否发布到公开学习中心。
              </p>
            </div>

            {success ? (
              <div
                className="notice"
                style={{ marginBottom: "12px", borderColor: "rgba(120,140,93,0.8)", color: "var(--accent-green)" }}
              >
                {success}
              </div>
            ) : null}
            {error ? (
              <div
                className="notice"
                style={{ marginBottom: "12px", borderColor: "rgba(217,119,87,0.8)", color: "var(--accent-orange)" }}
              >
                {error}
              </div>
            ) : null}

            <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
              <div style={{ padding: "12px", borderRadius: "12px", background: "var(--bg-subtle)" }}>
                <div className="text-muted" style={{ fontSize: "12px" }}>
                  工作流状态
                </div>
                <div style={{ marginTop: "6px", fontWeight: 700 }}>{draft.status || "reviewing"}</div>
                <div className="text-muted" style={{ marginTop: "6px", fontSize: "12px" }}>
                  创建于 {formatTime(draft.createdAt)}，最后编辑于 {formatTime(draft.updatedAt)}
                </div>
              </div>
              <div style={{ padding: "12px", borderRadius: "12px", background: "var(--bg-subtle)" }}>
                <div className="text-muted" style={{ fontSize: "12px", marginBottom: "8px" }}>
                  多 AI 流水线
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {(draft.pipeline || []).map((step) => (
                    <div
                      key={step.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "10px",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        background: "var(--bg-main)",
                        fontSize: "12px",
                      }}
                    >
                      <span>{step.label}</span>
                      <span className="text-muted">{step.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: "12px", borderRadius: "12px", background: "var(--bg-subtle)" }}>
                <div className="text-muted" style={{ fontSize: "12px", marginBottom: "8px" }}>
                  来源记录
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {sources.length ? (
                    sources.map((source) => (
                      <div key={source.id} style={{ padding: "8px 10px", borderRadius: "10px", background: "var(--bg-main)" }}>
                        <div style={{ fontWeight: 600 }}>{source.title}</div>
                        <div className="text-muted" style={{ fontSize: "12px", marginTop: "4px" }}>
                          {source.type} / {source.mode} / {source.status}
                        </div>
                        <div className="text-muted" style={{ fontSize: "12px", marginTop: "4px" }}>
                          {source.url || "手动粘贴文本"}；更新时间 {formatTime(source.updatedAt)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="notice">当前草稿没有关联来源。</div>
                  )}
                </div>
              </div>
              <div style={{ padding: "12px", borderRadius: "12px", background: "var(--bg-subtle)" }}>
                <div className="text-muted" style={{ fontSize: "12px", marginBottom: "8px" }}>
                  发布前检查项
                </div>
                {qualityCheck ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: "10px",
                        background: "var(--bg-main)",
                        fontSize: "12px",
                        color: qualityCheck.publishReady ? "var(--accent-green)" : "var(--accent-orange)",
                      }}
                    >
                      {qualityCheck.publishReady ? "当前草稿满足发布条件" : "当前草稿仍有阻断项，不能直接发布"}
                    </div>
                    {qualityCheck.artifactRequirements.map((requirement) => (
                      <div key={requirement.key} style={{ padding: "8px 10px", borderRadius: "10px", background: "var(--bg-main)" }}>
                        <div style={{ fontWeight: 600 }}>{requirement.label}</div>
                        <div className="text-muted" style={{ fontSize: "12px", marginTop: "4px" }}>
                          {formatRequirement(requirement)}
                        </div>
                      </div>
                    ))}
                    {qualityCheck.checklist.map((item) => (
                      <div key={item.key} style={{ padding: "8px 10px", borderRadius: "10px", background: "var(--bg-main)" }}>
                        <div style={{ fontWeight: 600, color: item.passed ? "var(--accent-green)" : "var(--accent-orange)" }}>
                          {item.passed ? "通过" : "阻断"} · {item.label}
                        </div>
                        <div className="text-muted" style={{ fontSize: "12px", marginTop: "4px" }}>
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="notice">暂未拿到检查结果。</div>
                )}
              </div>
            </div>

            <div className="field">
              <div className="label">主题标题</div>
              <input
                value={summary.topic}
                onChange={(event) => setSummary((prev) => (prev ? { ...prev, topic: event.target.value } : prev))}
              />
            </div>
            <div className="field">
              <div className="label">审核状态</div>
              <select value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value)}>
                <option value="reviewing">审核中</option>
                <option value="ready_to_publish">可发布</option>
                <option value="pending_review">待审核</option>
              </select>
            </div>
            <div className="field">
              <div className="label">审核备注（每行一条）</div>
              <textarea rows={4} value={reviewNotesText} onChange={(event) => setReviewNotesText(event.target.value)} />
            </div>
            <div className="field">
              <div className="label">改动摘要（每行一条）</div>
              <textarea rows={4} value={diffSummaryText} onChange={(event) => setDiffSummaryText(event.target.value)} />
            </div>

            <div className="hr"></div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ fontWeight: 700 }}>核心摘要</div>
              <button className="btn" onClick={addQuickFact}>
                添加
              </button>
            </div>
            <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
              {quickFacts.length ? (
                quickFacts.map((fact, index) => (
                  <div key={`fact-${index}`} className="panel" style={{ padding: "10px" }}>
                    <div className="field">
                      <div className="label">标题</div>
                      <input value={fact.k} onChange={(event) => setQuickFact(index, { ...fact, k: event.target.value })} />
                    </div>
                    <div className="field">
                      <div className="label">说明</div>
                      <input value={fact.v} onChange={(event) => setQuickFact(index, { ...fact, v: event.target.value })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button className="btn" onClick={() => removeQuickFact(index)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="notice">暂无摘要条目。</div>
              )}
            </div>

            <div className="hr"></div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ fontWeight: 700 }}>正文结构</div>
              <button className="btn" onClick={addSection}>
                添加小节
              </button>
            </div>
            <div style={{ display: "grid", gap: "12px", marginTop: "10px" }}>
              {sections.length ? (
                sections.map((section, index) => (
                  <div key={section.id || index} className="panel" style={{ padding: "10px" }}>
                    <div className="field">
                      <div className="label">小节标题</div>
                      <input value={section.h2} onChange={(event) => setSection(index, { ...section, h2: event.target.value })} />
                    </div>
                    <div className="field">
                      <div className="label">正文（每行一段）</div>
                      <textarea
                        rows={5}
                        value={toLines(section.paragraphs)}
                        onChange={(event) =>
                          setSection(index, { ...section, paragraphs: fromLines(event.target.value) })
                        }
                      />
                    </div>
                    <div className="field">
                      <div className="label">要点（每行一条）</div>
                      <textarea
                        rows={4}
                        value={toLines(section.bullets)}
                        onChange={(event) =>
                          setSection(index, { ...section, bullets: fromLines(event.target.value) })
                        }
                      />
                    </div>
                    <div className="field">
                      <div className="label">提示块</div>
                      <textarea
                        rows={3}
                        value={section.callout || ""}
                        onChange={(event) => setSection(index, { ...section, callout: event.target.value })}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button className="btn" onClick={() => removeSection(index)}>
                        删除小节
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="notice">当前草稿还没有小节。</div>
              )}
            </div>

            <div className="hr"></div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="btn" onClick={handleSave} disabled={saving || publishing}>
                {saving ? "保存中..." : "保存草稿"}
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePublish}
                disabled={publishing || workflowStatus === "pending_review" || !qualityCheck?.publishReady}
              >
                {publishing ? "发布中..." : "发布到学习中心"}
              </button>
            </div>
          </div>
        </aside>

        <main className="panel" style={{ background: "var(--bg-surface)", overflow: "hidden" }}>
          <div className="panel-header" style={{ background: "var(--bg-main)" }}>
            <div className="panel-title">阅读预览</div>
            <span className="chip">Preview</span>
          </div>
          <div className="panel-body yuque-main" style={{ padding: "40px", borderRadius: "0 0 14px 14px" }}>
            <div className="yuque-content">
              <h1 className="yuque-title">{summary.topic || "未命名主题"}</h1>

              {quickFacts.length > 0 ? (
                <div className="yuque-quickfacts">
                  <div className="yuque-quickfacts-title">核心摘要</div>
                  {quickFacts.map((fact, index) => (
                    <div key={`preview-fact-${index}`} className="yuque-quickfacts-item">
                      <div className="yuque-quickfacts-k">{fact.k}</div>
                      <div className="yuque-quickfacts-v">{fact.v}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="doc-body">
                {sections.map((section, index) => (
                  <section key={section.id || index} id={section.id}>
                    <h2 className="yuque-section-title">{section.h2}</h2>
                    {section.callout ? (
                      <div className="doc-callout">
                        <div className="doc-callout-icon">!</div>
                        <div className="doc-callout-content markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {section.callout}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : null}
                    {section.paragraphs?.map((paragraph, paragraphIndex) => (
                      <div key={`paragraph-${paragraphIndex}`} className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {paragraph}
                        </ReactMarkdown>
                      </div>
                    ))}
                    {section.bullets?.length ? (
                      <div className="markdown-body" style={{ margin: "10px 0 20px 18px" }}>
                        <ul>
                          {section.bullets.map((bullet, bulletIndex) => (
                            <li key={`bullet-${bulletIndex}`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {bullet}
                              </ReactMarkdown>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ))}
                {sections.length === 0 ? (
                  <div className="notice" style={{ marginTop: "30px" }}>
                    当前草稿还没有正文小节。
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
