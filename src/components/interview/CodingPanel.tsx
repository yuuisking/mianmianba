"use client";

import dynamic from "next/dynamic";
import { interviewFeatureFlags } from "@/lib/config/featureFlags";
import { getCodingLanguageLabel } from "@/lib/coding/problemBank";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

type CodingPanelResult = {
  summary?: string;
  feedback?: string[];
  compileStatus?: string;
  runStatus?: string;
  passedCount?: number;
  totalCount?: number;
  stdout?: string;
  stderr?: string;
  sampleResults?: Array<{
    index: number;
    passed: boolean;
    hidden: boolean;
    actual?: unknown;
    expected?: unknown;
  }>;
  failedCases?: Array<{
    index: number;
    actual?: unknown;
    expected?: unknown;
  }>;
};

type CodingPanelProps = {
  title: string;
  prompt: string;
  language: string;
  code: string;
  supportedLanguages: string[];
  latestResult: CodingPanelResult | null;
  isBusy: boolean;
  countdownLabel: string;
  onLanguageChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onRun: () => void;
  onSubmit: () => void;
};

/**
 * 渲染算法题面板，承载题面、编辑器、运行、提交和结果反馈。
 * @param props 算法题面板所需的题目与交互属性。
 * @returns 算法题面板组件。
 */
export function CodingPanel(props: CodingPanelProps) {
  const shouldUseMonaco = interviewFeatureFlags.enableMonacoCodingPanel;

  return (
    <div className="coding-panel-shell">
      <section className="coding-panel-problem">
        <div className="coding-panel-problem__header">
          <div>
            <div className="coding-panel-eyebrow">LeetCode 风格算法题</div>
            <h3>{props.title}</h3>
          </div>
          <div className="coding-panel-countdown">
            {props.countdownLabel}
          </div>
        </div>
        <pre className="coding-panel-problem__body">
          {props.prompt}
        </pre>
      </section>

      <section className="coding-panel-editor">
        <div className="coding-panel-editor__header">
          <label className="coding-panel-language">
            <span>语言</span>
            <select
              value={props.language}
              onChange={(event) => props.onLanguageChange(event.target.value)}
              disabled={props.isBusy}
              className="coding-panel-language__select"
            >
              {props.supportedLanguages.map((item) => (
                <option key={item} value={item}>
                  {getCodingLanguageLabel(item as never)}
                </option>
              ))}
            </select>
          </label>
          <div className="coding-panel-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={props.onRun}
              disabled={props.isBusy}
            >
              {props.isBusy ? "处理中..." : "运行代码"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={props.onSubmit}
              disabled={props.isBusy}
            >
              {props.isBusy ? "处理中..." : "提交代码"}
            </button>
          </div>
        </div>

        <div className="coding-panel-editor__surface">
          {shouldUseMonaco ? (
            <MonacoEditor
              height="460px"
              language={props.language === "cpp" ? "cpp" : props.language}
              value={props.code}
              onChange={(value) => props.onCodeChange(value || "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: "on",
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          ) : (
            <textarea
              value={props.code}
              onChange={(event) => props.onCodeChange(event.target.value)}
              spellCheck={false}
              className="coding-panel-editor__fallback"
            />
          )}
        </div>

        <div className="coding-panel-result">
          <div className="coding-panel-result__title">运行 / 提交结果</div>
          {props.latestResult ? (
            <div className="coding-panel-result__body">
              <div>{props.latestResult.summary || "已生成评估结果。"}</div>
              {typeof props.latestResult.passedCount === "number" &&
              typeof props.latestResult.totalCount === "number" ? (
                <div>
                  用例进度：{props.latestResult.passedCount}/{props.latestResult.totalCount}
                </div>
              ) : null}
              {props.latestResult.compileStatus ? (
                <div>编译状态：{props.latestResult.compileStatus}</div>
              ) : null}
              {props.latestResult.runStatus ? (
                <div>执行状态：{props.latestResult.runStatus}</div>
              ) : null}
              {props.latestResult.feedback?.length ? (
                <div>反馈：{props.latestResult.feedback.join("； ")}</div>
              ) : null}
              {props.latestResult.sampleResults?.length ? (
                <div className="coding-panel-result__samples">
                  {props.latestResult.sampleResults.map((item) => (
                    <div key={`${item.index}-${item.hidden ? "hidden" : "public"}`}>
                      {item.hidden ? `隐藏用例 ${item.index + 1}` : `样例 ${item.index + 1}`}：
                      {item.passed ? " 通过" : " 未通过"}
                    </div>
                  ))}
                </div>
              ) : null}
              {props.latestResult.failedCases?.length ? (
                <div className="coding-panel-result__stderr">
                  未通过用例：{JSON.stringify(props.latestResult.failedCases[0])}
                </div>
              ) : null}
              {props.latestResult.stderr ? (
                <div className="coding-panel-result__stderr">{props.latestResult.stderr}</div>
              ) : null}
              {props.latestResult.stdout ? (
                <div className="coding-panel-result__stdout">{props.latestResult.stdout}</div>
              ) : null}
            </div>
          ) : (
            <div className="coding-panel-result__empty">
              运行或提交后，这里会展示编译状态、通过用例数和失败详情。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
