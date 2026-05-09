"use server";

import prisma from "@/lib/prisma";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { normalizeLearningContent, type LearningContent } from "@/lib/learning/content-contract";

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
 * @param {LearningContent} content 标准化后的学习内容。
 * @returns {{ checks: QualityCheckItem[]; issues: QualityAgentResult["issues"] }} 规则检查结果。
 */
function buildRuleChecks(content: LearningContent): {
  checks: QualityCheckItem[];
  issues: QualityAgentResult["issues"];
} {
  const quickBlocks = [
    content.quickLook?.summary,
    ...(content.quickLook?.takeaways ?? []),
    ...(content.quickLook?.explainLikeImFive ?? []),
    content.quickLook?.retell,
  ].filter(Boolean);
  const articleSections = content.article?.sections ?? [];
  const sectionTitles = articleSections.map((item) => item.heading || item.h2 || "");
  const selfTests = content.selfTest?.questions ?? [];
  const interview = content.interview;
  const sources = content.sources ?? [];

  const structurePassed =
    quickBlocks.length >= 4 &&
    articleSections.length >= 6 &&
    selfTests.length > 0 &&
    Boolean(interview?.essentialPoints.length);
  const sourcePassed = sources.length > 0 && sources.every((item) => item.title && item.url);
  const sourceDetailPassed =
    sources.length > 0 &&
    sources.some((item) => item.applicableVersion || item.reviewedAt || (item.facts?.length ?? 0) > 0);
  const diagramPassed =
    articleSections.filter((item) => item.type === "diagram" || item.diagramCode || item.diagramSpec).length === 0 ||
    articleSections.some((item) => item.diagramSpec?.type === "flow");
  const trainingPassed =
    selfTests.length > 0 &&
    selfTests.every((item) => (item.gradingCriteria?.length ?? 0) > 0) &&
    Boolean(interview?.answer30s) &&
    Boolean(interview?.answer2min) &&
    Boolean(interview?.followUps.length);

  const checks: QualityCheckItem[] = [
    {
      key: "structure",
      passed: structurePassed,
      score: structurePassed ? 24 : 10,
      message: structurePassed ? "速读、深读、自测和面试结构完整。" : "结构仍不够完整，缺少固定学习骨架。",
    },
    {
      key: "source",
      passed: sourcePassed && sourceDetailPassed,
      score: sourcePassed && sourceDetailPassed ? 18 : sourcePassed ? 10 : 2,
      message: sourcePassed && sourceDetailPassed ? "来源与可信度字段完整。" : "来源字段存在缺失，可信度表达还不够。",
    },
    {
      key: "diagram",
      passed: diagramPassed,
      score: diagramPassed ? 18 : 6,
      message: diagramPassed ? "图表已采用标准协议或当前文档无需图解。" : "图表缺少标准图协议或稳定图解结构。",
    },
    {
      key: "training",
      passed: trainingPassed,
      score: trainingPassed ? 22 : 8,
      message: trainingPassed ? "训练闭环具备自测、评分标准和面试追问。" : "训练闭环不完整，缺少评分标准或追问。",
    },
    {
      key: "depth",
      passed: sectionTitles.length >= 6,
      score: sectionTitles.length >= 6 ? 18 : 8,
      message: sectionTitles.length >= 6 ? "深读章节数量达到试生产要求。" : "深读章节偏少，内容深度不足。",
    },
  ];

  const issues: QualityAgentResult["issues"] = [];
  if (!structurePassed) {
    issues.push({ severity: "high", type: "structure", message: "速读/深读/训练结构未达到试生产骨架要求。" });
  }
  if (!(sourcePassed && sourceDetailPassed)) {
    issues.push({ severity: "medium", type: "source", message: "来源与可信度字段不完整，建议补适用版本、引用事实和复核时间。" });
  }
  if (!diagramPassed) {
    issues.push({ severity: "high", type: "diagram", message: "图解未走标准协议，后续批量生产风险较高。" });
  }
  if (!trainingPassed) {
    issues.push({ severity: "high", type: "training", message: "训练闭环未齐，自测或面试内容不足以直接发布。" });
  }

  return { checks, issues };
}

/**
 * 调用大模型做内容质检，重点检查学习性、模板味和面试可用性。
 * @param {{ title: string; content: LearningContent }} input 文档标题和标准化内容。
 * @returns {Promise<ReviewAssessment>} AI 评审结果。
 */
async function runAiReview(input: { title: string; content: LearningContent }): Promise<ReviewAssessment> {
  const prompt = [
    "你是学习平台的内容质检专家，只做评审，不重写全文。",
    "请根据下面文档内容，从学习价值、面试可用性、模板味、可信度表达、图解稳定性五个维度打分。",
    "必须只返回 JSON，字段固定为：score,riskLevel,recommendation,summary,strengths,issues。",
    "recommendation 只能是 publish/review/block；riskLevel 只能是 low/medium/high；issues 里每项含 severity,type,message。",
    "",
    `标题：${input.title}`,
    `内容：${JSON.stringify(input.content)}`,
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

    const parsed = JSON.parse(raw) as Record<string, unknown>;
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
  const content = normalizeLearningContent(version.learningContent);
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
    const ruleResult = buildRuleChecks(content);
    const aiReview = await runAiReview({ title: document.title, content });
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
