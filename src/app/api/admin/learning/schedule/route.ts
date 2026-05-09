import { NextResponse } from "next/server";
import { learningFactory, type SourceType } from "@/lib/db/learningFactory";
import { isAuthorizationFailure, requireAdminUser } from "@/lib/permissions";

/**
 * Validates the incoming source type for schedule mutations.
 * @param {unknown} value Raw source type value from the request body.
 * @returns {SourceType} Normalized source type for the schedule model.
 */
function normalizeSourceType(value: unknown): SourceType {
  if (
    value === "manual_url" ||
    value === "github_directory" ||
    value === "github_markdown" ||
    value === "web_page" ||
    value === "yuque"
  ) {
    return value;
  }
  return "web_page";
}

/**
 * Creates or updates one learning-center collection schedule.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Schedule mutation result.
 */
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      scheduleId?: unknown;
      kbId?: unknown;
      name?: unknown;
      cron?: unknown;
      sourceType?: unknown;
      target?: unknown;
      whitelist?: unknown;
      enabled?: unknown;
      nextRunAt?: unknown;
    };

    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const cron = typeof body.cron === "string" ? body.cron.trim() : "";
    const target = typeof body.target === "string" ? body.target.trim() : "";

    if (!kbId || !name || !cron || !target) {
      return NextResponse.json({ error: "Missing required fields: kbId, name, cron, target" }, { status: 400 });
    }

    const schedule = learningFactory.createOrUpdateSchedule({
      scheduleId: typeof body.scheduleId === "string" ? body.scheduleId.trim() : undefined,
      kbId,
      name,
      cron,
      sourceType: normalizeSourceType(body.sourceType),
      target,
      whitelist: body.whitelist !== false,
      enabled: body.enabled !== false,
      nextRunAt: typeof body.nextRunAt === "string" ? body.nextRunAt : null,
    });

    return NextResponse.json({ success: true, schedule });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Deletes one learning-center collection schedule.
 * @param {Request} req Incoming route request.
 * @returns {Promise<Response>} Schedule deletion result.
 */
export async function DELETE(req: Request) {
  try {
    const authResult = await requireAdminUser();
    if (isAuthorizationFailure(authResult)) {
      return authResult.response;
    }

    const { searchParams } = new URL(req.url);
    const scheduleId = (searchParams.get("scheduleId") || "").trim();
    if (!scheduleId) {
      return NextResponse.json({ error: "Missing scheduleId" }, { status: 400 });
    }

    const ok = learningFactory.deleteSchedule(scheduleId);
    if (!ok) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
