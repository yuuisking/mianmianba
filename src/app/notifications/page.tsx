"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type InAppNotificationDTO = {
  id: string;
  type: string;
  title: string;
  content: string;
  actionPath: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

/**
 * 站内信页面，集中展示流程推进、淘汰与提醒消息。
 * @returns {JSX.Element} 站内信视图。
 */
export default function NotificationsPage(): JSX.Element {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<InAppNotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const hasSession = Boolean(session?.user?.id);

  useEffect(() => {
    if (!hasSession) {
      return;
    }

    async function fetchNotifications(): Promise<void> {
      setIsLoading(true);
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        data?: { unreadCount: number; notifications: InAppNotificationDTO[] };
      };
      setNotifications(payload.data?.notifications || []);
      setUnreadCount(payload.data?.unreadCount || 0);
      setIsLoading(false);
    }

    void fetchNotifications();
  }, [hasSession]);

  async function markRead(input: {
    notificationId?: string;
    markAll?: boolean;
  }): Promise<void> {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as { data?: { unreadCount: number } };
    setUnreadCount(payload.data?.unreadCount || 0);
    setNotifications((current) =>
      current.map((item) =>
        input.markAll || item.id === input.notificationId
          ? {
              ...item,
              isRead: true,
              readAt: new Date().toISOString(),
            }
          : item
      )
    );
  }

  return (
    <main className="v2-review-shell">
      <section className="v2-review-hero card">
        <div className="v2-review-hero__copy">
          <span className="pill blue">站内信</span>
          <h1>面试流程通知中心</h1>
          <p>这里汇总下一轮安排、Offer 结果、淘汰提醒和缺席通知，避免你错过关键节点。</p>
        </div>
        <div className="v2-review-hero__actions">
          <span className="pill orange">未读 {unreadCount}</span>
          {hasSession && notifications.length > 0 ? (
            <button type="button" className="btn" onClick={() => void markRead({ markAll: true })}>
              全部标为已读
            </button>
          ) : null}
        </div>
      </section>

      <section className="v2-review-section">
        <div className="v2-review-section__header">
          <div>
            <h2>通知列表</h2>
            <p>每一条通知都能直接跳到对应流程、反馈或复盘位置。</p>
          </div>
        </div>
        <div className="v2-review-action-list">
          {!hasSession ? (
            <article className="card v2-review-empty-card">
              <strong>登录后查看站内信</strong>
              <p>登录后即可查看下一轮安排、反馈入口和流程结果提醒。</p>
            </article>
          ) : isLoading ? (
            <article className="card v2-review-empty-card">
              <strong>正在读取站内信...</strong>
              <p>请稍候，正在同步你的流程通知。</p>
            </article>
          ) : notifications.length > 0 ? (
            notifications.map((item) => (
              <article key={item.id} className="card v2-review-action-card">
                <div className="v2-review-action-card__top">
                  <strong>{item.title}</strong>
                  <span className={`pill ${item.isRead ? "green" : "orange"}`}>
                    {item.isRead ? "已读" : "未读"}
                  </span>
                </div>
                <p>{item.content}</p>
                <div className="v2-review-action-card__meta">
                  <span>类型：{item.type}</span>
                  <span>时间：{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {item.actionPath ? (
                    <Link
                      href={item.actionPath}
                      className="btn btn-primary"
                      onClick={() => {
                        if (!item.isRead) {
                          void markRead({ notificationId: item.id });
                        }
                      }}
                    >
                      立即查看
                    </Link>
                  ) : null}
                  {!item.isRead ? (
                    <button type="button" className="btn" onClick={() => void markRead({ notificationId: item.id })}>
                      标记已读
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <article className="card v2-review-empty-card">
              <strong>当前还没有新的站内信</strong>
              <p>等你开始更多真实面试流程后，这里会同步展示轮次推进、Offer 和淘汰提醒。</p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
