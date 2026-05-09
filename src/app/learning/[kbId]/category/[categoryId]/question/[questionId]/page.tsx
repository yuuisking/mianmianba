import { notFound } from "next/navigation";
import QuestionDetailClient from "./QuestionDetailClient";
import { getLearningQuestionDetail } from "@/lib/learning/questionDetail";

type PageProps = {
  params: Promise<{
    kbId: string;
    categoryId: string;
    questionId: string;
  }>;
};

/**
 * 题目详情页改为服务端首屏直出，避免用户进入后再经历一轮客户端取数等待。
 * @param {PageProps} props 路由参数。
 * @returns {Promise<JSX.Element>} 直接可阅读的题目详情页。
 */
export default async function QuestionDetailPage(props: PageProps) {
  const { kbId, categoryId, questionId } = await props.params;
  const question = await getLearningQuestionDetail({
    kbId,
    categoryId,
    questionId,
    includeTree: true,
  });

  if (!question) {
    notFound();
  }

  return (
    <QuestionDetailClient
      kbId={kbId}
      questionId={questionId}
      initialQuestion={question}
      initialTree={question.tree ?? []}
    />
  );
}
