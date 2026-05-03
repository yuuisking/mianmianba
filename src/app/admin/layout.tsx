import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  const isAdmin = 
    session?.user?.email?.toLowerCase().includes("admin") || 
    session?.user?.name?.toLowerCase().includes("admin");

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}