import { NextResponse } from "next/server";
import { learningDb } from "@/lib/db/learningDb";
import { learningFactory } from "@/lib/db/learningFactory";
import {
  buildAutoDiscoveredSources,
  buildKnowledgeTopicProfileFromKb,
} from "@/lib/learning/sourceDiscovery";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * 自动为知识库补齐一批可追踪的官方文档和社区资料来源。
 * @param {Request} req 来源发现请求。
 * @returns {Promise<Response>} 新增与复用的来源结果。
 */
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      kbId?: unknown;
    };
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";

    if (!kbId) {
      return NextResponse.json({ error: "Missing required field: kbId" }, { status: 400 });
    }

    const data = learningDb.getLearningData();
    const kb = data.kbs.find((item) => item.id === kbId);
    if (!kb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    const selection = buildAutoDiscoveredSources(buildKnowledgeTopicProfileFromKb(kb));
    let createdCount = 0;
    let reusedCount = 0;

    for (const source of selection.accepted) {
      const result = learningFactory.registerSource({
        kbId,
        type: source.type,
        mode: "scheduled",
        title: source.title,
        url: source.url,
        subject: source.subject,
        whitelist: true,
        excerpt: `[AUTO_DISCOVERY] ${source.category} | ${source.selectionReason} | ${source.rationale}`,
      });

      if (result.reused) {
        reusedCount += 1;
      } else {
        createdCount += 1;
      }

      learningFactory.updateSource(result.source.id, {
        subject: source.subject,
        whitelist: true,
        error: null,
      });
    }

    return NextResponse.json({
      success: true,
      kbId,
      profile: selection.profile,
      createdCount,
      reusedCount,
      acceptedCount: selection.accepted.length,
      rejectedCount: selection.rejected.length,
      discovered: selection.accepted,
      rejected: selection.rejected,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
