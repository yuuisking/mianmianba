import prisma from "@/lib/prisma";
import type {
  ContinueTrainingCard,
  V2HomeDashboardSnapshot,
  V2ProgressMetric,
  WeaknessPreviewCard,
} from "@/lib/interview-v2/domain";

type ParsedDimension = {
  name?: string;
  score?: number | string;
};

type ParsedWeaknessSource = {
  name: string;
  count: number;
  hint: string;
  impactScore: number;
  progressScoreSum: number;
  actionPath: string | null;
  actionLabel: string;
};

/**
 * 解析报告里的 JSON 字段，兼容空值、错误字符串和非数组结果。
 * @param {string | null | undefined} raw 原始 JSON 字符串。
 * @returns {T[]} 解析后的数组，失败时返回空数组。
 */
function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * 计算自然日开始时间，用于周级统计。
 * @param {Date} date 参考时间。
 * @returns {Date} 当天零点时间。
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 生成某个时间点向前偏移若干天后的日期。
 * @param {Date} date 参考时间。
 * @param {number} days 向前偏移的天数。
 * @returns {Date} 偏移后的时间。
 */
function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * 将分数换算为弱项影响等级，分数越低影响越大。
 * @param {number} score 原始分值。
 * @returns {number} 统一后的影响分。
 */
function toImpactScore(score: number): number {
  return Math.max(1, Math.min(100, Math.round(100 - score)));
}

/**
 * 将原始进展分数归一化为 0-100 的展示百分比。
 * @param {number} score 原始分值。
 * @returns {number} 归一化后的百分比。
 */
function normalizeProgressPercent(score: number): number {
  return Math.max(5, Math.min(100, Math.round(score)));
}

/**
 * 从复盘样本里提取首页“薄弱点 Top 3”，统一汇总模拟面试、专项训练与学习测验的真实结果。
 * @param {{ interviewSessions: Array<{ report: { dimensions: string | null; risks: string | null } | null }>; practiceSessions: Array<{ totalScore: number | null; document: { id: string; title: string } }>; learningProgressList: Array<{ score: number | null; document: { id: string; title: string } }> }} input 最近样本。
 * @returns {WeaknessPreviewCard[]} 排序后的薄弱点预览列表。
 */
