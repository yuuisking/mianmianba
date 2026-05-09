import { NextResponse } from "next/server";
import { listPublicTopicBankCards } from "@/lib/learning/topicBankService";
import { getPublishedDocumentOutline } from "@/lib/learning/documentService";

/**
 * 聚合学习中心公开数据，供需要整库快照的页面或脚本使用。
 * @returns {Promise<Response>} Prisma 驱动的学习中心快照。
 */
export async function GET(): Promise<Response> {
  const banks = await listPublicTopicBankCards();
  const outlines = await Promise.all(
    banks.map(async (bank) => ({
      bankId: bank.id,
      outline: await getPublishedDocumentOutline(bank.id),
    }))
  );

  return NextResponse.json({
    banks,
    outlines,
  });
}
