import prisma from "@/lib/prisma";
import { validateDocumentContracts } from "@/lib/learning/content-contract";
import { getBenchmarkBanks } from "@/lib/learning/v2SeedData";

export type SeedLearningCenterV2Result = {
  categories: number;
  banks: number;
  chapters: number;
  documents: number;
  versions: number;
  qualityReports: number;
  reviewTasks: number;
  aiTasks: number;
};

/**
 * 生成 slug 对应的展示标签。
 * @param {string} value 原始 slug。
 * @returns {string} 去除多余连接符后的标签字符串。
 */
function toDisplaySlug(value: string): string {
  return value.replace(/-+/g, "-").trim();
}

/**
 * 清理旧文件仓学习数据，迁移完成后不再作为主数据源使用。
 * @returns {Promise<void>} 清理结束。
 */
export async function clearLegacyLearningContent(): Promise<void> {
  await prisma.$transaction([
    prisma.userAnswerScore.deleteMany(),
    prisma.documentInterviewSession.deleteMany(),
    prisma.learningProgress.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.reviewTask.deleteMany(),
    prisma.sourceMaterial.deleteMany(),
    prisma.documentTag.deleteMany(),
    prisma.documentVersion.deleteMany(),
    prisma.qualityReport.deleteMany(),
    prisma.document.deleteMany(),
    prisma.chapter.deleteMany(),
    prisma.topicBank.deleteMany(),
    prisma.topicCategory.deleteMany(),
    prisma.aiTaskStep.deleteMany(),
    prisma.aiTask.deleteMany(),
  ]);
}

/**
 * 将首批标杆题库导入 Prisma 正式表。
 * @param {{ resetExisting?: boolean }} options 导入参数。
 * @returns {Promise<SeedLearningCenterV2Result>} 导入统计结果。
 */
