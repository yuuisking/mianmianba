import prisma from "@/lib/prisma";

export type ReviewTaskSummary = {
  id: string;
  documentId: string;
  documentTitle: string;
  reviewType: string;
  status: string;
  reviewerId: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * 获取学习中心审核任务列表。
 * @param {{ status?: string }} options 可选筛选条件。
 * @returns {Promise<ReviewTaskSummary[]>} 审核任务摘要列表。
 */
export async function listLearningReviewTasks(options?: { status?: string }): Promise<ReviewTaskSummary[]> {
  const tasks = await prisma.reviewTask.findMany({
    where: options?.status ? { status: options.status } : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: {
      document: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  return tasks.map((task) => ({
    id: task.id,
    documentId: task.documentId,
    documentTitle: task.document.title,
    reviewType: task.reviewType,
    status: task.status,
    reviewerId: task.reviewerId,
    comment: task.comment,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }));
}

/**
 * 将指定审核任务标记为通过，并同步发布对应文档版本。
 * @param {{ taskId: string; reviewerId: string; comment?: string }} options 审核通过所需参数。
 * @returns {Promise<ReviewTaskSummary>} 更新后的审核任务摘要。
 */
export async function approveLearningReviewTask(options: {
  taskId: string;
  reviewerId: string;
  comment?: string;
}): Promise<ReviewTaskSummary> {
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.reviewTask.update({
      where: { id: options.taskId },
      data: {
        status: "APPROVED",
        reviewerId: options.reviewerId,
        comment: options.comment ?? null,
      },
      include: {
        document: true,
      },
    });

    await tx.document.update({
      where: { id: task.documentId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    return task;
  });

  return {
    id: result.id,
    documentId: result.documentId,
    documentTitle: result.document.title,
    reviewType: result.reviewType,
    status: result.status,
    reviewerId: result.reviewerId,
    comment: result.comment,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

/**
 * 将指定审核任务标记为拒绝，并保留反馈意见。
 * @param {{ taskId: string; reviewerId: string; comment: string }} options 审核拒绝参数。
 * @returns {Promise<ReviewTaskSummary>} 更新后的审核任务摘要。
 */
export async function rejectLearningReviewTask(options: {
  taskId: string;
  reviewerId: string;
  comment: string;
}): Promise<ReviewTaskSummary> {
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.reviewTask.update({
      where: { id: options.taskId },
      data: {
        status: "REJECTED",
        reviewerId: options.reviewerId,
        comment: options.comment,
      },
      include: {
        document: true,
      },
    });

    await tx.document.update({
      where: { id: task.documentId },
      data: {
        status: "REJECTED",
      },
    });

    return task;
  });

  return {
    id: result.id,
    documentId: result.documentId,
    documentTitle: result.document.title,
    reviewType: result.reviewType,
    status: result.status,
    reviewerId: result.reviewerId,
    comment: result.comment,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}
