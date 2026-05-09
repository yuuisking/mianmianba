import { NextResponse } from "next/server";
import { getBankDetail } from "@/lib/learning/bankStudio";

type RouteContext = {
  params: Promise<{ kbId: string }>;
};

/**
 * Returns the redesigned detail payload for one public bank page.
 * @param {Request} _req Incoming request.
 * @param {RouteContext} context Route params context.
 * @returns {Promise<Response>} JSON response containing one bank detail payload.
 */
export async function GET(_req: Request, context: RouteContext): Promise<Response> {
  try {
    const { kbId } = await context.params;
    const detail = await getBankDetail(kbId);
    if (!detail.bank) {
      return NextResponse.json({ success: false, error: "题库不存在。" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ...detail,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "获取题库详情失败。",
      },
      { status: 500 }
    );
  }
}
