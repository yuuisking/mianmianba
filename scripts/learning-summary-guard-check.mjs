import assert from "node:assert/strict";
import {
  normalizeDocumentSummaryInput,
  evaluateRawSummaryText,
  validateDocumentSummary,
} from "../src/lib/learning/documentSummary.ts";

/**
 * 执行 Task16 相关的最小校验，确保正文不足时不再走编造型兜底。
 * @returns {void} 断言失败时直接抛出异常并退出非零状态。
 */
function runLearningSummaryGuardChecks() {
  const insufficient = normalizeDocumentSummaryInput({
    title: "只剩标题",
    quickFacts: [{ k: "一句话", v: "只有一句描述" }],
    sections: [{ h2: "概览", paragraphs: ["太短了"] }],
  });
  assert.equal(insufficient.sufficiency.isSufficient, false, "短正文应被判定为信息不足");

  const sufficient = normalizeDocumentSummaryInput({
    title: "HashMap 核心原理",
    quickFacts: [{ k: "一句话", v: "HashMap 基于数组、链表与红黑树组织键值对。" }],
    sections: [
      {
        h2: "数据结构",
        paragraphs: [
          "HashMap 的主干结构是 Node 数组，数组中的每个桶位会根据 hash 定位。",
          "当多个键落入同一个桶位时，会先形成链表，长度继续增长后再视条件转换成红黑树。",
        ],
      },
      {
        h2: "扩容与冲突",
        bullets: [
          "负载因子和阈值共同决定扩容时机。",
          "rehash 时会按高位是否参与运算把节点拆分到新桶位。",
        ],
      },
    ],
  });
  assert.equal(sufficient.sufficiency.isSufficient, true, "真实正文应允许生成总结");

  const rawShortText = evaluateRawSummaryText("标题：HashMap\n一句话：这是一个集合。");
  assert.equal(rawShortText.isSufficient, false, "后台短文本也应被拒绝总结");

  assert.throws(
    () =>
      validateDocumentSummary({
        headline: "HashMap",
        summary: "",
        keyPoints: ["数组"],
        recommendedFocus: [],
      }),
    /缺少依据字段/,
    "模型返回缺字段时不应再兜底补全"
  );
}

runLearningSummaryGuardChecks();
console.log("learning-summary-guard-check: ok");
