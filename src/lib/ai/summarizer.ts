import { getDeepseekClient } from "./deepseek";

export async function summarizeDocument(text: string, existingContent?: string) {
  const openai = getDeepseekClient();
  let rawText = text;

  // Check if text is a URL
  if (text.trim().startsWith('http://') || text.trim().startsWith('https://')) {
    try {
      const response = await fetch(text.trim());
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }
      const html = await response.text();
      // Simple HTML to text extraction using regex
      rawText = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (e) {
      console.error('Error fetching URL:', e);
      throw new Error('Failed to fetch and extract text from URL');
    }
  }

const mergeInstructions = existingContent 
    ? `
ADDITIONAL CRITICAL REQUIREMENT (MERGE MODE):
You have been provided with the "Existing Content" of this topic. 
Your task is to MERGE the knowledge from the "Raw Text" into the "Existing Content".
- DO NOT lose the original depth, key points, or structure of the Existing Content.
- Integrate the new information from the Raw Text smoothly into the appropriate sections.
- If the Raw Text contains new concepts, add them; if it expands on existing concepts, enrich them.
- Keep the exact same JSON structure requested above.

Existing Content:
${existingContent}
` 
    : "";

  const prompt = `
Please summarize the following raw text into a structured JSON format.
The JSON should have the following structure to match our Learning Center UI:
{
  "topic": "string (the main topic name)",
  "content": {
    "quickFacts": [
      { "k": "string (short key, e.g., '一句话')", "v": "string (value)" },
      { "k": "string", "v": "string" }
    ],
    "sections": [
      {
        "id": "string (unique section id)",
        "h2": "string (section heading)",
        "paragraphs": ["string", "string"],
        "bullets": ["string", "string"],
        "callout": "string (optional, a tip or important note)"
      }
    ]
  }
}

CRITICAL REQUIREMENT:
You MUST include exactly the following sections in the "sections" array (the "h2" field MUST match these exactly):
1. "核心摘要" (Core Summary)
2. "深度图解 (Mermaid)" (In-depth Diagram using Mermaid)
3. "底层原理剖析" (Underlying Principle Analysis)
4. "高频面试题" (High-frequency Interview Questions)

For the "深度图解 (Mermaid)" section, you MUST provide a valid Mermaid chart (e.g., flowchart, sequence diagram, etc.) to visualize the core concepts. The Mermaid code MUST be wrapped in a markdown code block with the language "mermaid" (e.g. \`\`\`mermaid\n...\n\`\`\`), and placed inside one of the "paragraphs" or "bullets" of that section.
${mergeInstructions}

Raw Text:
${rawText.slice(0, 15000)} // Limit to avoid context length issues

Respond ONLY with the JSON. Do not wrap the JSON in markdown blocks (e.g. do not use \`\`\`json). The text inside the JSON values CAN and SHOULD use markdown formatting (like **bold**, \`inline code\`, and \`\`\`language code blocks\`\`\`) to preserve code snippets and readability. Please use Chinese for the content.
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
    throw new Error('Failed to generate summary');
  }

  try {
    return JSON.parse(content);
  } catch (error: unknown) {
    console.error('Failed to parse JSON:', content, error);
    throw new Error('Failed to parse summary JSON');
  }
}
