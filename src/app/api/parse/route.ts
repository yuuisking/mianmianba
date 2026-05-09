import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getDeepseekClient } from "@/lib/ai/deepseek";

interface ParsedProject {
  name: string;
  points: string;
}

interface ParsedPersona {
  seniority: string;
  strengths: string[];
  risks: string[];
  communicationStyle: string;
}

interface ParsedProfile {
  role: string;
  resumeSummaryMarkdown: string;
  resumeImprovements: string[];
  persona: ParsedPersona;
  jdGapWarning: {
    text: string;
    strategy: string;
  };
  projects: ParsedProject[];
  missingDataHints: string[];
}

/**
 * 用于将可预期的请求校验错误转成明确的接口返回，避免系统伪造默认数据。
 * @param message 直接返回给前端的错误信息。
 * @param status 对应的 HTTP 状态码。
 */
class ParseRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ParseRequestError";
    this.status = status;
  }
}

/**
 * 将表单字段统一收敛为去首尾空格的文本，避免类型分支散落在主流程里。
 * @param value 表单中的原始字段值。
 * @returns 规范化后的字符串，供解析流程直接使用。
 */
function normalizeTextField(value: FormDataEntryValue | string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 判断上传文件是否属于当前接口可直接提取文本的纯文本类格式。
 * @param file 用户上传的文件对象。
 * @returns 是否可以直接通过 `file.text()` 读取内容。
 */
function isPlainTextResumeFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown") ||
    lowerName.endsWith(".txt")
  );
}

/**
 * 从上传的简历文件中提取真实文本；不支持的格式会直接给出明确提示。
 * @param file 用户上传的简历文件。
 * @returns 可供模型分析的简历正文文本。
 */
async function extractResumeTextFromFile(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // `pdf-parse` 的内部入口没有随包提供类型声明，这里沿用动态导入并显式约束返回结构。
    // @ts-expect-error pdf-parse internal path has no public type declarations.
    const pdfParseModule = (await import("pdf-parse/lib/pdf-parse.js")) as {
      default?: (input: Buffer) => Promise<{ text?: string }>;
    };
    const pdfParse = pdfParseModule.default;

    if (!pdfParse) {
      throw new ParseRequestError("PDF 解析器加载失败，请稍后重试。", 500);
    }

    const pdfData = await pdfParse(buffer);
    return (pdfData.text || "").trim();
  }

  if (isPlainTextResumeFile(file)) {
    return (await file.text()).trim();
  }

  if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) {
    throw new ParseRequestError(
      "暂不支持直接解析 Word 简历，请改传 PDF / Markdown / TXT，或直接粘贴真实简历内容。",
      422
    );
  }

  throw new ParseRequestError(
    "当前仅支持 PDF / Markdown / TXT 简历文件；若使用其他格式，请先转换或直接粘贴简历内容。",
    422
  );
}

/**
 * 将未知输入安全转换为字符串数组，过滤空值后用于画像字段展示。
 * @param value 模型返回的任意字段值。
 * @returns 清洗后的字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 将模型返回的项目列表收敛为稳定结构，防止前端渲染时访问未定义字段。
 * @param value 模型返回的项目列表。
 * @returns 可直接用于确认页展示的项目数组。
 */
function normalizeProjects(value: unknown): ParsedProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: typeof item.name === "string" ? item.name.trim() : "",
      points: typeof item.points === "string" ? item.points.trim() : ""
    }))
    .filter((item) => item.name || item.points);
}

/**
 * 基于模型输出和本地规则生成缺失提示，明确告诉前端哪些关键数据并不存在。
 * @param profile 已规范化的解析结果。
 * @returns 去重后的缺失提示列表。
 */
