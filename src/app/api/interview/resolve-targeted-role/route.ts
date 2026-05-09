import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getDeepseekClient } from "@/lib/ai/deepseek";

type TargetedRoleResolution = {
  role: string;
  topic: string;
  desc: string;
  focus: string;
  needsClarification: boolean;
  clarificationPrompt: string;
};

/**
 * 清洗模型返回的文本字段，避免把空串或异常值继续写入训练上下文。
 * @param value 模型返回的任意字段值。
 * @returns 已裁剪的安全字符串。
 */
function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 归一化专项训练岗位识别结果，确保前端只消费真实推断值或明确的补充提示。
 * @param payload 模型返回的原始 JSON 对象。
 * @param fallbackPrompt 用户原始输入，作为描述字段的真实回退来源。
 * @returns 结构化后的岗位识别结果。
 */
function normalizeResolution(
  payload: unknown,
  fallbackPrompt: string
): TargetedRoleResolution {
  const data =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const role = sanitizeText(data.role);
  const topic = sanitizeText(data.topic);
  const desc = sanitizeText(data.desc) || fallbackPrompt;
  const focus = sanitizeText(data.focus) || topic;
  const clarificationPrompt =
    sanitizeText(data.clarificationPrompt) ||
    "当前只识别到训练主题，但还不能可靠判断目标岗位。请补充更明确的岗位信息，例如“Java 后端开发”“前端工程师”“测试开发”。";
  const needsClarification =
    typeof data.needsClarification === "boolean"
      ? data.needsClarification
      : !role;

  return {
    role,
    topic,
    desc,
    focus,
    needsClarification,
    clarificationPrompt
  };
}

/**
 * 基于用户输入的真实训练诉求推断专项训练岗位，不允许返回任何默认岗位造数。
 * @param request 当前请求对象，正文中需包含用户输入的训练描述。
 * @returns 岗位推断结果；若信息不足则返回明确补充提示。
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      prompt?: unknown;
    } | null;
    const prompt = sanitizeText(body?.prompt);
    if (!prompt) {
      return NextResponse.json(
        { error: "请先输入真实的专项训练诉求。" },
        { status: 400 }
      );
    }

    const openai = getDeepseekClient();
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是专项训练岗位提取器。你只能根据用户原话做最保守的岗位判断，严禁编造默认岗位。

请输出 JSON，字段必须包含：
- role: 目标岗位名称；如果无法可靠判断，必须返回空字符串
- topic: 本次训练主题，尽量短，例如“JVM”“系统设计”“项目表达”
- desc: 用户本次训练目标的简短描述
- focus: 本次应重点追问的训练点
- needsClarification: 是否仍需要用户补充岗位信息
- clarificationPrompt: 若需要补充岗位信息，应如何提示用户

规则：
1. 只能根据用户原话推断，不能补造不存在的岗位经历。
2. 如果用户只给出了知识点，比如“JVM”“Redis”“微服务排障”，可以结合常见职业语境做保守推断；只有在把握不足时才返回空 role。
3. 即便推断出了岗位，也不要夸大到具体公司、职级或技术栈。
4. 绝不能输出“开发工程师”“工程师”等泛化默认岗位作为兜底。`
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const rawContent = completion.choices[0]?.message?.content || "{}";
    const resolution = normalizeResolution(JSON.parse(rawContent), prompt);

    return NextResponse.json({ data: resolution });
  } catch (error) {
    console.error("Failed to resolve targeted role", error);
    return NextResponse.json(
      {
        error:
          "专项训练岗位识别暂时不可用，请补充更明确的岗位信息后重试。"
      },
      { status: 500 }
    );
  }
}
