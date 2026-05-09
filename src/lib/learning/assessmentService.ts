import prisma from "@/lib/prisma";
import {
  evaluateAssessment,
  type AssessmentInput,
  type AssessmentLevel,
  type AssessmentMode,
  type AssessmentResult,
} from "@/lib/learning/assessmentEngine";
import { normalizeInterviewContent, normalizeLearningContent } from "@/lib/learning/content-contract";

export type AssessmentDocumentContext = {
  documentId: string;
  title: string;
  learningContent: ReturnType<typeof normalizeLearningContent>;
  interviewContent: ReturnType<typeof normalizeInterviewContent>;
};

export type EvaluateDocumentAssessmentOptions = {
  questionId: string;
  userAnswer: string;
  mode: AssessmentMode;
  kbId?: string | null;
  categoryId?: string | null;
  selfTestIndex?: number;
  followUpIndex?: number;
  followUpQuestion?: string | null;
  sessionId?: string | null;
  userId?: string | null;
};

export type DocumentAssessmentResponse = {
  assessment: AssessmentResult;
  sessionId: string | null;
};

/**
 * 读取指定文档及其最新版本，为统一评估引擎准备上下文。
 * @param {{ questionId: string; kbId?: string | null; categoryId?: string | null }} input 文档定位参数。
 * @returns {Promise<AssessmentDocumentContext | null>} 可用于评估的文档上下文。
 */
export async function loadAssessmentDocumentContext(input: {
  questionId: string;
  kbId?: string | null;
  categoryId?: string | null;
}): Promise<AssessmentDocumentContext | null> {
  const document = await prisma.document.findFirst({
    where: {
      id: input.questionId,
      status: "PUBLISHED",
      ...(input.kbId ? { topicBankId: input.kbId } : {}),
      ...(input.categoryId ? { chapterId: input.categoryId } : {}),
    },
    include: {
      versions: {
        orderBy: [{ version: "desc" }],
        take: 1,
      },
    },
  });

  if (!document) {
    return null;
  }

  return {
    documentId: document.id,
    title: document.title,
    learningContent: normalizeLearningContent(document.versions[0]?.learningContent),
    interviewContent: normalizeInterviewContent(document.versions[0]?.interviewContent),
  };
}

/**
 * 将掌握度等级映射成学习进度状态，供学习中心统计复用。
 * @param {AssessmentLevel} level 当前掌握度等级。
 * @returns {string} 可写入 learning_progress 的状态值。
 */
function mapLevelToProgressStatus(level: AssessmentLevel): string {
  return level === "mastered" ? "COMPLETED" : "IN_PROGRESS";
}

/**
 * 为自测模式构建统一评估输入。
 * @param {AssessmentDocumentContext} context 文档上下文。
 * @param {number} selfTestIndex 自测题索引。
 * @param {string} userAnswer 用户回答。
 * @returns {AssessmentInput} 统一评估输入。
 */
function buildSelfTestAssessmentInput(
  context: AssessmentDocumentContext,
  selfTestIndex: number,
  userAnswer: string
): AssessmentInput {
  const test = context.learningContent.selfTests?.[selfTestIndex];
  if (!test) {
    throw new Error("自测题不存在");
  }

  return {
    questionId: `${context.documentId}:self-test:${selfTestIndex}`,
    question: test.question,
    mode: "self_test",
    userAnswer,
    expectedPoints: (test.gradingCriteria ?? []).map((item) => item.criterion),
    bonusPoints: context.interviewContent.bonusPoints.map((item) => item.point).slice(0, 2),
    commonMistakes: context.interviewContent.deductPoints.map((item) => item.point).slice(0, 3),
    standardAnswer: test.answer?.trim() || context.interviewContent.answer2min || context.title,
    scoringCriteria: (test.gradingCriteria ?? []).map((item) => ({
      criterion: item.criterion,
      points: item.points,
      description: item.description,
    })),
    reviewTarget: "回到 15 分钟深读里的核心原理、工程落地和你能这样复述部分重新整理答案。",
  };
}

/**
 * 为主问题面试模式构建统一评估输入。
 * @param {AssessmentDocumentContext} context 文档上下文。
 * @param {string} userAnswer 用户回答。
 * @returns {AssessmentInput} 统一评估输入。
 */
