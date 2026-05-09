import { config } from "dotenv";
import path from "path";

// 强制加载 .env.local 和 .env，确保大模型 API Key 存在
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

import { learningDb } from "../src/lib/db/learningDb";
import { summarizeDocument } from "../src/lib/ai/summarizer";
import { routeContent } from "../src/lib/ai/router";

type GitHubTreeEntry = {
  path: string;
  type: string;
};

type GitHubTreeResponse = {
  tree?: GitHubTreeEntry[];
};

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("用法: npx tsx scripts/import-github.ts <kbId> <githubDirUrl> [limit]");
    console.error("示例: npx tsx scripts/import-github.ts java https://github.com/Snailclimb/JavaGuide/tree/main/docs/java");
    process.exit(1);
  }

  const kbId = args[0];
  const githubUrl = args[1];
  const limit = args[2] ? parseInt(args[2], 10) : 0; // 0 表示不限制

  // 1. 解析 GitHub URL (形如 https://github.com/owner/repo/tree/branch/path)
  const match = githubUrl.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/);
  if (!match) {
    console.error("❌ 无效的 GitHub 目录 URL。格式应为: https://github.com/owner/repo/tree/branch/path");
    process.exit(1);
  }

  const [, owner, repo, branch, dirPath] = match;
  console.log(`\n📦 开始解析仓库: ${owner}/${repo} 分支: ${branch} 目录: ${dirPath}\n`);

  // 2. 获取仓库文件树
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(treeUrl);
  if (!res.ok) {
    console.error(`❌ 获取仓库树失败: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = (await res.json()) as GitHubTreeResponse;
  let files = (data.tree ?? []).filter((item) =>
    item.type === "blob" && 
    item.path.startsWith(dirPath + "/") && 
    item.path.endsWith(".md")
  );

  console.log(`📄 找到 ${files.length} 个 Markdown 文件。`);
  
  if (limit > 0) {
    console.log(`⏱️ 限制模式：只处理前 ${limit} 个文件。`);
    files = files.slice(0, limit);
  }

  // 3. 确保知识库存在
  const dbData = learningDb.getLearningData();
  const kb = dbData.kbs.find((item) => item.id === kbId);
  if (!kb) {
    learningDb.createKb({
      id: kbId,
      name: kbId.toUpperCase() + " 知识库",
      subtitle: "自动导入的体系化知识库",
      tags: ["GitHub导入", "自动生成"],
      updatedAt: new Date().toISOString().split("T")[0],
      stats: { topics: 0, paths: 0 },
    });
  }

  // 4. 逐个处理文件（串行处理以防触发大模型并发限制）
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // 去除前缀，提取相对路径 (例如 docs/java/basis/foo.md -> basis/foo.md)
    const relativePath = file.path.substring(dirPath.length + 1);
    const parts = relativePath.split("/");
    
    let subjectName = "默认分类";
    let fileName = relativePath;
    
    if (parts.length > 1) {
      subjectName = parts[0]; // 取第一级目录作为分类，例如 "basis"
      fileName = parts[parts.length - 1];
    } else {
      fileName = parts[0];
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
    console.log(`\n[${i + 1}/${files.length}] 正在处理分类 [${subjectName}] 的文件: ${fileName}...`);

    try {
      const rawRes = await fetch(rawUrl);
      if (!rawRes.ok) throw new Error(`Fetch failed: ${rawRes.status}`);
      const markdown = await rawRes.text();

      // 跳过太短的无意义文件
      if (markdown.length < 50) {
        console.log(`   ⏭️ 文件内容太短，跳过。`);
        continue;
      }

      console.log(`   🧠 正在调用 AI 路由引擎确定分类与主题...`);
      // 先判断分类和主题
      const currentDbData = learningDb.getLearningData();
      const title = fileName.replace(".md", "");
      const kbTree = currentDbData.trees[kbId] || { groups: [] };
      const routeRes = await routeContent(title, markdown.slice(0, 500), kbTree);
      subjectName = routeRes.subject;
      const topicName = routeRes.topic;
      
      console.log(`   🔀 路由结果: 分类=[${subjectName}], 主题=[${topicName}]`);
      
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
      
      // 判断是否有旧内容
      let existingContentStr: string | undefined = undefined;
      const existingContentObj = currentDbData.contents[kbId]?.[topicId];
      if (existingContentObj) {
        existingContentStr = JSON.stringify(existingContentObj, null, 2);
        console.log(`   🔄 发现已有内容，将进行知识融合...`);
      }

      console.log(`   🧠 正在调用 AI 归纳引擎解析并提取大纲...`);
      // 传递文本给大模型（自动截断防超长在 summarizer 中已处理），如果存在则传入 existingContent
      const summary = await summarizeDocument(markdown, existingContentStr);

      // 智能追加分类与主题
      learningDb.ensureSubject(kbId, subjectName);
      learningDb.addContent(kbId, subjectName, topicId, {
        title: summary.topic || topicName,
        breadcrumb: [kbId, subjectName],
        quickFacts: summary.content?.quickFacts || [],
        sections: summary.content?.sections || []
      });

      console.log(`   ✅ 成功入库！提取主题: ${summary.topic}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`   ❌ 处理失败: ${message}`);
    }
    
    // 适当延时，防止 DeepSeek API 限流
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`\n🎉 全部 ${files.length} 个文件处理完成！请返回网页刷新学习中心查看最新生成的体系树。`);
}

main();
