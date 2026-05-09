import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import { getInterviewModeLabel } from "@/lib/interview/config";

type ReportHistoryMessage = {
  role?: string;
  content?: string | string[];
};

/**
 * 判断当前历史是否已形成足够的有效问答，避免空面试也生成评分报告。
 * @param history 前端传入的面试历史快照。
 * @returns 是否存在至少一轮有效问答。
 */
function hasEffectiveInterviewContent(history: {
  messages?: ReportHistoryMessage[];
  questionCount?: number;
} | null): boolean {
  const messages = history?.messages || [];
  const userMessages = messages.filter((message) => {
    const content = Array.isArray(message.content)
      ? message.content.join("\n")
      : String(message.content || "");
    return message.role === "user" && content.trim().length > 0;
  });
  const assistantMessages = messages.filter((message) => {
    const content = Array.isArray(message.content)
      ? message.content.join("\n")
      : String(message.content || "");
    return message.role === "ai" && content.trim().length > 0;
  });

  return userMessages.length >= 1 && assistantMessages.length >= 1;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { history, profile, sessionId } = body;

    const questionCount = Number.isFinite(history?.questionCount)
      ? Number(history.questionCount)
      : 0;
    const mode = profile?.mode || "text";
    const targetLevel = profile?.targetLevel?.trim() || "未提供";
    const language = profile?.language?.trim() || "中文";
    const focus = profile?.focus?.trim() || "未额外指定";
    const role =
      profile?.role?.trim() ||
      getInterviewModeLabel(mode, Boolean(profile?.videoEnabled));

    if (!hasEffectiveInterviewContent(history)) {
      const existingSession = sessionId
        ? await prisma.interviewSession.findFirst({
            where: {
              id: sessionId,
              userId: session.user.id
            }
          })
        : null;

      if (existingSession) {
        await prisma.interviewSession.update({
          where: { id: existingSession.id },
          data: {
            status: "completed",
            score: null,
            mode
          }
        });
      }

      return NextResponse.json({
        noEffectiveInterview: true,
        score: null,
        highlights: [],
        risks: [],
        evidence: [],
        nextSteps: [],
        dimensions: [],
        metadata: {
          role,
          questions: questionCount
        },
        sessionId: existingSession?.id || sessionId || null
      });
    }

    const openai = getDeepseekClient();

    const prompt = `
请你作为资深技术面试评估官，根据真实面试历史生成结构化评估报告。

上下文：
- 目标岗位：${role}
- 目标层级：${targetLevel}
- 语言：${language}
- 本次重点：${focus}

面试历史：
${JSON.stringify(history, null, 2)}

你必须返回严格合法的 JSON 对象，不能输出 markdown 或额外说明。结构如下：
{
  "score": 85,
  "highlights": [
    "亮点 1",
    "亮点 2"
  ],
  "risks": [
    "风险 1",
    "风险 2"
  ],
  "evidence": [
    "判定证据 1",
    "判定证据 2"
  ],
  "nextSteps": [
    {
      "title": "可执行训练动作",
      "desc": "动作说明"
    }
  ],
  "dimensions": [
    { "name": "结构化表达 (STAR)", "score": "8.5" },
    { "name": "证据充分性 (量化指标)", "score": "7.0" },
    { "name": "技术深度与原理", "score": "8.0" },
    { "name": "方案权衡 (Trade-off)", "score": "7.5" },
    { "name": "JD 匹配度", "score": "8.5" }
  ],
  "metadata": {
    "role": "${role}",
    "questions": ${questionCount}
  }
}
`;

    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "你是一位资深技术面试评估官，只输出 JSON。" },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const report = JSON.parse(content);

    // Save to database
    try {
      const reportPayload = {
        highlights: JSON.stringify(report.highlights || []),
        risks: JSON.stringify(report.risks || []),
        nextSteps: JSON.stringify(report.nextSteps || []),
        dimensions: JSON.stringify(report.dimensions || []),
        evidence: JSON.stringify(report.evidence || [])
      };

      const existingSession = sessionId
        ? await prisma.interviewSession.findFirst({
            where: {
              id: sessionId,
              userId: session.user.id
            }
          })
        : null;

      const dbSession = existingSession
        ? await prisma.interviewSession.update({
            where: { id: existingSession.id },
            data: {
              status: "completed",
              score: report.score ?? null,
              mode,
              report: {
                upsert: {
                  create: reportPayload,
                  update: reportPayload
                }
              }
            }
          })
        : await prisma.interviewSession.create({
            data: {
              userId: session.user.id,
              status: "completed",
              score: report.score ?? null,
              mode,
              messages: {
                create: (history?.messages || []).map((msg: {
                  role: string;
                  content: string | string[];
                }) => ({
                  role: msg.role === "ai" ? "assistant" : "user",
                  content: Array.isArray(msg.content)
                    ? msg.content.join("\n")
                    : String(msg.content)
                }))
              },
              report: {
                create: reportPayload
              }
            }
          });
      
      return NextResponse.json({ ...report, sessionId: dbSession.id });
    } catch (dbError) {
      console.error("Failed to save report to database:", dbError);
      // Fallback: still return the report to frontend even if DB fails
      return NextResponse.json(report);
    }

  } catch (error) {
    console.error("Report API error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
