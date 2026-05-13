"use server";

import prisma from "@/lib/prisma";
import { callDeepSeek } from "@/lib/ai/deepseek";
import {
  normalizeInterviewContent,
  normalizeLearningContent,
  validateDeepReadReadiness,
  validateDocumentContracts,
  type InterviewContent,
  type LearningContent,
} from "@/lib/learning/content-contract";

type QualityCheckItem = {
  key: string;
  passed: boolean;
  score: number;
  message: string;
};

type QualityAgentResult = {
  score: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: "publish" | "review" | "block";
  summary: string;
  checks: QualityCheckItem[];
  issues: Array<{
    severity: "low" | "medium" | "high";
    type: string;
    message: string;
  }>;
};

type ReviewAssessment = {
  score: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: "publish" | "review" | "block";
  summary: string;
  strengths: string[];
  issues: Array<{
    severity: "low" | "medium" | "high";
    type: string;
    message: string;
  }>;
};

type LoadedDocumentForAudit = {
  id: string;
  title: string;
  currentVersionId: string;
};

type BankQualityAgentDocumentResult = {
  documentId: string;
  title: string;
  score: number;
  riskLevel: string;
  recommendation: string;
  error?: string;
};

/**
 * 解析风险等级，收口未知输入。
 * @param {unknown} value 任意值。
 * @returns {"low" | "medium" | "high"} 风险等级。
 */
function normalizeRiskLevel(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
}

/**
 * 解析发布建议，收口未知输入。
 * @param {unknown} value 任意值。
 * @returns {"publish" | "review" | "block"} 发布建议。
 */
function normalizeRecommendation(value: unknown): "publish" | "review" | "block" {
  if (value === "publish" || value === "review" || value === "block") {
    return value;
  }
  return "review";
}

/**
 * 将任意值限制到 0-100 分之间。
 * @param {unknown} value 任意值。
 * @returns {number} 规范分数。
 */
function normalizeScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * 读取文档当前版本，避免直接依赖 schema 中不存在的 currentVersion 关系。
 * @param {string} documentId 文档 ID。
 * @returns {Promise<{ document: LoadedDocumentForAudit; version: { id: string; learningContent: unknown } }>} 文档和当前版本。
 */
async function loadCurrentDocumentVersion(documentId: string): Promise<{
  document: LoadedDocumentForAudit;
  version: {
    id: string;
    learningContent: unknown;
    interviewContent: unknown;
  };
}> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      currentVersionId: true,
    },
  });

  if (!document?.currentVersionId) {
    throw new Error("文档不存在或没有可用版本。");
  }

  const version = await prisma.documentVersion.findFirst({
    where: {
      id: document.currentVersionId,
      documentId: document.id,
    },
    select: {
      id: true,
      learningContent: true,
      interviewContent: true,
    },
  });

  if (!version) {
    throw new Error("文档当前版本不存在，无法执行 AI 抽检。");
  }

  return {
    document: {
      id: document.id,
      title: document.title,
      currentVersionId: document.currentVersionId,
    },
    version,
  };
}

/**
 * 生成确定性门禁检查，先用硬规则兜住结构、来源、图表和训练闭环。
 * @param {{ title: string; learningContent: LearningContent; interviewContent: InterviewContent }} input 标准化后的学习与训练内容。
 * @returns {{ checks: QualityCheckItem[]; issues: QualityAgentResult["issues"] }} 规则检查结果。
 */
