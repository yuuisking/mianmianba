import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/permissions";

/**
 * 保护后台页面，仅允许管理员进入。
 * @param children 后台布局内的子页面内容。
 * @returns 管理员可见的后台内容，非管理员则跳转到控制台。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminRole(session?.user?.role);

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
