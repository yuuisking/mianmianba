"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Mermaid from "@/components/Mermaid";

type QuickFact = {
  k: string;
  v: string;
};

type ContentSection = {
  id: string;
  h2: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: string;
};

type TopicContent = {
  title: string;
  breadcrumb: string[];
  quickFacts: QuickFact[];
  sections: ContentSection[];
};

type TreeNode = {
  id: string;
  title: string;
  children?: TreeNode[];
};

type TreeGroup = {
  id: string;
  title: string;
  children: TreeNode[];
};

type TreeData = {
  id: string;
  title: string;
  groups: TreeGroup[];
};

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
  trees: Record<string, TreeData>;
  contents: Record<string, Record<string, TopicContent>>;
};

export default function LearningCenterPage() {
  const router = useRouter();
  const [data, setData] = useState<LearningData | null>(null);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/learning")
      .then((res) => res.json())
      .then((json: LearningData) => {
        setData(json);
        
        if (!json.kbs || json.kbs.length === 0) {
          setLoading(false);
          return;
        }

        // Just pre-expand the first kb's tree if available
        const firstKb = json.kbs[0];
        const tree = json.trees?.[firstKb.id];
        if (tree && tree.groups.length > 0) {
          const firstGroup = tree.groups[0];
          setExpandedGroups({ [firstGroup.id]: true });
          
          if (firstGroup.children && firstGroup.children.length > 0) {
            setSelectedTopicId(firstGroup.children[0].id);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load learning data:", err);
        setLoading(false);
      });
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStartInterview = (topicTitle: string) => {
    router.push(`/practice?topic=${encodeURIComponent(topicTitle)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-muted">数据加载失败</div>;

  if (data.kbs.length === 0) {
    return (
      <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
        <div className="panel">
          <div className="hero">
            <div className="breadcrumbs">
              <span className="chip">学习中心</span>
              <span>·</span>
              <span className="text-muted">体系化知识库（不是文档堆砌）</span>
            </div>
            <h1>暂无知识库内容</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              当前还没有任何知识库被创建或入库内容。请联系管理员在后台管理中创建知识库并入库内容。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedKbId) {
    return (
      <div className="container" style={{ padding: "18px 18px 40px 18px" }}>
        <div className="panel">
          <div className="hero">
            <div className="breadcrumbs">
              <span className="chip">学习中心</span>
              <span>·</span>
              <span className="text-muted">体系化知识库（不是文档堆砌）</span>
            </div>
            <h1>选择你的知识体系</h1>
            <p className="text-muted">先看到“大类”，再进入体系树；每个知识点都有典型回答、追问点与训练建议。</p>
          </div>
          <div className="section">
            <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "14px" }}>
              {data.kbs.map(kb => (
                <div 
                  key={kb.id} 
                  className="card" 
                  style={{ gridColumn: "span 4", padding: "14px", borderRadius: "14px", border: "1px solid var(--border-color)", background: "rgba(255,255,255,0.84)", boxShadow: "0 10px 30px rgba(20, 20, 19, 0.08)", cursor: "pointer", transition: "transform .08s ease, border-color .2s ease, background .2s ease" }}
                  onClick={() => {
                    setSelectedKbId(kb.id);
                    const tree = data.trees?.[kb.id];
                    if (tree && tree.groups.length > 0) {
                      const firstGroup = tree.groups[0];
                      setExpandedGroups({ [firstGroup.id]: true });
                      if (firstGroup.children && firstGroup.children.length > 0) {
                        setSelectedTopicId(firstGroup.children[0].id);
                      } else {
                        setSelectedTopicId("");
                      }
                    } else {
                      setSelectedTopicId("");
                    }
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "rgba(106,155,204,0.35)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}
                >
                  <h3 style={{ margin: "0 0 6px 0", fontSize: "18px" }}>{kb.name}</h3>
                  <p className="text-muted" style={{ fontSize: "14px" }}>{kb.subtitle}</p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                    <span className="chip" style={{ fontSize: "12px", background: "rgba(232,230,220,0.35)" }}>主题 {kb.stats.topics}</span>
                    <span className="chip" style={{ fontSize: "12px", background: "rgba(232,230,220,0.35)" }}>路径 {kb.stats.paths}</span>
                    <span className="chip" style={{ fontSize: "12px", background: "rgba(232,230,220,0.35)" }}>更新 {kb.updatedAt}</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                    {kb.tags.map(tag => (
                      <span key={tag} className="chip" style={{ fontSize: "12px", background: "rgba(232,230,220,0.35)" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentTree = selectedKbId ? data.trees?.[selectedKbId] : null;
  const content = (selectedKbId && selectedTopicId) ? data.contents?.[selectedKbId]?.[selectedTopicId] : null;

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

  return (
    <div className="yuque-layout">
      {/* Left Sidebar - Category Tree */}
      <aside className="yuque-sidebar">
        <div className="yuque-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
            <span style={{ background: "var(--accent-orange)", width: "16px", height: "16px", borderRadius: "4px" }}></span>
            {currentTree ? currentTree.title : "体系建设中"}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {currentTree && currentTree.groups && currentTree.groups.length > 0 ? (
            <div className="tree">
              {currentTree.groups.map((group) => (
                <div key={group.id} className={`tree-group ${expandedGroups[group.id] ? "open" : ""}`}>
                  <button onClick={() => toggleExpand(group.id)}>
                    <span>{group.title}</span>
                    <span className="text-muted" style={{ fontSize: "12px" }}>{expandedGroups[group.id] ? "▼" : "▶"}</span>
                  </button>
                  <div className="tree-children" style={{ display: expandedGroups[group.id] ? "flex" : "none" }}>
                    {group.children.map((child) => (
                      <div key={child.id} className="tree-item">
                        <a
                          href={`#${child.id}`}
                          className={child.id === selectedTopicId ? "active" : ""}
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedTopicId(child.id);
                          }}
                        >
                          {child.title}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted" style={{ padding: "0 12px", fontSize: "13px" }}>内容正在归纳录入中...</div>
          )}
        </div>
        <div style={{ padding: "20px 12px 0 12px", borderTop: "1px solid var(--border-color)", marginTop: "20px" }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setSelectedKbId(null); }} style={{ fontSize: "13px", color: "var(--text-muted)", textDecoration: "none" }}>← 返回知识库列表</a>
        </div>
      </aside>

      {/* Right Content Area */}
      <main className="yuque-main">
        {content ? (
          <div className="yuque-content">
            <h1 className="yuque-title">{content.title}</h1>
            
            {content.quickFacts && content.quickFacts.length > 0 && (
              <div className="yuque-quickfacts">
                <div className="yuque-quickfacts-title">核心摘要</div>
                {content.quickFacts.map((x, idx) => (
                  <div key={idx} className="yuque-quickfacts-item">
                    <div className="yuque-quickfacts-k">{x.k}</div>
                    <div className="yuque-quickfacts-v">{x.v}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="doc-body">
              {content.sections.map((s) => (
                <section key={s.id} id={s.id}>
                  <h2 className="yuque-section-title">{s.h2}</h2>
                  {s.callout && (
                    <div className="doc-callout">
                      <div className="doc-callout-icon">💡</div>
                      <div className="doc-callout-content markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {s.callout}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {s.paragraphs && s.paragraphs.map((p, idx) => (
                    <div key={idx} className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{p}</ReactMarkdown>
                    </div>
                  ))}
                  {s.bullets && s.bullets.length > 0 && (
                    <div className="markdown-body" style={{ margin: "10px 0 20px 18px" }}>
                      <ul>
                        {s.bullets.map((b, idx) => (
                          <li key={idx}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{b}</ReactMarkdown>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
            </div>

            <div style={{ marginTop: "60px", paddingTop: "40px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "center" }}>
              <button 
                onClick={() => handleStartInterview(content.title)}
                className="btn btn-primary"
                style={{ padding: "12px 30px", fontSize: "16px", borderRadius: "8px" }}
              >
                开始模拟面试
              </button>
            </div>
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "40px", marginBottom: "20px" }}>📖</div>
            <h2>该领域的知识体系还在构建中</h2>
            <p>敬请期待...</p>
          </div>
        )}
      </main>

      {/* Outline Area */}
      {content && content.sections.length > 0 && (
        <aside className="yuque-outline">
          <div className="yuque-outline-title">本页大纲</div>
          <div>
            {content.sections.map((s, idx) => (
              <a key={s.id} href={`#${s.id}`} className="yuque-outline-item">
                {s.h2}
              </a>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
