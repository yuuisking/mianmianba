import {
  AgentRunRole,
  CodingSessionStatus,
  InterviewQuestionKind,
  InterviewQuestionStatus,
  InterviewRoundStatus,
  Prisma,
} from "@prisma/client";
import {
  buildCodingProblemPrompt,
  DEFAULT_CODING_DURATION_MINUTES,
  DEFAULT_CODING_LANGUAGE,
  findCodingProblem,
  selectCodingProblemBySeed,
  SUPPORTED_CODING_LANGUAGES,
} from "@/lib/coding/problemBank";
import { runCodingJudge } from "@/lib/coding/judgeClient";
import type {
  CodingLanguage,
  CodingProblemDefinition,
  CodingRunResult,
} from "@/lib/coding/judgeTypes";
import prisma from "@/lib/prisma";

type EnsureCodingSessionInput = {
  userId: string;
  roundId: string;
  stageId?: string | null;
  role?: string | null;
  companyName?: string | null;
  projectName?: string | null;
};

type CodingSessionWithQuestion = Prisma.CodingSessionGetPayload<{
  include: {
    question: true;
  };
}>;

/**
 * 将运行结果转换为 Prisma 可写入的 JSON 值，避免 JSON 字段的结构类型被 TypeScript 误判。
 * @param value 任意可序列化对象。
 * @returns 可直接写入 Prisma JSON 字段的值。
 */
function toPrismaJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 将未知字符串安全收口到受支持语言集合中。
 * @param language 当前语言。
 * @returns 规范化后的语言。
 */
function normalizeCodingLanguage(language: string): CodingLanguage {
  if ((SUPPORTED_CODING_LANGUAGES as string[]).includes(language)) {
    return language as CodingLanguage;
  }

  return DEFAULT_CODING_LANGUAGE;
}

/**
 * 生成题目标题，补足公司和项目上下文，避免算法题看起来与当前面试完全脱节。
 * @param input 当前算法题生成上下文。
 * @param problem 已选中的题目模板。
 * @returns 用户可见的算法题标题。
 */
function buildCodingQuestionTitle(
  input: EnsureCodingSessionInput,
  problem: CodingProblemDefinition
): string {
  const prefix = [input.companyName, input.role].filter(Boolean).join(" / ");
  return prefix ? `${prefix} · ${problem.title}` : problem.title;
}

/**
 * 生成用户可见的算法题正文，保留面试上下文与最小必要说明。
 * @param input 当前算法题生成上下文。
 * @param problem 当前题目定义。
 * @returns 完整题面。
 */
function buildCodingQuestionPrompt(
  input: EnsureCodingSessionInput,
  problem: CodingProblemDefinition
): string {
  const intro = [
    "下面进入限时算法题环节。",
    input.projectName
      ? `你前面提到的项目是【${input.projectName}】，这道题重点看你的编码表达、边界处理和基本功。`
      : "这道题重点看你的编码表达、边界处理和基本功。",
    `难度：${problem.difficulty}`,
  ].join("\n");

  return `${intro}\n\n${buildCodingProblemPrompt(problem)}`;
}

/**
 * 从题目记录元数据中恢复当前算法题对应的题库定义，便于在复用旧会话时重写脏题面。
 * @param session 当前算法题会话。
 * @returns 对应的题库定义；找不到时返回 `null`。
 */
function resolveProblemFromCodingSession(
  session: CodingSessionWithQuestion
): CodingProblemDefinition | null {
  const rawMeta =
    session.question && typeof session.question.questionMeta === "object"
      ? (session.question.questionMeta as Record<string, unknown>)
      : null;
  const problemId = typeof rawMeta?.problemId === "string" ? rawMeta.problemId.trim() : "";
  return problemId ? findCodingProblem(problemId) : null;
}

/**
 * 复用已有算法题会话时，按最新真实上下文刷新题目标题与引导语，避免历史脏 prompt 持续污染当前轮次。
 * @param session 已存在的算法题会话。
 * @param input 当前真实岗位上下文。
 * @returns 刷新后的算法题会话。
 */
async function reconcileExistingCodingSession(
  session: CodingSessionWithQuestion,
  input: EnsureCodingSessionInput
): Promise<CodingSessionWithQuestion> {
  const problem = resolveProblemFromCodingSession(session);
  if (!problem) {
    return session;
  }

  const nextTitle = buildCodingQuestionTitle(input, problem);
  const nextPrompt = buildCodingQuestionPrompt(input, problem);
  if (session.question.title === nextTitle && session.question.prompt === nextPrompt) {
    return session;
  }

  await prisma.interviewQuestionRecord.update({
    where: {
      id: session.question.id,
    },
    data: {
      title: nextTitle,
      prompt: nextPrompt,
    },
  });

  return {
    ...session,
    question: {
      ...session.question,
      title: nextTitle,
      prompt: nextPrompt,
    },
  };
}

