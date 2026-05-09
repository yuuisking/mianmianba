import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions/completions";
import { searchKnowledgeBase } from "@/lib/knowledge/volc";
import { getDeepseekClient } from "@/lib/ai/deepseek";
import { buildInterviewSystemPrompt } from "@/lib/interview/prompt";

/**
 * 将面试消息内容归一化为单段纯文本，避免数组格式在多处重复处理。
 * @param message 原始消息对象。
 * @returns 可直接发送给模型的文本内容。
 */
function flattenMessageContent(message: {
  content: string[] | string;
}): string {
  return Array.isArray(message.content) ? message.content.join("\n") : message.content;
}

type StreamedDeltaChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
};

/**
 * 将系统提示词与历史消息统一拼成可直接发送给模型的消息数组。
 * @param systemPrompt 当前轮次最终生效的系统提示词。
 * @param messages 当前房间历史消息。
 * @returns 发送给模型的完整消息数组。
 */
function buildApiMessages(
  systemPrompt: string,
  messages: Array<{ role: string; content: string[] | string }>
): ChatCompletionMessageParam[] {
  const apiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt }
  ];

  for (const msg of messages) {
    const contentStr = flattenMessageContent(msg);
    apiMessages.push({
      role: msg.role === "ai" ? "assistant" : "user",
      content: contentStr
    });
  }

  return apiMessages;
}

/**
 * 将大模型返回的 token 增量转发给前端，确保文字面试与专项训练都是真正流式输出。
 * @param apiMessages 发送给模型的消息数组。
 * @param controller 当前响应流控制器。
 * @param encoder 文本编码器。
 */
async function pipeInterviewReplyStream(
  apiMessages: ChatCompletionMessageParam[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): Promise<void> {
  const openai = getDeepseekClient();
  const stream = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: apiMessages,
    stream: true
  });

  for await (const chunk of stream as AsyncIterable<StreamedDeltaChunk>) {
    const deltaText = chunk.choices?.[0]?.delta?.content;
    if (typeof deltaText === "string" && deltaText) {
      controller.enqueue(encoder.encode(deltaText));
    }
  }
}

/**
 * 处理面试房间聊天请求，并基于用户已确认的真实画像构造面试上下文。
 * @param request 当前聊天接口请求。
 * @returns 面试官流式回复，或明确的错误信息。
 */
export async function POST(request: Request) {
  try {
    const openai = getDeepseekClient();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      messages,
      profile,
      mode,
      topic,
      desc,
      questionLimit,
      durationLimitMinutes,
      completedRounds
    } = body;

    // Check for new session daily limit
    const cookieStore = await cookies();
    const today = new Date().toISOString().split('T')[0];
    const sessionCookieName = `sessions_${today}`;
    
    let sessionCount = parseInt(cookieStore.get(sessionCookieName)?.value || "0");

    // Consider it a new session if it's the first user reply (length == 2)
    // AI sends 1st message, user sends 1st reply -> messages.length === 2
    if (messages.length === 2) {
      if (sessionCount >= 999) {
        return NextResponse.json(
          { error: "今日面试次数已达上限（超过999次），请明天再来挑战！" },
          { status: 403 }
        );
      }
      // Increment session count
      sessionCount += 1;
    } else if (messages.length > 2) {
      // If they somehow bypass and try to continue when they already exceeded
      if (sessionCount > 999) {
         return NextResponse.json(
          { error: "今日面试次数已达上限（超过999次），请明天再来挑战！" },
          { status: 403 }
        );
      }
    }

    const resolvedRole =
      typeof profile?.role === "string" && profile.role.trim()
        ? profile.role.trim()
        : "";
    const domainContext =
      mode === "targeted"
        ? topic || desc || resolvedRole || "专项训练上下文"
        : resolvedRole || "候选人真实简历上下文";

    const latestMessageObj = messages[messages.length - 1];
    const latestMessageContent = latestMessageObj
      ? flattenMessageContent(latestMessageObj)
      : "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          let systemPrompt = "";
          let searchResults: Array<{ text?: string }> = [];
          
          // Before starting the final LLM stream, let's run the intent router.
          let routerResult = { needs_search: false };
          if (latestMessageContent) {
            try {
              const routerPrompt = `你是一个意图识别引擎。当前用户的面试岗位与领域上下文是：【${domainContext}】。
请判断用户的最新回复是否需要从外部知识库中检索信息（例如：包含不懂的最新技术名词、特定的专业术语、候选人主动提问求教，或者你需要为面试获取高质量的面试题等）。
注意：请基于该岗位的领域上下文（尤其是 AI、LLM 等现代技术栈）去理解用户的输入，如果涉及领域内的专有名词，应优先判定为需要检索。
请以 JSON 格式返回，包含一个布尔类型的字段 "needs_search"。例如：{"needs_search": true}`;

              const routerResponse = await openai.chat.completions.create({
                model: 'deepseek-chat',
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: routerPrompt },
                  { role: "user", content: latestMessageContent }
                ]
              });

              routerResult = JSON.parse(routerResponse.choices[0].message.content || '{"needs_search": false}');
              
              if (routerResult.needs_search) {
                // 向前端发送控制指令：开始检索
                controller.enqueue(encoder.encode('__STATUS_SEARCHING__'));
                
                searchResults = await searchKnowledgeBase(latestMessageContent);
                const promptPayload = buildInterviewSystemPrompt({
                  messages,
                  profile,
                  mode,
                  topic,
                  desc,
                  questionLimit,
                  durationLimitMinutes,
                  completedRounds,
                  searchResults
                });
                systemPrompt = promptPayload.systemPrompt;
              }
            } catch (err) {
              console.error("Intent Router or Knowledge Base search failed:", err);
            }
          }

          if (!systemPrompt) {
            const promptPayload = buildInterviewSystemPrompt({
              messages,
              profile,
              mode,
              topic,
              desc,
              questionLimit,
              durationLimitMinutes,
              completedRounds,
              searchResults: []
            });
            systemPrompt = promptPayload.systemPrompt;
          }

          const apiMessages = buildApiMessages(
            systemPrompt,
            messages as Array<{ role: string; content: string[] | string }>
          );

          // 向前端发送控制指令：检索完毕，准备生成回答
          controller.enqueue(encoder.encode('__STATUS_GENERATING__'));
          await pipeInterviewReplyStream(apiMessages, controller, encoder);
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    if (messages.length === 2) {
      headers.set('Set-Cookie', `${sessionCookieName}=${sessionCount}; Max-Age=${60 * 60 * 24}; Path=/`);
    }

    return new Response(stream, { headers });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
