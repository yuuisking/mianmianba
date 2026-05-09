import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * 安全读取服务端会话；如果浏览器携带了已失效的 cookie，则按匿名用户继续。
 * @returns {Promise<Session | null>} 当前会话，解密失败时返回 null。
 */
export async function getOptionalServerSession(): Promise<Session | null> {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    console.warn("[getOptionalServerSession] fallback to anonymous session:", error);
    return null;
  }
}
