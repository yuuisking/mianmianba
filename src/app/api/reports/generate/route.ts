import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import OpenAI from "openai";
import prisma from "@/lib/prisma";

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-8a8b513540294ed0bda785020bb1d269',
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { history, profile } = body;

    const questionCount = history?.questionCount || 5;
    const mode = profile?.mode || "general";
    const targetLevel = profile?.targetLevel || "未知层级";
    const language = profile?.language || "中文";
    const focus = profile?.focus || "综合面试";

    const prompt = `
Please act as an expert technical interviewer and provide an evaluation report based on the provided interview chat history.

Context:
- Target Level: ${targetLevel}
- Language: ${language}
- Focus: ${focus}

Chat History Information:
${JSON.stringify(history, null, 2)}

You MUST return a strictly valid JSON object. Do not output any markdown formatting like \`\`\`json. Only output the raw JSON object matching this exact structure:
{
  "score": 85, // integer between 0 and 100
  "highlights": [
    "String highlight 1",
    "String highlight 2"
  ],
  "risks": [
    "String risk 1",
    "String risk 2"
  ],
  "evidence": [
    "System evidence 1",
    "System evidence 2"
  ],
  "nextSteps": [
    {
      "title": "Actionable step title",
      "desc": "Description of the step"
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
    "role": "前端开发工程师", // Or infer from context
    "questions": ${questionCount}
  }
}
`;

    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are an expert technical interviewer evaluator. Output JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const report = JSON.parse(content);

    // Save to database
    try {
      const dbSession = await prisma.interviewSession.create({
        data: {
          userId: session.user.id,
          status: "completed",
          score: report.score || 0,
          mode: mode,
          messages: {
            create: (history?.messages || []).map((msg: { role: string, content: string | string[] }) => ({
              role: msg.role === "ai" ? "assistant" : "user",
              content: Array.isArray(msg.content) ? msg.content.join("\n") : String(msg.content)
            }))
          },
          report: {
            create: {
              highlights: JSON.stringify(report.highlights || []),
              risks: JSON.stringify(report.risks || []),
              nextSteps: JSON.stringify(report.nextSteps || []),
              dimensions: JSON.stringify(report.dimensions || []),
              evidence: JSON.stringify(report.evidence || [])
            }
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