function buildWeaknessCards(input: {
  interviewSessions: Array<{
    report: {
      dimensions: string | null;
      risks: string | null;
    } | null;
  }>;
  practiceSessions: Array<{
    totalScore: number | null;
    document: {
      id: string;
      title: string;
    };
  }>;
  learningProgressList: Array<{
    score: number | null;
    document: {
      id: string;
      title: string;
    };
  }>;
}): WeaknessPreviewCard[] {
  const map = new Map<string, ParsedWeaknessSource>();

  for (const session of input.interviewSessions) {
    if (!session.report) {
      continue;
    }

    const dimensions = parseJsonArray<ParsedDimension>(session.report.dimensions);
    for (const dimension of dimensions) {
      const name = dimension.name?.trim();
      const parsedScore = Number(dimension.score);
      if (!name || Number.isNaN(parsedScore) || parsedScore >= 7) {
        continue;
      }

      const impactScore = toImpactScore(parsedScore * 10);
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        existing.impactScore = Math.max(existing.impactScore, impactScore);
        existing.progressScoreSum += normalizeProgressPercent(parsedScore * 10);
        continue;
      }

      map.set(name, {
        name,
        count: 1,
        hint: `最近回答里，${name} 维度多次偏弱，建议优先安排定向训练。`,
        impactScore,
        progressScoreSum: normalizeProgressPercent(parsedScore * 10),
        actionPath: `/interview?mode=targeted&topic=${encodeURIComponent(name)}&desc=${encodeURIComponent(`最近回答里，${name} 维度多次偏弱，建议优先安排定向训练。`)}`,
        actionLabel: "专项突破",
      });
    }

    const risks = parseJsonArray<string>(session.report.risks);
    for (const risk of risks) {
      const normalizedRisk = risk.trim();
      if (!normalizedRisk) {
        continue;
      }

      const name =
        normalizedRisk.length > 18
          ? `${normalizedRisk.slice(0, 18)}...`
          : normalizedRisk;
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        existing.impactScore = Math.max(existing.impactScore, 60);
        existing.progressScoreSum += 35;
        continue;
      }

      map.set(name, {
        name,
        count: 1,
        hint: normalizedRisk,
        impactScore: 60,
        progressScoreSum: 35,
        actionPath: "/review",
        actionLabel: "查看复盘",
      });
    }
  }

  for (const session of input.practiceSessions) {
    if (session.totalScore === null || session.totalScore >= 75) {
      continue;
    }

    const name = session.document.title.trim();
    if (!name) {
      continue;
    }

    const impactScore = toImpactScore(session.totalScore);
    const existing = map.get(name);
    if (existing) {
      existing.count += 1;
      existing.impactScore = Math.max(existing.impactScore, impactScore);
      existing.progressScoreSum += normalizeProgressPercent(session.totalScore);
      continue;
    }

    map.set(name, {
      name,
      count: 1,
      hint: `最近专项训练《${name}》得分偏低，建议先回到同主题补练后再继续扩面。`,
      impactScore,
      progressScoreSum: normalizeProgressPercent(session.totalScore),
      actionPath: `/practice?topic=${encodeURIComponent(name)}`,
      actionLabel: "回到专项训练",
    });
  }

  for (const item of input.learningProgressList) {
    if (item.score === null || item.score >= 70) {
      continue;
    }

    const name = item.document.title.trim();
    if (!name) {
      continue;
    }

    const impactScore = toImpactScore(item.score);
    const existing = map.get(name);
    if (existing) {
      existing.count += 1;
      existing.impactScore = Math.max(existing.impactScore, impactScore);
      existing.progressScoreSum += normalizeProgressPercent(item.score);
      continue;
    }

    map.set(name, {
      name,
      count: 1,
      hint: `最近学习测验《${name}》掌握度不足，建议先回到学习中心补基础，再进入专项训练。`,
      impactScore,
      progressScoreSum: normalizeProgressPercent(item.score),
      actionPath: "/learning",
      actionLabel: "去补基础",
    });
  }

  return Array.from(map.values())
    .sort(
      (left, right) =>
        right.impactScore - left.impactScore || right.count - left.count
    )
    .slice(0, 3)
    .map((item) => {
      const progressPercent = Math.max(
        5,
        Math.min(100, Math.round(item.progressScoreSum / item.count))
      );

      return {
        name: item.name,
        hint: item.hint,
        progressPercent,
        progressLabel: `当前修复进度 ${progressPercent}%`,
        impactLabel: item.count > 1 ? `近阶段已连续命中 ${item.count} 次` : "最近一次复盘已命中",
        severity:
          item.impactScore >= 55 ? "high" : item.impactScore >= 35 ? "medium" : "low",
        actionLabel: item.actionLabel,
        actionPath: item.actionPath,
      };
    });
}

/**
 * 生成首页“继续训练”卡片，明确给出来源、原因与下一步动作。
 * @param {{ latestInterview: { createdAt: Date } | null; latestPractice: { createdAt: Date; document: { title: string } } | null; latestLearning: { updatedAt: Date; document: { title: string } } | null; topWeakness: WeaknessPreviewCard | null }} input 推荐输入。
 * @returns {ContinueTrainingCard | null} 继续训练卡片。
 */
