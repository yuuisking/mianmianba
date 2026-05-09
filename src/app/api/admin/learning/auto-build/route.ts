import { NextResponse } from "next/server";
import { learningDb, type DraftSummary, type TreeData } from "@/lib/db/learningDb";
import { learningFactory } from "@/lib/db/learningFactory";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

type AutoPublishedTopic = {
  topicId: string;
  topicTitle: string;
  subjectId: string;
  subjectTitle: string;
  content: {
    quickFacts: DraftSummary["content"]["quickFacts"];
    sections: DraftSummary["content"]["sections"];
  };
};

/**
 * 从自动目录中提取默认首页主题 ID，便于新知识库首次打开时定位。
 * @param {TreeData} treeData 自动生成的目录树。
 * @returns {string | null} 默认首页主题 ID。
 */
function resolveDefaultTopicId(treeData: TreeData): string | null {
  return treeData.groups[0]?.children[0]?.id ?? null;
}

/**
 * 将自动生成的正式文档临时写成草稿并立即发布，减少人工审核步骤。
 * @param {string} kbId 知识库 ID。
 * @param {AutoPublishedTopic} topic 自动生成的主题文档。
 * @param {string[]} sourceIds 关联来源 ID 列表。
 * @returns {{ topicId: string; topic: string }} 发布结果摘要。
 */
function publishAutomaticTopic(
  kbId: string,
  topic: AutoPublishedTopic,
  sourceIds: string[]
): { topicId: string; topic: string } {
  const summary: DraftSummary = {
    topic: topic.topicTitle,
    content: {
      quickFacts: topic.content.quickFacts,
      sections: topic.content.sections,
    },
  };
  const draft = learningFactory.createDraft({
    kbId,
    subject: topic.subjectId,
    summary,
    sourceIds,
    status: "ready_to_publish",
    diffSummary: [
      "已按正式文档骨架生成：总结归纳、正文解析、流程图/架构图/代码实例、面试常考。",
      "已跳过默认人工审核，直接写入公开知识库。",
    ],
  });
  learningFactory.updateDraft(kbId, draft.id, {
    summary,
    reviewNotes: [
      `该文档由“输入课题 -> 自动采集 -> 自动归类 -> 自动生成 -> 自动发布”链路生成。`,
      `当前主题为「${topic.topicTitle}」，已直接进入知识库，后续仅需按需补充细节。`,
    ],
    status: "ready_to_publish",
  });
  const published = learningFactory.publishDraft(kbId, draft.id);
  return {
    topicId: published?.topicId ?? topic.topicId,
    topic: topic.topicTitle,
  };
}

/**
 * 按需加载学习工厂自动建库模块，避免在构建期提前打包大体量自动生成链路。
 * @returns {Promise<{ buildAutomaticPublishedTopics: typeof import("@/lib/learning/autoFactory").buildAutomaticPublishedTopics; buildAutomaticTaxonomy: typeof import("@/lib/learning/autoFactory").buildAutomaticTaxonomy; buildAutoDiscoveredSources: typeof import("@/lib/learning/sourceDiscovery").buildAutoDiscoveredSources; buildKnowledgeTopicProfile: typeof import("@/lib/learning/sourceDiscovery").buildKnowledgeTopicProfile; }>} 自动建库相关方法集合。
 */
async function loadAutoBuildModules(): Promise<{
  buildAutomaticPublishedTopics: typeof import("@/lib/learning/autoFactory").buildAutomaticPublishedTopics;
  buildAutomaticTaxonomy: typeof import("@/lib/learning/autoFactory").buildAutomaticTaxonomy;
  buildAutoDiscoveredSources: typeof import("@/lib/learning/sourceDiscovery").buildAutoDiscoveredSources;
  buildKnowledgeTopicProfile: typeof import("@/lib/learning/sourceDiscovery").buildKnowledgeTopicProfile;
}> {
  const [autoFactory, sourceDiscovery] = await Promise.all([
    import("@/lib/learning/autoFactory"),
    import("@/lib/learning/sourceDiscovery"),
  ]);

  return {
    buildAutomaticPublishedTopics: autoFactory.buildAutomaticPublishedTopics,
    buildAutomaticTaxonomy: autoFactory.buildAutomaticTaxonomy,
    buildAutoDiscoveredSources: sourceDiscovery.buildAutoDiscoveredSources,
    buildKnowledgeTopicProfile: sourceDiscovery.buildKnowledgeTopicProfile,
  };
}

