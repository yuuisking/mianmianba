import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-8a8b513540294ed0bda785020bb1d269',
  baseURL: 'https://api.deepseek.com/v1',
});

export async function generateTaxonomy(kbId: string, description: string) {
  const prompt = `
Please generate a systematic taxonomy (learning outline) for the topic "${kbId}".
${description ? `Additional context: ${description}` : ''}

The JSON should have the following structure to match our Learning Center UI:
{
  "id": "${kbId}",
  "title": "string (the main title for the knowledge base)",
  "groups": [
    {
      "id": "string (unique group/subject id)",
      "title": "string (display title for the group/subject)",
      "children": [
        {
          "id": "string (unique topic id)",
          "title": "string (display title for the topic)"
        }
      ]
    }
  ]
}

Make sure the taxonomy is logically structured from basic to advanced. Provide an appropriate number of groups and topics for a comprehensive understanding.
Respond ONLY with the JSON. Do not wrap the JSON in markdown blocks (e.g. do not use \`\`\`json). Please use Chinese for the content.
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
    throw new Error('Failed to generate taxonomy');
  }

  try {
    return JSON.parse(content);
  } catch (error: unknown) {
    console.error('Failed to parse JSON:', content, error);
    throw new Error('Failed to parse taxonomy JSON');
  }
}
