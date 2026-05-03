import { NextResponse } from "next/server";
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
      name?: unknown;
      tags?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : [];

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Generate id safely
    const kbId = name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() + Date.now().toString(36);

    learningDb.createKb({
      id: kbId,
      name,
      subtitle: "",
      tags,
      updatedAt: new Date().toISOString().split("T")[0],
      stats: { topics: 0, paths: 0 },
    });

    return NextResponse.json({ success: true, kbId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const isAdmin =
      session?.user?.email?.toLowerCase().includes("admin") ||
      session?.user?.name?.toLowerCase().includes("admin");

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const kbId = searchParams.get("kbId");

    if (!kbId) {
      return NextResponse.json({ error: "Missing kbId" }, { status: 400 });
    }

    const ok = learningDb.deleteKb(kbId);
    if (!ok) {
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