function buildRuleChecks(input: {
  title: string;
  learningContent: LearningContent;
  interviewContent: InterviewContent;
}): {
  checks: QualityCheckItem[];
  issues: QualityAgentResult["issues"];
} {
  const contractValidation = validateDocumentContracts(input.learningContent, input.interviewContent, input.title);
  const deepReadValidation = validateDeepReadReadiness(input.title, input.learningContent);
  const findCheck = (name: string): boolean => contractValidation.checks.find((item) => item.name === name)?.pass ?? false;
  const sources = input.learningContent.sources ?? [];
  const sourcePassed = findCheck("sources_present");
  const sourceDetailPassed =
    sources.length > 0 &&
    sources.every((item) => Boolean(item.title && item.url && (item.applicableVersion || item.reviewedAt || (item.facts?.length ?? 0) > 0)));

  const checks: QualityCheckItem[] = [
    {
      key: "article_structure",
      passed: findCheck("article_structure"),
      score: findCheck("article_structure") ? 22 : 8,
      message: findCheck("article_structure") ? "文章骨架完整。" : "文章骨架不完整，缺少固定学习结构。",
    },
    {
      key: "self_tests",
      passed: findCheck("self_tests"),
      score: findCheck("self_tests") ? 16 : 6,
      message: findCheck("self_tests") ? "自测结构完整。" : "自测不足或缺少评分标准。",
    },
    {
      key: "interview_points",
      passed: findCheck("interview_points"),
      score: findCheck("interview_points") ? 16 : 6,
      message: findCheck("interview_points") ? "面试训练要点完整。" : "面试训练要点不完整。",
    },
    {
      key: "sources_present",
      passed: sourcePassed,
      score: sourcePassed ? 10 : 2,
      message: sourcePassed ? "已提供来源信息。" : "来源字段缺失。",
    },
    {
      key: "source_detail",
      passed: sourceDetailPassed,
      score: sourceDetailPassed ? 10 : 4,
      message: sourceDetailPassed ? "来源细节完整。" : "来源细节不足，缺少版本、事实或复核时间。",
    },
    {
      key: "deep_read_gate",
      passed: deepReadValidation.ready,
      score: deepReadValidation.ready ? 26 : 8,
      message:
        deepReadValidation.missingBlocks.length === 0
          ? "15 分钟深读门禁通过。"
          : `15 分钟深读缺少：${deepReadValidation.missingBlocks.join("、")}。`,
    },
  ];

  const issues: QualityAgentResult["issues"] = [];
  if (!findCheck("article_structure") || !deepReadValidation.ready) {
    issues.push({ severity: "high", type: "structure", message: "速读/深读结构未达到试生产骨架要求。" });
  }
  if (!findCheck("self_tests") || !findCheck("interview_points")) {
    issues.push({ severity: "high", type: "training", message: "训练闭环未齐，自测或面试内容不足以直接发布。" });
  }
  if (!sourcePassed || !sourceDetailPassed) {
    issues.push({ severity: "medium", type: "source", message: "来源与可信度字段不完整，建议补适用版本、引用事实和复核时间。" });
  }

  return { checks, issues };
}

/**
 * 清洗模型返回的 JSON 文本，兼容 ```json 代码块和前后多余说明。
 * @param {string} raw 模型原始返回。
 * @returns {string} 可交给 JSON.parse 的纯 JSON 文本。
 */
function extractJsonPayload(raw: string): string {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] ?? raw).trim();
  const startIndex = candidate.indexOf("{");
  const endIndex = candidate.lastIndexOf("}");
  if (startIndex >= 0 && endIndex > startIndex) {
    return candidate.slice(startIndex, endIndex + 1).trim();
  }
  return candidate;
}

/**
 * 调用大模型做内容质检，重点检查学习性、模板味和面试可用性。
 * @param {{ title: string; learningContent: LearningContent; interviewContent: InterviewContent }} input 文档标题和标准化内容。
 * @returns {Promise<ReviewAssessment>} AI 评审结果。
 */
async function runAiReview(input: {
  title: string;
  learningContent: LearningContent;
  interviewContent: InterviewContent;
}): Promise<ReviewAssessment> {
  const prompt = [
    "你是学习平台的内容质检专家，只做评审，不重写全文。",
    "请根据下面文档内容，从学习价值、面试可用性、模板味、可信度表达、图解稳定性五个维度打分。",
    "必须只返回 JSON，字段固定为：score,riskLevel,recommendation,summary,strengths,issues。",
    "recommendation 只能是 publish/review/block；riskLevel 只能是 low/medium/high；issues 里每项含 severity,type,message。",
    "",
    `标题：${input.title}`,
    `学习内容：${JSON.stringify(input.learningContent)}`,
    `训练内容：${JSON.stringify(input.interviewContent)}`,
  ].join("\n");

  try {
    const raw = await callDeepSeek({
      prompt,
      temperature: 0.1,
      maxTokens: 900,
      timeoutMs: 18_000,
      maxRetries: 2,
      retryDelayMs: 800,
    });

    const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>;
    return {
      score: normalizeScore(parsed.score),
      riskLevel: normalizeRiskLevel(parsed.riskLevel),
      recommendation: normalizeRecommendation(parsed.recommendation),
      summary: typeof parsed.summary === "string" ? parsed.summary : "AI 质检未给出摘要，建议人工复核。",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((item): item is string => typeof item === "string") : [],
      issues: Array.isArray(parsed.issues)
        ? parsed.issues
            .map((item) => {
              if (!item || typeof item !== "object") {
                return null;
              }
              const record = item as Record<string, unknown>;
              return {
                severity: normalizeRiskLevel(record.severity),
                type: typeof record.type === "string" ? record.type : "content",
                message: typeof record.message === "string" ? record.message : "AI 质检发现内容风险。",
              };
            })
            .filter((item): item is ReviewAssessment["issues"][number] => Boolean(item))
        : [],
    };
  } catch (error) {
    return {
      score: 70,
      riskLevel: "medium",
      recommendation: "review",
      summary: "AI 质检暂时不可用，当前先使用规则质检结果。",
      strengths: [],
      issues: [
        {
          severity: "medium",
          type: "ai-review",
          message: error instanceof Error ? `AI 质检失败：${error.message}` : "AI 质检失败，建议人工抽样复核。",
        },
      ],
    };
  }
}

