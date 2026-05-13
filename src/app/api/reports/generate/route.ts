import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import { getInterviewModeLabel, normalizeInterviewMode } from "@/lib/interview/config";
import { detectInterviewRoleTrack } from "@/lib/interview/prompt";
import {
  persistRoundReviewerPanel,
  runRoundReviewerPanel,
} from "@/lib/interview-v2/reviewerPanel";

type ReportHistoryMessage = {
  role?: string;
  content?: string | string[];
};

type ReportDimension = {
  name: string;
  score: string;
};

type ReportNextStep = {
  title: string;
  desc: string;
};

type ReportReviewPanelMetadata = {
  passed: boolean;
  passVotes: number;
  failVotes: number;
  totalReviewers: number;
  averageScore: number;
  adjudicationSummary: string;
  verdictReason: string;
  focusAreas: string[];
  actionItems: ReportNextStep[];
  reviewers: Array<{
    reviewerId: string;
    reviewerName: string;
    lens: string;
    vote: "PASS" | "FAIL";
    score: number;
    confidence: number;
    rationale: string;
    strengths: string[];
    improvements: string[];
  }>;
};

type ReportMetadataPayload = {
  role: string;
  questions: number;
  roleTrack: string;
  questionRoleFitScore: number;
  unknownCount: number;
  skipCount: number;
  hintCount: number;
  calibrationSummary: string;
  multiAgent: boolean;
  companyName?: string;
  stageLabel?: string;
  targetLevel?: string;
  baseRecord?: {
    durationSeconds: number;
    transcriptMessageCount: number;
    codingAttempted: boolean;
    codingSubmissionCount: number;
  };
  reviewPanel?: ReportReviewPanelMetadata;
};

type PerformancePanelResult = {
  communicationScore?: number;
  evidenceScore?: number;
  technicalDepthScore?: number;
  problemSolvingScore?: number;
  roleFitOnAnswerScore?: number;
  highlights?: string[];
  risks?: string[];
  evidence?: string[];
  nextSteps?: ReportNextStep[];
};

type QuestionFitPanelResult = {
  questionRoleFitScore?: number;
  fitSummary?: string;
  alignedAreas?: string[];
  mismatchReasons?: string[];
};

type InterviewSignalSummary = {
  transcript: string;
  questionTranscript: string;
  userAnswerCount: number;
  assistantQuestionCount: number;
  unknownCount: number;
  skipCount: number;
  hintCount: number;
  unknownRatio: number;
  skipRatio: number;
  answerCoverageRatio: number;
};

/**
 * 判断当前历史是否已形成足够的有效问答，避免空面试也生成评分报告。
 * @param history 前端传入的面试历史快照。
 * @returns 是否存在至少一轮有效问答。
 */
function hasEffectiveInterviewContent(history: {
  messages?: ReportHistoryMessage[];
  questionCount?: number;
} | null): boolean {
  const messages = history?.messages || [];
  const userMessages = messages.filter((message) => {
    const content = Array.isArray(message.content)
      ? message.content.join("\n")
      : String(message.content || "");
    return message.role === "user" && content.trim().length > 0;
  });
  const assistantMessages = messages.filter((message) => {
    const content = Array.isArray(message.content)
      ? message.content.join("\n")
      : String(message.content || "");
    return message.role === "ai" && content.trim().length > 0;
  });

  return userMessages.length >= 1 && assistantMessages.length >= 1;
}

/**
 * 将消息内容归一化为单段文本。
 * @param content 原始消息内容。
 * @returns 归一化后的纯文本。
 */
function normalizeMessageContent(content: string | string[] | undefined): string {
  if (Array.isArray(content)) {
    return content.join("\n").trim();
  }

  return String(content || "").trim();
}

/**
 * 将数值限制到合法评分范围。
 * @param value 原始分值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 限制后的分值。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 对面试历史做本地信号统计，用于校准“不会 / 跳过 / 提示”带来的评分波动。
 * @param history 前端传入的历史快照。
 * @returns 本地可计算的问答信号。
 */