/**
 * 根据当前语言返回初始代码模板。
 * @param problem 题目模板。
 * @param language 当前语言。
 * @returns 对应语言的起始代码。
 */
function getStarterCode(
  problem: CodingProblemDefinition,
  language: CodingLanguage
): string {
  return problem.starterByLanguage[language] || problem.starterByLanguage[DEFAULT_CODING_LANGUAGE];
}

/**
 * 将真实判题结果转换成前端与评分卡都可直接复用的结构化 JSON。
 * @param result 真实判题结果。
 * @param actionType 当前动作类型。
 * @returns 统一结果载荷。
 */
function buildResultPayload(
  result: CodingRunResult,
  actionType: "RUN" | "SUBMIT"
): Record<string, unknown> {
  const isSuccess = result.runStatus === "passed";
  const summary =
    result.compileStatus === "error"
      ? "代码编译失败，请先修复语法或类型问题。"
      : result.runStatus === "runtime_error"
        ? "代码运行时发生异常，请先排查边界条件或非法访问。"
        : result.runStatus === "timeout"
          ? "代码执行超时，请进一步优化复杂度或排查死循环。"
          : isSuccess
            ? actionType === "RUN"
              ? "运行完成，当前样例已全部通过。"
              : "提交完成，当前判题用例全部通过。"
            : `已通过 ${result.passedCount}/${result.totalCount} 组用例，请继续修正。`;

  return {
    summary,
    feedback: [
      `编译状态：${result.compileStatus}`,
      `执行状态：${result.runStatus}`,
      `通过用例：${result.passedCount}/${result.totalCount}`,
    ],
    compileStatus: result.compileStatus,
    runStatus: result.runStatus,
    passedCount: result.passedCount,
    totalCount: result.totalCount,
    stdout: result.stdout,
    stderr: result.stderr,
    timeMs: result.timeMs,
    memoryKb: result.memoryKb,
    failedCases: result.failedCases,
    sampleResults: result.sampleResults,
    evaluationMode: "real-judge",
  };
}

/**
 * 确保当前轮次有且仅有一个可复用的算法题会话。
 * @param input 当前用户、轮次与岗位上下文。
 * @returns 已存在或新创建的算法题会话详情。
 */
