"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import { CodingPanel } from "@/components/interview/CodingPanel";
import {
  buildInterviewRoomKey,
  getActiveInterviewSessionStorageKey,
  getInterviewModeLabel,
  normalizeInterviewMode,
  readStoredInterviewProfile,
  writeStoredInterviewProfile,
  type InterviewMode,
  type InterviewProfileState,
} from "@/lib/interview/config";

type CodingPanelResult = {
  summary?: string;
  feedback?: string[];
  compileStatus?: string;
  runStatus?: string;
  passedCount?: number;
  totalCount?: number;
  stdout?: string;
  stderr?: string;
  sampleResults?: Array<{
    index: number;
    passed: boolean;
    hidden: boolean;
    actual?: unknown;
    expected?: unknown;
  }>;
  failedCases?: Array<{
    index: number;
    input: unknown[];
    expected: unknown;
    actual?: unknown;
    stderr?: string;
  }>;
};

type CodingSessionView = {
  id: string;
  createdAt?: string;
  language: string;
  status: string;
  starterCode?: string | null;
  latestCode?: string | null;
  codingMeta?: {
    supportedLanguages?: string[];
    starterByLanguage?: Record<string, string>;
    durationMinutes?: number;
  } | null;
  question: {
    id: string;
    title?: string | null;
    prompt: string;
  };
  submissions?: Array<{
    id: string;
    resultPayload?: CodingPanelResult | null;
  }>;
};

/**
 * 为报告页生成当前会话专属的历史缓存键，保证算法题独立页结束后仍能跳到正确报告。
 * @param {string} sessionId 当前面试会话 ID。
 * @returns {string} 报告历史缓存键。
 */
function getReportHistoryStorageKey(sessionId: string): string {
  return `reportHistory:${sessionId}`;
}

/**
 * 统一从浏览器缓存中读取当前面试会话 ID，优先使用显式参数，其次回退到房间级缓存。
 * @param {string} roomKey 当前房间键。
 * @param {string} explicitSessionId 查询参数中的 sessionId。
 * @returns {string} 当前可用的会话 ID；不存在时返回空串。
 */
function readCachedSessionId(roomKey: string, explicitSessionId: string): string {
  if (typeof window === "undefined") {
    return explicitSessionId;
  }

  if (explicitSessionId.trim()) {
    return explicitSessionId.trim();
  }

  return (
    sessionStorage.getItem(getActiveInterviewSessionStorageKey(roomKey))?.trim() ||
    localStorage.getItem(getActiveInterviewSessionStorageKey(roomKey))?.trim() ||
    ""
  );
}

/**
 * 将秒数格式化成算法题倒计时展示文案。
 * @param {number} totalSeconds 剩余秒数。
 * @returns {string} `mm:ss` 格式的时钟文本。
 */
function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * 渲染独立算法题页面，避免编程环节与文字聊天混在同一屏。
 * @returns {JSX.Element} 算法题独立页。
 */
function CodingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const planId = searchParams.get("planId")?.trim() || "";
  const stageId = searchParams.get("stageId")?.trim() || "";
  const roundId = searchParams.get("roundId")?.trim() || "";
  const codingSessionId = searchParams.get("codingSessionId")?.trim() || "";
  const explicitSessionId = searchParams.get("sessionId")?.trim() || "";
  const mode = normalizeInterviewMode(searchParams.get("mode")) as InterviewMode;
  const roomKey = useMemo(
    () =>
      buildInterviewRoomKey({
        planId,
        stageId,
        roundId,
        mode,
      }),
    [mode, planId, roundId, stageId]
  );

  const [profile, setProfile] = useState<InterviewProfileState | null>(null);
  const [interviewSessionId, setInterviewSessionId] = useState("");
  const [codingSession, setCodingSession] = useState<CodingSessionView | null>(null);
  const [codingLanguage, setCodingLanguage] = useState("java");
  const [codingCode, setCodingCode] = useState("");
  const [codingLatestResult, setCodingLatestResult] = useState<CodingPanelResult | null>(null);
  const [codingBusy, setCodingBusy] = useState(false);
  const [countdownLabel, setCountdownLabel] = useState("35:00");
  const [loadError, setLoadError] = useState("");
  const [isFinishing, setIsFinishing] = useState(false);

  /**
   * 把服务端返回的算法题会话同步进本地状态与房间画像。
   * @param {CodingSessionView} nextSession 最新算法题会话。
   */
  const hydrateCodingSession = useCallback(
    (nextSession: CodingSessionView) => {
      setCodingSession(nextSession);
      setCodingLanguage(nextSession.language || "java");
      setCodingCode(nextSession.latestCode || nextSession.starterCode || "");
      setCodingLatestResult(nextSession.submissions?.[0]?.resultPayload || null);
      setProfile((current) => {
        if (!current) {
          return current;
        }
        const nextProfile = {
          ...current,
          codingSessionId: nextSession.id,
          codingRequired: true,
          currentRoundStatus: "CODING",
        };
        writeStoredInterviewProfile(nextProfile, roomKey);
        return nextProfile;
      });
    },
    [roomKey]
  );

  useEffect(() => {
    setProfile(readStoredInterviewProfile(roomKey));
    setInterviewSessionId(readCachedSessionId(roomKey, explicitSessionId));
  }, [explicitSessionId, roomKey]);

  /**
   * 从服务端读取当前独立页对应的算法题会话。
   */
  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const params = new URLSearchParams();
    if (codingSessionId) {
      params.set("codingSessionId", codingSessionId);
    } else if (roundId) {
      params.set("roundId", roundId);
    } else {
      setLoadError("当前缺少 roundId 或 codingSessionId，无法加载算法题。");
      return;
    }

    void (async () => {
      setLoadError("");
      const response = await fetch(`/api/v2/coding-sessions?${params.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: CodingSessionView;
      };
      if (!response.ok || !payload.data) {
        setLoadError(payload.error || "算法题会话加载失败，请返回上一页重试。");
        return;
      }

      hydrateCodingSession(payload.data);
    })();
  }, [codingSessionId, hydrateCodingSession, roundId, session?.user?.id]);

  /**
   * 根据算法题创建时间刷新倒计时文案，独立页面仍保持和原面试页一致的时限感知。
   */
  useEffect(() => {
    if (!codingSession) {
      return;
    }

    const startedAt =
      Date.parse(codingSession.createdAt || "") ||
      Date.now();
    const durationMinutes = codingSession.codingMeta?.durationMinutes || 35;
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const remainingSeconds = durationMinutes * 60 - elapsedSeconds;
      setCountdownLabel(formatCountdown(remainingSeconds));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [codingSession]);

  /**
   * 确保算法题独立页结束时也能绑定到真实会话，避免提交后报告页找不到当前面试记录。
   * @returns {Promise<string>} 当前可用的面试会话 ID。
   */
  const ensureInterviewSessionId = useCallback(async (): Promise<string> => {
    const cachedSessionId = interviewSessionId || readCachedSessionId(roomKey, explicitSessionId);
    if (cachedSessionId) {
      return cachedSessionId;
    }

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        status: "ongoing",
        roomKey,
        planId: profile?.interviewPlanId || planId || null,
        stageId: profile?.interviewStageId || stageId || null,
        roundId: profile?.interviewRoundId || roundId || null,
        sourceLaunchId: profile?.launchId,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { id?: string };
      error?: string;
    };
    if (!response.ok || !payload.data?.id) {
      throw new Error(payload.error || "创建面试会话失败，暂时无法生成报告。");
    }

    const nextSessionId = payload.data.id.trim();
    setInterviewSessionId(nextSessionId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(getActiveInterviewSessionStorageKey(roomKey), nextSessionId);
      localStorage.setItem(getActiveInterviewSessionStorageKey(roomKey), nextSessionId);
    }
    return nextSessionId;
  }, [explicitSessionId, interviewSessionId, mode, planId, profile, roomKey, roundId, stageId]);

  /**
   * 统一结束算法题页面对应的面试会话，并跳转到报告页。
   * @param {string} reason 结束原因。
   */
  const finishCodingInterview = useCallback(
    async (reason: string) => {
      const sessionId = await ensureInterviewSessionId();
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          getReportHistoryStorageKey(sessionId),
          JSON.stringify({
            sessionId,
            roomKey,
            planId: profile?.interviewPlanId || planId || null,
            stageId: profile?.interviewStageId || stageId || null,
            roundId: profile?.interviewRoundId || roundId || null,
            mode,
            messages: [],
            elapsedTime: 0,
            questionCount: 0,
            completedRounds: 0,
            pendingAssistantReply: false,
          })
        );
      }
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          mode,
          planId: profile?.interviewPlanId || planId || null,
          stageId: profile?.interviewStageId || stageId || null,
          roundId: profile?.interviewRoundId || roundId || null,
          sourceLaunchId: profile?.launchId,
          roomKey,
          terminationReason: reason,
        }),
      });
      router.push(`/report?sessionId=${sessionId}`);
    },
    [ensureInterviewSessionId, mode, planId, profile, roomKey, roundId, router, stageId]
  );

  /**
   * 执行一次运行或提交，并在提交成功后直接收尾本轮面试。
   * @param {"run" | "submit"} action 当前动作。
   */
  const executeCodingAction = useCallback(
    async (action: "run" | "submit") => {
      if (!codingSession?.id) {
        return;
      }

      setCodingBusy(true);
      setLoadError("");
      try {
        const response = await fetch(`/api/v2/coding-sessions/${codingSession.id}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: codingCode,
            language: codingLanguage,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: {
            session: CodingSessionView;
            evaluation: {
              resultPayload?: CodingPanelResult;
            };
          };
          error?: string;
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error || "算法题动作执行失败");
        }

        hydrateCodingSession(payload.data.session);
        setCodingLatestResult(payload.data.evaluation.resultPayload || null);
        if (action === "submit") {
          setIsFinishing(true);
          await finishCodingInterview("候选人完成算法题并提交");
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "算法题执行失败，请稍后重试。");
      } finally {
        setCodingBusy(false);
      }
    },
    [codingCode, codingLanguage, codingSession?.id, finishCodingInterview, hydrateCodingSession]
  );

  /**
   * 切换语言时同步切到对应 starter code，保持和 LeetCode 类似的体验。
   * @param {string} nextLanguage 目标语言。
   */
  const handleCodingLanguageChange = useCallback(
    (nextLanguage: string) => {
      setCodingLanguage(nextLanguage);
      const nextStarterCode = codingSession?.codingMeta?.starterByLanguage?.[nextLanguage];
      if (nextStarterCode) {
        setCodingCode(nextStarterCode);
      }
    },
    [codingSession?.codingMeta?.starterByLanguage]
  );

  if (!session?.user?.id) {
    return (
      <section style={{ minHeight: "calc(100vh - 70px)", display: "grid", placeItems: "center", padding: "2rem" }}>
        <div style={{ width: "min(92vw, 760px)", padding: "2.2rem", borderRadius: "28px", backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid rgba(20,20,19,0.08)" }}>
          <span className="tag tag-primary">算法题页面</span>
          <h1 style={{ marginTop: "1rem" }}>登录后继续当前算法题</h1>
          <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
            当前编程环节已经切换到独立页面。登录后可继续编写、运行并提交代码。
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.4rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                requestAuth({
                  title: "登录后继续算法题",
                  description: "登录后继续当前编程环节并生成报告。",
                  callbackUrl: `/coding?${searchParams.toString()}`,
                })
              }
            >
              登录继续
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => router.push("/setup")}>
              返回发起页
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        minHeight: "calc(100vh - 70px)",
        padding: "1.4rem",
        background:
          "radial-gradient(920px 420px at 12% 12%, rgba(217, 119, 87, 0.12), transparent 62%), radial-gradient(820px 360px at 88% 10%, rgba(106, 155, 204, 0.1), transparent 58%), linear-gradient(180deg, #faf9f5 0%, #f6f4ee 100%)",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <div style={{ padding: "1.1rem 1.2rem", borderRadius: "24px", backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid rgba(20,20,19,0.08)", display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <span className="tag tag-primary">{getInterviewModeLabel(mode, Boolean(profile?.videoEnabled))}</span>
            <h1 style={{ margin: "0.7rem 0 0.25rem 0" }}>独立算法题环节</h1>
            <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.7 }}>
              当前轮次已切换为独立编程页面，不再和聊天区域混排。
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsFinishing(true);
                void finishCodingInterview("候选人结束算法题环节");
              }}
              disabled={codingBusy || isFinishing}
            >
              {isFinishing ? "正在结束..." : "结束并生成报告"}
            </button>
          </div>
        </div>

        {loadError ? (
          <div style={{ padding: "1rem 1.1rem", borderRadius: "20px", border: "1px solid rgba(217, 119, 87, 0.2)", backgroundColor: "rgba(217, 119, 87, 0.08)", color: "var(--text-dark)" }}>
            {loadError}
          </div>
        ) : null}

        {codingSession ? (
          <CodingPanel
            title={codingSession.question.title || "限时算法题"}
            prompt={codingSession.question.prompt}
            language={codingLanguage}
            code={codingCode}
            supportedLanguages={
              codingSession.codingMeta?.supportedLanguages?.length
                ? codingSession.codingMeta.supportedLanguages
                : ["java", "cpp", "javascript", "python", "go"]
            }
            latestResult={codingLatestResult}
            isBusy={codingBusy || isFinishing}
            countdownLabel={countdownLabel}
            onLanguageChange={handleCodingLanguageChange}
            onCodeChange={setCodingCode}
            onRun={() => {
              void executeCodingAction("run");
            }}
            onSubmit={() => {
              void executeCodingAction("submit");
            }}
          />
        ) : (
          <div style={{ padding: "1.4rem", borderRadius: "24px", backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid rgba(20,20,19,0.08)" }}>
            正在加载算法题...
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 为独立算法题页提供 Suspense 边界，兼容查询参数读取。
 * @returns {JSX.Element} 带 Suspense 的算法题页。
 */
export default function CodingPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem" }}>Loading...</div>}>
      <CodingPageContent />
    </Suspense>
  );
}