function summarizeInterviewSignals(history: {
  messages?: ReportHistoryMessage[];
} | null): InterviewSignalSummary {
  const messages = history?.messages || [];
  const transcriptLines: string[] = [];
  const questionLines: string[] = [];
  let userAnswerCount = 0;
  let assistantQuestionCount = 0;
  let unknownCount = 0;
  let skipCount = 0;
  let hintCount = 0;

  for (const message of messages) {
    const content = normalizeMessageContent(message.content);
    if (!content) {
      continue;
    }

    const lower = content.toLowerCase();
    if (message.role === "ai") {
      assistantQuestionCount += 1;
      questionLines.push(content);
      transcriptLines.push(`面试官: ${content}`);
      continue;
    }

    userAnswerCount += 1;
    transcriptLines.push(`候选人: ${content}`);
    if (
      /不会|不知道|答不上来|不太清楚|没做过|不了解|没有接触过|先给我一点提示/.test(
        content
      )
    ) {
      unknownCount += 1;
    }
    if (/跳过|skip/.test(lower)) {
      skipCount += 1;
    }
    if (/提示|hint|引导/.test(lower)) {
      hintCount += 1;
    }
  }

  const denominator = Math.max(userAnswerCount, 1);
  return {
    transcript: transcriptLines.join("\n"),
    questionTranscript: questionLines.join("\n"),
    userAnswerCount,
    assistantQuestionCount,
    unknownCount,
    skipCount,
    hintCount,
    unknownRatio: unknownCount / denominator,
    skipRatio: skipCount / denominator,
    answerCoverageRatio: userAnswerCount / Math.max(assistantQuestionCount, 1)
  };
}

/**
 * 当报告页没有携带完整历史时，从数据库按 `sessionId` 回源消息与基础画像，避免刷新后无法生成报告。
 * @param input 当前登录用户与目标会话信息。
 * @returns 可用于生成报告的历史快照和画像补充信息。
 */
