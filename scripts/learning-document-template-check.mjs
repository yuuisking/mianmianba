import assert from "node:assert/strict";
import {
  alignDraftToFormalTemplate,
  buildMissingBlockNote,
  inspectDraftQuality,
} from "../src/lib/learning/documentTemplate.ts";

/**
 * 校验 Task20 的固定骨架、缺失标记和发布前质量门槛。
 * @returns {void} 任一断言失败都会抛错并退出非零状态。
 */
function runLearningDocumentTemplateChecks() {
  const autoDraft = alignDraftToFormalTemplate({
    topic: "Java · JVM 内存模型与 GC 流程",
    content: {
      quickFacts: [{ k: "课题", v: "Java" }],
      sections: [
        {
          id: "old-summary",
          h2: "核心摘要",
          paragraphs: ["JVM 内存模型与 GC 流程需要同时说明区域职责、回收触发时机和调优抓手。"],
        },
        {
          id: "old-analysis",
          h2: "底层原理剖析",
          paragraphs: ["重点拆解堆、栈、方法区、对象分配、可达性分析和分代回收。"],
        },
        {
          id: "old-qa",
          h2: "高频面试题",
          bullets: ["为什么 Minor GC 会频繁发生？", "CMS 和 G1 的核心差异是什么？", "如何定位 Full GC 过多？"],
        },
      ],
    },
  });

  assert.deepEqual(
    autoDraft.content.sections?.slice(0, 4).map((section) => section.h2),
    ["总结归纳", "正文解析", "流程图/架构图/代码实例", "面试常考"],
    "旧草稿应被对齐到固定正式文档骨架"
  );
  assert.ok(
    autoDraft.content.sections?.[2]?.paragraphs?.some((paragraph) => paragraph.includes("流程图")),
    "图例章节应补齐固定子块标签"
  );
  assert.ok(
    autoDraft.content.sections?.[2]?.paragraphs?.some((paragraph) => paragraph.includes("代码实例")),
    "图例章节应包含代码实例占位或内容"
  );

  const blockedDraft = alignDraftToFormalTemplate({
    topic: "Vue3 · 响应式更新流程",
    content: {
      quickFacts: [{ k: "课题", v: "Vue3" }],
      sections: [
        {
          id: "summary",
          h2: "总结归纳",
          paragraphs: ["响应式更新流程需要串起依赖收集、触发更新、调度和组件渲染。"],
        },
        {
          id: "analysis",
          h2: "正文解析",
          paragraphs: ["需要说明 track、trigger、scheduler、组件更新与 DOM patch 的衔接关系。"],
        },
        {
          id: "artifacts",
          h2: "流程图/架构图/代码实例",
          paragraphs: [
            "**流程图**",
            buildMissingBlockNote("流程图", "当前主题尚未整理出从依赖收集到视图更新的可信执行流程"),
            "**代码实例**",
            buildMissingBlockNote("代码实例", "当前主题尚未补齐可信的响应式更新示例"),
          ],
        },
        {
          id: "interview",
          h2: "面试常考",
          bullets: ["track 和 trigger 分别做什么？", "scheduler 为什么能减少重复渲染？", "组件更新为什么不是同步直刷 DOM？"],
        },
      ],
    },
  });

  const blockedCheck = inspectDraftQuality(blockedDraft);
  assert.equal(blockedCheck.publishReady, false, "必需块只做缺失标记时不能发布");
  assert.ok(
    blockedCheck.blockingIssues.some((issue) => issue.includes("流程图检查")),
    "流程图缺失应进入阻断项"
  );
  assert.ok(
    blockedCheck.blockingIssues.some((issue) => issue.includes("代码实例检查")),
    "代码实例缺失应进入阻断项"
  );

  const readyDraft = alignDraftToFormalTemplate({
    topic: "JavaScript · 事件循环",
    content: {
      quickFacts: [{ k: "课题", v: "JavaScript" }],
      sections: [
        {
          id: "summary",
          h2: "总结归纳",
          paragraphs: ["事件循环负责协调调用栈、任务队列和渲染时机，是前端异步行为的核心执行模型。"],
        },
        {
          id: "analysis",
          h2: "正文解析",
          paragraphs: ["要说明宏任务、微任务、渲染机会、Promise then 与 setTimeout 的先后关系。"],
        },
        {
          id: "artifacts",
          h2: "流程图/架构图/代码实例",
          paragraphs: [
            "当前主题要求：流程图、代码实例。缺失时必须明确标记，禁止废话填充。",
            "**流程图**",
            "```mermaid\nflowchart LR\nA[script] --> B[microtask]\nB --> C[render]\nC --> D[macrotask]\n```",
            "**代码实例**",
            "```js\nconsole.log('start');\nsetTimeout(() => console.log('timeout'), 0);\nPromise.resolve().then(() => console.log('microtask'));\nconsole.log('end');\n```",
          ],
        },
        {
          id: "interview",
          h2: "面试常考",
          bullets: [
            "为什么 Promise.then 一般比 setTimeout 更早执行？",
            "浏览器什么时候会安排渲染？",
            "Node.js 的事件循环和浏览器有哪些差异？",
          ],
        },
      ],
    },
  });

  const readyCheck = inspectDraftQuality(readyDraft);
  assert.equal(readyCheck.publishReady, true, "固定骨架齐全且必需块完整时应允许发布");
}

runLearningDocumentTemplateChecks();
console.log("learning-document-template-check: ok");
