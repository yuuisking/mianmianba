"use client";

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "loose",
  fontFamily: "var(--font-ui)",
  suppressErrorRendering: true,
  themeVariables: {
    background: "#ffffff",
    primaryColor: "#f5f7ff",
    primaryTextColor: "#141413",
    primaryBorderColor: "#141413",
    lineColor: "#5b6475",
    secondaryColor: "#fffaf4",
    tertiaryColor: "#f6f7fa",
  },
});

/**
 * 将 Mermaid 源码中的 Markdown 代码围栏剥离掉，避免把围栏本身交给 Mermaid 解析。
 * @param {string} chart 原始 Mermaid 文本。
 * @returns {string} 去掉围栏后的图表源码。
 */
function stripMermaidFence(chart: string): string {
  return chart
    .replace(/^```mermaid\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * 清洗节点标签中的高风险字符，降低 Mermaid 11 对特殊符号报语法错的概率。
 * @param {string} label 原始节点标签。
 * @returns {string} 适合 Mermaid 解析的安全标签。
 */
function normalizeMermaidLabel(label: string): string {
  return label
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/&/g, "和")
    .replace(/>=|≥/g, "大于等于")
    .replace(/<=|≤/g, "小于等于")
    .replace(/>/g, "大于")
    .replace(/</g, "小于")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 为常见 flowchart 节点补齐引号包裹，避免中文、符号和比较表达触发 Mermaid 语法错误。
 * @param {string} chart 原始 Mermaid 文本。
 * @returns {string} 预处理后的 Mermaid 文本。
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
 * 将文本转义成可安全写入 HTML 的纯文本，供渲染失败时回退展示源码。
 * @param {string} value 原始文本。
 * @returns {string} HTML 转义后的文本。
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 解析简单的 Mermaid flowchart 边关系，供 Mermaid 失败时降级渲染。
 * @param {string} chart 预处理后的 Mermaid 文本。
 * @returns {{ from: string; to: string; label: string }[]} 可读边列表。
 */
function parseSimpleFlowchartEdges(chart: string): Array<{ from: string; to: string; label: string }> {
  const nodeLabels = new Map<string, string>();

  for (const line of chart.split("\n")) {
    for (const match of line.matchAll(/([A-Za-z][\w-]*)(?:\["(.*?)"\]|\{"(.*?)"\}|\[(.*?)\]|\{(.*?)\})/g)) {
      const [, nodeId, quotedRect, quotedDiamond, rect, diamond] = match;
      const label = quotedRect || quotedDiamond || rect || diamond || nodeId;
      nodeLabels.set(nodeId, label.trim());
    }
  }

  const edges: Array<{ from: string; to: string; label: string }> = [];
  for (const line of chart.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^flowchart\b/i.test(trimmed)) {
      continue;
    }

    const labeledEdgeMatch = trimmed.match(/^([A-Za-z][\w-]*)\s*--\s*(.*?)\s*-->\s*([A-Za-z][\w-]*)$/);
    if (labeledEdgeMatch) {
      const [, fromId, edgeLabel, toId] = labeledEdgeMatch;
      edges.push({
        from: nodeLabels.get(fromId) || fromId,
        to: nodeLabels.get(toId) || toId,
        label: edgeLabel.trim(),
      });
      continue;
    }

    const plainEdgeMatch = trimmed.match(/^([A-Za-z][\w-]*)\s*-->\s*([A-Za-z][\w-]*)$/);
    if (plainEdgeMatch) {
      const [, fromId, toId] = plainEdgeMatch;
      edges.push({
        from: nodeLabels.get(fromId) || fromId,
        to: nodeLabels.get(toId) || toId,
        label: "",
      });
    }
  }

  return edges;
}

/**
 * 生成流程图失败时的结构化降级视图，避免直接把源码暴露给用户。
 * @param {string} chart 预处理后的 Mermaid 文本。
 * @returns {string} 可直接注入页面的 HTML。
 */
function buildFlowchartFallbackHtml(chart: string): string {
  const edges = parseSimpleFlowchartEdges(chart);
  if (!edges.length) {
    return `<div class="mermaid-chart__fallback">
      <div class="mermaid-chart__fallback-title">流程图暂未成功渲染，已保留 Mermaid 源码：</div>
      <pre>${escapeHtml(chart)}</pre>
    </div>`;
  }

  const edgeItems = edges
    .map(
      (edge) => `<li>
        <span class="mermaid-chart__fallback-node">${escapeHtml(edge.from)}</span>
        <span class="mermaid-chart__fallback-arrow">${edge.label ? `${escapeHtml(edge.label)} ->` : "->"}</span>
        <span class="mermaid-chart__fallback-node">${escapeHtml(edge.to)}</span>
      </li>`
    )
    .join("");

  return `<div class="mermaid-chart__fallback mermaid-chart__fallback--graph">
    <div class="mermaid-chart__fallback-title">流程图已切换为兼容展示：</div>
    <ol class="mermaid-chart__fallback-edges">${edgeItems}</ol>
  </div>`;
}

/**
 * 渲染 Mermaid 图表；若解析失败，则降级为可复制源码，避免整页刷出 Mermaid 错误节点。
 * @param {{ chart: string }} props Mermaid 图表属性。
 * @returns {JSX.Element} 图表容器。
 */
export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      if (!chart || !ref.current) return;

      const normalizedChart = sanitizeMermaidChart(chart);

      try {
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const { svg: generatedSvg } = await mermaid.render(id, normalizedChart);
        if (isMounted) {
          setSvg(generatedSvg);
        }
      } catch (error) {
        if (isMounted) {
          setSvg(buildFlowchartFallbackHtml(normalizedChart));
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  /**
   * 渲染 Mermaid 主图与可选的放大弹层，便于查看大图。
   * @returns {ReactNode} 图表与放大查看节点。
   */
  function renderChartContent(): ReactNode {
    return (
      <>
        <div ref={ref} className="mermaid-chart" dangerouslySetInnerHTML={{ __html: svg }} />
        {svg ? (
          <button
            type="button"
            className="mermaid-chart__expand"
            onClick={() => setIsExpanded(true)}
            aria-label="放大查看流程图"
            title="放大查看"
          >
            放大
          </button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="mermaid-chart-shell">{renderChartContent()}</div>
      {isExpanded ? (
        <div className="mermaid-chart-modal" role="dialog" aria-modal="true" onClick={() => setIsExpanded(false)}>
          <div className="mermaid-chart-modal__content" onClick={(event) => event.stopPropagation()}>
            <div className="mermaid-chart-modal__header">
              <div className="mermaid-chart-modal__title">流程图大图查看</div>
              <button type="button" className="mermaid-chart-modal__close" onClick={() => setIsExpanded(false)}>
                关闭
              </button>
            </div>
            <div className="mermaid-chart-modal__body" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        </div>
      ) : null}
    </>
  );
}