export async function ensureCodingSession(input: EnsureCodingSessionInput) {
  const existing = await prisma.codingSession.findFirst({
    where: {
      roundId: input.roundId,
      userId: input.userId,
    },
    include: {
      question: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  if (existing) {
    return reconcileExistingCodingSession(existing, input);
  }

  const round = await prisma.interviewRound.findFirst({
    where: {
      id: input.roundId,
      userId: input.userId,
    },
    include: {
      questions: {
        orderBy: {
          questionOrder: "desc",
        },
        take: 1,
      },
    },
  });
  if (!round) {
    throw new Error("Interview round not found");
  }

  const problem = selectCodingProblemBySeed(round.id);
  const questionOrder = (round.questions[0]?.questionOrder || 0) + 1;
  const language = DEFAULT_CODING_LANGUAGE;
  const created = await prisma.$transaction(async (tx) => {
    const question = await tx.interviewQuestionRecord.create({
      data: {
        roundId: round.id,
        stageId: input.stageId || round.stageId,
        questionOrder,
        kind: InterviewQuestionKind.CODING,
        status: InterviewQuestionStatus.ASKING,
        title: buildCodingQuestionTitle(input, problem),
        prompt: buildCodingQuestionPrompt(input, problem),
        sourceType: "SYSTEM_CODING_GATE",
        askedByRole: AgentRunRole.CODE_INTERVIEWER,
        questionMeta: {
          problemId: problem.id,
          slug: problem.slug,
          difficulty: problem.difficulty,
          supportedLanguages: SUPPORTED_CODING_LANGUAGES,
          constraints: problem.constraints,
          examples: problem.examples,
          tags: problem.tags || [],
        },
        rubric: {
          dimensions: ["正确性", "边界处理", "代码表达", "复杂度意识"],
        },
      },
    });

    const codingSession = await tx.codingSession.create({
      data: {
        roundId: round.id,
        questionId: question.id,
        userId: input.userId,
        language,
        status: CodingSessionStatus.READY,
        starterCode: getStarterCode(problem, language),
        latestCode: getStarterCode(problem, language),
        codingMeta: {
          problemId: problem.id,
          slug: problem.slug,
          difficulty: problem.difficulty,
          supportedLanguages: SUPPORTED_CODING_LANGUAGES,
          starterByLanguage: problem.starterByLanguage,
          functionNameByLanguage: problem.functionNameByLanguage,
          durationMinutes: DEFAULT_CODING_DURATION_MINUTES,
        },
      },
      include: {
        question: true,
      },
    });

    await tx.interviewRound.update({
      where: {
        id: round.id,
      },
      data: {
        status: InterviewRoundStatus.CODING,
      },
    });

    return codingSession;
  });

  return created;
}

/**
 * 获取当前用户可访问的算法题会话详情。
 * @param userId 当前用户 ID。
 * @param codingSessionId 算法题会话 ID。
 * @returns 算法题会话详情。
 */
export async function getCodingSessionDetail(
  userId: string,
  codingSessionId: string
) {
  return prisma.codingSession.findFirst({
    where: {
      id: codingSessionId,
      userId,
    },
    include: {
      question: true,
      submissions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      },
    },
  });
}

/**
 * 处理一次算法题“运行”或“提交”，并把结果回写到会话、提交记录和评分卡。
 * @param input 当前用户动作。
 * @returns 更新后的算法题会话详情与本次结果。
 */
export async function executeCodingSessionAction(input: {
  userId: string;
  codingSessionId: string;
  actionType: "RUN" | "SUBMIT";
  code: string;
  language: string;
}) {
  const session = await prisma.codingSession.findFirst({
    where: {
      id: input.codingSessionId,
      userId: input.userId,
    },
    include: {
      question: true,
    },
  });
  if (!session) {
    throw new Error("Coding session not found");
  }

  const problemId =
    typeof session.codingMeta === "object" &&
    session.codingMeta &&
    "problemId" in (session.codingMeta as Record<string, unknown>)
      ? String((session.codingMeta as Record<string, unknown>).problemId || "")
      : "";
  const problem = findCodingProblem(problemId);
  if (!problem) {
    throw new Error("当前算法题题库记录不存在，无法继续运行。");
  }

  const language = normalizeCodingLanguage(input.language);
  const codeSnapshot = input.code.trim() ? input.code : getStarterCode(problem, language);
  const judgeResult = await runCodingJudge({
    language,
    code: codeSnapshot,
    problem,
    mode: input.actionType === "RUN" ? "run" : "submit",
  });
  const resultPayload = buildResultPayload(judgeResult, input.actionType);
  const nextStatus =
    input.actionType === "RUN"
      ? CodingSessionStatus.RUNNING
      : CodingSessionStatus.REVIEWED;

  const updatedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.codingSession.update({
      where: {
        id: session.id,
      },
      data: {
        language,
        starterCode: getStarterCode(problem, language),
        latestCode: codeSnapshot,
        status: nextStatus,
        runCount:
          input.actionType === "RUN" ? { increment: 1 } : undefined,
        submitCount:
          input.actionType === "SUBMIT" ? { increment: 1 } : undefined,
        lastRunAt: input.actionType === "RUN" ? new Date() : session.lastRunAt,
        lastSubmitAt:
          input.actionType === "SUBMIT" ? new Date() : session.lastSubmitAt,
      },
      include: {
        question: true,
        submissions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
      },
    });

    await tx.codingSubmission.create({
      data: {
        codingSessionId: session.id,
        actionType: input.actionType,
        codeSnapshot: codeSnapshot,
        passedCount: judgeResult.passedCount,
        totalCount: judgeResult.totalCount,
        runtimeMs: judgeResult.timeMs,
        memoryKb: judgeResult.memoryKb,
        resultPayload: toPrismaJson(resultPayload),
      },
    });

    if (input.actionType === "SUBMIT") {
      await tx.interviewQuestionRecord.update({
        where: {
          id: session.questionId,
        },
        data: {
          status: InterviewQuestionStatus.SCORED,
        },
      });
      await tx.interviewRound.update({
        where: {
          id: session.roundId,
        },
        data: {
          status: InterviewRoundStatus.SCORING,
        },
      });
      await tx.interviewScorecard.create({
        data: {
          roundId: session.roundId,
          questionId: session.questionId,
          codingScore:
            judgeResult.totalCount > 0
              ? Number(
                  ((judgeResult.passedCount / judgeResult.totalCount) * 100).toFixed(2)
                )
              : 0,
          rubricBreakdown: toPrismaJson(resultPayload),
        },
      });
    }

    return updated;
  });

  return {
    session: updatedSession,
    evaluation: {
      passedCount: judgeResult.passedCount,
      totalCount: judgeResult.totalCount,
      resultPayload,
    },
  };
}
