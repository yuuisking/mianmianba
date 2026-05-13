import { NextResponse } from "next/server";
import {
  InterviewExperienceCollectionStatus,
  Prisma,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import type { InterviewExperienceCollectionTaskDTO } from "@/lib/interview-v2/domain";
import { collectInterviewExperiencesFromPublicWeb } from "@/lib/interview-v2/experienceCollection";
import {
  isAuthorizationFailure,
  requireAuthenticatedUser,
} from "@/lib/permissions";

type CollectExperienceBody = {
  companyName?: string;
  roleName?: string;
  departmentName?: string;
};

/**
 * 从任务摘要中读取部门信息，兼容历史任务未写入该字段的情况。
 * @param {InterviewExperienceTaskRecord} task 面经采集任务记录。
 * @returns {string | null} 归一化后的部门名称。
 */
function readTaskDepartmentName(task: InterviewExperienceTaskRecord): string | null {
  const resultSummary =
    task.resultSummary && typeof task.resultSummary === "object" && !Array.isArray(task.resultSummary)
      ? (task.resultSummary as Record<string, unknown>)
      : null;
  const departmentName = resultSummary?.departmentName;
  return typeof departmentName === "string" && departmentName.trim() ? departmentName.trim() : null;
}

type InterviewExperienceTaskRecord = Prisma.InterviewExperienceCollectionTaskGetPayload<{
  include: {
    insights: {
      orderBy: {
        sortOrder: "asc";
      };
    };
  };
}>;

const EXPERIENCE_TASK_RUNNING_STALE_MS = 8 * 60 * 1000;

/**
 * 将数据库中的面经采集任务映射为前端可直接消费的 DTO。
 * @param {Awaited<ReturnType<typeof prisma.interviewExperienceCollectionTask.findFirst>>} task 数据库任务记录。
 * @returns {InterviewExperienceCollectionTaskDTO | null} 前端任务 DTO。
 */
function mapTaskToDto(
  task: InterviewExperienceTaskRecord | null
): InterviewExperienceCollectionTaskDTO | null {
  if (!task) {
    return null;
  }

  return {
    id: task.id,
    companyName: task.companyName,
    roleName: task.roleName,
    status: task.status,
    progress: task.progress,
    currentStep: task.currentStep,
    summary: task.summary,
    resultSummary:
      task.resultSummary && typeof task.resultSummary === "object" && !Array.isArray(task.resultSummary)
        ? (task.resultSummary as Record<string, unknown>)
        : null,
    errorMessage: task.errorMessage,
    latestSourceCount: task.latestSourceCount,
    startedAt: task.startedAt?.toISOString() || null,
    finishedAt: task.finishedAt?.toISOString() || null,
    createdAt: task.createdAt.toISOString(),
    insights: (task.insights || []).map((item) => ({
      id: item.id,
      stageType: item.stageType,
      title: item.title,
      summary: item.summary,
      tags: item.tags,
      sourceLabel: item.sourceLabel,
      freshnessLabel: item.freshnessLabel,
      evidenceUrl: item.evidenceUrl,
      sortOrder: item.sortOrder,
    })),
  };
}

/**
 * 查询指定用户、公司与岗位的最近一次面经采集任务。
 * @param {string} userId 当前用户 ID。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @returns {Promise<InterviewExperienceTaskRecord | null>} 最近一次采集任务。
 */
async function findLatestExperienceTask(
  userId: string,
  companyName: string,
  roleName: string,
  departmentName?: string
): Promise<InterviewExperienceTaskRecord | null> {
  const tasks = await prisma.interviewExperienceCollectionTask.findMany({
    where: {
      userId,
      companyName,
      roleName,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      insights: {
        orderBy: {
          sortOrder: "asc",
        },
      },
    },
    take: 12,
  });

  if (!departmentName?.trim()) {
    return tasks[0] || null;
  }

  const normalizedDepartmentName = departmentName.trim();
  return (
    tasks.find((task) => readTaskDepartmentName(task) === normalizedDepartmentName) ||
    tasks.find((task) => !readTaskDepartmentName(task)) ||
    tasks[0] ||
    null
  );
}

/**
 * 将长时间未更新的 RUNNING 任务自动收口为失败，避免页面永远停留在 48%。
 * @param {InterviewExperienceTaskRecord | null} task 当前任务。
 * @returns {Promise<InterviewExperienceTaskRecord | null>} 已归一化后的任务。
 */
async function resolvePossiblyStaleRunningTask(
  task: InterviewExperienceTaskRecord | null
): Promise<InterviewExperienceTaskRecord | null> {
  if (!task || task.status !== InterviewExperienceCollectionStatus.RUNNING) {
    return task;
  }

  const lastTouchedAt = task.updatedAt || task.startedAt || task.createdAt;
  if (Date.now() - lastTouchedAt.getTime() < EXPERIENCE_TASK_RUNNING_STALE_MS) {
    return task;
  }

  return prisma.interviewExperienceCollectionTask.update({
    where: {
      id: task.id,
    },
    data: {
      status: InterviewExperienceCollectionStatus.FAILED,
      progress: 100,
      currentStep: "采集超时",
      summary: "上一次公开面经采集已中断，请重新发起。",
      errorMessage: "采集任务执行超时，系统已自动收口本次任务。",
      finishedAt: new Date(),
    },
    include: {
      insights: {
        orderBy: {
          sortOrder: "asc",
        },
      },
    },
  });
}

/**
 * 在后台执行公开面经采集任务，避免把长耗时采集过程阻塞在单个 HTTP 响应中。
 * @param {{
 *   taskId: string;
 *   companyName: string;
 *   roleName: string;
 *   departmentName?: string;
 * }} input 任务执行参数。
 * @returns {Promise<void>} 执行完成后更新任务状态。
 */
async function executeExperienceCollectionTaskInBackground(input: {
  taskId: string;
  companyName: string;
  roleName: string;
  departmentName?: string;
}): Promise<void> {
  try {
    await prisma.interviewExperienceCollectionTask.update({
      where: {
        id: input.taskId,
      },
      data: {
        progress: 48,
        currentStep: "正在抓取公开网页面经并抽取结构化信息",
      },
    });

    const openai = getDeepseekClient();
    const collectionResult = await collectInterviewExperiencesFromPublicWeb({
      openai,
      companyName: input.companyName,
      roleName: input.roleName,
      departmentName: input.departmentName,
    });
    const insights = collectionResult.insights;

    await prisma.$transaction([
      prisma.interviewExperienceInsight.deleteMany({
        where: {
          taskId: input.taskId,
        },
      }),
      ...insights.map((item) =>
        prisma.interviewExperienceInsight.create({
          data: {
            taskId: input.taskId,
            stageType: item.stageType,
            title: item.title,
            summary: item.summary,
            tags: item.tags,
            sourceLabel: item.sourceLabel,
            freshnessLabel: item.freshnessLabel,
            evidenceUrl: item.evidenceUrl,
            sortOrder: item.sortOrder,
          },
        })
      ),
    ]);

    await prisma.interviewExperienceCollectionTask.update({
      where: {
        id: input.taskId,
      },
      data: {
        status: InterviewExperienceCollectionStatus.COMPLETED,
        progress: 100,
        currentStep: "采集完成",
        summary:
          insights.length > 0
            ? `已检索 ${collectionResult.resultSummary.searchResultCount} 条结果，解析 ${collectionResult.resultSummary.parsedDocumentCount} 个正文，最终沉淀 ${insights.length} 组可用于出题的面经洞察。`
            : `已检索 ${collectionResult.resultSummary.searchResultCount} 条公开结果，但暂未为 ${input.companyName} ${input.roleName} 筛出可入库面经，请查看下方拒绝原因后重试。`,
        latestSourceCount: insights.length,
        resultSummary: {
          ...collectionResult.resultSummary,
          insightCount: insights.length,
          source: insights[0]?.sourceLabel || "公开网页面经",
        },
        finishedAt: new Date(),
      },
    });
  } catch (collectionError) {
    await prisma.interviewExperienceCollectionTask.update({
      where: {
        id: input.taskId,
      },
      data: {
        status: InterviewExperienceCollectionStatus.FAILED,
        progress: 100,
        currentStep: "采集失败",
        summary: "公开网页面经采集未完成，请稍后重试。",
        errorMessage:
          collectionError instanceof Error ? collectionError.message : "面经采集失败",
        finishedAt: new Date(),
      },
    });
  }
}

/**
 * 获取指定公司与岗位的最近一次面经采集任务。
 * @param {Request} request 当前请求对象。
 * @returns {Promise<Response>} 最近一次任务结果。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get("companyName")?.trim() || "";
    const roleName = searchParams.get("roleName")?.trim() || "";
    const departmentName = searchParams.get("departmentName")?.trim() || "";
    if (!companyName || !roleName) {
      return NextResponse.json({ data: null });
    }

    const task = await resolvePossiblyStaleRunningTask(
      await findLatestExperienceTask(authResult.user.id, companyName, roleName, departmentName)
    );

    return NextResponse.json({ data: mapTaskToDto(task) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch interview experience task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 发起一次真实的面经采集任务，并把结果写入数据库。
 * @param {Request} request 当前请求对象。
 * @returns {Promise<Response>} 任务结果响应。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuthenticatedUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await request.json()) as CollectExperienceBody;
    const companyName = body.companyName?.trim() || "";
    const roleName = body.roleName?.trim() || "";
    const departmentName = body.departmentName?.trim() || "";
    if (!companyName || !roleName) {
      return NextResponse.json({ error: "请先填写目标公司和目标岗位后再采集最新面经。" }, { status: 400 });
    }

    const createdTask = await prisma.interviewExperienceCollectionTask.create({
      data: {
        userId: authResult.user.id,
        companyName,
        roleName,
        status: InterviewExperienceCollectionStatus.RUNNING,
        progress: 12,
        currentStep: "正在初始化采集任务",
        resultSummary: departmentName ? { departmentName } : Prisma.JsonNull,
        startedAt: new Date(),
      },
      include: {
        insights: true,
      },
    });

    void executeExperienceCollectionTaskInBackground({
      taskId: createdTask.id,
      companyName,
      roleName,
      departmentName,
    });

    return NextResponse.json({ data: mapTaskToDto(createdTask) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to collect interview experiences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