async function resolveReportGenerationContext(input: {
  userId: string;
  sessionId?: string | null;
  history: {
    messages?: ReportHistoryMessage[];
    questionCount?: number;
  } | null;
  profile: Record<string, unknown> | null;
}): Promise<{
  history: {
    sessionId?: string | null;
    messages: ReportHistoryMessage[];
    questionCount: number;
  } | null;
  profile: Record<string, unknown> | null;
  mode: string;
}> {
  const incomingHistoryMessages = input.history?.messages || [];
  const hasIncomingEffectiveHistory =
    incomingHistoryMessages.some((message) => message.role === "user") &&
    incomingHistoryMessages.some((message) => message.role === "ai");

  if (hasIncomingEffectiveHistory || !input.sessionId) {
    return {
      history: input.history
        ? {
            sessionId: input.sessionId,
            messages: incomingHistoryMessages,
            questionCount: Number.isFinite(input.history.questionCount)
              ? Number(input.history.questionCount)
              : incomingHistoryMessages.filter((message) => message.role === "user").length,
          }
        : null,
      profile: input.profile,
      mode: typeof input.profile?.mode === "string" ? String(input.profile.mode) : "text",
    };
  }

  const existingSession = await prisma.interviewSession.findFirst({
    where: {
      id: input.sessionId,
      userId: input.userId,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!existingSession) {
    const normalizedHistory = input.history
      ? {
          sessionId: input.sessionId,
          messages: input.history.messages || [],
          questionCount: Number.isFinite(input.history.questionCount)
            ? Number(input.history.questionCount)
            : (input.history.messages || []).filter((message) => message.role === "user").length,
        }
      : null;
    return {
      history: normalizedHistory,
      profile: input.profile,
      mode: typeof input.profile?.mode === "string" ? String(input.profile.mode) : "text",
    };
  }

  const restoredMessages: ReportHistoryMessage[] = existingSession.messages.map((message) => ({
    role: message.role === "assistant" ? "ai" : "user",
    content: String(message.content || ""),
  }));
  const mergedProfile = {
    ...(input.profile || {}),
    mode: existingSession.mode || (typeof input.profile?.mode === "string" ? String(input.profile.mode) : "text"),
  };

  return {
    history: {
      sessionId: existingSession.id,
      messages: restoredMessages,
      questionCount: restoredMessages.filter((message) => message.role === "user").length,
    },
    profile: mergedProfile,
    mode: existingSession.mode || "text",
  };
}

/**
 * 调用“候选人表现评估 Agent”，产出多维表现结论。
 * @param input 评估上下文。
 * @returns 结构化表现评估结果。
 */
async function evaluatePerformancePanel(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  role: string;
  targetLevel: string;
  language: string;
  focus: string;
  transcript: string;
}): Promise<PerformancePanelResult> {
  const prompt = `
你是“候选人表现评估 Agent”。请只基于真实问答内容评价候选人表现，不要替系统问错题背锅，也不要脑补候选人没有说过的能力。

上下文：
- 目标岗位：${input.role}
- 目标层级：${input.targetLevel}
- 语言：${input.language}
- 本次重点：${input.focus}

真实问答转写：
${input.transcript || "暂无"}

请返回 JSON：
{
  "communicationScore": 0,
  "evidenceScore": 0,
  "technicalDepthScore": 0,
  "problemSolvingScore": 0,
  "roleFitOnAnswerScore": 0,
  "highlights": ["..."],
  "risks": ["..."],
  "evidence": ["..."],
  "nextSteps": [
    { "title": "训练动作", "desc": "动作说明" }
  ]
}
`.trim();

  const completion = await input.openai.chat.completions.create({
    model: "deepseek-chat",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是候选人表现评估 Agent，只输出 JSON，所有分值范围为 0 到 10。"
      },
      { role: "user", content: prompt }
    ]
  });

  return JSON.parse(completion.choices[0]?.message?.content || "{}") as PerformancePanelResult;
}

/**
 * 调用“题目匹配度评估 Agent”，判断这场提问是否真的对准目标岗位。
 * @param input 评估上下文。
 * @returns 结构化匹配度结果。
 */
async function evaluateQuestionFitPanel(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  role: string;
  focus: string;
  questionTranscript: string;
}): Promise<QuestionFitPanelResult> {
  const prompt = `
你是“题目匹配度评估 Agent”。请评估这场面试官提问，是否真的围绕目标岗位与本次重点展开。

上下文：
- 目标岗位：${input.role}
- 本次重点：${input.focus}

面试官提问记录：
${input.questionTranscript || "暂无"}

请返回 JSON：
{
  "questionRoleFitScore": 0,
  "fitSummary": "一句话总结提问是否对题",
  "alignedAreas": ["对齐点 1", "对齐点 2"],
  "mismatchReasons": ["跑偏原因 1", "跑偏原因 2"]
}
`.trim();

  const completion = await input.openai.chat.completions.create({
    model: "deepseek-chat",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是题目匹配度评估 Agent，只输出 JSON，questionRoleFitScore 范围为 0 到 10。"
      },
      { role: "user", content: prompt }
    ]
  });

  return JSON.parse(completion.choices[0]?.message?.content || "{}") as QuestionFitPanelResult;
}

/**
 * 根据多视角评估与本地信号，计算最终展示分数和维度分。
 * @param input 评估面板与本地问答信号。
 * @returns 最终得分、维度列表与校准说明。
 */