/**
 * 合并规则质检和 AI 评审结果，给出最终风险等级和发布建议。
 * @param {{ checks: QualityCheckItem[]; issues: QualityAgentResult["issues"] }} ruleResult 规则质检结果。
 * @param {ReviewAssessment} aiReview AI 评审结果。
 * @returns {QualityAgentResult} 最终质检结果。
 */
function mergeQualityAssessment(
  ruleResult: { checks: QualityCheckItem[]; issues: QualityAgentResult["issues"] },
  aiReview: ReviewAssessment
): QualityAgentResult {
  const ruleScore = ruleResult.checks.reduce((sum, item) => sum + item.score, 0);
  const score = Math.round(ruleScore * 0.55 + aiReview.score * 0.45);
  const issues = [...ruleResult.issues, ...aiReview.issues];

  let recommendation: QualityAgentResult["recommendation"] = aiReview.recommendation;
  if (issues.some((item) => item.severity === "high")) {
    recommendation = "review";
  }
  if (score < 60 || issues.filter((item) => item.severity === "high").length >= 2) {
    recommendation = "block";
  } else if (score >= 82 && issues.every((item) => item.severity === "low")) {
    recommendation = "publish";
  }

  const riskLevel: QualityAgentResult["riskLevel"] =
    recommendation === "block" ? "high" : recommendation === "review" ? "medium" : "low";

  return {
    score,
    riskLevel,
    recommendation,
    summary: aiReview.summary,
    checks: ruleResult.checks,
    issues,
  };
}

/**
 * 将最终质检结果写回质量报告、审核任务和 AI 任务，形成可追踪闭环。
 * @param {{ documentId: string; versionId: string; result: QualityAgentResult; triggeredBy?: string | null; aiTaskId: string }} input 写回参数。
 * @returns {Promise<void>} 写回结束。
 */
async function persistQualityAgentResult(input: {
  documentId: string;
  versionId: string;
  result: QualityAgentResult;
  triggeredBy?: string | null;
  aiTaskId: string;
}): Promise<void> {
  const reviewStatus = input.result.recommendation === "publish" ? "APPROVED" : "PENDING";
  const checkScores = new Map(input.result.checks.map((item) => [item.key, item.score]));
  const suggestionItems = Array.from(
    new Set(
      [
        input.result.summary,
        ...input.result.issues.map((item) => item.message),
        ...input.result.checks.filter((item) => !item.passed).map((item) => item.message),
      ].filter(Boolean)
    )
  );
  const reviewComment = [
    `结论：${input.result.summary}`,
    `建议：${input.result.recommendation}`,
    ...input.result.issues.map((item) => `[${item.severity}] ${item.message}`),
  ].join("\n");

  await prisma.$transaction(async (tx) => {
    await tx.qualityReport.create({
      data: {
        documentId: input.documentId,
        versionId: input.versionId,
        totalScore: input.result.score,
        factScore: Math.max(0, input.result.score - input.result.issues.filter((item) => item.type === "source").length * 8),
        learningScore: Math.round(((checkScores.get("structure") ?? 0) + (checkScores.get("depth") ?? 0)) / 0.42),
        interviewScore: Math.round(((checkScores.get("training") ?? 0) / 22) * 100),
        originalityScore: input.result.issues.some((item) => item.type === "template" || item.type === "template-smell") ? 60 : 85,
        readabilityScore: Math.round(
          ((((checkScores.get("structure") ?? 0) + (checkScores.get("depth") ?? 0)) / 42) * 100 + input.result.score) / 2
        ),
        codeDiagramScore: Math.round(((checkScores.get("diagram") ?? 0) / 18) * 100),
        issues: input.result.issues,
        suggestions: suggestionItems,
        pass: input.result.recommendation === "publish",
      },
    });

    await tx.document.update({
      where: { id: input.documentId },
      data: {
        qualityScore: input.result.score,
        status: input.result.recommendation === "block" ? "DRAFT" : undefined,
      },
    });

    await tx.reviewTask.create({
      data: {
        documentId: input.documentId,
        reviewType: "AI_QUALITY_CHECK",
        status: reviewStatus,
        reviewerId: input.triggeredBy ?? undefined,
        comment: reviewComment,
      },
    });

    await tx.aiTask.update({
      where: { id: input.aiTaskId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        output: input.result,
        errorMessage: null,
      },
    });
  });
}