function buildInterviewAssessmentInput(context: AssessmentDocumentContext, userAnswer: string): AssessmentInput {
  return {
    questionId: context.documentId,
    question: context.interviewContent.question || context.title,
    mode: "interview",
    userAnswer,
    expectedPoints: context.interviewContent.essentialPoints.map((item) => item.point),
    bonusPoints: [
      ...context.interviewContent.bonusPoints.map((item) => item.point),
      ...context.interviewContent.advancedPoints.map((item) => item.point),
    ],
    commonMistakes: context.interviewContent.deductPoints.map((item) => item.point),
    standardAnswer:
      context.interviewContent.answer2min || context.interviewContent.answer30s || context.interviewContent.advancedAnswer,
    nextFollowUpQuestion: context.interviewContent.followUps[0]?.question ?? null,
    reviewTarget: "回到这篇文档的核心原理、工程落地和常见误区部分，再按结论 -> 原理 -> 场景 -> 边界重答。",
  };
}

/**
 * 为追问模式构建统一评估输入。
 * @param {AssessmentDocumentContext} context 文档上下文。
 * @param {number | undefined} followUpIndex 追问索引。
 * @param {string | null | undefined} followUpQuestion 显式指定的追问文本。
 * @param {string} userAnswer 用户回答。
 * @returns {AssessmentInput} 统一评估输入。
 */
function buildFollowUpAssessmentInput(
  context: AssessmentDocumentContext,
  followUpIndex: number | undefined,
  followUpQuestion: string | null | undefined,
  userAnswer: string
): AssessmentInput {
  const currentFollowUp = followUpQuestion?.trim() || context.interviewContent.followUps[followUpIndex ?? 0]?.question;
  const currentKeyAnswer = context.interviewContent.followUps[followUpIndex ?? 0]?.keyAnswer?.trim();
  const nextFollowUp =
    context.interviewContent.followUps[(followUpIndex ?? 0) + 1]?.question ?? context.interviewContent.followUps[0]?.question ?? null;

  if (!currentFollowUp) {
    throw new Error("当前没有可用的追问题目");
  }

  return {
    questionId: `${context.documentId}:follow-up:${followUpIndex ?? 0}`,
    question: currentFollowUp,
    mode: "follow_up",
    userAnswer,
    expectedPoints: currentKeyAnswer ? [currentKeyAnswer] : context.interviewContent.essentialPoints.map((item) => item.point),
    bonusPoints: context.interviewContent.bonusPoints.map((item) => item.point).slice(0, 2),
    commonMistakes: context.interviewContent.deductPoints.map((item) => item.point).slice(0, 3),
    standardAnswer: currentKeyAnswer || context.interviewContent.answer30s || context.interviewContent.answer2min,
    nextFollowUpQuestion: nextFollowUp,
    reviewTarget: "回到当前追问对应的边界、风险和项目取舍部分，再补一轮更完整的回答。",
  };
}

/**
 * 为已登录用户创建或复用当前文档的面试会话。
 * @param {{ documentId: string; userId: string; sessionId?: string | null }} input 会话参数。
 * @returns {Promise<string>} 可继续写入的会话 ID。
 */
async function ensureInterviewSession(input: {
  documentId: string;
  userId: string;
  sessionId?: string | null;
}): Promise<string> {
  if (input.sessionId?.trim()) {
    const existing = await prisma.documentInterviewSession.findFirst({
      where: {
        id: input.sessionId,
        documentId: input.documentId,
        userId: input.userId,
      },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
  }

  const session = await prisma.documentInterviewSession.create({
    data: {
      userId: input.userId,
      documentId: input.documentId,
      status: "ACTIVE",
      startedAt: new Date(),
    },
    select: { id: true },
  });
  return session.id;
}

/**
 * 将统一评估结果同步到 learning_progress，供掌握度统计与弱项推荐复用。
 * @param {{ userId: string; documentId: string; assessment: AssessmentResult }} input 需要写入的学习进度参数。
 * @returns {Promise<void>} 写入结束。
 */
async function syncAssessmentProgress(input: {
  userId: string;
  documentId: string;
  assessment: AssessmentResult;
}): Promise<void> {
  const previous = await prisma.learningProgress.findUnique({
    where: {
      userId_documentId: {
        userId: input.userId,
        documentId: input.documentId,
      },
    },
    select: {
      score: true,
      status: true,
    },
  });

  await prisma.learningProgress.upsert({
    where: {
      userId_documentId: {
        userId: input.userId,
        documentId: input.documentId,
      },
    },
    update: {
      status:
        previous?.status === "COMPLETED" && input.assessment.level !== "mastered"
          ? "COMPLETED"
          : mapLevelToProgressStatus(input.assessment.level),
      score: Math.max(previous?.score ?? 0, input.assessment.score),
    },
    create: {
      userId: input.userId,
      documentId: input.documentId,
      status: mapLevelToProgressStatus(input.assessment.level),
      score: input.assessment.score,
    },
  });
}

/**
 * 将面试或追问评估结果落入用户答案记录，复用同一张 user_answer_scores 表。
 * @param {{ sessionId: string; userId: string; documentId: string; question: string; userAnswer: string; assessment: AssessmentResult }} input 需要持久化的评估结果。
 * @returns {Promise<void>} 写入结束。
 */
async function persistInterviewAssessment(input: {
  sessionId: string;
  userId: string;
  documentId: string;
  question: string;
  userAnswer: string;
  assessment: AssessmentResult;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.userAnswerScore.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        documentId: input.documentId,
        question: input.question,
        userAnswer: input.userAnswer,
        standardAnswer: input.assessment.recommendedAnswer,
        score: input.assessment.score,
        hitPoints: input.assessment.hitPoints,
        missingPoints: input.assessment.missingPoints,
        factErrors: input.assessment.wrongPoints,
        expressionFeedback: input.assessment.expressionFeedback,
        improvedAnswer: input.assessment.improvedAnswer,
        nextQuestion:
          input.assessment.nextAction.type === "follow_up" ? input.assessment.nextAction.target : input.assessment.nextAction.reason,
        criterionScores: input.assessment.criterionScores,
      },
    });

    const history = await tx.userAnswerScore.findMany({
      where: { sessionId: input.sessionId },
      select: { score: true },
    });

    const averageScore =
      history.length > 0
        ? history.reduce((sum, item) => sum + (item.score ?? 0), 0) / history.length
        : input.assessment.score;

    await tx.documentInterviewSession.update({
      where: { id: input.sessionId },
      data: {
        totalScore: averageScore,
        status: input.assessment.nextAction.type === "follow_up" ? "ACTIVE" : "ACTIVE",
        finishedAt: input.assessment.level === "mastered" ? new Date() : null,
      },
    });
  });
}

