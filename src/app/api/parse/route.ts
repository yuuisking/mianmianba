import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-8a8b513540294ed0bda785020bb1d269',
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let resumeText = "";
    let jdText = "";
    let targetLevel = "";
    let language = "";
    let focus = "";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      resumeText = formData.get("resumeText") as string || "";
      jdText = formData.get("jdText") as string || "";
      targetLevel = formData.get("targetLevel") as string || "";
      language = formData.get("language") as string || "";
      focus = formData.get("focus") as string || "";

      if (file && file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // @ts-ignore
        const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
        const pdfParse = (pdfParseModule as any).default || (pdfParseModule as any);
        const pdfData = await pdfParse(buffer);
        resumeText += "\n" + (pdfData?.text || "");
      } else if (file) {
        resumeText += "\n[File attached but not parsed: " + file.name + "]";
      }
    } else {
      const body = await req.json();
      resumeText = body.resumeText || "";
      jdText = body.jdText || "";
      targetLevel = body.targetLevel || "";
      language = body.language || "";
      focus = body.focus || "";
    }

    console.log("Parsing inputs:", { targetLevel, language, focus });

    const prompt = `
Please act as an expert technical interviewer and resume reviewer.
I will provide you with a candidate's resume and a target Job Description (JD).
Your task is to analyze the resume against the JD, extract the candidate's core skills, highlight any gaps, and list key projects for potential interview questions.

Input:
Target Level: ${targetLevel}
Language: ${language}
Focus: ${focus}

Resume Text:
${resumeText}

JD Text:
${jdText}

You MUST return a strictly valid JSON object. Do not output any markdown formatting like \`\`\`json. Only output the raw JSON object matching this structure:
{
  "role": "The core target job role or direction (e.g., Java后端工程师, 前端开发, Python工程师, 产品经理) - max 15 chars",
  "skills": [
    { "name": "Skill Name", "level": "Level of proficiency (e.g., 熟练, 掌握, 了解)" }
  ],
  "jdGapWarning": {
    "text": "Short warning about gaps between resume and JD (can use HTML tags like <strong>)",
    "strategy": "Interview strategy to address these gaps"
  },
  "projects": [
    {
      "name": "Project Name",
      "points": "Potential interview questions or focus points for this project"
    }
  ]
}
`;

    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are an expert technical interviewer. Output JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    let content = completion.choices[0]?.message?.content || "{}";
    
    // DeepSeek sometimes wraps JSON in markdown blocks despite instructions
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error("JSON Parse failed on:", content);
      
      // Secondary fallback: Try to extract JSON if it's embedded in other text
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON object found");
        }
      } catch (e2) {
        // Fallback if parsing completely fails
        result = {
          role: "目标职位",
          skills: [{ name: "无法解析技能", level: "未知" }],
          jdGapWarning: { text: "简历解析失败，请检查文本格式", strategy: "无" },
          projects: [{ name: "解析失败", points: "无" }]
        };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Parse API Error:", error);
    return NextResponse.json({ error: 'Failed to parse resume and JD' }, { status: 500 });
  }
}