function buildContinueTrainingCard(input: {
  latestInterview: { createdAt: Date; score: number | null } | null;
  latestPractice: {
    createdAt: Date;
    totalScore: number | null;
    document: { title: string };
  } | null;
  latestLearning: {
    updatedAt: Date;
    status: string;
    score: number | null;
    document: { title: string };
  } | null;
  topWeakness: WeaknessPreviewCard | null;
}): ContinueTrainingCard | null {
  const latestCandidates = [
    input.latestLearning
      ? {
          kind: "learning" as const,
          time: input.latestLearning.updatedAt,
          payload: input.latestLearning,
        }
      : null,
    input.latestPractice
      ? {
          kind: "practice" as const,
          time: input.latestPractice.createdAt,
          payload: input.latestPractice,
        }
      : null,
    input.latestInterview
      ? {
          kind: "interview" as const,
          time: input.latestInterview.createdAt,
          payload: input.latestInterview,
        }
      : null,
  ]
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.time.getTime() - left.time.getTime());

  const latest = latestCandidates[0] ?? null;

  if (latest?.kind === "learning") {
    const learningProgressPercent =
      latest.payload.status === "COMPLETED"
        ? 100
        : normalizeProgressPercent(latest.payload.score ?? 45);
    return {
      title: `继续学习《${latest.payload.document.title}》`,
      subtitle:
        "先把当前学习主题吃透，再回到专项训练或模拟面试验证掌握情况。",
      progressPercent: learningProgressPercent,
      progressLabel: `当前学习进度 ${learningProgressPercent}%`,
      nextStepLabel: "下一步：完成学习后去做对应专项训练",
      actionLabel: "继续学习",
      actionPath: "/learning",
    };
  }

  if (latest?.kind === "practice") {
    const practiceProgressPercent = normalizeProgressPercent(
      latest.payload.totalScore ?? 40
    );
    return {
      title: `继续专项训练《${latest.payload.document.title}》`,
      subtitle:
        "先把这一类题型压实，再回到模拟面试验证补强效果。",
      progressPercent: practiceProgressPercent,
      progressLabel: `当前训练完成度 ${practiceProgressPercent}%`,
      nextStepLabel: "下一步：补练同主题，再回到模拟面试验证",
      actionLabel: "继续专项训练",
      actionPath: `/practice?topic=${encodeURIComponent(latest.payload.document.title)}`,
    };
  }

  if (input.topWeakness) {
    return {
      title: `优先补强「${input.topWeakness.name}」`,
      subtitle:
        "先压掉当前最影响表现的问题，再安排下一场训练或模拟。",
      progressPercent: input.topWeakness.progressPercent,
      progressLabel: input.topWeakness.progressLabel,
      nextStepLabel: "下一步：先做对应补强动作，再安排下一场模拟",
      actionLabel: input.topWeakness.actionLabel,
      actionPath: input.topWeakness.actionPath,
    };
  }

  if (latest?.kind === "interview") {
    const interviewProgressPercent = normalizeProgressPercent(
      latest.payload.score ?? 50
    );
    return {
      title: "查看最近一次模拟面试复盘",
      subtitle:
        "先确认这场模拟面试里真正掉分的问题，再决定是补学习还是补专项训练。",
      progressPercent: interviewProgressPercent,
      progressLabel: `当前复盘完成度 ${interviewProgressPercent}%`,
      nextStepLabel: "下一步：先进入复盘中心确认补强方向",
      actionLabel: "去看复盘",
      actionPath: "/review",
    };
  }

  return null;
}

/**
 * 生成首页指标卡，明确展示三端汇总口径与复盘闭环动作。
 * @param {{ learningActiveCount: number; previousLearningActiveCount: number; practiceWeeklyCount: number; previousPracticeWeeklyCount: number; interviewWeeklyCount: number; previousInterviewWeeklyCount: number; reviewClosureCount: number; previousReviewClosureCount: number }} input 聚合后的指标输入。
 * @returns {V2ProgressMetric[]} 首页指标卡列表。
 */