function buildMissingDataHints(profile: ParsedProfile): string[] {
  const missingHints = [...profile.missingDataHints];
  const hasProjectEvidence = profile.projects.length > 0;
  const hasTechnicalEvidence =
    profile.persona.strengths.length > 0 ||
    Boolean(profile.resumeSummaryMarkdown) ||
    hasProjectEvidence;

  if (!hasTechnicalEvidence) {
    missingHints.push("当前简历中缺少足够的技术基础线索，暂时无法围绕真实技术能力生成可靠问题。");
  }

  if (!hasProjectEvidence) {
    missingHints.push("当前简历中缺少可追问的项目或经历线索，暂时无法围绕真实项目场景生成可靠问题。");
  }

  return Array.from(new Set(missingHints));
}

/**
 * 将模型返回的原始 JSON 收敛为前端稳定结构，并在关键字段缺失时保留明确提示。
 * @param payload 模型返回的原始对象。
 * @returns 已标准化的解析结果。
 */
function normalizeParsedProfile(payload: unknown): ParsedProfile {
  if (!payload || typeof payload !== "object") {
    throw new ParseRequestError("简历解析返回格式异常，请重试。系统不会自动补造简历画像。", 502);
  }

  const raw = payload as Record<string, unknown>;
  const rawPersona =
    raw.persona && typeof raw.persona === "object" ? (raw.persona as Record<string, unknown>) : {};
  const rawJdGapWarning =
    raw.jdGapWarning && typeof raw.jdGapWarning === "object"
      ? (raw.jdGapWarning as Record<string, unknown>)
      : {};

  const profile: ParsedProfile = {
    role: typeof raw.role === "string" ? raw.role.trim() : "",
    resumeSummaryMarkdown:
      typeof raw.resumeSummaryMarkdown === "string" ? raw.resumeSummaryMarkdown.trim() : "",
    resumeImprovements: normalizeStringArray(raw.resumeImprovements),
    persona: {
      seniority: typeof rawPersona.seniority === "string" ? rawPersona.seniority.trim() : "",
      strengths: normalizeStringArray(rawPersona.strengths),
      risks: normalizeStringArray(rawPersona.risks),
      communicationStyle:
        typeof rawPersona.communicationStyle === "string"
          ? rawPersona.communicationStyle.trim()
          : ""
    },
    jdGapWarning: {
      text: typeof rawJdGapWarning.text === "string" ? rawJdGapWarning.text.trim() : "",
      strategy:
        typeof rawJdGapWarning.strategy === "string" ? rawJdGapWarning.strategy.trim() : ""
    },
    projects: normalizeProjects(raw.projects),
    missingDataHints: normalizeStringArray(raw.missingDataHints)
  };

  profile.missingDataHints = buildMissingDataHints(profile);

  return profile;
}

/**
 * 处理简历解析请求，仅基于用户真实提供的简历与 JD 返回结构化画像，不提供假数据兜底。
 * @param req 当前解析接口请求，支持 JSON 与表单上传两种输入。
 * @returns 结构化解析结果，或明确的缺失/失败提示。
 */
