import { NextResponse } from "next/server";
import { generateTaxonomy } from "@/lib/ai/taxonomy";
import { learningDb } from "@/lib/db/learningDb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

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
      description?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!kbId) {
      return NextResponse.json({ error: "Missing required fields: kbId" }, { status: 400 });
    }

    const treeData = await generateTaxonomy(kbId, description);
    
    // Save to database
    learningDb.saveTaxonomy(kbId, treeData);

    return NextResponse.json({ success: true, treeData });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
