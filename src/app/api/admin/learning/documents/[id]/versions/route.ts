import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/learning/documents/[id]/versions
 * 返回指定文档的版本历史与关联质量报告。
 * @param {Request} _request 请求对象。
 * @param {RouteContext} context 路由参数。
 * @returns {Promise<NextResponse>} 文档版本列表响应。
 */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { id } = await context.params;
    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: [{ version: "desc" }],
      include: {
        qualityReport: true,
      },
    });

    return NextResponse.json({
      success: true,
      versions: versions.map((item) => ({
        id: item.id,
        version: item.version,
        createdBy: item.createdBy,
        createdByType: item.createdByType,
        changeLog: item.changeLog,
        createdAt: item.createdAt.toISOString(),
        qualityReport: item.qualityReport
          ? {
              id: item.qualityReport.id,
              totalScore: item.qualityReport.totalScore,
              factScore: item.qualityReport.factScore,
              learningScore: item.qualityReport.learningScore,
              interviewScore: item.qualityReport.interviewScore,
              pass: item.qualityReport.pass,
            }
          : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "获取文档版本失败。",
      },
      { status: 500 }
    );
  }
}
