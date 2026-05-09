import { redirect } from "next/navigation";

/**
 * 将根路径统一跳转到公开首页，避免进入站点即被登录流程阻断。
 * @returns 无返回值，直接执行服务端跳转。
 */
export default function RootPage() {
  redirect("/home");
}
