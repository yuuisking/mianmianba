import { NextResponse } from "next/server";
import { getPublicBankCards } from "@/lib/learning/bankStudio";

/**
 * Returns the redesigned public bank list for the learning center home page.
 * @returns {Response} JSON response containing visible public banks.
 */
export async function GET(): Promise<Response> {
  try {
    const banks = await getPublicBankCards();
    return NextResponse.json({
      success: true,
      banks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "获取题库列表失败。",
      },
      { status: 500 }
    );
  }
}
