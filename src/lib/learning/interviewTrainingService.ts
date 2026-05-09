import prisma from "@/lib/prisma";
import { evaluateAssessment } from "@/lib/learning/assessmentEngine";
import { normalizeInterviewContent } from "@/lib/learning/content-contract";

export type LearningInterviewSession = {
  id: string;
  documentId: string;
  userId: string;
  status: string;
  question: string;
  followUps: string[];
  score: number | null;
  feedback: string | null;
  createdAt: string;
};

export type LearningInterviewScoreResult = {
  score: number;
  hitPoints: string[];
  missingPoints: string[];
  factErrors: string[];
  expressionFeedback: string;
  improvedAnswer: string;
  nextQuestion: string;
};

/**
 * 从模型返回中提取第一个 JSON 对象，兼容 Markdown 代码块和前后说明文字。
 * @param {string} value 模型原始返回文本。
 * @returns {string | null} 可直接 JSON.parse 的对象字符串。
 */
function extractJsonObject(value: string): string | null {
  const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const startIndex = text.indexOf("{");
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

/**
 * 为指定文档创建新的训练会话。
 * @param {{ documentId: string; userId: string }} options 创建会话所需参数。
 * @returns {Promise<LearningInterviewSession>} 新建的训练会话摘要。
 */
export async function startLearningInterviewSession(options: {
  documentId: string;
  userId: string;
}): Promise<LearningInterviewSession> {
  const document = await prisma.document.findUnique({
    where: { id: options.documentId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!document) {
    throw new Error("文档不存在");
  }

  const version = document.versions[0];
  const interviewContent = normalizeInterviewContent(version?.interviewContent);
  const session = await prisma.documentInterviewSession.create({
    data: {
      userId: options.userId,
      documentId: options.documentId,
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });

  return {
    id: session.id,
    documentId: session.documentId,
    userId: session.userId,
    status: session.status,
    question: interviewContent.question || document.title,
    followUps: interviewContent.followUps.map((item) => item.question),
    score: session.totalScore,
    feedback: null,
    createdAt: session.createdAt.toISOString(),
  };
}

/**
 * 对用户主回答进行结构化评分，并将结果写入会话记录。
 * @param {{ sessionId: string; answer: string }} options 评分参数。
 * @returns {Promise<LearningInterviewScoreResult>} 评分结果。
 */
export async function scoreLearningInterviewAnswer(options: {
  sessionId: string;
  answer: string;
}): Promise<LearningInterviewScoreResult> {
  const session = await prisma.documentInterviewSession.findUnique({
    where: { id: options.sessionId },
    include: {
      document: {
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error("训练会话不存在");
  }

  const interviewContent = normalizeInterviewContent(session.document.versions[0]?.interviewContent);
  const assessment = await evaluateAssessment({
    questionId: session.documentId,
    question: interviewContent.question || session.document.title,
    mode: "interview",
    userAnswer: options.answer,
    expectedPoints: interviewContent.essentialPoints.map((item) => item.point),
    bonusPoints: [
      ...interviewContent.bonusPoints.map((item) => item.point),
      ...interviewContent.advancedPoints.map((item) => item.point),
    ],
    commonMistakes: interviewContent.deductPoints.map((item) => item.point),
    standardAnswer: interviewContent.answer2min || interviewContent.answer30s || interviewContent.advancedAnswer,
    nextFollowUpQuestion: interviewContent.followUps[0]?.question || null,
    reviewTarget: "回到 15 分钟深读里的核心原理、工程落地和常见误区，再用自己的话重答。",
  });
  const result: LearningInterviewScoreResult = {
    score: assessment.score,
    hitPoints: assessment.hitPoints,
    missingPoints: assessment.missingPoints,
    factErrors: assessment.wrongPoints,
    expressionFeedback: assessment.expressionFeedback,
    improvedAnswer: assessment.improvedAnswer,
    nextQuestion:
      assessment.nextAction.type === "follow_up"
        ? assessment.nextAction.target
        : interviewContent.followUps[0]?.question || "请继续补充一个更贴近项目落地的例子。",
  };

  await prisma.$transaction(async (tx) => {
    await tx.userAnswerScore.create({
      data: {
        sessionId: session.id,
        userId: session.userId,
        documentId: session.documentId,
        question: interviewContent.question || session.document.title,
        userAnswer: options.answer,
        standardAnswer: interviewContent.answer2min || interviewContent.answer30s || null,
        score: result.score,
        hitPoints: result.hitPoints,
        missingPoints: result.missingPoints,
        factErrors: result.factErrors,
        expressionFeedback: result.expressionFeedback,
        improvedAnswer: result.improvedAnswer,
        nextQuestion: result.nextQuestion,
        criterionScores: assessment.criterionScores,
      },
    });

    await tx.documentInterviewSession.update({
      where: { id: session.id },
      data: {
        totalScore: result.score,
      },
    });
  });

  return result;
}
