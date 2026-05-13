import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  listInAppNotifications,
  markInAppNotificationsRead,
} from "@/lib/notifications/inAppNotifications";

/**
 * 提取接口异常信息。
 * @param error 异常对象。
 * @returns 可展示的错误文本。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET(): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await listInAppNotifications(session.user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      notificationId?: string;
      markAll?: boolean;
    };

    const data = await markInAppNotificationsRead({
      userId: session.user.id,
      notificationId: body.notificationId?.trim() || null,
      markAll: Boolean(body.markAll),
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