function buildCalibratedScore(input: {
  performance: PerformancePanelResult;
  questionFit: QuestionFitPanelResult;
  signals: InterviewSignalSummary;
}): {
  score: number;
  dimensions: ReportDimension[];
  calibrationSummary: string;
} {
  const communication = clamp(Number(input.performance.communicationScore || 0), 0, 10);
  const evidence = clamp(Number(input.performance.evidenceScore || 0), 0, 10);
  const technicalDepth = clamp(Number(input.performance.technicalDepthScore || 0), 0, 10);
  const problemSolving = clamp(Number(input.performance.problemSolvingScore || 0), 0, 10);
  const answerRoleFit = clamp(Number(input.performance.roleFitOnAnswerScore || 0), 0, 10);
  const questionRoleFit = clamp(Number(input.questionFit.questionRoleFitScore || 0), 0, 10);

  const baseScore =
    (communication * 0.2 +
      evidence * 0.22 +
      technicalDepth * 0.23 +
      problemSolving * 0.2 +
      answerRoleFit * 0.15) *
    10;
  const fitPenaltyFactor = 0.45 + questionRoleFit / 20;
  const unknownPenalty = input.signals.unknownRatio * 42 * fitPenaltyFactor;
  const skipPenalty = input.signals.skipRatio * 16 * fitPenaltyFactor;
  const hintPenalty = Math.min(input.signals.hintCount * 2, 8);
  const lowCoveragePenalty =
    input.signals.answerCoverageRatio < 0.55
      ? (0.55 - input.signals.answerCoverageRatio) * 18
      : 0;
  const mismatchCompensation =
    questionRoleFit < 5 ? Math.min((5 - questionRoleFit) * 3, 9) : 0;
  const finalScore = clamp(
    Math.round(
      baseScore -
        unknownPenalty -
        skipPenalty -
        hintPenalty -
        lowCoveragePenalty +
        mismatchCompensation
    ),
    0,
    100
  );

  return {
    score: finalScore,
    dimensions: [
      { name: "结构化表达 (STAR)", score: communication.toFixed(1) },
      { name: "证据充分性 (量化指标)", score: evidence.toFixed(1) },
      { name: "技术深度与原理", score: technicalDepth.toFixed(1) },
      { name: "问题拆解与定位", score: problemSolving.toFixed(1) },
      { name: "岗位回答匹配度", score: answerRoleFit.toFixed(1) },
      { name: "题目岗位匹配度", score: questionRoleFit.toFixed(1) }
    ],
    calibrationSummary: `基础分 ${Math.round(baseScore)}，不会/答不上来 ${input.signals.unknownCount} 次，跳过 ${input.signals.skipCount} 次，提示 ${input.signals.hintCount} 次，题目岗位匹配度 ${questionRoleFit.toFixed(
      1
    )}/10。`
  };
}

/**
 * 将报告 metadata 序列化为稳定字符串，供历史报告与复盘中心复用。
 * @param metadata 当前报告的结构化 metadata。
 * @returns 可写入数据库的 JSON 字符串。
 */