/**
 * 将评估结果以 best-effort 方式同步到学习进度，避免非核心持久化失败打断前台训练闭环。
 * @param {{ userId: string; documentId: string; assessment: AssessmentResult }} input 进度写入参数。
 * @returns {Promise<void>} 同步结束。
 */
async function trySyncAssessmentProgress(input: {
  userId: string;
  documentId: string;
  assessment: AssessmentResult;
}): Promise<void> {
  try {
    await syncAssessmentProgress(input);
  } catch (error) {
    console.warn("[assessmentService] sync progress skipped", {
      userId: input.userId,
      documentId: input.documentId,
      score: input.assessment.score,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 将面试结果以 best-effort 方式写入会话和答题记录，避免数据库抖动阻断评分结果返回。
 * @param {{ sessionId: string; userId: string; documentId: string; question: string; userAnswer: string; assessment: AssessmentResult }} input 面试写入参数。
 * @returns {Promise<void>} 同步结束。
 */
async function tryPersistInterviewAssessment(input: {
  sessionId: string;
  userId: string;
  documentId: string;
  question: string;
  userAnswer: string;
  assessment: AssessmentResult;
}): Promise<void> {
  try {
    await persistInterviewAssessment(input);
  } catch (error) {
    console.warn("[assessmentService] persist interview assessment skipped", {
      sessionId: input.sessionId,
      userId: input.userId,
      documentId: input.documentId,
      question: input.question,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 执行统一文档评估，并在登录态下复用同一套持久化逻辑。
 * @param {EvaluateDocumentAssessmentOptions} options 评估请求参数。
 * @returns {Promise<DocumentAssessmentResponse>} 统一评估结果与可复用的面试会话 ID。
 */
export async function evaluateDocumentAssessment(
  options: EvaluateDocumentAssessmentOptions
): Promise<DocumentAssessmentResponse> {
  const context = await loadAssessmentDocumentContext({
    questionId: options.questionId,
    kbId: options.kbId ?? null,
    categoryId: options.categoryId ?? null,
  });

  if (!context) {
    throw new Error("题目不存在");
  }

  const input =
    options.mode === "self_test"
      ? buildSelfTestAssessmentInput(context, options.selfTestIndex ?? 0, options.userAnswer)
      : options.mode === "follow_up"
        ? buildFollowUpAssessmentInput(context, options.followUpIndex, options.followUpQuestion, options.userAnswer)
        : buildInterviewAssessmentInput(context, options.userAnswer);

  const assessment = await evaluateAssessment(input);
  let sessionId: string | null = null;

  if (options.userId?.trim()) {
    await trySyncAssessmentProgress({
      userId: options.userId,
      documentId: context.documentId,
      assessment,
    });

    if (options.mode === "interview" || options.mode === "follow_up") {
      sessionId = await ensureInterviewSession({
        documentId: context.documentId,
        userId: options.userId,
        sessionId: options.sessionId ?? null,
      });

      await tryPersistInterviewAssessment({
        sessionId,
        userId: options.userId,
        documentId: context.documentId,
        question: input.question,
        userAnswer: options.userAnswer,
        assessment,
      });
    }
  }

  return {
    assessment,
    sessionId,
  };
}
