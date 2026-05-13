import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { resolvePlanFeedbackPath } from "@/lib/interview-v2/lifecycle";

type FeedbackPageProps = {
  searchParams: Promise<{
    planId?: string;
  }>;
};

/**
 * 为“查看反馈”提供统一兜底路由，优先进入复盘中心，必要时回退到报告页。
 * @param props 页面查询参数。
 * @returns 不渲染内容，直接重定向。
 */
export default async function FeedbackPage(props: FeedbackPageProps): Promise<never> {
  const session = await getServerSession(authOptions);
  const { planId } = await props.searchParams;

  if (!session?.user?.id || !planId?.trim()) {
    redirect("/review");
  }

  const targetPath = await resolvePlanFeedbackPath({
    userId: session.user.id,
    planId: planId.trim(),
  });

  redirect(targetPath || "/review");
}
