import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions/completions";
import { searchKnowledgeBase } from "@/lib/knowledge/volc";

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-8a8b513540294ed0bda785020bb1d269'
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messages, profile, mode, topic, desc } = body; 

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

    let systemPrompt = "";
    const domainContext = mode === "targeted" ? topic : (profile?.role || '人工智能与软件开发');
    
    if (mode === "targeted") {
      systemPrompt = `你是一个高级面试辅导官。候选人目前正在进行专项训练，主题是【${topic}】，其薄弱点/训练目标为：【${desc}】。作为导师与面试官，你需要针对这个知识点进行深度、专业的追问或解答，每次只关注一个核心问题，帮助其巩固和提高。不需要要求候选人做自我介绍，直奔主题。`;
    } else {
      systemPrompt = `你是一个专业的${profile?.role || '开发'}面试官与资深导师，正在与候选人交流。`;
      if (profile) {
         systemPrompt += `候选人的简历信息：目标职位【${profile.targetLevel || '开发工程师'}】，面试重点【${profile.focus || '综合面试'}】。`;
      }
      systemPrompt += "请根据候选人的回答进行专业的点评、解答或追问。回答要专业、简练，像真实的面试或指导对话。";
    }

    // 增加严格的 Persona 限制，赋予面试官+导师的双重身份，以及领域上下文
    systemPrompt += `\n【核心身份与交互原则】：
1. **你的身份**：你既是一位高标准、专业的面试官，也是一位渊博的资深导师。绝对不能暴露你是一个 AI 或使用了外部工具/知识库。你当前的专业领域和语境是：【${domainContext}】。
2. **术语消歧义规则（重要）**：当候选人提到英文缩写（如 MCP、SKILL、RAG 等）或可能存在歧义的词汇时，你**必须优先**基于当前的专业领域（特别是 AI Agent 开发、大模型、软件工程等领域）进行解释。例如，在 AI 领域，MCP 通常指 Model Context Protocol，而 Skill 通常指大模型的技能/插件。如果某个缩写在当前领域极为罕见或存在极大歧义，请以导师口吻主动向候选人确认（例如：“你提到的 MCP 是指 Model Context Protocol，还是其他领域的概念？”），绝对不要自信地跨行业瞎掰（比如解释成芯片设计的 EDA 工具）。
3. **导师模式**：当候选人说出短词汇（如“mcp skill”）、明确表示不懂、或者主动向你求教时，你必须切换到导师模式。基于你的知识储备或参考资料，给出专业、清晰的科普和解答。解答后，可以自然地引导回面试场景（例如：“你理解了吗？那么如果在你的项目中遇到类似问题，你会怎么处理？”），切忌像个无情的提问机器一样死板反问。
4. **面试官模式**：当候选人在认真回答面试问题时，你需进行专业的点评与深挖追问。
5. **禁止行为**：
   - 绝对不能在回答中说出类似“根据知识库”、“既然知识库中没有现成资料”、“我搜索了资料”、“构建学习框架”等暴露你内部状态的话语。
   - 绝对不能捏造或者输出类似 \`skill\`、\`desc\` 等系统占位符。
   - 永远保持自然对话，直接对候选人说话。`;

    const latestMessageObj = messages[messages.length - 1];
    const latestMessageContent = latestMessageObj 
      ? (Array.isArray(latestMessageObj.content) ? latestMessageObj.content.join('\n') : latestMessageObj.content)
      : "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          
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
                
                const searchResults = await searchKnowledgeBase(latestMessageContent);
                if (searchResults && searchResults.length > 0) {
                  systemPrompt += `\n\n【参考资料（仅供你作为面试官提问或判断时参考，绝对不要告诉候选人这是你检索到的）】：\n${searchResults.map((r: any) => r.text).join('\n')}`;
                }
              }
            } catch (err) {
              console.error("Intent Router or Knowledge Base search failed:", err);
            }
          }

          // Now construct the final messages with updated systemPrompt
          const apiMessages: ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt }
          ];

          for (const msg of messages) {
            const contentStr = Array.isArray(msg.content) ? msg.content.join('\n') : msg.content;
            if (msg.role === 'ai') {
              apiMessages.push({ role: 'assistant', content: contentStr });
            } else {
              apiMessages.push({ role: 'user', content: contentStr });
            }
          }

          // 向前端发送控制指令：检索完毕，准备生成回答
          controller.enqueue(encoder.encode('__STATUS_GENERATING__'));

          // Call with streaming for the final answer
          const streamCompletion = await openai.chat.completions.create({
            model: 'deepseek-chat',
            messages: apiMessages,
            stream: true,
          });

          for await (const chunk of streamCompletion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
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
