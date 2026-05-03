import { NextResponse } from 'next/server';
import { uploadDocumentToKB } from '@/lib/knowledge/volc';

// 合规白名单配置
const ALLOWED_SOURCES = [
  "https://raw.githubusercontent.com/fe-interview/react-questions/main/README.md",
  "https://raw.githubusercontent.com/anthropic/mcp-docs/main/README.md"
];

export async function GET(req: Request) {
  try {
    // Vercel Cron Auth check (optional, depending on setup)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const url of ALLOWED_SOURCES) {
      try {
        console.log(`[Spider] Fetching from whitelist URL: ${url}`);
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`Failed to fetch: ${res.statusText}`);
        }

        const text = await res.text();
        // 提取文件名
        const filename = url.split('/').pop() || `spider-${Date.now()}.md`;
        
        // 调用合规知识库上传接口
        const uploadResult = await uploadDocumentToKB(`auto-${filename}`, text);
        
        if (uploadResult) {
          successCount++;
        }
      } catch (err: any) {
        console.error(`[Spider] Error fetching ${url}:`, err.message);
        errors.push(`${url}: ${err.message}`);
      }
    }

    return NextResponse.json({
      message: `Spider cron job finished`,
      successCount,
      errors
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