/**
 * 对单篇文档执行 AI 抽检并写回质检结果。
 * @param {{ documentId: string; triggeredBy?: string | null }} input 文档 ID 与触发者。
 * @returns {Promise<QualityAgentResult>} 最终质检结果。
 */
export async function runDocumentQualityAgent(input: {
  documentId: string;
  triggeredBy?: string | null;
}): Promise<QualityAgentResult> {
  const { document, version } = await loadCurrentDocumentVersion(input.documentId);
  const learningContent = normalizeLearningContent(version.learningContent);
  const interviewContent = normalizeInterviewContent(version.interviewContent);
  const aiTask = await prisma.aiTask.create({
    data: {
      taskType: "QUALITY_AUDIT",
      status: "RUNNING",
      targetType: "DOCUMENT",
      targetId: document.id,
      input: {
        documentId: document.id,
        versionId: version.id,
        title: document.title,
      },
      startedAt: new Date(),
    },
  });

  try {
    const ruleResult = buildRuleChecks({
      title: document.title,
      learningContent,
      interviewContent,
    });
    const aiReview = await runAiReview({
      title: document.title,
      learningContent,
      interviewContent,
    });
    const result = mergeQualityAssessment(ruleResult, aiReview);
    await persistQualityAgentResult({
      documentId: document.id,
      versionId: version.id,
      result,
      triggeredBy: input.triggeredBy,
      aiTaskId: aiTask.id,
    });
    return result;
  } catch (error) {
    await prisma.aiTask.update({
      where: { id: aiTask.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        output: {
          documentId: document.id,
          versionId: version.id,
        },
        errorMessage: error instanceof Error ? error.message : "AI 抽检执行失败。",
      },
    });
    throw error;
  }
}

/**
 * 对题库下当前全部文档执行 AI 抽检，返回批量结果摘要。
 * @param {{ bankId: string; triggeredBy?: string | null }} input 题库 ID 与触发者。
 * @returns {Promise<{ total: number; blocked: number; review: number; published: number; results: Array<{ documentId: string; title: string; score: number; riskLevel: string; recommendation: string }> }>} 批量质检摘要。
 */
export async function runBankQualityAgent(input: {
  bankId: string;
  triggeredBy?: string | null;
}): Promise<{
  total: number;
  blocked: number;
  review: number;
  published: number;
  results: BankQualityAgentDocumentResult[];
}> {
  const documents = await prisma.document.findMany({
    where: { topicBankId: input.bankId, currentVersionId: { not: null } },
    orderBy: [{ chapter: { sortOrder: "asc" } }, { publishedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
    },
  });

  const results: BankQualityAgentDocumentResult[] = [];
  for (const item of documents) {
    try {
      const result = await runDocumentQualityAgent({
        documentId: item.id,
        triggeredBy: input.triggeredBy,
      });
      results.push({
        documentId: item.id,
        title: item.title,
        score: result.score,
        riskLevel: result.riskLevel,
        recommendation: result.recommendation,
      });
    } catch (error) {
      results.push({
        documentId: item.id,
        title: item.title,
        score: 0,
        riskLevel: "high",
        recommendation: "block",
        error: error instanceof Error ? error.message : "AI 抽检执行失败。",
      });
    }
  }

  return {
    total: results.length,
    blocked: results.filter((item) => item.recommendation === "block").length,
    review: results.filter((item) => item.recommendation === "review").length,
    published: results.filter((item) => item.recommendation === "publish").length,
    results,
  };
}
