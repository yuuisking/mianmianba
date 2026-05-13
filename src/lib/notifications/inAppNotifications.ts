import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type InAppNotificationDTO = {
  id: string;
  type: string;
  title: string;
  content: string;
  actionPath: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type NotificationWriter = Prisma.TransactionClient | typeof prisma;

/**
 * 将通知元数据稳定转换为 Prisma JSON，避免对象字面量与 JSON 输入类型不兼容。
 * @param metadata 通知元数据。
 * @returns Prisma 可接受的 JSON 输入。
 */
function toPrismaJson(
  metadata: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | undefined {
  if (!metadata) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
}

/**
 * 创建一条站内信通知。
 * @param writer Prisma 客户端或事务客户端。
 * @param input 通知内容。
 * @returns 新建通知。
 */
export async function createInAppNotification(
  writer: NotificationWriter,
  input: {
    userId: string;
    type: string;
    title: string;
    content: string;
    actionPath?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  return writer.inAppNotification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      content: input.content,
      actionPath: input.actionPath || null,
      metadata: toPrismaJson(input.metadata),
    },
  });
}

/**
 * 读取当前用户的站内信列表。
 * @param userId 用户 ID。
 * @returns 通知列表与未读数量。
 */
export async function listInAppNotifications(userId: string): Promise<{
  unreadCount: number;
  notifications: InAppNotificationDTO[];
}> {
  const [notifications, unreadCount] = await Promise.all([
    prisma.inAppNotification.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    }),
    prisma.inAppNotification.count({
      where: {
        userId,
        isRead: false,
      },
    }),
  ]);

  return {
    unreadCount,
    notifications: notifications.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content,
      actionPath: item.actionPath,
      isRead: item.isRead,
      readAt: item.readAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

/**
 * 将一条或全部通知标记为已读。
 * @param input 用户与通知参数。
 * @returns 处理后的未读数量。
 */
export async function markInAppNotificationsRead(input: {
  userId: string;
  notificationId?: string | null;
  markAll?: boolean;
}): Promise<{ unreadCount: number }> {
  const where = input.markAll
    ? {
        userId: input.userId,
        isRead: false,
      }
    : {
        id: input.notificationId || "",
        userId: input.userId,
        isRead: false,
      };

  await prisma.inAppNotification.updateMany({
    where,
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  const unreadCount = await prisma.inAppNotification.count({
    where: {
      userId: input.userId,
      isRead: false,
    },
  });

  return { unreadCount };
}
