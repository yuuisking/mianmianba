"use client";

import { useMemo, useState, type ReactNode } from "react";
import Mermaid from "@/components/Mermaid";
import type { StandardDiagramSpec } from "@/lib/learning/content-contract";

type LearningDiagramProps = {
  title?: string;
  diagramSpec?: StandardDiagramSpec;
  diagramCode?: string;
  fallbackDescription?: string;
};

type DerivedNode = {
  id: string;
  label: string;
  shortLabel: string;
};

type DerivedEdge = {
  from: string;
  to: string;
  label?: string;
};

type DerivedDiagramSpec = {
  type: "flow";
  title?: string;
  notes: string[];
  nodes: DerivedNode[];
  edges: DerivedEdge[];
};

/**
 * 移除 Mermaid 代码围栏，避免把围栏本身当成图源码。
 * @param {string} chart 原始 Mermaid 文本。
 * @returns {string} 纯 Mermaid 源码。
 */
function stripMermaidFence(chart: string): string {
  return chart
    .replace(/^```mermaid\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * 清洗 Mermaid 标签中的特殊字符，便于后续做简单解析。
 * @param {string} label 节点标签。
 * @returns {string} 清洗后的标签。
 */
function normalizeMermaidLabel(label: string): string {
  return label
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 预处理 Mermaid flowchart，统一节点标签格式。
 * @param {string} chart 原始 Mermaid 文本。
 * @returns {string} 便于解析的 Mermaid 文本。
 */
function sanitizeMermaidChart(chart: string): string {
  const withoutFence = stripMermaidFence(chart).replace(/\r\n/g, "\n");

  return withoutFence
    .split("\n")
    .map((line) =>
      line
        .replace(/([A-Za-z][\w-]*)\[(.*?)]/g, (_match, nodeId: string, label: string) => {
          const trimmed = label.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return `${nodeId}[${trimmed}]`;
          }

          return `${nodeId}["${normalizeMermaidLabel(trimmed)}"]`;
        })
        .replace(/([A-Za-z][\w-]*)\{(.*?)}/g, (_match, nodeId: string, label: string) => {
          const trimmed = label.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return `${nodeId}{${trimmed}}`;
          }

          return `${nodeId}{"${normalizeMermaidLabel(trimmed)}"}`;
        })
    )
    .join("\n")
    .trim();
}

/**
 * 将长节点标签压缩成更适合图里显示的短标签。
 * @param {string} label 原始节点标签。
 * @returns {string} 短标签。
 */
function compactNodeLabel(label: string): string {
  const normalized = label.replace(/^线程调用\s*/u, "").replace(/^LockSupport\./u, "").trim();

  const rules: Array<[RegExp, string]> = [
    [/tryAcquire\s+或\s+tryAcquireShared/i, "tryAcquire"],
    [/acquire/i, "acquire()"],
    [/获取成功/u, "获取成功?"],
    [/继续执行业务逻辑/u, "继续执行"],
    [/Node/u, "Node 入队"],
    [/等待队列/u, "等待队列"],
    [/unpark/i, "unpark 唤醒"],
    [/park/i, "park 挂起"],
    [/再次竞争|重新竞争/u, "重新竞争"],
    [/前驱.*释放/u, "前驱释放"],
    [/事务提交/u, "事务提交"],
    [/刷脏页/u, "刷脏页"],
    [/Read View/i, "Read View"],
    [/布隆过滤器/u, "前置过滤"],
    [/核心线程未满/u, "核心线程?"],
    [/队列未满/u, "队列未满?"],
    [/最大线程未满/u, "最大线程?"],
    [/拒绝策略/u, "拒绝策略"],
    [/父加载器/u, "父加载器"],
    [/加载请求/u, "加载请求"],
    [/GC Roots/i, "GC Roots"],
    [/主内存/u, "主内存"],
    [/工作内存/u, "工作内存"],
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(normalized)) {
      return replacement;
    }
  }

  const firstSegment = normalized.split(/[，。；：/]/)[0]?.trim() ?? normalized;
  return firstSegment.length <= 10 ? firstSegment : `${firstSegment.slice(0, 10)}...`;
}

/**
 * 从 Mermaid 源码中抽取流程图节点和边，转换成稳定的图组件协议。
 * @param {string} chart Mermaid 文本。
 * @param {string | undefined} fallbackDescription 图下注释。
 * @param {string | undefined} title 图标题。
 * @returns {DerivedDiagramSpec | null} 标准化后的流程图协议。
 */
function buildDerivedFlowSpec(
  chart: string,
  fallbackDescription?: string,
  title?: string
): DerivedDiagramSpec | null {
  const normalizedChart = sanitizeMermaidChart(chart);
  const nodeMap = new Map<string, DerivedNode>();
  const edges: DerivedEdge[] = [];

  for (const line of normalizedChart.split("\n")) {
    for (const match of line.matchAll(/([A-Za-z][\w-]*)(?:\["(.*?)"\]|\{"(.*?)"\}|\[(.*?)\]|\{(.*?)\})/g)) {
      const [, nodeId, quotedRect, quotedDiamond, rect, diamond] = match;
      const label = (quotedRect || quotedDiamond || rect || diamond || nodeId).trim();
      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          label,
          shortLabel: compactNodeLabel(label),
        });
      }
    }
  }

  for (const line of normalizedChart.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^flowchart\b/i.test(trimmed)) {
      continue;
    }

    const labeledEdgeMatch = trimmed.match(/^([A-Za-z][\w-]*)\s*--\s*(.*?)\s*-->\s*([A-Za-z][\w-]*)$/);
    if (labeledEdgeMatch) {
      const [, fromId, edgeLabel, toId] = labeledEdgeMatch;
      edges.push({
        from: fromId,
        to: toId,
        label: edgeLabel.trim(),
      });
      continue;
    }

    const plainEdgeMatch = trimmed.match(/^([A-Za-z][\w-]*)\s*-->\s*([A-Za-z][\w-]*)$/);
    if (plainEdgeMatch) {
      const [, fromId, toId] = plainEdgeMatch;
      edges.push({
        from: fromId,
        to: toId,
      });
    }
  }

  if (!nodeMap.size || !edges.length) {
    return null;
  }

  return {
    type: "flow",
    title,
    notes: fallbackDescription?.trim() ? [fallbackDescription.trim()] : [],
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

/**
 * 生成用于复制和下载的图文摘要。
 * @param {DerivedDiagramSpec} spec 标准图协议。
 * @returns {string} 文本摘要。
 */
function buildDiagramDigest(spec: DerivedDiagramSpec): string {
  return [
    spec.title ? `标题：${spec.title}` : "",
    "流程主线：",
    ...spec.edges.map((edge, index) => {
      const from = spec.nodes.find((item) => item.id === edge.from)?.label ?? edge.from;
      const to = spec.nodes.find((item) => item.id === edge.to)?.label ?? edge.to;
      return `${index + 1}. ${from}${edge.label ? ` --${edge.label}--> ` : " -> "}${to}`;
    }),
    spec.notes.length > 0 ? "" : "",
    ...(spec.notes.length > 0 ? ["图下注释：", ...spec.notes.map((item, index) => `${index + 1}. ${item}`)] : []),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 在浏览器中触发文本文件下载。
 * @param {string} fileName 文件名。
 * @param {string} content 文件内容。
 * @returns {void}
 */
function downloadText(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * 学习文档标准图组件：优先展示稳定的结构化流程摘要，并保留原图参考入口。
 * @param {LearningDiagramProps} props 图表属性。
 * @returns {ReactNode} 标准图组件。
 */
export default function LearningDiagram(props: LearningDiagramProps): ReactNode {
  const { title, diagramSpec, diagramCode, fallbackDescription } = props;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const resolvedSpec = useMemo<DerivedDiagramSpec | null>(() => {
    if (diagramSpec?.type === "flow") {
      return {
        type: "flow",
        title: diagramSpec.title || title,
        notes: diagramSpec.notes ?? [],
        nodes: diagramSpec.nodes.map((item) => ({
          id: item.id,
          label: item.label,
          shortLabel: item.shortLabel?.trim() || compactNodeLabel(item.label),
        })),
        edges: diagramSpec.edges,
      };
    }

    if (diagramCode?.trim()) {
      return buildDerivedFlowSpec(diagramCode, fallbackDescription, title);
    }

    return null;
  }, [diagramCode, diagramSpec, fallbackDescription, title]);

  const digest = useMemo(() => (resolvedSpec ? buildDiagramDigest(resolvedSpec) : fallbackDescription ?? ""), [fallbackDescription, resolvedSpec]);

  async function handleCopy(): Promise<void> {
    if (!digest.trim()) {
      return;
    }
    await navigator.clipboard.writeText(digest);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const edgeList = resolvedSpec?.edges.map((edge, index) => {
    const fromNode = resolvedSpec.nodes.find((item) => item.id === edge.from);
    const toNode = resolvedSpec.nodes.find((item) => item.id === edge.to);
    return {
      key: `${edge.from}-${edge.to}-${index}`,
      fromLabel: fromNode?.shortLabel ?? edge.from,
      fromFullLabel: fromNode?.label ?? edge.from,
      toLabel: toNode?.shortLabel ?? edge.to,
      toFullLabel: toNode?.label ?? edge.to,
      edgeLabel: edge.label?.trim(),
    };
  });

  const explanationItems = resolvedSpec?.nodes
    .filter((item) => item.shortLabel !== item.label)
    .map((item) => ({
      key: item.id,
      label: item.shortLabel,
      text: item.label,
    }));

  return (
    <div className="learning-diagram">
      <div className="learning-diagram__toolbar">
        <div>
          <span>标准图解</span>
          <strong>{resolvedSpec?.title || title || "流程图"}</strong>
        </div>
        <div className="learning-diagram__actions">
          <button type="button" className="learning-text-action" onClick={() => setExpanded(true)}>
            放大查看
          </button>
          <button type="button" className="learning-text-action" onClick={() => void handleCopy()}>
            {copied ? "已复制" : "复制图"}
          </button>
          <button
            type="button"
            className="learning-text-action"
            onClick={() => downloadText(`${(resolvedSpec?.title || title || "diagram").replace(/\s+/g, "-")}.txt`, digest)}
          >
            下载图
          </button>
          {diagramCode ? (
            <button type="button" className="learning-text-action" onClick={() => setShowRaw((current) => !current)}>
              {showRaw ? "收起原图" : "查看原图"}
            </button>
          ) : null}
        </div>
      </div>

      {edgeList?.length ? (
        <div className="learning-diagram__flow-wrap">
          <strong>流程主线</strong>
          <div className="learning-diagram__flow" role="list" aria-label="流程主线">
          {edgeList.map((item, index) => (
            <article key={item.key} className="learning-diagram__edge" role="listitem">
              <span className="learning-diagram__edge-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="learning-diagram__edge-body">
                <div className="learning-diagram__chips">
                  <span className="learning-diagram__chip" title={item.fromFullLabel}>
                    {item.fromLabel}
                  </span>
                  <span className="learning-diagram__arrow">{item.edgeLabel ? `${item.edgeLabel} ->` : "->"}</span>
                  <span className="learning-diagram__chip" title={item.toFullLabel}>
                    {item.toLabel}
                  </span>
                </div>
                {item.edgeLabel ? <p>条件：{item.edgeLabel}</p> : null}
              </div>
            </article>
          ))}
          </div>
        </div>
      ) : fallbackDescription ? (
        <div className="learning-diagram__empty">
          <p>{fallbackDescription}</p>
        </div>
      ) : null}

      {explanationItems?.length ? (
        <div className="learning-diagram__notes">
          <strong>图中节点说明</strong>
          <ul>
            {explanationItems.map((item) => (
              <li key={item.key}>
                <strong>{item.label}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {resolvedSpec?.notes.length ? (
        <div className="learning-diagram__notes">
          <strong>补充说明</strong>
          <ul>
            {resolvedSpec.notes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {showRaw && diagramCode ? (
        <div className="learning-diagram__raw">
          <Mermaid chart={diagramCode} />
        </div>
      ) : null}

      {expanded ? (
        <div className="learning-diagram__modal" role="dialog" aria-modal="true" onClick={() => setExpanded(false)}>
          <div className="learning-diagram__modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="learning-diagram__modal-head">
              <strong>{resolvedSpec?.title || title || "流程图大图查看"}</strong>
              <button type="button" className="learning-text-action" onClick={() => setExpanded(false)}>
                关闭
              </button>
            </div>
            {edgeList?.length ? (
              <div className="learning-diagram__flow-wrap">
                <strong>流程主线</strong>
                <div className="learning-diagram__flow learning-diagram__flow--expanded" role="list" aria-label="放大后的流程主线">
                {edgeList.map((item, index) => (
                  <article key={`${item.key}-modal`} className="learning-diagram__edge" role="listitem">
                    <span className="learning-diagram__edge-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="learning-diagram__edge-body">
                      <div className="learning-diagram__chips">
                        <span className="learning-diagram__chip" title={item.fromFullLabel}>
                          {item.fromLabel}
                        </span>
                        <span className="learning-diagram__arrow">{item.edgeLabel ? `${item.edgeLabel} ->` : "->"}</span>
                        <span className="learning-diagram__chip" title={item.toFullLabel}>
                          {item.toLabel}
                        </span>
                      </div>
                      {item.edgeLabel ? <p>条件：{item.edgeLabel}</p> : null}
                    </div>
                  </article>
                ))}
                </div>
              </div>
            ) : null}
            {explanationItems?.length ? (
              <div className="learning-diagram__notes">
                <strong>图中节点说明</strong>
                <ul>
                  {explanationItems.map((item) => (
                    <li key={`${item.key}-modal`}>
                      <strong>{item.label}</strong>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {resolvedSpec?.notes.length ? (
              <div className="learning-diagram__notes">
                <strong>补充说明</strong>
                <ul>
                  {resolvedSpec.notes.map((item) => (
                    <li key={`${item}-modal`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {diagramCode ? (
              <div className="learning-diagram__raw learning-diagram__raw--modal">
                <Mermaid chart={diagramCode} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