function buildProgressMetrics(input: {
  learningActiveCount: number;
  previousLearningActiveCount: number;
  practiceWeeklyCount: number;
  previousPracticeWeeklyCount: number;
  interviewWeeklyCount: number;
  previousInterviewWeeklyCount: number;
  reviewClosureCount: number;
  previousReviewClosureCount: number;
}): V2ProgressMetric[] {
  const buildHelper = (
    current: number,
    previous: number,
    emptyText: string
  ): {
    helper: string;
    trend: "positive" | "neutral" | "negative";
  } => {
    if (current === 0 && previous === 0) {
      return {
        helper: emptyText,
        trend: "neutral",
      };
    }

    const delta = current - previous;
    if (delta > 0) {
      return {
        helper: `较上周 +${delta}`,
        trend: "positive",
      };
    }
    if (delta < 0) {
      return {
        helper: `较上周 ${delta}`,
        trend: "negative",
      };
    }

    return {
      helper: "较上周持平",
      trend: "neutral",
    };
  };

  const learningState = buildHelper(
    input.learningActiveCount,
    input.previousLearningActiveCount,
    "还没有形成学习推进记录"
  );
  const practiceState = buildHelper(
    input.practiceWeeklyCount,
    input.previousPracticeWeeklyCount,
    "近7天还没有专项训练动作"
  );
  const interviewState = buildHelper(
    input.interviewWeeklyCount,
    input.previousInterviewWeeklyCount,
    "近7天还没有模拟面试记录"
  );
  const closureState = buildHelper(
    input.reviewClosureCount,
    input.previousReviewClosureCount,
    "近7天还没有形成复盘闭环"
  );

  return [
    {
      key: "learningProgress",
      label: "学习推进",
      value: `${input.learningActiveCount}`,
      helper: learningState.helper,
      trend: learningState.trend,
    },
    {
      key: "practiceActions",
      label: "专项训练",
      value: `${input.practiceWeeklyCount}`,
      helper: practiceState.helper,
      trend: practiceState.trend,
    },
    {
      key: "interviewActions",
      label: "模拟面试",
      value: `${input.interviewWeeklyCount}`,
      helper: interviewState.helper,
      trend: interviewState.trend,
    },
    {
      key: "reviewClosure",
      label: "复盘闭环",
      value: `${input.reviewClosureCount}`,
      helper: closureState.helper,
      trend: closureState.trend,
    },
  ];
}

/**
 * 生成首页顶部的进度说明，明确告诉用户数据来源与推荐逻辑。
 * @param {{ learningActiveCount: number; practiceWeeklyCount: number; interviewWeeklyCount: number; reviewClosureCount: number }} input 当前聚合结果。
 * @returns {string} 进度摘要。
 */
function buildProgressSummary(input: {
  learningActiveCount: number;
  practiceWeeklyCount: number;
  interviewWeeklyCount: number;
  reviewClosureCount: number;
}): string {
  return `最近已推进 ${input.learningActiveCount} 个学习主题、完成 ${input.practiceWeeklyCount} 次专项训练、${input.interviewWeeklyCount} 场模拟面试，并形成 ${input.reviewClosureCount} 个补强动作。`;
}

/**
 * 生成首页薄弱点说明，明确它来自复盘中心统一结论。
 * @param {WeaknessPreviewCard[]} weaknesses 当前薄弱点列表。
 * @returns {string} 薄弱点摘要。
 */
function buildWeaknessSummary(weaknesses: WeaknessPreviewCard[]): string {
  if (weaknesses.length === 0) {
    return "当前样本还不够稳定，先完成学习、专项训练或模拟面试后再回来查看。";
  }

  return "这里会直接展示当前最需要优先补强的问题，以及下一步建议动作。";
}

/**
 * 聚合首页 v2.0 所需的真实进度、继续训练与薄弱点数据。
 * @param {{ userId: string }} input 当前用户标识。
 * @returns {Promise<V2HomeDashboardSnapshot>} 首页操作台聚合结果。
 */