function stringifyReportMetadata(metadata: ReportMetadataPayload): string {
  return JSON.stringify(metadata);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { history, profile, sessionId } = body;
    const resolvedContext = await resolveReportGenerationContext({
      userId: session.user.id,
      sessionId,
      history: history || null,
      profile: profile || null,
    });
    const resolvedHistory = resolvedContext.history;
    const resolvedProfile = resolvedContext.profile;

    const questionCount = Number.isFinite(resolvedHistory?.questionCount)
      ? Number(resolvedHistory?.questionCount)
      : 0;
    const mode =
      (typeof resolvedProfile?.mode === "string" && String(resolvedProfile.mode)) ||
      resolvedContext.mode ||
      "text";
    const targetLevel =
      (typeof resolvedProfile?.targetLevel === "string" && String(resolvedProfile.targetLevel).trim()) ||
      "未提供";
    const language =
      (typeof resolvedProfile?.language === "string" && String(resolvedProfile.language).trim()) ||
      "中文";
    const focus =
      (typeof resolvedProfile?.focus === "string" && String(resolvedProfile.focus).trim()) ||
      "未额外指定";
    const role =
      (typeof resolvedProfile?.role === "string" && String(resolvedProfile.role).trim()) ||
      getInterviewModeLabel(normalizeInterviewMode(mode), Boolean(resolvedProfile?.videoEnabled));

    if (!hasEffectiveInterviewContent(resolvedHistory)) {
      const existingSession = sessionId
        ? await prisma.interviewSession.findFirst({
            where: {
              id: sessionId,
              userId: session.user.id
            },
            include: {
              messages: {
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
          })
        : null;
      const relatedCodingSession =
        existingSession?.roundId
          ? await prisma.codingSession.findFirst({
              where: {
                userId: session.user.id,
                roundId: existingSession.roundId,
              },
              include: {
                submissions: true,
              },
              orderBy: {
                createdAt: "desc",
              },
            })
          : null;
      const baseMetadata: ReportMetadataPayload = {
        role,
        questions: questionCount,
        roleTrack: detectInterviewRoleTrack([role, focus]),
        questionRoleFitScore: 0,
        unknownCount: 0,
        skipCount: 0,
        hintCount: 0,
        calibrationSummary: "本次有效问答不足，系统已生成基础记录而非正式评分报告。",
        multiAgent: false,
        companyName:
          (typeof resolvedProfile?.companyName === "string" &&
            String(resolvedProfile.companyName).trim()) ||
          "",
        stageLabel:
          (typeof resolvedProfile?.currentStageLabel === "string" &&
            String(resolvedProfile.currentStageLabel).trim()) ||
          "当前轮次",
        targetLevel,
        baseRecord: {
          durationSeconds: Number((history as { elapsedTime?: number } | null)?.elapsedTime || 0),
          transcriptMessageCount:
            resolvedHistory?.messages?.length ||
            existingSession?.messages.length ||
            0,
          codingAttempted: Boolean(relatedCodingSession),
          codingSubmissionCount: relatedCodingSession?.submissions.length || 0,
        },
      };
      const baseRecordPayload = {
        noEffectiveInterview: true,
        score: null,
        highlights: [
          "系统已保留本次面试尝试记录，避免空白跳转。",
          relatedCodingSession
            ? "检测到你进入过算法题环节，本次会把编程尝试一并记入基础记录。"
            : "本次主要停留在准备或短暂尝试阶段，尚未形成足够的问答样本。",
        ].filter(Boolean),
        risks: [
          "当前有效问答不足，无法输出可信的正式评分。",
          "建议至少完成一轮项目问答或一次完整算法题提交，再查看正式复盘结果。",
        ],
        evidence: [
          `消息记录数：${resolvedHistory?.messages?.length || existingSession?.messages.length || 0}`,
          `算法题尝试：${relatedCodingSession ? "已进入" : "未进入"}`,
          `算法题提交次数：${relatedCodingSession?.submissions.length || 0}`,
        ],
        nextSteps: [
          {
            title: "重新开始一次有效面试",
            desc: "至少完成一轮真实问答，或提交一次算法题，以便系统生成可解释的正式报告。",
          },
        ],
        dimensions: [],
        metadata: baseMetadata,
        sessionId: existingSession?.id || sessionId || null,
      };

      if (existingSession) {
        await prisma.interviewSession.update({
          where: { id: existingSession.id },
          data: {
            status: "completed",
            score: null,
            mode,
            report: {
              upsert: {
                create: {
                  highlights: JSON.stringify(baseRecordPayload.highlights),
                  risks: JSON.stringify(baseRecordPayload.risks),
                  nextSteps: JSON.stringify(baseRecordPayload.nextSteps),
                  dimensions: JSON.stringify([]),
                  evidence: JSON.stringify(baseRecordPayload.evidence),
                  metadata: stringifyReportMetadata(baseMetadata),
                },
                update: {
                  highlights: JSON.stringify(baseRecordPayload.highlights),
                  risks: JSON.stringify(baseRecordPayload.risks),
                  nextSteps: JSON.stringify(baseRecordPayload.nextSteps),
                  dimensions: JSON.stringify([]),
                  evidence: JSON.stringify(baseRecordPayload.evidence),
                  metadata: stringifyReportMetadata(baseMetadata),
                },
              },
            },
          }
        });
      } else if (sessionId) {
        await prisma.interviewSession.create({
          data: {
            id: sessionId,
            userId: session.user.id,
            status: "completed",
            score: null,
            mode,
            messages: {
              create: (resolvedHistory?.messages || []).map((msg) => ({
                role: msg.role === "ai" ? "assistant" : "user",
                content: Array.isArray(msg.content) ? msg.content.join("\n") : String(msg.content),
              })),
            },
            report: {
              create: {
                highlights: JSON.stringify(baseRecordPayload.highlights),
                risks: JSON.stringify(baseRecordPayload.risks),
                nextSteps: JSON.stringify(baseRecordPayload.nextSteps),
                dimensions: JSON.stringify([]),
                evidence: JSON.stringify(baseRecordPayload.evidence),
                metadata: stringifyReportMetadata(baseMetadata),
              },
            },
          },
        });
      }

      return NextResponse.json(baseRecordPayload);
    }

    const openai = getDeepseekClient();
    const signals = summarizeInterviewSignals(resolvedHistory);
    const roleTrack = detectInterviewRoleTrack([role, focus]);
    const [performance, questionFit] = await Promise.all([
      evaluatePerformancePanel({
        openai,
        role,
        targetLevel,
        language,
        focus,
        transcript: signals.transcript
      }),
      evaluateQuestionFitPanel({
        openai,
        role,
        focus,
        questionTranscript: signals.questionTranscript
      })
    ]);
    const reviewPanel = await runRoundReviewerPanel({
      openai,
      companyName:
        (typeof resolvedProfile?.companyName === "string" &&
          String(resolvedProfile.companyName).trim()) ||
        "",
      roleName: role,
      targetLevel,
      stageLabel:
        (typeof resolvedProfile?.currentStageLabel === "string" &&
          String(resolvedProfile.currentStageLabel).trim()) ||
        "当前轮次",
      focus,
      transcript: signals.transcript,
      questionTranscript: signals.questionTranscript,
    });
    const calibrated = buildCalibratedScore({
      performance,
      questionFit,
      signals
    });
    const fitSummary = questionFit.fitSummary?.trim() || "";
    const mismatchReasons = (questionFit.mismatchReasons || []).filter(Boolean);
    const highlights = Array.from(new Set((performance.highlights || []).filter(Boolean))).slice(0, 4);
    const reviewHighlights = Array.from(
      new Set(reviewPanel.reviewers.flatMap((item) => item.strengths).filter(Boolean))
    ).slice(0, 4);
    const risks = Array.from(
      new Set(
        [
          ...(performance.risks || []),
          ...reviewPanel.reviewers.flatMap((item) => item.improvements || []),
          ...(fitSummary ? [`题目岗位匹配度：${fitSummary}`] : []),
          ...mismatchReasons.map((item) => `题目跑偏：${item}`),
          signals.unknownCount > 0
            ? `本场出现 ${signals.unknownCount} 次“不会 / 答不上来”，会直接拉低最终得分。`
            : ""
        ].filter(Boolean)
      )
    ).slice(0, 6);
    const evidence = Array.from(
      new Set(
        [
          ...(performance.evidence || []),
          calibrated.calibrationSummary,
          `评审团投票：${reviewPanel.passVotes}/${reviewPanel.totalReviewers} 通过，裁决结果：${
            reviewPanel.passed ? "本轮通过" : "本轮淘汰"
          }。`,
          reviewPanel.verdictReason
        ].filter(Boolean)
      )
    ).slice(0, 6);
    const nextSteps = Array.from(
      new Map(
        [...(performance.nextSteps || []), ...reviewPanel.actionItems].map((item) => [
          `${item.title}__${item.desc}`,
          item,
        ])
      ).values()
    ).slice(0, 4);
    const metadata: ReportMetadataPayload = {
      role,
      questions: questionCount,
      roleTrack,
      questionRoleFitScore: Number(questionFit.questionRoleFitScore || 0),
      unknownCount: signals.unknownCount,
      skipCount: signals.skipCount,
      hintCount: signals.hintCount,
      calibrationSummary: calibrated.calibrationSummary,
      multiAgent: true,
      companyName:
        (typeof resolvedProfile?.companyName === "string" &&
          String(resolvedProfile.companyName).trim()) ||
        "",
      stageLabel:
        (typeof resolvedProfile?.currentStageLabel === "string" &&
          String(resolvedProfile.currentStageLabel).trim()) ||
        "当前轮次",
      targetLevel,
      reviewPanel: {
        passed: reviewPanel.passed,
        passVotes: reviewPanel.passVotes,
        failVotes: reviewPanel.failVotes,
        totalReviewers: reviewPanel.totalReviewers,
        averageScore: reviewPanel.averageScore,
        adjudicationSummary: reviewPanel.adjudicationSummary,
        verdictReason: reviewPanel.verdictReason,
        focusAreas: reviewPanel.focusAreas,
        actionItems: reviewPanel.actionItems,
        reviewers: reviewPanel.reviewers,
      },
    };

    const report = {
      score: calibrated.score,
      highlights: Array.from(new Set([...highlights, ...reviewHighlights])).slice(0, 6),
      risks,
      evidence,
      nextSteps,
      dimensions: calibrated.dimensions,
      metadata,
    };

    // Save to database
    try {
      const reportPayload = {
        highlights: JSON.stringify(report.highlights || []),
        risks: JSON.stringify(report.risks || []),
        nextSteps: JSON.stringify(report.nextSteps || []),
        dimensions: JSON.stringify(report.dimensions || []),
        evidence: JSON.stringify(report.evidence || []),
        metadata: stringifyReportMetadata(metadata),
      };

      const existingSession = sessionId
        ? await prisma.interviewSession.findFirst({
            where: {
              id: sessionId,
              userId: session.user.id
            }
          })
        : null;

      const dbSession = existingSession
        ? await prisma.interviewSession.update({
            where: { id: existingSession.id },
            data: {
              status: "completed",
              score: report.score ?? null,
              mode,
              report: {
                upsert: {
                  create: reportPayload,
                  update: reportPayload
                }
              }
            }
          })
        : await prisma.interviewSession.create({
            data: {
              userId: session.user.id,
              status: "completed",
              score: report.score ?? null,
              mode,
              messages: {
                create: (history?.messages || []).map((msg: {
                  role: string;
                  content: string | string[];
                }) => ({
                  role: msg.role === "ai" ? "assistant" : "user",
                  content: Array.isArray(msg.content)
                    ? msg.content.join("\n")
                    : String(msg.content)
                }))
              },
              report: {
                create: reportPayload
              }
            }
          });

      await persistRoundReviewerPanel({
        userId: session.user.id,
        planId:
          typeof resolvedProfile?.interviewPlanId === "string"
            ? String(resolvedProfile.interviewPlanId)
            : null,
        stageId:
          typeof resolvedProfile?.interviewStageId === "string"
            ? String(resolvedProfile.interviewStageId)
            : null,
        roundId:
          typeof resolvedProfile?.interviewRoundId === "string"
            ? String(resolvedProfile.interviewRoundId)
            : null,
        panel: reviewPanel,
      });
      
      return NextResponse.json({ ...report, sessionId: dbSession.id });
    } catch (dbError) {
      console.error("Failed to save report to database:", dbError);
      // Fallback: still return the report to frontend even if DB fails
      return NextResponse.json(report);
    }

  } catch (error) {
    console.error("Report API error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