/**
 * 将单个课题直接编排成“自动来源筛选 -> 目录生成 -> 自动发布”的知识工厂初始结果。
 * @param {Request} req 后台自动建库请求。
 * @returns {Promise<Response>} 自动建库结果与工作台摘要。
 */
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      topic?: unknown;
      visibility?: unknown;
      notes?: unknown;
    };
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const visibility = body.visibility === "private" ? "private" : "public";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!topic) {
      return NextResponse.json({ error: "请输入要自动生成的课题" }, { status: 400 });
    }

    const {
      buildAutomaticPublishedTopics,
      buildAutomaticTaxonomy,
      buildAutoDiscoveredSources,
      buildKnowledgeTopicProfile,
    } = await loadAutoBuildModules();
    const profile = buildKnowledgeTopicProfile(topic);
    const selection = buildAutoDiscoveredSources(profile);
    const treeData = buildAutomaticTaxonomy(profile);
    const defaultTopicId = resolveDefaultTopicId(treeData);

    learningDb.createKb({
      id: profile.kbId,
      name: profile.kbName,
      subtitle: profile.subtitle,
      tags: profile.tags,
      description: [profile.description, notes].filter(Boolean).join(" "),
      visibility,
      defaultTopicId,
      updatedAt: new Date().toISOString().split("T")[0],
      stats: { topics: 0, paths: 0 },
    });
    learningDb.saveTaxonomy(profile.kbId, treeData);

    const registeredSources = selection.accepted.map((source) => {
      const result = learningFactory.registerSource({
        kbId: profile.kbId,
        type: source.type,
        mode: "batch",
        title: source.title,
        url: source.url,
        subject: source.subject,
        whitelist: true,
        excerpt: `[AUTO_BUILD] ${source.category} | ${source.selectionReason} | ${source.rationale}`,
        category: source.category,
        authorityScore: source.authorityScore,
        freshnessScore: source.freshnessScore,
        qualityScore: source.qualityScore,
        qualityGate: source.qualityGate,
        boundaryVerdict: source.boundaryVerdict,
        selectionReason: source.selectionReason,
      });

      learningFactory.updateSource(result.source.id, {
        subject: source.subject,
        error: null,
        category: source.category,
        authorityScore: source.authorityScore,
        freshnessScore: source.freshnessScore,
        qualityScore: source.qualityScore,
        qualityGate: source.qualityGate,
        boundaryVerdict: source.boundaryVerdict,
        selectionReason: source.selectionReason,
      });

      return result.source;
    });

    const sourceIds = registeredSources.map((source) => source.id);
    const publishedTopics = buildAutomaticPublishedTopics(profile, treeData, selection.accepted).map((topic) => ({
      subjectId: topic.subjectId,
      subjectTitle: topic.subjectTitle,
      ...publishAutomaticTopic(profile.kbId, topic, sourceIds),
    }));
    const snapshot = learningFactory.getSnapshot(profile.kbId);

    return NextResponse.json({
      success: true,
      kbId: profile.kbId,
      profile,
      acceptedSources: selection.accepted,
      rejectedSources: selection.rejected,
      treeData,
      drafted: [],
      publishedTopics,
      snapshot: {
        stats: snapshot.stats,
        kbs: snapshot.kbs,
        drafts: learningFactory.withDraftWorkflow(snapshot.drafts),
        sources: snapshot.sources,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