export async function buildV2HomeDashboardSnapshot(input: {
  userId: string;
}): Promise<V2HomeDashboardSnapshot> {
  const now = new Date();
  const currentWeekStart = subtractDays(startOfDay(now), 6);
  const previousWeekStart = subtractDays(currentWeekStart, 7);
  const previousWeekEnd = subtractDays(currentWeekStart, 1);

  const [
    recentInterviewSessions,
    currentWeekInterviewCount,
    previousWeekInterviewCount,
    recentPracticeSessions,
    currentWeekPracticeCount,
    previousWeekPracticeCount,
    recentLearningProgress,
    currentWeekLearningCount,
    previousWeekLearningCount,
  ] = await Promise.all([
    prisma.interviewSession.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        report: true,
      },
    }),
    prisma.interviewSession.count({
      where: {
        userId: input.userId,
        createdAt: { gte: currentWeekStart },
      },
    }),
    prisma.interviewSession.count({
      where: {
        userId: input.userId,
        createdAt: { gte: previousWeekStart, lte: previousWeekEnd },
      },
    }),
    prisma.documentInterviewSession.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        document: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.documentInterviewSession.count({
      where: {
        userId: input.userId,
        createdAt: { gte: currentWeekStart },
      },
    }),
    prisma.documentInterviewSession.count({
      where: {
        userId: input.userId,
        createdAt: { gte: previousWeekStart, lte: previousWeekEnd },
      },
    }),
    prisma.learningProgress.findMany({
      where: {
        userId: input.userId,
        status: { not: "NOT_STARTED" },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        document: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.learningProgress.count({
      where: {
        userId: input.userId,
        status: { not: "NOT_STARTED" },
        updatedAt: { gte: currentWeekStart },
      },
    }),
    prisma.learningProgress.count({
      where: {
        userId: input.userId,
        status: { not: "NOT_STARTED" },
        updatedAt: { gte: previousWeekStart, lte: previousWeekEnd },
      },
    }),
  ]);

  const weaknesses = buildWeaknessCards({
    interviewSessions: recentInterviewSessions,
    practiceSessions: recentPracticeSessions,
    learningProgressList: recentLearningProgress,
  });

  const reviewClosureCount = currentWeekPracticeCount + currentWeekLearningCount;
  const previousReviewClosureCount =
    previousWeekPracticeCount + previousWeekLearningCount;
  const metrics = buildProgressMetrics({
    learningActiveCount: recentLearningProgress.length,
    previousLearningActiveCount: previousWeekLearningCount,
    practiceWeeklyCount: currentWeekPracticeCount,
    previousPracticeWeeklyCount: previousWeekPracticeCount,
    interviewWeeklyCount: currentWeekInterviewCount,
    previousInterviewWeeklyCount: previousWeekInterviewCount,
    reviewClosureCount,
    previousReviewClosureCount,
  });

  const continueTraining = buildContinueTrainingCard({
    latestInterview: recentInterviewSessions[0]
      ? {
          createdAt: recentInterviewSessions[0].createdAt,
          score: recentInterviewSessions[0].score,
        }
      : null,
    latestPractice: recentPracticeSessions[0]
      ? {
          createdAt: recentPracticeSessions[0].createdAt,
          totalScore: recentPracticeSessions[0].totalScore,
          document: recentPracticeSessions[0].document,
        }
      : null,
    latestLearning: recentLearningProgress[0]
      ? {
          updatedAt: recentLearningProgress[0].updatedAt,
          status: recentLearningProgress[0].status,
          score: recentLearningProgress[0].score,
          document: recentLearningProgress[0].document,
        }
      : null,
    topWeakness: weaknesses[0] ?? null,
  });

  return {
    metrics,
    continueTraining,
    weaknesses,
    progressSummary: buildProgressSummary({
      learningActiveCount: recentLearningProgress.length,
      practiceWeeklyCount: currentWeekPracticeCount,
      interviewWeeklyCount: currentWeekInterviewCount,
      reviewClosureCount,
    }),
    weaknessSummary: buildWeaknessSummary(weaknesses),
  };
}
