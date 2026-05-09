import { NextResponse } from "next/server";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import prisma from "@/lib/prisma";
import {
  normalizeInterviewContent,
  normalizeLearningContent,
} from "@/lib/learning/content-contract";

type AssistantRequestMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * 将输入消息规范化为安全、可发送给模型的历史数组。
 * @param {unknown} value 请求体中的消息字段。
 * @returns {AssistantRequestMessage[]} 规范后的消息数组。
 */
function normalizeMessages(value: unknown): AssistantRequestMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) {
        return null;
      }

      return {
        role,
        content: content.trim(),
      } satisfies AssistantRequestMessage;
    })
    .filter((item): item is AssistantRequestMessage => Boolean(item))
    .slice(-24);
}

/**
 * 构造题目模式下的面面吧智能助手系统提示词，限制回答只围绕当前题目上下文展开。
 * @param {object} context 当前题目上下文。
 * @returns {string} 提示词正文。
 */
function buildQuestionAssistantPrompt(context: {
  knowledgeBaseName: string;
  categoryName: string;
  title: string;
  difficulty: string;
  tags: string[];
  keyPoints: string[];
  detailedExplanation: string;
  codeExample: string | null;
  relatedQuestions: string[];
  siblingQuestions: string[];
}): string {
  return [
    "你是“面面吧智能助手”在题目深挖场景下的一个回答模式，对外统一使用“面面吧智能助手”这个名称。",
    "你的任务是围绕当前题目、参考答案、关联题和同分类题目，帮助用户继续追问、补充回答思路、整理面试表达。",
    "如果用户问题明显超出当前题目和分类上下文，请明确说明“当前题目上下文不足以可靠回答”，并建议回到这道题本身或同分类继续问。",
    "优先用中文回答，表达要像真实面试辅导，不要空泛套话。",
    "",
    `知识库：${context.knowledgeBaseName}`,
    `分类：${context.categoryName}`,
    `题目：${context.title}`,
    `难度：${context.difficulty}`,
    `标签：${context.tags.join("、") || "无"}`,
    "",
    "参考答案核心要点：",
    context.keyPoints.length > 0 ? context.keyPoints.map((item, index) => `${index + 1}. ${item}`).join("\n") : "暂无",
    "",
    "参考答案详细解析：",
    context.detailedExplanation || "暂无",
    "",
    "代码示例：",
    context.codeExample || "暂无",
    "",
    "关联题目：",
    context.relatedQuestions.length > 0 ? context.relatedQuestions.join("；") : "暂无",
    "",
    "同分类其他题目：",
    context.siblingQuestions.length > 0 ? context.siblingQuestions.join("；") : "暂无",
    "",
    "回答要求：",
    "1. 先直接回答用户问题，再补充面试里的表达方式或追问点。",
    "2. 如果适合，可以输出简短要点列表、代码示例或 Mermaid 图。",
    "3. 不要编造当前题目答案里没有依据的细节。",
  ].join("\n");
}

/**
 * 读取题目模式所需的上下文，基于 Prisma 文档体系生成问答辅助上下文。
 * @param {{ questionId: string; kbId?: string | null; categoryId?: string | null }} input 题目标识与可选范围。
 * @returns {Promise<{
 *   knowledgeBaseName: string;
 *   categoryName: string;
 *   title: string;
 *   difficulty: string;
 *   tags: string[];
 *   keyPoints: string[];
 *   detailedExplanation: string;
 *   codeExample: string | null;
 *   relatedQuestions: string[];
 *   siblingQuestions: string[];
 * } | null>} 题目上下文，找不到题目时返回 `null`。
 */
async function loadQuestionAssistantContext(input: {
  questionId: string;
  kbId?: string | null;
  categoryId?: string | null;
}): Promise<{
  knowledgeBaseName: string;
  categoryName: string;
  title: string;
  difficulty: string;
  tags: string[];
  keyPoints: string[];
  detailedExplanation: string;
  codeExample: string | null;
  relatedQuestions: string[];
  siblingQuestions: string[];
} | null> {
  const document = await prisma.document.findFirst({
    where: {
      id: input.questionId,
      status: "PUBLISHED",
      ...(input.kbId ? { topicBankId: input.kbId } : {}),
      ...(input.categoryId ? { chapterId: input.categoryId } : {}),
    },
    include: {
      topicBank: true,
      chapter: true,
      tags: {
        include: {
          tag: true,
        },
      },
      versions: {
        orderBy: [{ version: "desc" }],
        take: 1,
      },
    },
  });

  if (!document) {
    return null;
  }

  const latestVersion = document.versions[0];
  const interviewContent = normalizeInterviewContent(latestVersion?.interviewContent);
  const learningContent = normalizeLearningContent(latestVersion?.learningContent);
  const [relatedQuestions, siblingQuestions] = await Promise.all([
    prisma.document.findMany({
      where: {
        topicBankId: document.topicBankId,
        id: { not: document.id },
        status: "PUBLISHED",
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 6,
      select: {
        title: true,
      },
    }),
    prisma.document.findMany({
      where: {
        chapterId: document.chapterId,
        id: { not: document.id },
        status: "PUBLISHED",
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 8,
      select: {
        title: true,
      },
    }),
  ]);

  const codeSection = learningContent.article?.sections.find((section) => section.type === "code");
  const detailedExplanation =
    interviewContent.answer2min ||
    interviewContent.advancedAnswer ||
    learningContent.article?.summary ||
    learningContent.article?.sections
      .flatMap((section) => section.paragraphs)
      .filter(Boolean)
      .slice(0, 3)
      .join("\n") ||
    document.summary ||
    "";

  return {
    knowledgeBaseName: document.topicBank.name,
    categoryName: document.chapter?.name ?? "未分章",
    title: interviewContent.question || document.title,
    difficulty: document.difficulty,
    tags: document.tags.map((item) => item.tag.name),
    keyPoints: interviewContent.essentialPoints.map((item) => item.point),
    detailedExplanation,
    codeExample: codeSection?.code ?? null,
    relatedQuestions: relatedQuestions.map((item) => item.title),
    siblingQuestions: siblingQuestions.map((item) => item.title),
  };
}

/**
 * 处理题目详情页独立助手问答。
 * @param {Request} request 当前 POST 请求。
 * @param {{ params: Promise<{ questionId: string }> }} context 路由参数上下文。
 * @returns {Promise<NextResponse>} 助手回答结果。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ questionId: string }> }
): Promise<NextResponse> {
  try {
    const { questionId } = await context.params;
    const requestUrl = new URL(request.url);
    const kbId = requestUrl.searchParams.get("kbId");
    const categoryId = requestUrl.searchParams.get("categoryId");
    const body = (await request.json().catch(() => ({}))) as { messages?: unknown };
    const messages = normalizeMessages(body.messages);

    if (!questionId) {
      return NextResponse.json({ error: "缺少题目标识。" }, { status: 400 });
    }

    if (messages.length === 0 || messages.filter((message) => message.role === "user").length === 0) {
      return NextResponse.json({ error: "请先输入你的问题。" }, { status: 400 });
    }

    const questionContext = await loadQuestionAssistantContext({
      questionId,
      kbId,
      categoryId,
    });

    if (!questionContext) {
      return NextResponse.json({ error: "题目不存在或尚未发布。" }, { status: 404 });
    }

    const client = getDeepseekClient();
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: buildQuestionAssistantPrompt(questionContext),
        },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("面面吧智能助手返回内容为空。");
    }

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("[POST /api/learning/questions/[questionId]/assistant] error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "面面吧智能助手暂时不可用，请稍后再试。",
      },
      { status: 500 }
    );
  }
}
