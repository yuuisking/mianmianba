import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * GET /api/admin/learning/documents
 * 返回学习中心文档列表，供后台文档管理面板消费。
 * @param {NextRequest} request 请求对象。
 * @returns {Promise<NextResponse>} 文档摘要列表响应。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const bankId = request.nextUrl.searchParams.get("bankId");
    const documents = await prisma.document.findMany({
      where: bankId ? { topicBankId: bankId } : undefined,
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        difficulty: true,
        frequency: true,
        qualityScore: true,
        updatedAt: true,
        topicBank: {
          select: {
            id: true,
            name: true,
          },
        },
        chapter: {
          select: {
            id: true,
            name: true,
          },
        },
        versions: {
          orderBy: [{ version: "desc" }],
          take: 1,
          select: {
            id: true,
            version: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      documents: documents.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        status: item.status,
        difficulty: item.difficulty,
        interviewFrequency: item.frequency,
        qualityScore: item.qualityScore,
        bankId: item.topicBank.id,
        bankName: item.topicBank.name,
        chapterId: item.chapter?.id ?? null,
        chapterName: item.chapter?.name ?? "未分章",
        latestVersion: item.versions[0]?.version ?? 0,
        latestVersionAt: item.versions[0]?.createdAt.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "获取文档列表失败。",
      },
      { status: 500 }
    );
  }
}
