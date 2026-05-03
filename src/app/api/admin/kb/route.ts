import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { deleteDocumentFromKB, uploadDocumentToKB } from '@/lib/knowledge/volc';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.email !== "admin@resumer.com") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const docs = await prisma.knowledgeDocument.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        size: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      data: docs.map((d) => ({
        id: d.id,
        name: d.name,
        size: d.size,
        status: d.status,
        uploadTime: d.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.email !== "admin@resumer.com") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const textContent = formData.get("textContent") as string;
    const filename = formData.get("filename") as string;
    const githubUrl = formData.get("githubUrl") as string;

    let createdCount = 0;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Duplicate check for file upload
      const existing = await prisma.knowledgeDocument.findFirst({
        where: { userId: session.user.id, name: file.name, sourceType: 'file' }
      });
      if (existing) {
        return NextResponse.json({ error: "该文件已存在，请勿重复上传" }, { status: 400 });
      }

      const arkDocId = await uploadDocumentToKB(file.name, buffer.toString('utf-8'));
      if (!arkDocId) return NextResponse.json({ error: "Upload to KB failed" }, { status: 500 });

      await prisma.knowledgeDocument.create({
        data: {
          userId: session.user.id,
          name: file.name,
          sourceType: 'file',
          size: buffer.length,
          status: 'ready',
          arkDocId: arkDocId,
        },
      });
      createdCount = 1;
    } else if (textContent && filename) {
      const arkDocId = await uploadDocumentToKB(filename, textContent);
      if (!arkDocId) return NextResponse.json({ error: "Upload to KB failed" }, { status: 500 });

      await prisma.knowledgeDocument.create({
        data: {
          userId: session.user.id,
          name: filename,
          sourceType: 'text',
          size: Buffer.byteLength(textContent, 'utf8'),
          status: 'ready',
          arkDocId: arkDocId,
        },
      });
      createdCount = 1;
    } else if (githubUrl) {
      let fetchUrl = githubUrl.replace(/\/$/, ''); // remove trailing slash
      
      // 1. Handle full repository URL (e.g., https://github.com/user/repo)
      const repoMatch = fetchUrl.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)$/);
      if (repoMatch) {
        const owner = repoMatch[1];
        const repo = repoMatch[2];
        
        // Fetch default branch
        const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (!repoInfoRes.ok) throw new Error(`GitHub Repo not found or rate limited: ${repoInfoRes.statusText}`);
        const repoInfo = (await repoInfoRes.json()) as { default_branch?: string };
        const defaultBranch = repoInfo.default_branch || 'main';

        // Fetch tree recursively
        const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
        const treeData = (await treeRes.json()) as { tree?: Array<{ type: string; path: string }> };
        if (!treeData.tree) throw new Error("Failed to fetch repo tree");

        // Filter MD/TXT files (limit to top 20 to avoid timeouts in Vercel/Node functions)
        // Also exclude common non-question files like README.md, LICENSE.md, CONTRIBUTING.md
        const mdFiles = treeData.tree
          .filter((item) => {
            if (item.type !== 'blob') return false;
            const pathLower = item.path.toLowerCase();
            const filenameLower = item.path.split('/').pop()?.toLowerCase() || '';
            
            // Ignore common docs that are not interview questions
            if (filenameLower === 'readme.md' || 
                filenameLower === 'license.md' || 
                filenameLower === 'license.txt' || 
                filenameLower === 'contributing.md' ||
                filenameLower === 'changelog.md') {
              return false;
            }

            return pathLower.endsWith('.md') || pathLower.endsWith('.txt');
          })
          .slice(0, 20);

        if (mdFiles.length === 0) throw new Error("No markdown or text files found in the repository");

        for (const f of mdFiles) {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${f.path}`;
          
          // Duplicate check for github whole repo import
          const existing = await prisma.knowledgeDocument.findFirst({
            where: { userId: session.user.id, sourceUrl: rawUrl }
          });
          if (existing) {
            continue; // Skip this file and proceed to next
          }

          const contentRes = await fetch(rawUrl);
          if (contentRes.ok) {
            const text = await contentRes.text();
            const extractedFilename = f.path.split('/').pop() || `github-${Date.now()}.md`;
            const arkDocId = await uploadDocumentToKB(extractedFilename, text);
            if (arkDocId) {
              await prisma.knowledgeDocument.create({
                data: {
                  userId: session.user.id,
                  name: extractedFilename,
                  sourceType: 'github',
                  sourceUrl: rawUrl,
                  size: Buffer.byteLength(text, 'utf8'),
                  status: 'ready',
                  arkDocId: arkDocId,
                },
              });
              createdCount++;
            }
          }
        }
        if (createdCount === 0) return NextResponse.json({ error: "Failed to upload any files to KB" }, { status: 500 });
      } 
      // 2. Handle specific file URL (e.g., https://github.com/user/repo/blob/main/file.md)
      else {
        if (fetchUrl.includes("github.com") && fetchUrl.includes("/blob/")) {
          fetchUrl = fetchUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
        }
        
        // Duplicate check for specific github file import
        const existing = await prisma.knowledgeDocument.findFirst({
          where: { userId: session.user.id, sourceUrl: fetchUrl }
        });
        if (existing) {
          return NextResponse.json({ error: "该文件已存在，请勿重复导入" }, { status: 400 });
        }

        const res = await fetch(fetchUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch from GitHub: ${res.statusText}`);
        }
        const fetchedText = await res.text();
        const extractedFilename = fetchUrl.split('/').pop() || `github-${Date.now()}.md`;
        
        const arkDocId = await uploadDocumentToKB(extractedFilename, fetchedText);
        if (!arkDocId) return NextResponse.json({ error: "Upload to KB failed" }, { status: 500 });

        await prisma.knowledgeDocument.create({
          data: {
            userId: session.user.id,
            name: extractedFilename,
            sourceType: 'github',
            sourceUrl: fetchUrl,
            size: Buffer.byteLength(fetchedText, 'utf8'),
            status: 'ready',
            arkDocId: arkDocId,
          },
        });
        createdCount = 1;
      }
    } else {
      return NextResponse.json({ error: "Missing file, text content, or github url" }, { status: 400 });
    }

    return NextResponse.json({ success: true, createdCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.email !== "admin@resumer.com") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    
    // Bulk Delete
    if (body.bulk) {
      const ids = body.ids as string[];
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: "Missing ids for bulk delete" }, { status: 400 });
      }

      const docs = await prisma.knowledgeDocument.findMany({
        where: { 
          userId: session.user.id,
          id: { in: ids }
        },
      });
      
      for (const doc of docs) {
        if (doc.arkDocId) {
          // If there's an Ark ID, delete it from Volcengine
          await deleteDocumentFromKB(doc.arkDocId);
        }
      }
      
      await prisma.knowledgeDocument.deleteMany({
        where: { 
          userId: session.user.id,
          id: { in: ids }
        },
      });
      
      return NextResponse.json({ success: true, deletedCount: docs.length });
    }

    const id = body?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Missing id or bulk flag" }, { status: 400 });
    }

    const doc = await prisma.knowledgeDocument.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (doc.arkDocId) {
      await deleteDocumentFromKB(doc.arkDocId);
    }

    await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
