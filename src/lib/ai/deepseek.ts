import OpenAI from "openai";

let deepseekClient: OpenAI | null = null;

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
