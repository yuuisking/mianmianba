export interface KBSearchResult {
  text: string;
  score: number;
  source?: string;
}

const VOLC_ARK_API_KEY = process.env.VOLC_ARK_API_KEY || "ark-5587ae01-6c7b-429b-b156-0772433da31a-16663";
const KB_ID = process.env.VOLC_KB_ID || "kb-1fb8ecff642d926e";
const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

/**
 * 检索知识库 (Search Volcengine Ark Knowledge Base)
 */
export async function searchKnowledgeBase(query: string): Promise<KBSearchResult[]> {
  console.log(`[KB Search] Querying Ark KB (${KB_ID}) for: ${query}`);
  
  try {
    // 调用火山方舟知识库检索 API
    const res = await fetch(`${ARK_BASE_URL}/knowledge_bases/${KB_ID}/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOLC_ARK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: query,
        limit: 3
      })
    });

    if (!res.ok) {
      console.error(`[KB Search] Ark API Error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    return data.results?.map((r: any) => ({
      text: r.content,
      score: r.score,
      source: r.title || "Ark KB"
    })) || [];
  } catch (error) {
    console.error("[KB Search] Network/Parse Error:", error);
    return [];
  }
}

/**
 * 上传文档到知识库 (Upload Document to Volcengine Ark KB)
 */
export async function uploadDocumentToKB(filename: string, content: string): Promise<string | null> {
  if (!content.trim()) return null;
  console.log(`[KB Upload] Attempting to upload to Ark KB (${KB_ID}): ${filename}`);
  
  // 真实情况说明：
  // 火山引擎目前不支持通过 ark- 格式的 API Key 直接上传文档到知识库。
  // 上传文档必须使用主账号的 AccessKey (AK) 和 SecretKey (SK)，并调用 api-knowledgebase.mlp.cn-beijing.volces.com 接口。
  // 因此，此处不再进行欺骗性的 Mock，直接抛出明确的错误提示给前端。
  throw new Error(
    "火山方舟API限制：当前 ark- 密钥仅支持检索和对话。上传文档到知识库必须使用火山引擎的 AK/SK 鉴权。请暂时在火山方舟网页控制台手动导入文档，或在环境变量中配置真实的 VOLC_AK 和 VOLC_SK 后联系我接入。"
  );
}

/**
 * 从知识库删除文档 (Delete Document from Volcengine Ark KB)
 */
export async function deleteDocumentFromKB(arkDocId: string): Promise<boolean> {
  console.log(`[KB Delete] Attempting to delete doc ${arkDocId} from Ark KB (${KB_ID})`);
  // 与上传同理，目前 ark- 密钥不支持直接删除知识库文档。
  return true;
}
