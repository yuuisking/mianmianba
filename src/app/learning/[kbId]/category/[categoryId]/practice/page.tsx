"use client";

import { useEffect, useState, useRef, type ReactNode, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";

type QuestionItem = {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
};

type PracticeSettings = {
  order: "sequence" | "random" | "difficulty";
  difficultyFilter: "" | "easy" | "medium" | "hard";
};

const difficultyLabel: Record<string, { text: string; color: string }> = {
  easy: { text: "简单", color: "#788c5d" },
  medium: { text: "中等", color: "#d97757" },
  hard: { text: "困难", color: "#c44" },
};

/**
 * 刷题模式页面
 */
export default function PracticeModePage(): ReactNode {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const kbId = params.kbId as string;
  const categoryId = params.categoryId as string;
  const startQuestionId = searchParams.get("start");

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [settings, setSettings] = useState<PracticeSettings>({
    order: "sequence",
    difficultyFilter: "",
  });
  const [showSettings, setShowSettings] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Answer states
  const [userAnswer, setUserAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [aiEvaluation, setAiEvaluation] = useState<string>("");
  const [showReference, setShowReference] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  // Progress
  const [masteredCount, setMasteredCount] = useState(0);
  const [needsPracticeCount, setNeedsPracticeCount] = useState(0);

  const answerRef = useRef<HTMLTextAreaElement>(null);

  const currentQuestion = questions[currentIndex];

  async function loadQuestions() {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      query.set("pageSize", "1000");
      query.set("kbId", kbId);
      if (settings.difficultyFilter) query.set("difficulty", settings.difficultyFilter);

      const res = await fetch(`/api/learning/categories/${categoryId}/questions?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载题目失败");

      let qs: QuestionItem[] = data.questions;

      // Apply order
      if (settings.order === "random") {
        qs = qs.sort(() => Math.random() - 0.5);
      } else if (settings.order === "difficulty") {
        const order = { easy: 0, medium: 1, hard: 2 };
        qs = qs.sort((a: QuestionItem, b: QuestionItem) => order[a.difficulty] - order[b.difficulty]);
      }

      // If startQuestionId specified, move it to first
      if (startQuestionId) {
        const idx = qs.findIndex((q: QuestionItem) => q.id === startQuestionId);
        if (idx > 0) {
          const [q] = qs.splice(idx, 1);
          qs.unshift(q);
        }
      }

      setQuestions(qs);
      setShowSettings(false);
      setCurrentIndex(0);
      resetAnswerState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  function resetAnswerState() {
    setUserAnswer("");
    setSubmitted(false);
    setAiEvaluation("");
    setShowReference(false);
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!userAnswer.trim() || !currentQuestion) return;

    setEvaluating(true);
    setSubmitted(true);

    try {
      const res = await fetch("/api/learning/practice/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          userAnswer: userAnswer.trim(),
          kbId,
          categoryId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "评估失败");

      setAiEvaluation(data.evaluation);

      // Record attempt
      await fetch("/api/learning/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          attempted: true,
          correct: data.isCorrect,
        }),
      });
    } catch (err) {
      setAiEvaluation("评估出错，请直接查看参考答案。");
    } finally {
      setEvaluating(false);
    }
  }

  function handleMark(status: "mastered" | "needsPractice") {
    if (!currentQuestion) return;

    fetch("/api/learning/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        mastered: status === "mastered",
      }),
    });

    if (status === "mastered") {
      setMasteredCount((c) => c + 1);
    } else {
      setNeedsPracticeCount((c) => c + 1);
    }

    nextQuestion();
  }

  function nextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      resetAnswerState();
    } else {
      alert("恭喜！已完成本分类所有题目。");
      router.push(`/learning/${kbId}/category/${categoryId}`);
    }
  }

  function skipQuestion() {
    nextQuestion();
  }

  if (showSettings) {
    return (
      <div className="container" style={{ paddingTop: "2rem", maxWidth: "600px" }}>
        <div className="panel">
          <h2 style={{ marginBottom: "1.5rem" }}>刷题设置</h2>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>出题顺序</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[
                { value: "sequence", label: "顺序" },
                { value: "random", label: "随机" },
                { value: "difficulty", label: "按难度" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`btn ${settings.order === opt.value ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setSettings((s) => ({ ...s, order: opt.value as PracticeSettings["order"] }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>难度筛选</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className={`btn ${!settings.difficultyFilter ? "btn-primary" : "btn-outline"}`}
                onClick={() => setSettings((s) => ({ ...s, difficultyFilter: "" }))}
              >
                全部
              </button>
              {["easy", "medium", "hard"].map((d) => (
                <button
                  key={d}
                  className={`btn ${settings.difficultyFilter === d ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setSettings((s) => ({ ...s, difficultyFilter: d as PracticeSettings["difficultyFilter"] }))}
                >
                  {difficultyLabel[d].text}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" onClick={() => void loadQuestions()} disabled={loading}>
              {loading ? "加载中..." : "开始刷题"}
            </button>
            <button className="btn btn-outline" onClick={() => router.push(`/learning/${kbId}/category/${categoryId}`)}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <div className="panel">
          <div className="notice">{error}</div>
          <button className="btn btn-primary" onClick={() => setShowSettings(true)}>
            重新设置
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <div className="panel">
          <h2>没有题目</h2>
          <p className="text-muted">该分类下没有符合条件的题目。</p>
          <button className="btn btn-primary" onClick={() => setShowSettings(true)}>
            重新设置
          </button>
        </div>
      </div>
    );
  }

  const diff = difficultyLabel[currentQuestion.difficulty];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <div className="container" style={{ paddingTop: "1rem", paddingBottom: "3rem", maxWidth: "900px" }}>
      {/* Progress Bar */}
      <div style={{ marginBottom: "1rem" }}>
        <div
          style={{
            height: "4px",
            backgroundColor: "rgba(20,20,19,0.08)",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              backgroundColor: "var(--accent-orange)",
              transition: "width 0.3s",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            marginTop: "0.25rem",
          }}
        >
          <span>
            {currentIndex + 1} / {questions.length}
          </span>
          <span>
            已掌握 {masteredCount} · 需练习 {needsPracticeCount}
          </span>
        </div>
      </div>

      {/* Question */}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "999px",
              backgroundColor: diff.color + "15",
              color: diff.color,
              fontWeight: 600,
            }}
          >
            {diff.text}
          </span>
          {currentQuestion.tags.map((tag) => (
            <span key={tag} className="tag" style={{ fontSize: "0.75rem" }}>
              {tag}
            </span>
          ))}
          <button
            className="btn btn-outline"
            style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
            onClick={() => setShowSettings(true)}
          >
            设置
          </button>
        </div>

        <h2 style={{ fontSize: "1.2rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          {currentQuestion.title}
        </h2>

        {/* Answer Input */}
        {!submitted && (
          <form onSubmit={handleSubmit}>
            <textarea
              ref={answerRef}
              className="input"
              placeholder="请输入你的回答..."
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              style={{
                width: "100%",
                minHeight: "150px",
                resize: "vertical",
                marginBottom: "1rem",
                fontSize: "0.95rem",
                lineHeight: 1.6,
              }}
            />
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary" disabled={!userAnswer.trim() || evaluating}>
                {evaluating ? "评估中..." : "提交答案"}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setSubmitted(true);
                  setShowReference(true);
                }}
              >
                直接看答案
              </button>
              <button type="button" className="btn btn-outline" onClick={skipQuestion}>
                跳过
              </button>
            </div>
          </form>
        )}

        {/* AI Evaluation */}
        {submitted && aiEvaluation && (
          <div
            style={{
              backgroundColor: "rgba(106, 155, 204, 0.06)",
              border: "1px solid rgba(106, 155, 204, 0.2)",
              borderRadius: "8px",
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <h4 style={{ color: "var(--accent-blue)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
              AI 评估
            </h4>
            <div style={{ fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{aiEvaluation}</div>
          </div>
        )}

        {/* Reference Answer */}
        {submitted && showReference && (
          <div style={{ marginBottom: "1rem" }}>
            <button
              className="btn btn-outline"
              onClick={() => router.push(`/learning/${kbId}/category/${categoryId}/question/${currentQuestion.id}`)}
            >
              查看完整参考答案
            </button>
          </div>
        )}

        {/* Action Buttons after submit */}
        {submitted && !evaluating && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => handleMark("mastered")}>
              掌握了
            </button>
            <button className="btn btn-outline" onClick={() => handleMark("needsPractice")}>
              还需要练
            </button>
            <button className="btn btn-outline" onClick={nextQuestion}>
              下一题
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