export async function seedLearningCenterV2(options?: {
  resetExisting?: boolean;
}): Promise<SeedLearningCenterV2Result> {
  if (options?.resetExisting) {
    await clearLegacyLearningContent();
  }

  const banks = getBenchmarkBanks();
  const counters: SeedLearningCenterV2Result = {
    categories: 0,
    banks: 0,
    chapters: 0,
    documents: 0,
    versions: 0,
    qualityReports: 0,
    reviewTasks: 0,
    aiTasks: 0,
  };

  for (const bank of banks) {
    const category = await prisma.topicCategory.upsert({
      where: { slug: bank.categorySlug },
      update: {
        name: bank.categoryName,
        description: bank.categoryDescription,
      },
      create: {
        slug: bank.categorySlug,
        name: bank.categoryName,
        description: bank.categoryDescription,
      },
    });
    counters.categories += 1;

    const topicBank = await prisma.topicBank.upsert({
      where: { slug: bank.bankSlug },
      update: {
        name: bank.bankName,
        description: bank.description,
        categoryId: category.id,
        targetRole: bank.targetRole,
        difficulty: bank.difficulty,
        coverUrl: bank.coverUrl ?? null,
        status: "PUBLISHED",
        isFeatured: true,
        publishedAt: new Date(),
      },
      create: {
        slug: bank.bankSlug,
        name: bank.bankName,
        description: bank.description,
        categoryId: category.id,
        targetRole: bank.targetRole,
        difficulty: bank.difficulty,
        coverUrl: bank.coverUrl ?? null,
        status: "PUBLISHED",
        isFeatured: true,
        publishedAt: new Date(),
      },
    });
    counters.banks += 1;

    for (const [chapterIndex, chapter] of bank.chapters.entries()) {
      const savedChapter = await prisma.chapter.upsert({
        where: {
          topicBankId_slug: {
            topicBankId: topicBank.id,
            slug: chapter.slug,
          },
        },
        update: {
          name: chapter.name,
          sortOrder: chapterIndex,
        },
        create: {
          topicBankId: topicBank.id,
          slug: chapter.slug,
          name: chapter.name,
          sortOrder: chapterIndex,
        },
      });
      counters.chapters += 1;

      for (const documentSeed of chapter.documents) {
        const validation = validateDocumentContracts(
          documentSeed.learningContent,
          documentSeed.interviewContent,
          documentSeed.title
        );
        const document = await prisma.document.upsert({
          where: {
            topicBankId_slug: {
              topicBankId: topicBank.id,
              slug: documentSeed.slug,
            },
          },
          update: {
            chapterId: savedChapter.id,
            title: documentSeed.title,
            summary: documentSeed.summary,
            difficulty: documentSeed.difficulty,
            frequency: documentSeed.frequency,
            status: "PUBLISHED",
            qualityScore: validation.pass ? 95 : 58,
            originalityScore: validation.pass ? 90 : 60,
            publishedAt: new Date(),
          },
          create: {
            topicBankId: topicBank.id,
            chapterId: savedChapter.id,
            slug: documentSeed.slug,
            title: documentSeed.title,
            summary: documentSeed.summary,
            difficulty: documentSeed.difficulty,
            frequency: documentSeed.frequency,
            status: "PUBLISHED",
            qualityScore: validation.pass ? 95 : 58,
            originalityScore: validation.pass ? 90 : 60,
            publishedAt: new Date(),
          },
        });
        counters.documents += 1;

        const qualityReport = await prisma.qualityReport.create({
          data: {
            documentId: document.id,
            totalScore: validation.pass ? 95 : 58,
            factScore: validation.pass ? 96 : 60,
            learningScore: validation.pass ? 95 : 56,
            interviewScore: validation.pass ? 93 : 55,
            originalityScore: validation.pass ? 90 : 60,
            readabilityScore: validation.pass ? 92 : 62,
            codeDiagramScore: validation.pass ? 88 : 52,
            issues: validation.checks.filter((item) => !item.pass).map((item) => item.detail ?? item.name),
            suggestions: validation.checks.filter((item) => !item.pass).map((item) => `${item.name} 需要补齐`),
            pass: validation.pass,
          },
        });
        counters.qualityReports += 1;

        const existingVersion = await prisma.documentVersion.findFirst({
          where: { documentId: document.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });

        const version = await prisma.documentVersion.create({
          data: {
            documentId: document.id,
            version: (existingVersion?.version ?? 0) + 1,
            learningContent: documentSeed.learningContent,
            interviewContent: documentSeed.interviewContent,
            markdownContent: documentSeed.learningContent.article?.sections
              .map((item) => `## ${item.heading}\n\n${item.body ?? ""}`)
              .join("\n\n"),
            sourceSnapshot: {
              sources: documentSeed.sources,
            },
            qualityReportId: qualityReport.id,
            createdBy: "system-seed",
            createdByType: "system",
            changeLog: "初始化学习中心 V2 标杆文档",
          },
        });
        counters.versions += 1;

        await prisma.document.update({
          where: { id: document.id },
          data: {
            currentVersionId: version.id,
          },
        });

        await prisma.reviewTask.create({
          data: {
            documentId: document.id,
            reviewerId: null,
            reviewType: "INITIAL_PUBLISH",
            status: "APPROVED",
            comment: "首批标杆文档初始化导入",
          },
        });
        counters.reviewTasks += 1;

        await prisma.aiTask.create({
          data: {
            taskType: "generate-document",
            status: "COMPLETED",
            targetType: "document",
            targetId: document.id,
            input: {
              title: document.title,
              chapter: chapter.name,
            },
            output: {
              qualityScore: validation.pass ? 95 : 58,
              sources: documentSeed.sources,
            },
            finishedAt: new Date(),
            startedAt: new Date(),
          },
        });
        counters.aiTasks += 1;

        await prisma.sourceMaterial.createMany({
          data: documentSeed.sources.map((source) => ({
            documentId: document.id,
            versionId: version.id,
            sourceUrl: source.url,
            sourceType: source.type,
            trustLevel: source.type === "official" ? "HIGH" : "MEDIUM",
            facts: {
              title: source.title,
            },
          })),
          skipDuplicates: false,
        });

        for (const tagName of documentSeed.tags) {
          const normalizedTag = toDisplaySlug(tagName.toLowerCase().replace(/\s+/g, "-"));
          const tag = await prisma.tag.upsert({
            where: { slug: normalizedTag },
            update: { name: tagName },
            create: {
              name: tagName,
              slug: normalizedTag,
            },
          });

          await prisma.documentTag.upsert({
            where: {
              documentId_tagId: {
                documentId: document.id,
                tagId: tag.id,
              },
            },
            update: {},
            create: {
              documentId: document.id,
              tagId: tag.id,
            },
          });
        }
      }

      const docCount = await prisma.document.count({
        where: {
          topicBankId: topicBank.id,
          chapterId: savedChapter.id,
          status: "PUBLISHED",
        },
      });

      await prisma.topicBank.update({
        where: { id: topicBank.id },
        data: {
          documentCount: await prisma.document.count({
            where: { topicBankId: topicBank.id, status: "PUBLISHED" },
          }),
          questionCount: await prisma.document.count({
            where: { topicBankId: topicBank.id, status: "PUBLISHED" },
          }),
          sortOrder: 0,
        },
      });

      void docCount;
    }
  }

  return counters;
}
