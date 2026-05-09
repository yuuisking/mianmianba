import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import Header from "@/components/layout/Header";
import AuthProvider from "@/components/providers/AuthProvider";

export const metadata: Metadata = {
  title: "面面吧",
  description: "结构化评估报告, 定制您的专属面试官",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      style={
        {
          "--font-poppins":
            '"PingFang SC", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
          "--font-lora":
            '"Songti SC", "Noto Serif SC", "STSong", Georgia, serif',
        } as CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <Header />
          <main className="container">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
