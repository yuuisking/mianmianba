import { getDeepseekClient } from "./deepseek";

export async function routeContent(title: string, summary: string, kbTree: any): Promise<{ subject: string; topic: string }> {
  const openai = getDeepseekClient();
  const prompt = `
You are an intelligent knowledge base router. Your task is to categorize a new article into an existing knowledge base tree, or create a suitable new category/topic if it doesn't fit anywhere.

Here is the current knowledge base outline (TreeData):
${JSON.stringify(kbTree, null, 2)}

Here is the new article information:
Title: ${title}
Summary: ${summary}

Based on the above information, determine the most appropriate "subject" (category ID or name) and "topic" (topic ID or name) for this article.
If the article perfectly matches an existing subject and topic, return their exact names.
If the article fits an existing subject but needs a new topic, return the existing subject and a newly generated, suitable topic name.
If the article doesn't fit any existing subject, generate a suitable new subject name and a new topic name.

Respond ONLY with a JSON object in the following format. Do not include markdown blocks like \`\`\`json.
{
  "subject": "string (the determined subject)",
  "topic": "string (the determined topic)"
}
  `;

  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that outputs JSON only.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Failed to generate routing decision');
  }

  try {
    return JSON.parse(content);
  } catch (error: unknown) {
    console.error('Failed to parse routing JSON:', content, error);
    throw new Error('Failed to parse routing JSON');
  }
}
