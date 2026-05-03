import { NextResponse } from "next/server";
import { summarizeDocument } from "@/lib/ai/summarizer";
import { routeContent } from "@/lib/ai/router";
import { learningDb } from "@/lib/db/learningDb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

// GitHub 树状结构 API 返回项的类型
type GitHubTreeItem = {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const isAdmin =
      session?.user?.email?.toLowerCase().includes("admin") ||
      session?.user?.name?.toLowerCase().includes("admin");

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      kbId?: unknown;
      githubUrl?: unknown;
      limit?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const githubUrl = typeof body.githubUrl === "string" ? body.githubUrl.trim() : "";
    const limit = typeof body.limit === "number" ? body.limit : 0;

    if (!kbId || !githubUrl) {
      return NextResponse.json({ error: "Missing required fields: kbId, githubUrl" }, { status: 400 });
    }

    // 1. 解析 GitHub URL (形如 https://github.com/owner/repo/tree/branch/path)
    const match = githubUrl.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/);
    if (!match) {
      return NextResponse.json({ error: "无效的 GitHub 目录 URL。格式应为: https://github.com/owner/repo/tree/branch/path" }, { status: 400 });
    }

    const [, owner, repo, branch, dirPath] = match;

    // 2. 获取仓库文件树
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(treeUrl);
    if (!res.ok) {
       return NextResponse.json({ error: `获取仓库树失败: ${res.status} ${res.statusText}` }, { status: 500 });
    }

    const data = await res.json();
    let files = data.tree.filter((item: GitHubTreeItem) => 
      item.type === "blob" && 
      item.path.startsWith(dirPath + "/") && 
      item.path.endsWith(".md")
    ) as GitHubTreeItem[];

    if (files.length === 0) {
      return NextResponse.json({ error: "未找到任何 Markdown 文件" }, { status: 404 });
    }

    if (limit > 0) {
      files = files.slice(0, limit);
    }

    // 3. 确保知识库存在
    const dbData = learningDb.getLearningData();
    let kb = dbData.kbs.find(k => k.id === kbId);
    if (!kb) {
      learningDb.createKb({
        id: kbId,
        name: kbId.toUpperCase() + " 知识库",
        subtitle: "自动导入的体系化知识库",
        tags: ["GitHub导入", "自动生成"],
        updatedAt: new Date().toISOString().split("T")[0],
        stats: { topics: 0, paths: 0 }
      });
    }

    // 此接口由于是在网页上被调用，如果文件太多可能会超时 (Next.js Edge Runtime / Serverless timeout)。
    // 这里我们为了演示，直接同步处理。生产环境中，大批量导入建议使用后台队列或上面的脚本。
    
    // 返回一个 ReadableStream 来流式输出处理进度给前端
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const sendMsg = (msg: string) => {
          controller.enqueue(encoder.encode(JSON.stringify({ message: msg }) + "\n"));
        };

        sendMsg(`📦 开始解析仓库: ${owner}/${repo} 分支: ${branch} 目录: ${dirPath}`);
        sendMsg(`📄 找到 ${files.length} 个 Markdown 文件。${limit > 0 ? `(限制处理前 ${limit} 个)` : ''}`);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const relativePath = file.path.substring(dirPath.length + 1);
          const parts = relativePath.split("/");
          
          let subjectName = "默认分类";
          let fileName = relativePath;
          
          if (parts.length > 1) {
            subjectName = parts[0]; 
            fileName = parts[parts.length - 1];
          } else {
            fileName = parts[0];
          }

          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
          sendMsg(`\n[${i + 1}/${files.length}] 正在处理: [${subjectName}] ${fileName}...`);

          try {
            const rawRes = await fetch(rawUrl);
            if (!rawRes.ok) throw new Error(`Fetch failed: ${rawRes.status}`);
            const markdown = await rawRes.text();

            if (markdown.length < 50) {
              sendMsg(`   ⏭️ 文件内容太短，跳过。`);
              continue;
            }

            sendMsg(`   🧠 正在调用 AI 路由引擎确定分类与主题...`);
            const currentDbData = learningDb.getLearningData();
            const title = fileName.replace(".md", "");
            const kbTree = currentDbData.trees[kbId] || { groups: [] };
            const routeRes = await routeContent(title, markdown.slice(0, 500), kbTree);
            subjectName = routeRes.subject;
            const topicName = routeRes.topic;
            
            sendMsg(`   🔀 路由结果: 分类=[${subjectName}], 主题=[${topicName}]`);
            
            let topicId = "";
            // 查找是否已存在同名 topic
            if (currentDbData.contents[kbId]) {
              for (const [id, content] of Object.entries(currentDbData.contents[kbId])) {
                if (content.title === topicName) {
                  topicId = id;
                  break;
                }
              }
            }
            
            if (!topicId) {
              // 如果没有找到同名 topic，则生成一个安全的 ID
              const safeTopic = encodeURIComponent(topicName.trim()).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
              topicId = safeTopic || Date.now().toString();
            }
            
            let existingContentStr: string | undefined = undefined;
            const existingContentObj = currentDbData.contents[kbId]?.[topicId];
            if (existingContentObj) {
              existingContentStr = JSON.stringify(existingContentObj, null, 2);
              sendMsg(`   🔄 发现已有内容，将进行知识融合...`);
            }

            sendMsg(`   🧠 正在调用 AI 归纳引擎...`);
            const summary = await summarizeDocument(markdown, existingContentStr);

            learningDb.ensureSubject(kbId, subjectName);
            learningDb.addContent(kbId, subjectName, topicId, {
              title: summary.topic || topicName,
              breadcrumb: [kbId, subjectName],
              quickFacts: summary.content?.quickFacts || [],
              sections: summary.content?.sections || []
            });

            sendMsg(`   ✅ 成功入库！提取主题: ${summary.topic}`);
            successCount++;
          } catch (err: any) {
            sendMsg(`   ❌ 处理失败: ${err.message}`);
            failCount++;
          }
          
          // 防止 API 限流
          await new Promise(r => setTimeout(r, 2000));
        }

        sendMsg(`\n🎉 批量导入完成！成功: ${successCount}, 失败/跳过: ${files.length - successCount}`);
        sendMsg(`__DONE__`);
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