export async function POST(req: Request) {
  try {
    const openai = getDeepseekClient();
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
      const fileEntry = formData.get("file");
      const file = fileEntry instanceof File ? fileEntry : null;

      resumeText = normalizeTextField(formData.get("resumeText"));
      jdText = normalizeTextField(formData.get("jdText"));
      targetLevel = normalizeTextField(formData.get("targetLevel"));
      language = normalizeTextField(formData.get("language"));
      focus = normalizeTextField(formData.get("focus"));

      if (file) {
        const extractedResumeText = await extractResumeTextFromFile(file);
        resumeText = [resumeText, extractedResumeText].filter(Boolean).join("\n\n").trim();
      }
    } else {
      const body = (await req.json()) as Record<string, unknown>;
      resumeText = normalizeTextField(typeof body.resumeText === "string" ? body.resumeText : "");
      jdText = normalizeTextField(typeof body.jdText === "string" ? body.jdText : "");
      targetLevel = normalizeTextField(
        typeof body.targetLevel === "string" ? body.targetLevel : ""
      );
      language = normalizeTextField(typeof body.language === "string" ? body.language : "");
      focus = normalizeTextField(typeof body.focus === "string" ? body.focus : "");
    }

    if (!resumeText) {
      throw new ParseRequestError(
        "请先上传可解析的真实简历文件，或直接粘贴完整简历内容后再开始解析。",
        422
      );
    }

    const prompt = `
你是一名严谨的技术面试官和简历分析师。你只能根据候选人真实提供的简历与 JD 生成结果。

请严格遵守以下规则：
1. 绝对不能编造岗位、项目、技能、经历、成果或候选人画像。
2. 信息不足时，对应字段必须返回空字符串或空数组。missingDataHints 只允许写会影响技术判断或后续追问质量的补充提示，不要写年龄、居住地、GPA、排名、离职原因、求职动机等非必要信息。
3. resumeSummaryMarkdown 必须是简短 Markdown 摘要，使用 3-6 条短列表，聚焦真实经历、技术栈、项目证据和求职方向。
4. resumeImprovements 必须返回 2-4 条“简历可优化点”，只基于真实简历内容，聚焦项目表达、技术细节、量化结果、职责边界、亮点证明，不要写空话。
5. persona 只输出可从简历中直接归纳出的候选人画像，不要使用模糊套话。
6. jdGapWarning 只在 JD 与简历之间确实存在缺口时填写；若没有 JD 或无法判断，请留空。
7. projects 最多返回 3 个最值得追问的真实项目；没有就返回空数组。

输入信息：
目标层级：${targetLevel || "未提供"}
面试语言：${language || "未提供"}
训练重点：${focus || "未提供"}

简历正文：
${resumeText}

JD 正文：
${jdText || "未提供"}

你必须返回严格合法的 JSON，不要输出 Markdown 代码块，不要输出额外说明。结构如下：
{
  "role": "本次最匹配的目标岗位，最多 20 个字；无法判断时返回空字符串",
  "resumeSummaryMarkdown": "- 简短摘要 1\\n- 简短摘要 2",
  "resumeImprovements": ["简历可优化点 1", "简历可优化点 2"],
  "persona": {
    "seniority": "候选人经验阶段，如校招 / 1-3年 / 资深；无法判断时返回空字符串",
    "strengths": ["最多 3 条真实优势"],
    "risks": ["最多 3 条需要补足的风险或不确定项"],
    "communicationStyle": "从简历表达中观察到的表达风格或面试呈现特点；无法判断时返回空字符串"
  },
  "jdGapWarning": {
    "text": "与 JD 的主要差距提示，无需 HTML",
    "strategy": "对应的面试应对策略"
  },
  "projects": [
    {
      "name": "项目名称",
      "points": "该项目最值得追问的 1-2 个点"
    }
  ],
  "missingDataHints": ["仅在需要补充技术判断相关信息时给出提示；不要输出年龄、居住地等非必要信息"]
}
`;

    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是一名严谨的技术面试官。只输出 JSON，绝不编造简历信息。"
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    let content = completion.choices[0]?.message?.content || "{}";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let rawResult: unknown;

    try {
      rawResult = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new ParseRequestError(
          "模型返回格式异常，请重试。系统不会自动补造简历画像。",
          502
        );
      }

      rawResult = JSON.parse(jsonMatch[0]);
    }

    const result = normalizeParsedProfile(rawResult);
    const hasTechnicalEvidence =
      result.persona.strengths.length > 0 ||
      Boolean(result.resumeSummaryMarkdown) ||
      result.projects.length > 0;

    if (!hasTechnicalEvidence) {
      throw new ParseRequestError(
        "当前简历缺少足够的技术基础线索，暂时无法生成可靠画像。请补充项目经历或技术细节后重试。",
        422
      );
    }

    if (result.projects.length === 0) {
      throw new ParseRequestError(
        "当前简历缺少可追问的项目或经历线索，暂时无法进入后续面试。请补充真实项目经历后重试。",
        422
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Parse API Error:", error);

    if (error instanceof ParseRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "简历解析失败，请稍后重试。系统不会自动补造缺失信息。" },
      { status: 500 }
    );
  }
}
