import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBankDetail } from "@/lib/learning/bankStudio";

type PageProps = {
  params: Promise<{
    kbId: string;
  }>;
};

/**
 * 题库入口页只承担“直达首题”的职责，避免用户再次进入中间选择页。
 * @param {PageProps} props 路由参数。
 * @returns {Promise<JSX.Element>} 首题缺失时的兜底空状态。
 */
export default async function KnowledgeBasePage(props: PageProps) {
  const { kbId } = await props.params;
  const detail = await getBankDetail(kbId);

  if (!detail.bank) {
    notFound();
  }

  if (detail.defaultQuestionPath) {
    redirect(detail.defaultQuestionPath);
  }

  return (
    <section className="minimal-learning">
      <div className="minimal-learning__shell">
        <div className="minimal-learning__empty">
          <h2 style={{ marginBottom: "0.5rem", fontSize: "1.15rem", fontWeight: 700 }}>{detail.bank.name}</h2>
          <p style={{ margin: 0 }}>当前题库还在整理中，暂时没有可阅读的题目。</p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/learning" className="btn btn-primary">
              返回学习中心
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
