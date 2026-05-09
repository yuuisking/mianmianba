import OpenAI from "openai";

let deepseekClient: OpenAI | null = null;

type CallDeepSeekOptions = {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
};

/**
 * 让当前线程等待指定毫秒数，供模型重试退避复用。
 * @param {number} ms 等待时长，单位毫秒。
 * @returns {Promise<void>} 等待结束。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断 DeepSeek 调用失败是否值得重试，避免把明显的参数错误或鉴权错误反复放大。
 * @param {unknown} error 任意异常对象。
 * @returns {boolean} 是否建议重试。
 */
function isRetryableDeepSeekError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    status?: number;
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };

  if (record.status === 408 || record.status === 409 || record.status === 429) {
    return true;
  }

  if (typeof record.status === "number" && record.status >= 500) {
    return true;
  }

  const code = record.code ?? record.cause?.code ?? "";
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return true;
  }

  const message = `${record.message ?? ""} ${record.cause?.message ?? ""}`.toLowerCase();
  return message.includes("timeout") || message.includes("timed out") || message.includes("socket hang up");
}

/**
 * 为模型调用增加超时控制，避免上游长时间挂起拖垮训练接口。
 * @param {Promise<string>} task 实际模型请求。
 * @param {number} timeoutMs 超时时间，单位毫秒。
 * @returns {Promise<string>} 模型返回文本。
 */
async function withTimeout(task: Promise<string>, timeoutMs: number): Promise<string> {
  return await Promise.race([
    task,
    new Promise<string>((_, reject) => {
      const timeoutError = new Error(`DeepSeek timeout after ${timeoutMs}ms`);
      (timeoutError as Error & { code?: string }).code = "MODEL_TIMEOUT";
      setTimeout(() => reject(timeoutError), timeoutMs);
    }),
  ]);
}

/**
 * Return a singleton DeepSeek client backed only by environment configuration.
 * Throws immediately when the API key is missing so runtime failures are explicit.
 */
export function getDeepseekClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
  }

  return deepseekClient;
}

/**
 * 调用 DeepSeek API 进行文本生成。
 * @param options 生成选项。
 * @returns 生成的文本内容。
 */
export async function callDeepSeek(options: {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<string> {
  const client = getDeepseekClient();
  const timeoutMs = options.timeoutMs ?? 18_000;
  const maxRetries = options.maxRetries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 600;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await withTimeout(
        client.chat.completions
          .create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: options.prompt }],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 4096,
          })
          .then((result) => result.choices[0]?.message?.content ?? ""),
        timeoutMs
      );

      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableDeepSeekError(error)) {
        throw error;
      }

      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("DeepSeek 调用失败");
}
