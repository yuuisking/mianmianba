"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuthDialog } from "@/components/auth/AuthDialogProvider";
import {
  buildInterviewLimitStrategy,
  getActiveInterviewSessionStorageKey,
  getInterviewHistoryStorageKey,
  getInterviewModeLabel,
  getLatestInterviewHistoryStorageKey,
  getRemainingQuestionCount,
  isRealtimeInterviewMode,
  normalizeInterviewMode,
  readStoredInterviewProfile,
  writeStoredInterviewProfile,
  type InterviewHistorySnapshot,
  type InterviewLimitType,
  type InterviewMessage,
  type InterviewMode,
  type InterviewProfileState
} from "@/lib/interview/config";
import { buildInterviewOpening } from "@/lib/interview/prompt";

type MicStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "muted"
  | "processing"
  | "denied"
  | "error";

type CameraStatus = "off" | "requesting" | "on" | "error";

/**
 * 将面试官回答的 Markdown 文本做轻量标准化，复用学习助手已验证过的展示体验。
 * @param {string} value 原始回答文本。
 * @returns {string} 适合 ReactMarkdown 渲染的文本。
 */
function normalizeInterviewMarkdown(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type QueuedTtsSegment = {
  turnId: number;
  text: string;
  audioBinary: ArrayBuffer;
  pauseAfterMs: number;
};

type RealtimeTtsRequestOptions = {
  voiceType?: string;
  speedRatio?: number;
  pitchRatio?: number;
  volumeRatio?: number;
};

/**
 * 判断当前异常是否为浏览器或请求中断导致的 AbortError，便于在流式场景下静默处理。
 * @param error 当前捕获到的异常对象。
 * @returns 是否属于可忽略的中断异常。
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * 将秒数格式化为房间统一展示时钟。
 * @param seconds 当前累计秒数。
 * @returns `mm:ss` 格式的时钟字符串。
 */
function formatElapsedClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainedSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainedSeconds}`;
}

/**
 * 生成当前消息时间戳，统一前后端展示口径。
 * @returns `HH:mm` 格式的时间字符串。
 */
function buildMessageTime(): string {
  return new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * 构造本地结束提示消息，用于自动结束时补充最后一条 AI 提示。
 * @param text 结束原因提示。
 * @returns 可直接插入消息流的 AI 消息。
 */
function createClosingMessage(text: string): InterviewMessage {
  return {
    role: "ai",
    content: [text],
    time: buildMessageTime(),
    tag: "本轮结束"
  };
}

/**
 * 将当前对话容器滚动到底部，确保流式回复时最新内容始终可见。
 * @param container 对话滚动容器。
 * @param anchor 底部定位锚点。
 * @param behavior 浏览器滚动行为。
 */
function scrollChatToBottom(
  container: HTMLDivElement | null,
  anchor: HTMLDivElement | null,
  behavior: ScrollBehavior = "auto"
): void {
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior });
  }

  if (anchor) {
    anchor.scrollIntoView({ block: "end", behavior });
  }
}

/**
 * 解析服务端流式分片中的状态标记与真实回答文本，避免控制指令吞掉同包正文。
 * @param chunk 当前读取到的文本分片。
 * @returns 标记状态与可用于渲染的真实正文。
 */
function parseInterviewStreamChunk(chunk: string): {
  searching: boolean;
  generating: boolean;
  content: string;
} {
  return {
    searching: chunk.includes("__STATUS_SEARCHING__"),
    generating: chunk.includes("__STATUS_GENERATING__"),
    content: chunk
      .replaceAll("__STATUS_SEARCHING__", "")
      .replaceAll("__STATUS_GENERATING__", "")
  };
}

/**
 * 判断当前页面是否处于浏览器允许调用音视频设备的安全上下文。
 * @returns 安全上下文返回 `true`。
 */
function isSecureMediaContext(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

/**
 * 将最新面试官发言收口成适合会议字幕展示的一行文本。
 * @param text 最新面试官原始文本。
 * @param emptyFallback 当前没有可展示文本时的兜底字幕。
 * @returns 适用于实时字幕区的一行文本。
 */
function buildRealtimeCaption(text: string, emptyFallback: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return emptyFallback;
  }

  return normalized;
}

/**
 * 将面试官字幕按自然停顿切成多行，便于逐行上滚显示。
 * @param text 最新面试官原始文本。
 * @param emptyFallback 当前没有可展示文本时的兜底字幕。
 * @returns 适合逐行字幕的文本数组。
 */
function buildRealtimeCaptionLines(text: string, emptyFallback: string): string[] {
  const normalized = buildRealtimeCaption(text, emptyFallback);
  const fragments = normalized
    .split(/(?<=[，。！？；：])/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (fragments.length === 0) {
    return [normalized];
  }

  const lines: string[] = [];
  let buffer = "";

  for (const fragment of fragments) {
    const nextLine = buffer ? `${buffer}${fragment}` : fragment;
    if (nextLine.length <= 24) {
      buffer = nextLine;
      continue;
    }

    if (buffer) {
      lines.push(buffer);
      buffer = fragment;
      continue;
    }

    const chunks = fragment.match(/.{1,24}/g) || [fragment];
    lines.push(...chunks);
    buffer = "";
  }

  if (buffer) {
    lines.push(buffer);
  }

  return lines.length > 0 ? lines : [normalized];
}

/**
 * 在当前增量文本中寻找适合开始播报的切分点，优先选择完整语义边界，其次选择较自然的短停顿。
 * @param text 当前尚未播报的原始文本。
 * @param minLength 当前片段至少应达到的字符长度。
 * @returns 找到切分点时返回应消费的字符数，否则返回 `null`。
 */
function findSpeakableSegmentBoundary(
  text: string,
  minLength: number
): number | null {
  const hardBoundaryChars = new Set(["。", "！", "？", "；", "\n"]);
  const softBoundaryChars = new Set(["，", "：", ",", ":"]);
  const cadenceAnchors = ["然后", "另外", "但是", "不过", "所以", "如果", "其实", "接着"];

  for (let index = Math.max(minLength - 1, 0); index < text.length; index += 1) {
    const char = text[index];
    if (hardBoundaryChars.has(char)) {
      return index + 1;
    }

    if (
      [".", "!", "?"].includes(char) &&
      (index === text.length - 1 || /\s/.test(text[index + 1] || ""))
    ) {
      return index + 1;
    }
  }

  for (let index = Math.max(minLength - 1, 0); index < text.length; index += 1) {
    if (softBoundaryChars.has(text[index])) {
      return index + 1;
    }
  }

  for (let index = Math.max(minLength, 0); index < text.length; index += 1) {
    const nextSlice = text.slice(index, index + 2);
    if (cadenceAnchors.some((anchor) => nextSlice === anchor.slice(0, 2))) {
      return index;
    }
  }

  if (text.length >= Math.max(minLength + 8, 24)) {
    return Math.min(text.length, minLength + 8);
  }

  return null;
}

/**
 * 从模型增量文本里提取当前已经适合播报的一批短意群，尽量贴近“接话式”体验。
 * @param text 当前尚未播报的原始文本。
 * @param preferShortFirstSegment 首段是否优先更短地开始播报。
 * @returns 可播报片段列表及其对应已消费的原始字符数。
 */
function extractSpeakableTextSegments(
  text: string,
  preferShortFirstSegment = false
): {
  segments: string[];
  consumedLength: number;
} {
  const segments: string[] = [];
  let cursor = 0;

  /**
   * 为首段寻找更短的起手切分点，让实时语音更像真人接话，而不是等完整长句。
   * @param source 当前剩余文本。
   * @returns 若找到合适的首段边界，返回应消费的字符数。
   */
  const findLeadInBoundary = (source: string): number | null => {
    const preferredMinLength = 6;
    const preferredMaxLength = 16;

    for (let index = preferredMinLength - 1; index < Math.min(source.length, preferredMaxLength); index += 1) {
      if (["，", "：", ",", ":"].includes(source[index])) {
        return index + 1;
      }
    }

    const hardBoundary = findSpeakableSegmentBoundary(source, preferredMinLength);
    if (hardBoundary !== null && hardBoundary <= preferredMaxLength) {
      return hardBoundary;
    }

    if (source.length >= preferredMaxLength) {
      return preferredMaxLength;
    }

    return null;
  };

  while (cursor < text.length) {
    const remainingText = text.slice(cursor);
    const trimmedText = remainingText.trimStart();
    const leadingWhitespaceLength = remainingText.length - trimmedText.length;
    cursor += leadingWhitespaceLength;

    if (!trimmedText) {
      return {
        segments,
        consumedLength: cursor
      };
    }

    const boundary =
      segments.length === 0 && preferShortFirstSegment
        ? findLeadInBoundary(text.slice(cursor))
        : findSpeakableSegmentBoundary(text.slice(cursor), 18);

    if (boundary === null) {
      break;
    }

    const segmentText = text.slice(cursor, cursor + boundary).trim();
    if (segmentText) {
      segments.push(segmentText);
    }
    cursor += boundary;
  }

  return {
    segments,
    consumedLength: cursor
  };
}

/**
 * 将模型文本整理成更适合口语播报的短句，减少 Markdown 和条目符号带来的机械朗读感。
 * @param text 原始待播报文本。
 * @returns 更适合实时语音播报的文本。
 */
function sanitizeTtsTextForConversation(text: string): string {
  return text
    .replace(/^(总体来说|总的来说|从这个角度来看|从整体上来看|严格来说)[，,:：]?\s*/g, "")
    .replace(/^(我想先说一下|我先说一下|我先补一句|这里我先说一下)[，,:：]?\s*/g, "")
    .replace(
      /^(下面我(?:们)?(?:来|就)?(?:继续)?(?:追问|看|聊|问)(?:一下)?)[，,:：]?\s*/g,
      "那我们接着看一个点，"
    )
    .replace(
      /^(接下来我(?:们)?(?:想)?(?:再)?(?:追问|问)(?:一下)?)[，,:：]?\s*/g,
      "那我接着问一个更具体的，"
    )
    .replace(/^(从面试官的角度来看|从这个角度来说|进一步来说)[，,:：]?\s*/g, "")
    .replace(/^换句话说[，,:：]?\s*/g, "换个角度看，")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/请你详细(?:阐述|说明|展开)(?:一下)?/g, "你具体说说")
    .replace(/请展开说明(?:一下)?/g, "你展开说说")
    .replace(/请介绍一下/g, "你讲讲")
    .replace(/你需要重点说明/g, "你重点说说")
    .replace(/请从多个维度(?:来)?分析/g, "你从几个关键点说说")
    .replace(/请你系统地(?:阐述|说明|分析)(?:一下)?/g, "你按你的思路说说")
    .replace(/[`#>]/g, "")
    .replace(/[()（）\[\]]/g, "")
    .replace(/\s*:\s*/g, "，")
    .replace(/\s*：\s*/g, "，")
    .replace(/\s+/g, " ")
    .replace(/([，。！？；：,!?;:])\1+/g, "$1")
    .trim();
}

/**
 * 为实时播报片段计算更自然的段间停顿，避免一段刚结束下一段立刻顶上来。
 * @param text 当前已经清洗过的播报文本。
 * @param segmentIndex 当前轮次中的片段序号。
 * @returns 下一段开始前建议等待的毫秒数。
 */
function buildRealtimeTtsPauseAfterMs(text: string, segmentIndex: number): number {
  const trimmed = text.trim();
  const isShortLeadIn =
    segmentIndex === 0 &&
    trimmed.length <= 14 &&
    /^(好|行|那|这样|先|那你|如果按你|具体到这)/.test(trimmed);

  if (!trimmed) {
    return 0;
  }

  if (isShortLeadIn && /[。！!？?]$/.test(trimmed)) {
    return 210;
  }

  if (/[？?]$/.test(trimmed)) {
    return segmentIndex === 0 ? 180 : 220;
  }

  if (/[。！!；;]$/.test(trimmed)) {
    return segmentIndex === 0 ? 160 : 210;
  }

  if (/[，,:：]$/.test(trimmed)) {
    return 110;
  }

  return segmentIndex === 0 ? 120 : 160;
}

/**
 * 根据当前片段位置为实时播报选择更自然的火山语音参数，首段更强调“接话感”。
 * @param text 当前要播报的文本。
 * @param segmentIndex 当前轮次里的片段序号。
 * @returns 传给 TTS 的轻量配置。
 */
function buildRealtimeTtsOptions(
  text: string,
  segmentIndex: number
): RealtimeTtsRequestOptions {
  const normalizedText = text.trim();
  const isQuestionLike = /[？?]$/.test(normalizedText);
  const isLeadInSegment =
    segmentIndex === 0 &&
    normalizedText.length <= 18 &&
    /^(好|行|那|这样|先|那你|你刚才|如果按你|具体到这)/.test(normalizedText);

  if (isLeadInSegment) {
    return {
      speedRatio: 0.99,
      pitchRatio: 1.01,
      volumeRatio: 1.0
    };
  }

  if (segmentIndex === 0) {
    return {
      speedRatio: isQuestionLike ? 1.01 : 1.0,
      pitchRatio: 1.02,
      volumeRatio: 1.01
    };
  }

  if (segmentIndex === 1) {
    return {
      speedRatio: isQuestionLike ? 0.98 : 0.96,
      pitchRatio: 1.0,
      volumeRatio: 1.0
    };
  }

  return {
    speedRatio: isQuestionLike ? 0.97 : 0.95,
    pitchRatio: 1.0,
    volumeRatio: 1.0
  };
}

const INTERVIEW_NAV_ITEMS = [
  { href: "/home", label: "首页" },
  { href: "/setup", label: "发起面试" },
  { href: "/practice", label: "专项训练" },
  { href: "/learning", label: "学习中心" },
  { href: "/review", label: "复盘中心" }
] as const;

/**
 * 基于当前房间状态生成历史快照，供报告页与离开确认复用。
 * @param input 当前会话状态。
 * @returns 可持久化的面试历史快照。
 */
function buildHistorySnapshot(input: {
  sessionId: string | null;
  mode: InterviewMode;
  messages: InterviewMessage[];
  elapsedTime: number;
  completedRounds: number;
  limitType: InterviewLimitType;
  questionLimit: number | null;
  durationLimitMinutes: number | null;
  launchId?: string;
}): InterviewHistorySnapshot {
  const {
    sessionId,
    mode,
    messages,
    elapsedTime,
    completedRounds,
    limitType,
    questionLimit,
    durationLimitMinutes,
    launchId
  } = input;

  return {
    sessionId: sessionId || undefined,
    mode,
    messages,
    elapsedTime,
    questionCount: completedRounds,
    completedRounds,
    limitType,
    questionLimit,
    durationLimitMinutes,
    launchId
  };
}

/**
 * 渲染面试房间主体，并统一处理实时模式、会话持久化、离开确认和自动结束。
 * @returns 面试房间主界面。
 */
function InterviewContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { requestAuth } = useAuthDialog();
  const initialProfile = useMemo(() => readStoredInterviewProfile(), []);
  const mode = normalizeInterviewMode(
    searchParams.get("mode") || initialProfile?.mode || "text"
  );
  const topic = searchParams.get("topic") || initialProfile?.topic || "";
  const desc = searchParams.get("desc") || initialProfile?.desc || "";
  const isRealtimeMode = isRealtimeInterviewMode(mode);
  const [profile, setProfile] = useState<InterviewProfileState | null>(initialProfile);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [input, setInput] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<
    "面试官思考中" | "进一步检索资料中"
  >("面试官思考中");
  const [showLimitAlert, setShowLimitAlert] = useState(false);
  const [limitAlertMessage, setLimitAlertMessage] = useState("");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(
    null
  );
  const [isExitConfirming, setIsExitConfirming] = useState(false);
  const [roomSessionId, setRoomSessionId] = useState<string | null>(null);
  const [autoEnding, setAutoEnding] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(isRealtimeMode);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [micErrorMsg, setMicErrorMsg] = useState("");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(
    initialProfile?.videoEnabled ? "on" : "off"
  );
  const [cameraErrorMsg, setCameraErrorMsg] = useState("");
  const [audioErrorMsg, setAudioErrorMsg] = useState("");
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [partialUserTranscript, setPartialUserTranscript] = useState("");
  const [assistantCaptionText, setAssistantCaptionText] = useState("");
  const [assistantSpeechStatus, setAssistantSpeechStatus] = useState<
    "idle" | "thinking" | "speaking" | "interrupted"
  >("idle");
  const [captionLineIndex, setCaptionLineIndex] = useState(0);
  const [captionTransitionEnabled, setCaptionTransitionEnabled] = useState(true);
  const [userCaptionLineIndex, setUserCaptionLineIndex] = useState(0);
  const [userCaptionTransitionEnabled, setUserCaptionTransitionEnabled] = useState(true);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const creationPromiseRef = useRef<Promise<string | null> | null>(null);
  const hasFinalizedRef = useRef(false);
  const initialMessagePersistedRef = useRef(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<InterviewMessage[]>(messages);
  const elapsedTimeRef = useRef(elapsedTime);
  const completedRoundsRef = useRef(completedRounds);
  const isTypingRef = useRef(isTyping);
  const isInterruptedRef = useRef(false);
  const handleSendMessageRef = useRef<
    (rawText: string, overrideTag?: string) => Promise<void>
  >(async () => {});
  const audioQueueRef = useRef<QueuedTtsSegment[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderCtxRef = useRef<AudioContext | null>(null);
  const recorderSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const utteranceChunksRef = useRef<Int16Array[]>([]);
  const utteranceLastVoiceAtRef = useRef(0);
  const utteranceHasVoiceRef = useRef(false);
  const utteranceStartAtRef = useRef(0);
  const micStatusRef = useRef<MicStatus>(micStatus);
  const isComposingRef = useRef(false);
  const partialAsrPendingRef = useRef(false);
  const partialAsrRequestedAtRef = useRef(0);
  const currentUtteranceIdRef = useRef(0);
  const assistantTurnIdRef = useRef(0);
  const assistantStreamingPreviewRef = useRef("");
  const assistantCaptionCommittedRef = useRef("");
  const limitType = profile?.limitType ?? "none";
  const questionLimit = profile?.questionLimit ?? null;
  const durationLimitMinutes = profile?.durationLimitMinutes ?? null;
  const limitStrategy = buildInterviewLimitStrategy(
    limitType,
    questionLimit,
    durationLimitMinutes
  );
  const modeLabel = getInterviewModeLabel(mode, Boolean(profile?.videoEnabled));
  const launchId = profile?.launchId || "";
  const activeSessionStorageKey = launchId
    ? getActiveInterviewSessionStorageKey(launchId)
    : null;
  const currentQuestionNumber = useMemo(() => {
    if (questionLimit) {
      return Math.min(completedRounds + 1, questionLimit);
    }

    return completedRounds + 1;
  }, [completedRounds, questionLimit]);
  const remainingQuestionCount = getRemainingQuestionCount(
    questionLimit,
    completedRounds
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentSessionIdRef.current = roomSessionId;
  }, [roomSessionId]);

  useEffect(() => {
    elapsedTimeRef.current = elapsedTime;
  }, [elapsedTime]);

  useEffect(() => {
    completedRoundsRef.current = completedRounds;
  }, [completedRounds]);

  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  useEffect(() => {
    micStatusRef.current = micStatus;
  }, [micStatus]);

  useEffect(() => {
    if (profile?.videoEnabled) {
      setCameraStatus("on");
      return;
    }

    if (cameraStatus !== "requesting") {
      setCameraStatus("off");
    }
  }, [cameraStatus, profile?.videoEnabled]);

  /**
   * 在需要身份的房间动作前触发统一认证弹层，并在成功后继续原动作。
   * @param onSuccess 登录成功后需要继续执行的动作。
   * @param title 当前动作对应的弹层标题。
   */
  const requireActionAuth = useCallback(
    (onSuccess: () => void, title: string) => {
      requestAuth({
        title,
        description: "登录后即可继续当前面试，并保留本次题量与时长策略。",
        callbackUrl: "/interview",
        onSuccess
      });
    },
    [requestAuth]
  );

  /**
   * 将最新历史快照持久化到会话缓存，供报告页和离开确认复用。
   * @param overrideMessages 若传入则使用覆盖后的消息列表。
   * @param overrideElapsed 若传入则使用覆盖后的时长。
   * @param overrideRounds 若传入则使用覆盖后的轮次。
   */
  const persistHistorySnapshot = useCallback(
    (
      overrideMessages?: InterviewMessage[],
      overrideElapsed?: number,
      overrideRounds?: number
    ) => {
      const snapshot = buildHistorySnapshot({
        sessionId: currentSessionIdRef.current,
        mode,
        messages: overrideMessages ?? messagesRef.current,
        elapsedTime: overrideElapsed ?? elapsedTimeRef.current,
        completedRounds: overrideRounds ?? completedRoundsRef.current,
        limitType,
        questionLimit,
        durationLimitMinutes,
        launchId
      });

      if (launchId) {
        sessionStorage.setItem(
          getInterviewHistoryStorageKey(launchId),
          JSON.stringify(snapshot)
        );
      }

      sessionStorage.setItem(
        getLatestInterviewHistoryStorageKey(),
        JSON.stringify(snapshot)
      );
    },
    [durationLimitMinutes, launchId, limitType, mode, questionLimit]
  );

  /**
   * 统一调整输入框高度，避免多行输入时遮挡底部操作区。
   */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`;
    }
  }, [input]);

  /**
   * 初始化开场消息，并确保房间始终基于真实画像而不是默认假数据。
   */
  useEffect(() => {
    const latestProfile = readStoredInterviewProfile();
    setProfile(latestProfile);
    setNeedsInteraction(isRealtimeMode);

    const opening = buildInterviewOpening(mode, latestProfile, topic, desc);
    setMessages([
      {
        role: "ai",
        content: opening,
        time: buildMessageTime(),
        tag: ""
      }
    ]);
  }, [desc, isRealtimeMode, mode, topic]);

  /**
   * 维护房间内计时器，并在达到时长上限后触发自动结束。
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedTime((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /**
   * 在消息或思考状态变化后自动滚动到底部，保持对话焦点稳定。
   */
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      scrollChatToBottom(
        chatHistoryRef.current,
        chatBottomRef.current,
        isTyping ? "auto" : "smooth"
      );
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isThinking, isTyping, messages]);

  /**
   * 创建或复用当前房间对应的后端会话记录，确保一次进入只记录一次面试。
   * @returns 已创建的面试会话 ID；若失败则返回 `null`。
   */
  const ensureInterviewSession = useCallback(async (): Promise<string | null> => {
    if (!session?.user?.id) {
      return null;
    }

    if (currentSessionIdRef.current) {
      return currentSessionIdRef.current;
    }

    if (creationPromiseRef.current) {
      return creationPromiseRef.current;
    }

    creationPromiseRef.current = (async () => {
      try {
        if (activeSessionStorageKey) {
          const storedSessionId = sessionStorage.getItem(activeSessionStorageKey);
          if (storedSessionId) {
            setRoomSessionId(storedSessionId);
            return storedSessionId;
          }
        }

        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            status: "ongoing"
          })
        });

        if (!response.ok) {
          throw new Error("创建面试会话失败");
        }

        const payload = (await response.json()) as { data?: { id?: string } };
        const createdId = payload.data?.id || null;
        if (createdId) {
          setRoomSessionId(createdId);
          if (activeSessionStorageKey) {
            sessionStorage.setItem(activeSessionStorageKey, createdId);
          }
        }

        return createdId;
      } catch (error) {
        console.error("Failed to create interview session", error);
        return null;
      } finally {
        creationPromiseRef.current = null;
      }
    })();

    return creationPromiseRef.current;
  }, [activeSessionStorageKey, mode, session?.user?.id]);

  /**
   * 将单条消息实时落库，确保离开页面后仍能保留本次对话记录。
   * @param sessionId 当前会话 ID。
   * @param role 消息角色。
   * @param content 消息正文。
   */
  const persistMessage = useCallback(
    async (sessionId: string, role: "assistant" | "user", content: string) => {
      try {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            role,
            content
          })
        });
      } catch (error) {
        console.error("Failed to persist interview message", error);
      }
    },
    []
  );

  /**
   * 使用 `keepalive` 请求补做会话结束，适用于刷新或关闭页面时的最后清理。
   * @param sessionId 当前会话 ID。
   */
  const finalizeSessionWithKeepalive = useCallback(
    (sessionId: string) => {
      void fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          mode
        }),
        keepalive: true
      }).catch((error) => {
        console.error("Failed to finalize interview session with keepalive", error);
      });
    },
    [mode]
  );

  /**
   * 结束所有音频、流式播放和采集资源，避免离开后仍占用设备。
   */
  const stopRealtimeMedia = useCallback(() => {
    abortControllerRef.current?.abort();
    ttsAbortControllerRef.current?.abort();
    recorderProcessorRef.current?.disconnect();
    recorderSourceRef.current?.disconnect();
    recorderProcessorRef.current = null;
    recorderSourceRef.current = null;

    if (recorderCtxRef.current) {
      void recorderCtxRef.current.close();
      recorderCtxRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
      } catch (error) {
        console.error("Failed to stop current TTS source", error);
      }
      currentAudioSourceRef.current.disconnect();
      currentAudioSourceRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    partialAsrPendingRef.current = false;
    partialAsrRequestedAtRef.current = 0;
    currentUtteranceIdRef.current += 1;
    assistantTurnIdRef.current += 1;
    assistantStreamingPreviewRef.current = "";
    assistantCaptionCommittedRef.current = "";
    setIsPlaying(false);
    setPartialUserTranscript("");
    setAssistantCaptionText("");
    setAssistantSpeechStatus("idle");
    setMicStatus("idle");
    setCameraStatus("off");
  }, []);

  /**
   * 更新当前房间画像并同步写回缓存，保证视频状态切换后仍能被其他页面读取。
   * @param updater 基于上一份画像返回下一份画像。
   */
  const updateStoredProfile = useCallback(
    (updater: (current: InterviewProfileState | null) => InterviewProfileState | null) => {
      setProfile((current) => {
        const next = updater(current);
        if (next) {
          writeStoredInterviewProfile(next);
        }
        return next;
      });
    },
    []
  );

  /**
   * 记录实时语音里被打断的面试官回复片段，供下一轮继续承接上下文。
   * @param assistantText 被打断前已生成的面试官文本片段。
   */
  const storeRealtimeInterruptionContext = useCallback(
    (assistantText: string) => {
      const normalizedText = assistantText.replace(/\s+/g, " ").trim();
      if (!normalizedText) {
        return;
      }

      updateStoredProfile((current) =>
        current
          ? {
              ...current,
              realtimeInterruptionContext: {
                interruptedAssistantText: normalizedText,
                interruptedAt: new Date().toISOString()
              }
            }
          : current
      );
    },
    [updateStoredProfile]
  );

  /**
   * 清除上一轮实时语音被打断的上下文，避免已承接完成后继续污染后续轮次。
   */
  const clearRealtimeInterruptionContext = useCallback(() => {
    updateStoredProfile((current) =>
      current
        ? {
            ...current,
            realtimeInterruptionContext: undefined
          }
        : current
    );
  }, [updateStoredProfile]);

  /**
   * 关闭当前本地视频轨道，但保留音频链路。
   */
  const disableRealtimeVideo = useCallback(() => {
    if (streamRef.current) {
      streamRef.current
        .getVideoTracks()
        .forEach((track) => {
          track.stop();
          streamRef.current?.removeTrack(track);
        });
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus("off");
    setCameraErrorMsg("");

    updateStoredProfile((current) =>
      current
        ? {
            ...current,
            videoEnabled: false
          }
        : current
    );
  }, [updateStoredProfile]);

  /**
   * 打开当前本地视频轨道；若房间已连通则在现有流上增补视频预览。
   */
  const enableRealtimeVideo = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("error");
      setCameraErrorMsg("当前浏览器不支持摄像头访问。");
      return;
    }

    if (!isSecureMediaContext()) {
      setCameraStatus("error");
      setCameraErrorMsg("当前站点不是 HTTPS 安全环境，浏览器不会开放摄像头权限。");
      return;
    }

    try {
      setCameraStatus("requesting");
      setCameraErrorMsg("");
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
      const videoTrack = videoStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error("未获取到可用视频轨道。");
      }

      if (streamRef.current) {
        streamRef.current
          .getVideoTracks()
          .forEach((track) => {
            track.stop();
            streamRef.current?.removeTrack(track);
          });
        streamRef.current.addTrack(videoTrack);
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      } else if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
      }

      setCameraStatus("on");

      updateStoredProfile((current) =>
        current
          ? {
              ...current,
              videoEnabled: true
            }
          : current
      );
    } catch (error) {
      console.error("Failed to enable realtime video", error);
      setCameraStatus("error");
      setCameraErrorMsg(
        error instanceof Error
          ? error.message
          : "摄像头不可用，请检查浏览器权限。"
      );
    }
  }, [updateStoredProfile]);

  /**
   * 切换实时房间中的本地视频预览状态。
   */
  const toggleRealtimeVideo = useCallback(async () => {
    if (!isRealtimeMode) {
      return;
    }

    if (profile?.videoEnabled) {
      disableRealtimeVideo();
      return;
    }

    await enableRealtimeVideo();
  }, [disableRealtimeVideo, enableRealtimeVideo, isRealtimeMode, profile?.videoEnabled]);

  /**
   * 统一收尾当前面试，可选择同步跳转到报告页或仅完成记录。
   * @param options 结束原因、是否跳报告页及是否为卸载清理。
   */
  const finalizeInterview = useCallback(
    async (options: {
      reason: string;
      navigateToReport: boolean;
      keepalive?: boolean;
    }) => {
      if (hasFinalizedRef.current) {
        return;
      }

      hasFinalizedRef.current = true;
      stopRealtimeMedia();
      persistHistorySnapshot();

      const sessionId = currentSessionIdRef.current;
      if (sessionId) {
        if (options.keepalive) {
          finalizeSessionWithKeepalive(sessionId);
        } else {
          try {
            await fetch(`/api/sessions/${sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "completed",
                mode
              })
            });
          } catch (error) {
            console.error("Failed to finalize interview session", error);
          }
        }
      }

      if (activeSessionStorageKey) {
        sessionStorage.removeItem(activeSessionStorageKey);
      }

      if (!options.keepalive && options.navigateToReport) {
        router.push(sessionId ? `/report?sessionId=${sessionId}` : "/report");
      }
    },
    [
      activeSessionStorageKey,
      finalizeSessionWithKeepalive,
      mode,
      persistHistorySnapshot,
      router,
      stopRealtimeMedia
    ]
  );

  /**
   * 在会话已建立后补写开场消息，避免只在生成报告时才真正落库。
   */
  useEffect(() => {
    if (!session?.user?.id || messages.length === 0 || initialMessagePersistedRef.current) {
      return;
    }

    void (async () => {
      const sessionId = await ensureInterviewSession();
      if (!sessionId) {
        return;
      }

      initialMessagePersistedRef.current = true;
      await persistMessage(sessionId, "assistant", messages[0].content.join("\n"));
      persistHistorySnapshot(messages, elapsedTime, completedRounds);
    })();
  }, [
    completedRounds,
    elapsedTime,
    ensureInterviewSession,
    messages,
    persistHistorySnapshot,
    persistMessage,
    session?.user?.id
  ]);

  /**
   * 在面试页面内拦截顶部导航跳转，只影响当前房间，不扩散到历史页面。
   */
  useEffect(() => {
    if (!session?.user?.id || hasFinalizedRef.current) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const href = anchor.getAttribute("href")?.trim() || "";
      if (!href || href.startsWith("#") || href.startsWith("http")) {
        return;
      }

      if (!INTERVIEW_NAV_ITEMS.some((item) => item.href === href)) {
        return;
      }

      if (href === pathname) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setPendingNavigationHref(href);
      setShowExitDialog(true);
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [pathname, session?.user?.id]);

  /**
   * 在刷新或关闭页面时给出原生离开提示，并尽量完成最后一次会话收尾。
   */
  useEffect(() => {
    if (!session?.user?.id || hasFinalizedRef.current) {
      return;
    }

    let unloadConfirmed = false;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      unloadConfirmed = true;
      event.preventDefault();
      event.returnValue = "";
    };

    const handlePageHide = () => {
      if (!unloadConfirmed || hasFinalizedRef.current) {
        return;
      }

      void finalizeInterview({
        reason: "用户关闭或刷新页面",
        navigateToReport: false,
        keepalive: true
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [finalizeInterview, session?.user?.id]);

  /**
   * 当达到时长上限后自动结束，并补上一条结束提示消息。
   */
  useEffect(() => {
    if (
      !durationLimitMinutes ||
      autoEnding ||
      hasFinalizedRef.current ||
      elapsedTime < durationLimitMinutes * 60 ||
      isTyping
    ) {
      return;
    }

    setAutoEnding(true);
    const closingMessage = createClosingMessage(
      `已达到本场 ${durationLimitMinutes} 分钟的时长上限，本轮面试到此结束，正在为你生成报告。`
    );
    setMessages((current) => {
      const nextMessages = [...current, closingMessage];
      persistHistorySnapshot(nextMessages, elapsedTime, completedRounds);
      return nextMessages;
    });

    void (async () => {
      const sessionId = await ensureInterviewSession();
      if (sessionId) {
        await persistMessage(sessionId, "assistant", closingMessage.content.join("\n"));
      }
      await finalizeInterview({
        reason: "时长已达上限",
        navigateToReport: true
      });
    })();
  }, [
    autoEnding,
    completedRounds,
    durationLimitMinutes,
    elapsedTime,
    ensureInterviewSession,
    finalizeInterview,
    isTyping,
    persistHistorySnapshot,
    persistMessage
  ]);

  /**
   * 初始化音频上下文，兼容 Safari 等浏览器的不同实现。
   * @returns 当前可用的音频上下文。
   */
  const initAudioContext = useCallback(() => {
    if (!audioContext) {
      const AudioContextClass =
        window.AudioContext ||
        (window as WindowWithWebkitAudioContext).webkitAudioContext;
      if (AudioContextClass) {
        const context = new AudioContextClass();
        setAudioContext(context);
        if (context.state === "suspended") {
          void context.resume();
        }
        return context;
      }
      return null;
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    return audioContext;
  }, [audioContext]);

  /**
   * 请求 TTS 音频并返回可解码的二进制数据。
   * @param text 需要播报的文本。
   * @param options 当前播报片段使用的语音参数。
   * @param signal 终止信号。
   * @returns 音频二进制；失败时返回 `null`。
   */
  const fetchTtsAudio = useCallback(
    async (
      text: string,
      options?: RealtimeTtsRequestOptions,
      signal?: AbortSignal
    ) => {
      if (!text.trim() || !isRealtimeMode) {
        return null;
      }

      try {
        setAudioErrorMsg("");
        const response = await fetch("/api/speech/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceType: options?.voiceType,
            speedRatio: options?.speedRatio,
            pitchRatio: options?.pitchRatio,
            volumeRatio: options?.volumeRatio
          }),
          signal
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setAudioErrorMsg(errorBody.error || "AI 语音播报失败，请稍后重试。");
          return null;
        }

        return await response.arrayBuffer();
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Failed to fetch TTS audio", error);
          setAudioErrorMsg(
            error instanceof Error ? error.message : "AI 语音播报失败，请稍后重试。"
          );
        }
        return null;
      }
    },
    [isRealtimeMode]
  );

  /**
   * 播放队列中的下一段音频，保持实时模式下的连续播报体验。
   */
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    const queuedSegment = audioQueueRef.current.shift();
    if (!queuedSegment) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }

    try {
      const context = initAudioContext();
      if (!context) {
        throw new Error("当前浏览器不支持音频播放。");
      }

      if (context.state === "suspended") {
        await context.resume();
      }

      if (
        isInterruptedRef.current ||
        queuedSegment.turnId !== assistantTurnIdRef.current
      ) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        if (!isInterruptedRef.current) {
          setAssistantSpeechStatus("idle");
        }
        if (audioQueueRef.current.some((item) => item.turnId === assistantTurnIdRef.current)) {
          void playNextAudio();
        }
        return;
      }

      const decodedBuffer = await context.decodeAudioData(
        queuedSegment.audioBinary.slice(0)
      );
      const source = context.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(context.destination);
      currentAudioSourceRef.current = source;
      setAudioErrorMsg("");
      const nextCaptionText = [
        assistantCaptionCommittedRef.current,
        queuedSegment.text
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (nextCaptionText) {
        setAssistantCaptionText(nextCaptionText);
      }
      setAssistantSpeechStatus("speaking");
      source.onended = () => {
        currentAudioSourceRef.current = null;
        isPlayingRef.current = false;
        setIsPlaying(false);
        assistantCaptionCommittedRef.current = nextCaptionText;
        setAssistantCaptionText(nextCaptionText);
        if (
          !isInterruptedRef.current &&
          queuedSegment.turnId === assistantTurnIdRef.current
        ) {
          if (!audioQueueRef.current.some((item) => item.turnId === assistantTurnIdRef.current)) {
            setAssistantSpeechStatus("idle");
          }
          window.setTimeout(() => {
            if (
              !isInterruptedRef.current &&
              queuedSegment.turnId === assistantTurnIdRef.current
            ) {
              void playNextAudio();
            }
          }, queuedSegment.pauseAfterMs);
        }
      };
      source.start(0);
    } catch (error) {
      console.error("Audio playback failed", error);
      setAudioErrorMsg(
        error instanceof Error
          ? error.message
          : "AI 语音未成功播放，请点击重新连接后重试。"
      );
      isPlayingRef.current = false;
      setIsPlaying(false);
      currentAudioSourceRef.current = null;
      if (!isInterruptedRef.current) {
        setAssistantSpeechStatus("idle");
      }
      if (
        !isInterruptedRef.current &&
        queuedSegment.turnId === assistantTurnIdRef.current
      ) {
        void playNextAudio();
      }
    }
  }, [initAudioContext]);

  /**
   * 将一段文本加入 TTS 播放队列，仅在实时模式下启用。
   * @param text 需要播报的文本。
   * @param turnId 当前面试官发言轮次。
   * @param segmentIndex 当前轮次里的播报片段序号。
   */
  const queueTts = useCallback(
    async (text: string, turnId: number, segmentIndex = 0) => {
      if (!isRealtimeMode || isInterruptedRef.current) {
        return;
      }

      if (turnId !== assistantTurnIdRef.current) {
        return;
      }

      const spokenText = sanitizeTtsTextForConversation(text);
      if (!spokenText) {
        return;
      }

      setAssistantSpeechStatus("thinking");
      const ttsOptions = buildRealtimeTtsOptions(spokenText, segmentIndex);
      const signal = ttsAbortControllerRef.current?.signal;
      const audioBinary = await fetchTtsAudio(spokenText, ttsOptions, signal);
      if (
        !audioBinary ||
        isInterruptedRef.current ||
        signal?.aborted ||
        turnId !== assistantTurnIdRef.current
      ) {
        return;
      }

      audioQueueRef.current.push({
        turnId,
        text: spokenText,
        audioBinary,
        pauseAfterMs: buildRealtimeTtsPauseAfterMs(spokenText, segmentIndex)
      });
      void playNextAudio();
    },
    [fetchTtsAudio, isRealtimeMode, playNextAudio]
  );

  /**
   * 在实时模式下打断当前 AI 播放和流式生成，允许候选人直接插话。
   */
  const interruptAi = useCallback(() => {
    const interruptedPreview = assistantStreamingPreviewRef.current.trim();
    if (interruptedPreview) {
      storeRealtimeInterruptionContext(interruptedPreview);
    }

    isInterruptedRef.current = true;
    assistantTurnIdRef.current += 1;
    abortControllerRef.current?.abort();
    ttsAbortControllerRef.current?.abort();

    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
      } catch (error) {
        console.error("Failed to interrupt current audio source", error);
      }
      currentAudioSourceRef.current.disconnect();
      currentAudioSourceRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsTyping(false);
    setIsThinking(false);
    setAudioErrorMsg("");
    setAssistantSpeechStatus("interrupted");
  }, [storeRealtimeInterruptionContext]);

  /**
   * 将 PCM 浮点音频数据转换为 16 位整型，供语音识别接口使用。
   * @param float32 当前音频帧。
   * @returns PCM16 数据块。
   */
  const pcmFloatTo16 = useCallback((float32: Float32Array) => {
    const output = new Int16Array(float32.length);
    for (let index = 0; index < float32.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, float32[index]));
      output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  }, []);

  /**
   * 合并多段 PCM16 音频块，供一次性上传识别。
   * @param chunks 多段音频数据。
   * @returns 合并后的 PCM16 音频。
   */
  const concatInt16 = useCallback((chunks: Int16Array[]) => {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Int16Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }, []);

  /**
   * 将 ArrayBuffer 编码为 Base64，兼容语音识别接口的传输格式。
   * @param buffer 原始二进制数据。
   * @returns Base64 字符串。
   */
  const arrayBufferToBase64 = useCallback((buffer: ArrayBufferLike) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }, []);

  /**
   * 发送实时录音到 ASR 接口，并将识别结果继续接入当前面试流。
   * @param pcm16 待识别的 PCM16 音频。
   */
  const submitPcmToAsr = useCallback(
    async (pcm16: Int16Array) => {
      if (pcm16.length < 16000 * 0.2) {
        setMicStatus("error");
        setMicErrorMsg("声音太短或太轻，请重试。");
        window.setTimeout(() => setMicStatus("recording"), 1500);
        return;
      }

      try {
        const audioBase64 = arrayBufferToBase64(pcm16.buffer);
        const response = await fetch("/api/speech/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            format: "raw"
          })
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errorBody.error || "语音识别失败");
        }

        const data = (await response.json()) as { text?: string };
        if (!data.text?.trim()) {
          setPartialUserTranscript("");
          setMicStatus("error");
          setMicErrorMsg("未识别到清晰语音，请靠近麦克风重试。");
          window.setTimeout(() => setMicStatus("recording"), 1500);
          return;
        }

        setPartialUserTranscript("");
        await handleSendMessageRef.current(data.text);
      } catch (error) {
        console.error("ASR request failed", error);
        setPartialUserTranscript("");
        setMicStatus("error");
        setMicErrorMsg(
          error instanceof Error
            ? error.message
            : "语音识别失败，请检查网络或设备。"
        );
        window.setTimeout(() => setMicStatus("recording"), 1500);
      }
    },
    [arrayBufferToBase64]
  );

  /**
   * 在用户仍在发言时尝试请求一版临时识别结果，为字幕区提供更接近实时的增量反馈。
   * @param pcm16 当前发言已累计的 PCM16 音频。
   * @param utteranceId 当前发言轮次编号，用于丢弃过期结果。
   */
  const requestPartialUserTranscript = useCallback(
    async (pcm16: Int16Array, utteranceId: number) => {
      if (partialAsrPendingRef.current || pcm16.length < 16000 * 0.6) {
        return;
      }

      partialAsrPendingRef.current = true;
      try {
        const audioBase64 = arrayBufferToBase64(pcm16.buffer);
        const response = await fetch("/api/speech/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            format: "raw"
          })
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { text?: string };
        if (
          utteranceId !== currentUtteranceIdRef.current ||
          micStatusRef.current === "processing"
        ) {
          return;
        }

        if (data.text?.trim()) {
          setPartialUserTranscript(data.text.trim());
        }
      } catch (error) {
        console.error("Partial ASR request failed", error);
      } finally {
        partialAsrPendingRef.current = false;
      }
    },
    [arrayBufferToBase64]
  );

  /**
   * 启动实时面试所需的麦克风和可选视频采集，并串接本地 VAD。
   * @param initialText 首次连接后需要立即播报的文本。
   */
  const startRealtimeConnection = useCallback(
    async (initialText?: string) => {
      if (!session?.user?.id) {
        requireActionAuth(
          () => {
            void startRealtimeConnection(initialText);
          },
          "登录后连接实时面试"
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setMicStatus("error");
        setMicErrorMsg("当前浏览器不支持麦克风访问。");
        return;
      }

      if (!isSecureMediaContext()) {
        setMicStatus("error");
        setMicErrorMsg("当前站点不是 HTTPS 安全环境，浏览器不会开放麦克风权限。");
        return;
      }

      initAudioContext();
      if (isTyping || isPlayingRef.current) {
        interruptAi();
      }

      try {
        stopRealtimeMedia();
        setMicStatus("requesting");
        setMicErrorMsg("");
        setAudioErrorMsg("");
        setPartialUserTranscript("");
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: Boolean(profile?.videoEnabled)
        });

        streamRef.current = mediaStream;
        if (profile?.videoEnabled && videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          setCameraStatus("on");
        } else {
          setCameraStatus("off");
        }

        if (initialText) {
          void queueTts(initialText, assistantTurnIdRef.current, 0);
        }

        const AudioContextClass =
          window.AudioContext ||
          (window as WindowWithWebkitAudioContext).webkitAudioContext;
        const context = new AudioContextClass({ sampleRate: 16000 });
        recorderCtxRef.current = context;
        const source = context.createMediaStreamSource(mediaStream);
        const processor = context.createScriptProcessor(4096, 1, 1);
        recorderSourceRef.current = source;
        recorderProcessorRef.current = processor;
        source.connect(processor);
        processor.connect(context.destination);

        utteranceChunksRef.current = [];
        utteranceHasVoiceRef.current = false;
        utteranceLastVoiceAtRef.current = 0;
        utteranceStartAtRef.current = 0;

        processor.onaudioprocess = (event) => {
          event.outputBuffer.getChannelData(0).fill(0);
          if (micStatusRef.current !== "recording") {
            return;
          }

          const inputData = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let index = 0; index < inputData.length; index += 1) {
            sum += inputData[index] * inputData[index];
          }
          const rms = Math.sqrt(sum / inputData.length);
          const now = performance.now();
          const isVoice = rms > 0.002;

          if (isVoice) {
            if (!utteranceHasVoiceRef.current && (isTypingRef.current || isPlayingRef.current)) {
              interruptAi();
            }
            utteranceHasVoiceRef.current = true;
            utteranceLastVoiceAtRef.current = now;
            if (utteranceStartAtRef.current === 0) {
              utteranceStartAtRef.current = now;
              currentUtteranceIdRef.current += 1;
              partialAsrRequestedAtRef.current = 0;
              partialAsrPendingRef.current = false;
              setPartialUserTranscript("");
            }
          }

          if (utteranceHasVoiceRef.current) {
            utteranceChunksRef.current.push(pcmFloatTo16(inputData));
            const utteranceDuration = now - utteranceStartAtRef.current;
            if (
              utteranceDuration > 900 &&
              now - partialAsrRequestedAtRef.current > 900 &&
              !partialAsrPendingRef.current
            ) {
              partialAsrRequestedAtRef.current = now;
              const pcmSnapshot = concatInt16(utteranceChunksRef.current);
              void requestPartialUserTranscript(
                pcmSnapshot,
                currentUtteranceIdRef.current
              );
            }
          }

          const silenceTime = now - utteranceLastVoiceAtRef.current;
          const duration = now - utteranceStartAtRef.current;
          if (
            utteranceHasVoiceRef.current &&
            utteranceLastVoiceAtRef.current > 0 &&
            (silenceTime > 800 || duration > 10000)
          ) {
            const pcm = concatInt16(utteranceChunksRef.current);
            utteranceChunksRef.current = [];
            utteranceHasVoiceRef.current = false;
            utteranceLastVoiceAtRef.current = 0;
            utteranceStartAtRef.current = 0;
            partialAsrRequestedAtRef.current = 0;
            setMicStatus("processing");
            void submitPcmToAsr(pcm).finally(() => {
              if (micStatusRef.current === "processing") {
                setMicStatus("recording");
              }
            });
          }
        };

        setMicStatus("recording");
      } catch (error) {
        console.error("Failed to access realtime media", error);
        stopRealtimeMedia();
        setMicStatus("denied");
        setMicErrorMsg(
          profile?.videoEnabled
            ? "摄像头或麦克风权限不可用，请在浏览器设置中允许访问。"
            : "麦克风权限不可用，请在浏览器设置中允许访问。"
        );
      }
    },
    [
      concatInt16,
      initAudioContext,
      interruptAi,
      isTyping,
      pcmFloatTo16,
      profile?.videoEnabled,
      queueTts,
      requestPartialUserTranscript,
      requireActionAuth,
      session?.user?.id,
      stopRealtimeMedia,
      submitPcmToAsr
    ]
  );

  /**
   * 切换实时房间中的麦克风状态，支持静音和恢复。
   */
  const toggleRealtimeMic = useCallback(() => {
    if (!isRealtimeMode || autoEnding) {
      return;
    }

    if (!streamRef.current || streamRef.current.getAudioTracks().length === 0) {
      setNeedsInteraction(false);
      initAudioContext();
      void startRealtimeConnection();
      return;
    }

    const audioTracks = streamRef.current.getAudioTracks();
    const nextEnabled = !audioTracks[0].enabled;
    audioTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });

    setMicErrorMsg("");
    if (!nextEnabled) {
      setPartialUserTranscript("");
      currentUtteranceIdRef.current += 1;
    }
    setMicStatus(nextEnabled ? "recording" : "muted");
  }, [autoEnding, initAudioContext, isRealtimeMode, startRealtimeConnection]);

  /**
   * 统一发送用户消息，并在必要时自动创建会话、落库消息和处理自动结束。
   * @param rawText 用户输入文本。
   * @param overrideTag 附加标签，如“跳过本题”。
   */
  const handleSendMessage = useCallback(
    async (rawText: string, overrideTag?: string) => {
      if (!session?.user?.id) {
        requireActionAuth(
          () => {
            void handleSendMessage(rawText, overrideTag);
          },
          "登录后开始面试对话"
        );
        return;
      }

      const text = rawText.trim();
      if (!text || isTyping || autoEnding || hasFinalizedRef.current) {
        return;
      }

      const sessionId = await ensureInterviewSession();
      if (!sessionId) {
        return;
      }

      isInterruptedRef.current = false;
      const assistantTurnId = assistantTurnIdRef.current + 1;
      assistantTurnIdRef.current = assistantTurnId;
      assistantStreamingPreviewRef.current = "";
      assistantCaptionCommittedRef.current = "";
      setAssistantCaptionText("");
      setAssistantSpeechStatus("thinking");
      abortControllerRef.current = new AbortController();
      ttsAbortControllerRef.current = new AbortController();
      const activeProfile = readStoredInterviewProfile() ?? profile;

      const userMessage: InterviewMessage = {
        role: "user",
        content: text.split("\n"),
        time: buildMessageTime(),
        tag: overrideTag || ""
      };
      const nextCompletedRounds = completedRoundsRef.current + 1;
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);
      setCompletedRounds(nextCompletedRounds);
      setInput("");
      setIsTyping(true);
      setIsThinking(true);
      setThinkingStatus("面试官思考中");
      persistHistorySnapshot(updatedMessages, elapsedTimeRef.current, nextCompletedRounds);
      await persistMessage(sessionId, "user", userMessage.content.join("\n"));

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages,
            profile: activeProfile,
            mode,
            topic,
            desc,
            questionLimit,
            durationLimitMinutes,
            completedRounds: nextCompletedRounds
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          if (response.status === 403) {
            const errorBody = (await response.json()) as { error?: string };
            setLimitAlertMessage(errorBody.error || "当前面试次数已达上限。");
            setShowLimitAlert(true);
          }
          throw new Error("Failed to stream interview response");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const placeholderMessage: InterviewMessage = {
          role: "ai",
          content: [""],
          time: buildMessageTime(),
          tag: ""
        };
        setMessages((current) => [...current, placeholderMessage]);

        let fullText = "";
        let processedTextLength = 0;
        let queuedSegmentCount = 0;
        if (reader) {
          let isFirstToken = true;
          try {
            while (true) {
              if (assistantTurnIdRef.current !== assistantTurnId) {
                break;
              }
              const { done, value } = await reader.read();
              if (done) {
                setIsThinking(false);
                const remainingText = fullText.slice(processedTextLength).trim();
                if (
                  remainingText &&
                  !isInterruptedRef.current &&
                  assistantTurnIdRef.current === assistantTurnId
                ) {
                  void queueTts(remainingText, assistantTurnId, queuedSegmentCount);
                  queuedSegmentCount += 1;
                }
                break;
              }

              const parsedChunk = parseInterviewStreamChunk(
                decoder.decode(value, { stream: true })
              );
              if (parsedChunk.searching) {
                setThinkingStatus("进一步检索资料中");
              }
              if (parsedChunk.generating) {
                setThinkingStatus("面试官思考中");
              }

              const textChunk = parsedChunk.content;
              if (!textChunk) {
                continue;
              }

              if (isFirstToken && textChunk.trim()) {
                isFirstToken = false;
                setIsThinking(false);
                if (!isRealtimeMode) {
                  setAssistantSpeechStatus("idle");
                }
              }

              fullText += textChunk;
              assistantStreamingPreviewRef.current = fullText;
              setMessages((current) => {
                const nextMessages = [...current];
                const lastIndex = nextMessages.length - 1;
                nextMessages[lastIndex] = {
                  ...nextMessages[lastIndex],
                  content: fullText.split("\n")
                };
                return nextMessages;
              });

              if (isRealtimeMode) {
                const { segments, consumedLength } = extractSpeakableTextSegments(
                  fullText.slice(processedTextLength),
                  processedTextLength === 0
                );
                if (
                  consumedLength > 0 &&
                  !isInterruptedRef.current &&
                  assistantTurnIdRef.current === assistantTurnId
                ) {
                  segments.forEach((segment) => {
                    void queueTts(segment, assistantTurnId, queuedSegmentCount);
                    queuedSegmentCount += 1;
                  });
                  processedTextLength += consumedLength;
                }
              }
            }
          } catch (error) {
            if (!isAbortError(error)) {
              throw error;
            }
          }
        }

        const finalizedAiText = fullText.trim();
        if (
          finalizedAiText &&
          !isInterruptedRef.current &&
          assistantTurnIdRef.current === assistantTurnId
        ) {
          assistantStreamingPreviewRef.current = finalizedAiText;
          assistantCaptionCommittedRef.current = finalizedAiText;
          setAssistantCaptionText(finalizedAiText);
          const finalizedMessages = [
            ...updatedMessages,
            {
              ...placeholderMessage,
              content: finalizedAiText.split("\n")
            }
          ];
          persistHistorySnapshot(
            finalizedMessages,
            elapsedTimeRef.current,
            nextCompletedRounds
          );
          await persistMessage(sessionId, "assistant", finalizedAiText);
          clearRealtimeInterruptionContext();
          if (!isRealtimeMode) {
            setAssistantSpeechStatus("idle");
          }
        }

        if (questionLimit && nextCompletedRounds >= questionLimit) {
          setAutoEnding(true);
          await finalizeInterview({
            reason: "题量已达上限",
            navigateToReport: true
          });
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Failed to send interview message", error);
        }
      } finally {
        if (assistantTurnIdRef.current === assistantTurnId) {
          assistantStreamingPreviewRef.current = "";
        }
        setIsThinking(false);
        if (!isInterruptedRef.current) {
          setIsTyping(false);
        }
        if (
          assistantTurnIdRef.current === assistantTurnId &&
          !isPlayingRef.current &&
          !isInterruptedRef.current
        ) {
          setAssistantSpeechStatus("idle");
        }
      }
    },
    [
      autoEnding,
      desc,
      durationLimitMinutes,
      ensureInterviewSession,
      clearRealtimeInterruptionContext,
      finalizeInterview,
      isRealtimeMode,
      isTyping,
      mode,
      persistHistorySnapshot,
      persistMessage,
      profile,
      questionLimit,
      queueTts,
      requireActionAuth,
      session?.user?.id,
      topic
    ]
  );

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  /**
   * 处理发送按钮点击，复用统一消息发送主流程。
   */
  const handleSend = useCallback(() => {
    void handleSendMessage(input);
  }, [handleSendMessage, input]);

  /**
   * 处理快捷动作“跳过本题”。
   */
  const handleSkip = useCallback(() => {
    void handleSendMessage("这道题我不太清楚，我们可以跳过吗？", "跳过本题");
  }, [handleSendMessage]);

  /**
   * 处理快捷动作“我不知道”。
   */
  const handleIdk = useCallback(() => {
    void handleSendMessage(
      "这个问题我暂时回答不上来，请先给我一点提示，再继续追问。",
      "我不知道"
    );
  }, [handleSendMessage]);

  /**
   * 处理输入框回车发送逻辑，同时兼容中文输入法组合态。
   * @param event 文本域键盘事件。
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        if (
          event.nativeEvent.isComposing ||
          isComposingRef.current ||
          event.keyCode === 229
        ) {
          return;
        }
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /**
   * 由按钮触发主动结束，并跳转到报告页。
   */
  const handleManualEnd = useCallback(() => {
    if (!session?.user?.id) {
      requireActionAuth(handleManualEnd, "登录后结束面试并生成报告");
      return;
    }

    setAutoEnding(true);
    void finalizeInterview({
      reason: "用户主动结束面试",
      navigateToReport: true
    });
  }, [finalizeInterview, requireActionAuth, session?.user?.id]);

  /**
   * 取消当前离开操作并关闭结束确认弹层。
   */
  const handleExitCancel = useCallback(() => {
    setPendingNavigationHref(null);
    setShowExitDialog(false);
  }, []);

  /**
   * 确认离开当前面试，先完成会话收尾，再跳转到目标页面。
   */
  const handleExitConfirm = useCallback(() => {
    if (!pendingNavigationHref) {
      setShowExitDialog(false);
      return;
    }

    setIsExitConfirming(true);
    void (async () => {
      try {
        await finalizeInterview({
          reason: "用户主动离开房间",
          navigateToReport: false
        });
        router.push(pendingNavigationHref);
      } finally {
        setIsExitConfirming(false);
        setShowExitDialog(false);
        setPendingNavigationHref(null);
      }
    })();
  }, [finalizeInterview, pendingNavigationHref, router]);

  const latestAiMessageText =
    [...messages]
      .reverse()
      .find((message) => message.role === "ai")
      ?.content.join(" ") || "";
  const latestAiMessageIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .filter((entry) => entry.message.role === "ai")
    .at(-1)?.index;
  const latestUserMessageText =
    [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content.join(" ") || "";
  const displayedAssistantCaptionText =
    assistantCaptionText.trim() || latestAiMessageText;
  const displayedUserCaptionText =
    partialUserTranscript.trim() || latestUserMessageText;
  const realtimeCaptionLines = useMemo(
    () =>
      buildRealtimeCaptionLines(
        displayedAssistantCaptionText,
        "连接后，面试官的发言会以实时字幕方式显示在这里。"
      ),
    [displayedAssistantCaptionText]
  );
  const userRealtimeCaptionLines = useMemo(
    () =>
      buildRealtimeCaptionLines(
        displayedUserCaptionText,
        "连接后，你的发言会以实时字幕方式显示在这里。"
      ),
    [displayedUserCaptionText]
  );
  const visibleCaptionLines =
    realtimeCaptionLines.length > 1
      ? [
          ...realtimeCaptionLines,
          realtimeCaptionLines[0],
          realtimeCaptionLines[1] || realtimeCaptionLines[0]
        ]
      : realtimeCaptionLines;
  const visibleUserCaptionLines =
    userRealtimeCaptionLines.length > 1
      ? [
          ...userRealtimeCaptionLines,
          userRealtimeCaptionLines[0],
          userRealtimeCaptionLines[1] || userRealtimeCaptionLines[0]
        ]
      : userRealtimeCaptionLines;
  const attendeeLabel =
    session?.user?.name?.trim() || initialProfile?.role?.trim() || "用户";
  const roomStatusLabel = needsInteraction
    ? "等待进入会议"
    : assistantSpeechStatus === "interrupted"
      ? "已暂停，正在听你说"
    : isThinking
      ? thinkingStatus
      : isPlaying
        ? "面试官正在播报"
        : partialUserTranscript.trim()
          ? "你正在说话"
        : micStatus === "processing"
          ? "正在识别你的回答"
          : micStatus === "muted"
            ? "你的麦克风已静音"
            : micStatus === "recording"
              ? "正在通话"
              : micStatus === "requesting"
                ? "正在连接设备"
                : micStatus === "denied" || micStatus === "error"
                  ? "设备连接异常"
                  : "等待连接完成";
  const micButtonLabel =
    micStatus === "muted" || micStatus === "idle" || micStatus === "denied"
      ? "打开麦克风"
      : "静音麦克风";
  const showVideoPreview = profile?.videoEnabled && cameraStatus === "on";

  /**
   * 让实时字幕按行自然切换，而不是整段文本整体做动画。
   */
  useEffect(() => {
    setCaptionLineIndex(0);
    setCaptionTransitionEnabled(true);

    if (realtimeCaptionLines.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setCaptionLineIndex((current) => current + 1);
    }, 2200);

    return () => {
      window.clearInterval(timer);
    };
  }, [realtimeCaptionLines]);

  /**
   * 让用户字幕也按双行窗口、逐行上移的方式自然切换。
   */
  useEffect(() => {
    setUserCaptionLineIndex(0);
    setUserCaptionTransitionEnabled(true);

    if (userRealtimeCaptionLines.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setUserCaptionLineIndex((current) => current + 1);
    }, 2200);

    return () => {
      window.clearInterval(timer);
    };
  }, [userRealtimeCaptionLines]);

  /**
   * 在字幕滚到补位行后，静默重置到第一行，避免首尾切换时跳动。
   */
  const handleCaptionTransitionEnd = useCallback(() => {
    if (realtimeCaptionLines.length <= 1) {
      return;
    }

    if (captionLineIndex < realtimeCaptionLines.length) {
      return;
    }

    setCaptionTransitionEnabled(false);
    setCaptionLineIndex(0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setCaptionTransitionEnabled(true);
      });
    });
  }, [captionLineIndex, realtimeCaptionLines.length]);

  /**
   * 用户字幕滚到补位行后，静默回到第一行，避免跳动。
   */
  const handleUserCaptionTransitionEnd = useCallback(() => {
    if (userRealtimeCaptionLines.length <= 1) {
      return;
    }

    if (userCaptionLineIndex < userRealtimeCaptionLines.length) {
      return;
    }

    setUserCaptionTransitionEnabled(false);
    setUserCaptionLineIndex(0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setUserCaptionTransitionEnabled(true);
      });
    });
  }, [userCaptionLineIndex, userRealtimeCaptionLines.length]);

  return (
    <section
      id="view-interview"
      className="view active"
      style={{
        paddingTop: 0,
        paddingBottom: 0,
        minHeight: "calc(100vh - 70px)"
      }}
    >
      {showLimitAlert ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 220,
            display: "grid",
            placeItems: "center",
            backgroundColor: "rgba(20, 20, 19, 0.42)",
            backdropFilter: "blur(6px)"
          }}
        >
          <div
            style={{
              width: "min(92vw, 460px)",
              padding: "2rem",
              borderRadius: "24px",
              backgroundColor: "rgba(255, 255, 255, 0.98)",
              border: "1px solid rgba(20,20,19,0.08)",
              boxShadow: "0 28px 70px rgba(20,20,19,0.15)"
            }}
          >
            <h3 style={{ marginBottom: "0.65rem" }}>提示</h3>
            <p style={{ marginBottom: "1.5rem", color: "rgba(20,20,19,0.72)" }}>
              {limitAlertMessage}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowLimitAlert(false)}
            >
              我知道了
            </button>
          </div>
        </div>
      ) : null}

      {showExitDialog ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 230,
            display: "grid",
            placeItems: "center",
            backgroundColor: "rgba(20, 20, 19, 0.42)",
            backdropFilter: "blur(6px)"
          }}
        >
          <div
            style={{
              width: "min(92vw, 520px)",
              padding: "2rem",
              borderRadius: "24px",
              backgroundColor: "rgba(255, 255, 255, 0.98)",
              border: "1px solid rgba(20,20,19,0.08)",
              boxShadow: "0 28px 70px rgba(20,20,19,0.15)"
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0.72rem",
                borderRadius: "999px",
                backgroundColor: "rgba(217, 119, 87, 0.1)",
                color: "var(--accent-orange)",
                fontSize: "0.8rem",
                fontWeight: 600
              }}
            >
              面试进行中
            </div>
            <h3 style={{ margin: "1rem 0 0.7rem 0" }}>是否结束本次面试？</h3>
            <p style={{ marginBottom: "1.5rem", color: "rgba(20,20,19,0.72)", lineHeight: 1.7 }}>
              当前面试仍在进行中。确认离开后会立即结束本次面试，并停止当前房间的后续追问。
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                flexWrap: "wrap"
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleExitCancel}
                disabled={isExitConfirming}
              >
                继续当前面试
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExitConfirm}
                disabled={isExitConfirming}
              >
                {isExitConfirming ? "正在结束..." : "结束并离开"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isRealtimeMode ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 70px)",
            backgroundColor: "var(--bg-main)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              flexShrink: 0,
              zIndex: 12,
              background:
                "linear-gradient(180deg, rgba(250,249,245,0.98), rgba(250,249,245,0.94))",
              backdropFilter: "blur(10px)",
              borderBottom: "1px solid rgba(20,20,19,0.06)"
            }}
          >
            <div
              style={{
                maxWidth: "1160px",
                margin: "0 auto",
                padding: "1.2rem 1.5rem",
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              <div style={{ display: "grid", gap: "0.4rem" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.55rem"
                  }}
                >
                  <span className="tag tag-primary" style={{ margin: 0 }}>
                    {modeLabel}
                  </span>
                  {topic ? (
                    <span
                      style={{
                        display: "inline-flex",
                        padding: "0.25rem 0.65rem",
                        borderRadius: "999px",
                        backgroundColor: "rgba(106, 155, 204, 0.08)",
                        color: "var(--accent-blue)",
                        fontSize: "0.8rem",
                        fontWeight: 600
                      }}
                    >
                      {topic}
                    </span>
                  ) : null}
                </div>
                <h1 style={{ margin: 0, fontSize: "1.6rem" }}>
                  {profile?.role?.trim() || "等待补充岗位信息"}
                </h1>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.94rem",
                    color: "rgba(20,20,19,0.72)"
                  }}
                >
                  {limitStrategy.summary}，当前第 {currentQuestionNumber} 题
                  {remainingQuestionCount !== null
                    ? `，剩余 ${remainingQuestionCount} 题`
                    : "，不限轮次"}
                  。
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.7rem",
                  flexWrap: "wrap"
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.62rem 0.95rem",
                    borderRadius: "999px",
                    backgroundColor: "rgba(217, 119, 87, 0.08)",
                    color: "var(--accent-orange)",
                    fontWeight: 700
                  }}
                >
                  已用时 {formatElapsedClock(elapsedTime)}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleManualEnd}
                  disabled={autoEnding}
                >
                  {autoEnding ? "正在结束..." : "结束并生成报告"}
                </button>
              </div>
            </div>
          </div>

          <div
            ref={chatHistoryRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.5rem",
              minHeight: 0
            }}
          >
            <div
              style={{
                maxWidth: "920px",
                margin: "0 auto",
                display: "grid",
                gap: "1.5rem"
              }}
            >
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${message.time}-${index}`}
                  style={{
                    display: "flex",
                    justifyContent:
                      message.role === "user" ? "flex-end" : "flex-start"
                  }}
                >
                  <div
                    style={{
                      maxWidth: message.role === "user" ? "78%" : "92%",
                      display: "flex",
                      gap: "0.95rem",
                      alignItems: "flex-start",
                      flexDirection:
                        message.role === "user" ? "row-reverse" : "row"
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        minWidth: "44px",
                        height: "44px",
                        minHeight: "44px",
                        flex: "0 0 44px",
                        aspectRatio: "1 / 1",
                        borderRadius: "50%",
                        backgroundColor:
                          message.role === "user"
                            ? "rgba(106, 155, 204, 0.1)"
                            : "rgba(217, 119, 87, 0.1)",
                        border: "1px solid rgba(20,20,19,0.08)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        color:
                          message.role === "user"
                            ? "var(--accent-blue)"
                            : "var(--accent-orange)",
                        overflow: "hidden"
                      }}
                    >
                      {message.role === "user" ? (
                        "我"
                      ) : (
                        <svg
                          aria-hidden="true"
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 12a8 8 0 0 1 16 0" />
                          <path d="M2 13v3a2 2 0 0 0 2 2h1v-7H4a2 2 0 0 0-2 2Z" />
                          <path d="M22 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" />
                          <path d="M9 18a3 3 0 0 0 6 0" />
                        </svg>
                      )}
                    </div>
                    <div
                      className={`interview-message__body ${message.role === "user" ? "is-user" : "is-ai"}`}
                    >
                      {message.tag ? (
                        <div
                          style={{
                            display: "inline-flex",
                            marginBottom: "0.55rem",
                            padding: "0.18rem 0.56rem",
                            borderRadius: "999px",
                            backgroundColor: "rgba(20,20,19,0.05)",
                            color: "var(--text-muted)",
                            fontSize: "0.75rem",
                            fontWeight: 600
                          }}
                        >
                          {message.tag}
                        </div>
                      ) : null}
                      <div
                        className={`markdown-body interview-markdown ${message.role === "user" ? "is-user" : "is-ai"}`}
                      >
                        {message.role === "ai" ? (
                          <>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {normalizeInterviewMarkdown(message.content.join("\n\n"))}
                            </ReactMarkdown>
                            {isTyping && latestAiMessageIndex === index ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  width: "8px",
                                  height: "1.05rem",
                                  borderRadius: "999px",
                                  backgroundColor: "rgba(217, 119, 87, 0.55)",
                                  verticalAlign: "middle",
                                  marginTop: "0.15rem"
                                }}
                              />
                            ) : null}
                          </>
                        ) : (
                          message.content.map((paragraph) => (
                            <p key={`${message.time}-${paragraph}`}>{paragraph}</p>
                          ))
                        )}
                      </div>
                      <div
                        style={{
                          marginTop: "0.75rem",
                          fontSize: "0.76rem",
                          color: "var(--text-muted)"
                        }}
                      >
                        {message.time}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {isThinking ? (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      padding: "0.72rem 0.92rem",
                      borderRadius: "999px",
                      backgroundColor: "rgba(20,20,19,0.04)",
                      color: "var(--text-muted)",
                      fontSize: "0.84rem"
                    }}
                  >
                    {thinkingStatus}
                  </div>
                </div>
              ) : null}
              <div ref={chatBottomRef} aria-hidden="true" />
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              zIndex: 10,
              padding: "1rem 1.5rem 1.4rem",
              background:
                "linear-gradient(180deg, rgba(250,249,245,0), rgba(250,249,245,0.98) 18%, rgba(250,249,245,0.98))"
            }}
          >
            <div
              style={{
                maxWidth: "920px",
                margin: "0 auto",
                padding: "1rem 1.1rem",
                borderRadius: "26px",
                border: "1px solid rgba(20,20,19,0.08)",
                backgroundColor: "rgba(255,255,255,0.95)",
                boxShadow: "0 18px 40px rgba(20,20,19,0.08)"
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  window.setTimeout(() => {
                    isComposingRef.current = false;
                  }, 300);
                }}
                disabled={isTyping || autoEnding}
                rows={1}
                placeholder="输入你的回答，按 Enter 发送，Shift + Enter 换行"
                style={{
                  width: "100%",
                  minHeight: "52px",
                  maxHeight: "180px",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  fontSize: "0.95rem",
                  backgroundColor: "transparent",
                  color: "var(--text-dark)",
                  fontFamily: "var(--font-ui)",
                  lineHeight: 1.6
                }}
              />
              <div
                style={{
                  marginTop: "0.75rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSkip}
                    disabled={isTyping || autoEnding}
                    style={{ height: "44px", padding: "0 1rem", fontSize: "0.9rem" }}
                  >
                    跳过本题
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleIdk}
                    disabled={isTyping || autoEnding}
                    style={{ height: "44px", padding: "0 1rem", fontSize: "0.9rem" }}
                  >
                    我不知道
                  </button>
                </div>
                <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleManualEnd}
                    disabled={autoEnding}
                    style={{ height: "44px", padding: "0 1rem", fontSize: "0.9rem" }}
                  >
                    {autoEnding ? "正在结束..." : "结束面试"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping || autoEnding}
                    style={{ height: "44px", padding: "0 1.15rem", fontSize: "0.9rem" }}
                  >
                    发送回答
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            minHeight: "calc(100vh - 70px)",
            background:
              "radial-gradient(920px 420px at 12% 12%, rgba(217, 119, 87, 0.12), transparent 62%), radial-gradient(820px 360px at 88% 10%, rgba(106, 155, 204, 0.1), transparent 58%), linear-gradient(180deg, #faf9f5 0%, #f6f4ee 100%)",
            padding: "1.25rem"
          }}
        >
          {needsInteraction ? (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 130,
                display: "grid",
                placeItems: "center",
                backgroundColor: "rgba(250,249,245,0.82)",
                backdropFilter: "blur(10px)"
              }}
            >
              <div
                style={{
                  width: "min(92vw, 520px)",
                  padding: "2rem",
                  borderRadius: "32px",
                  backgroundColor: "rgba(255,255,255,0.96)",
                  border: "1px solid rgba(20,20,19,0.08)",
                  boxShadow: "0 32px 80px rgba(20,20,19,0.14)"
                }}
              >
                <span className="tag tag-primary" style={{ margin: 0 }}>
                  {modeLabel}
                </span>
                <h1 style={{ marginTop: "0.9rem", marginBottom: "0.75rem" }}>
                  开始实时面试连接
                </h1>
                <p style={{ color: "rgba(20,20,19,0.72)" }}>
                  这是一场以音频为主的会议式面试。
                  {profile?.videoEnabled
                    ? " 你当前已打开摄像头，连接后会展示你的本地画面。"
                    : " 你当前使用纯音频模式，连接后仍可随时打开摄像头。"}
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "0.75rem",
                    margin: "1.25rem 0 1.5rem"
                  }}
                >
                  <div
                    style={{
                      padding: "0.9rem 1rem",
                      borderRadius: "18px",
                      border: "1px solid rgba(20,20,19,0.08)",
                      backgroundColor: "rgba(255,255,255,0.76)"
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      题量 / 时长
                    </div>
                    <div style={{ marginTop: "0.3rem", fontWeight: 700 }}>
                      {limitStrategy.summary}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "0.9rem 1rem",
                      borderRadius: "18px",
                      border: "1px solid rgba(20,20,19,0.08)",
                      backgroundColor: "rgba(255,255,255,0.76)"
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      当前重点
                    </div>
                    <div style={{ marginTop: "0.3rem", fontWeight: 700 }}>
                      {topic || profile?.focus || "综合面试"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setNeedsInteraction(false);
                    initAudioContext();
                    void startRealtimeConnection(messages[0]?.content.join(" "));
                  }}
                >
                  点击开始连接
                </button>
              </div>
            </div>
          ) : null}

          <div
            style={{
              maxWidth: "1420px",
              margin: "0 auto",
              display: "grid",
              gap: "1rem",
              minHeight: "calc(100vh - 70px - 2.5rem)"
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateRows: "auto 1fr auto auto",
                borderRadius: "34px",
                border: "1px solid rgba(20,20,19,0.08)",
                backgroundColor: "rgba(255,255,255,0.76)",
                boxShadow: "0 22px 60px rgba(20,20,19,0.08)",
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                  padding: "1.05rem 1.25rem",
                  borderBottom: "1px solid rgba(20,20,19,0.06)",
                  backgroundColor: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(14px)"
                }}
              >
                <div style={{ display: "grid", gap: "0.36rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
                    <span className="tag tag-primary" style={{ margin: 0 }}>
                      {modeLabel}
                    </span>
                    <span className="chip">{topic || profile?.focus || "综合面试"}</span>
                    <span className="chip" style={{ color: "var(--accent-orange)" }}>
                      {roomStatusLabel}
                    </span>
                  </div>
                  <strong style={{ fontFamily: "var(--font-heading)", fontSize: "1.18rem" }}>
                    {profile?.role?.trim() || "实时面试房间"}
                  </strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                    {limitStrategy.summary}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", alignItems: "center" }}>
                  <div className="chip" style={{ color: "var(--accent-orange)" }}>
                    已用时 {formatElapsedClock(elapsedTime)}
                  </div>
                  <div className="chip">第 {currentQuestionNumber} 题</div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setNeedsInteraction(false);
                      initAudioContext();
                      void startRealtimeConnection(messages[0]?.content.join(" "));
                    }}
                    disabled={autoEnding}
                    style={{ height: "40px", padding: "0 0.95rem", fontSize: "0.86rem" }}
                  >
                    重新连接
                  </button>
                </div>
              </div>

              <div
                style={{
                  padding: "1.2rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "1rem"
                }}
              >
                <div
                  style={{
                    position: "relative",
                    minHeight: "440px",
                    borderRadius: "28px",
                    overflow: "hidden",
                    border: "1px solid rgba(20,20,19,0.08)",
                    background:
                      "radial-gradient(520px 260px at 40% 18%, rgba(106, 155, 204, 0.22), transparent 60%), linear-gradient(180deg, #1f2127 0%, #141413 100%)",
                    color: "white",
                    display: "grid",
                    gridTemplateRows: "1fr auto"
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: "1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      pointerEvents: "none"
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        padding: "0.45rem 0.72rem",
                        borderRadius: "999px",
                        backgroundColor: "rgba(255,255,255,0.14)",
                        backdropFilter: "blur(10px)",
                        fontSize: "0.84rem",
                        fontWeight: 700
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: isPlaying ? "#6a9bcc" : isThinking ? "#d97757" : "#b0aea5",
                          boxShadow: isPlaying ? "0 0 0 6px rgba(106,155,204,0.18)" : "none"
                        }}
                      />
                      面试官
                    </div>
                    <span
                      style={{
                        padding: "0.42rem 0.68rem",
                        borderRadius: "999px",
                        backgroundColor: "rgba(255,255,255,0.12)",
                        backdropFilter: "blur(10px)",
                        fontSize: "0.8rem",
                        color: "rgba(255,255,255,0.82)"
                      }}
                    >
                      {assistantSpeechStatus === "interrupted"
                        ? "已被打断"
                        : isPlaying
                          ? "播报中"
                          : isThinking
                            ? thinkingStatus
                            : "待发言"}
                    </span>
                  </div>

                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      display: "grid",
                      placeItems: "center",
                      padding: "3rem 2rem 1.2rem"
                    }}
                  >
                    <div style={{ textAlign: "center", maxWidth: "30rem" }}>
                      <div
                        style={{
                          position: "relative",
                          width: "176px",
                          height: "176px",
                          margin: "0 auto 1.4rem",
                          display: "grid",
                          placeItems: "center"
                        }}
                      >
                        {(isPlaying || isThinking) && (
                          <>
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: "50%",
                                border: `2px solid ${isPlaying ? "rgba(106,155,204,0.88)" : "rgba(217,119,87,0.76)"}`,
                                opacity: 0.42,
                                animation: "pulse-ring 2s ease-out infinite"
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                inset: "16px",
                                borderRadius: "50%",
                                border: `2px solid ${isPlaying ? "rgba(106,155,204,0.58)" : "rgba(217,119,87,0.42)"}`,
                                opacity: 0.28,
                                animation: "pulse-ring 2s ease-out infinite 0.8s"
                              }}
                            />
                          </>
                        )}
                        <div
                          style={{
                            width: "124px",
                            height: "124px",
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            background:
                              "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.08))",
                            border: "1px solid rgba(255,255,255,0.16)",
                            backdropFilter: "blur(14px)",
                            boxShadow: "0 26px 52px rgba(0,0,0,0.22)"
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="42"
                            height="42"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 12a8 8 0 0 1 16 0" />
                            <path d="M2 13v3a2 2 0 0 0 2 2h1v-7H4a2 2 0 0 0-2 2Z" />
                            <path d="M22 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" />
                            <path d="M9 18a3 3 0 0 0 6 0" />
                          </svg>
                        </div>
                      </div>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.15rem", fontWeight: 700 }}>
                        面试官
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      margin: "0 1rem 1rem",
                      padding: "0.82rem 1rem",
                      borderRadius: "18px",
                      backgroundColor: "rgba(255,255,255,0.82)",
                      border: "1px solid rgba(20,20,19,0.08)",
                      backdropFilter: "blur(10px)",
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        marginBottom: "0.35rem"
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.76rem",
                          color: "rgba(20,20,19,0.62)",
                          fontWeight: 700
                        }}
                      >
                        实时字幕
                      </span>
                      <span
                        style={{
                          fontSize: "0.76rem",
                          color: "rgba(20,20,19,0.58)"
                        }}
                      >
                        {latestUserMessageText ? `你刚刚说：${latestUserMessageText}` : "等待你的发言"}
                      </span>
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        height: "3.4rem",
                        fontSize: "0.94rem",
                        color: "rgba(20,20,19,0.92)",
                        lineHeight: 1.7,
                        position: "relative"
                      }}
                    >
                      <div
                        onTransitionEnd={handleCaptionTransitionEnd}
                        style={{
                          display: "grid",
                          width: "100%",
                          transform: `translateY(-${captionLineIndex * 1.7}rem)`,
                          transition: captionTransitionEnabled
                            ? "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)"
                            : "none"
                        }}
                      >
                        {visibleCaptionLines.map((line, index) => (
                          <span
                            key={`caption-line-${index}-${line}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              minHeight: "1.7rem",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {line}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    position: "relative",
                    minHeight: "440px",
                    borderRadius: "28px",
                    overflow: "hidden",
                    border: "1px solid rgba(20,20,19,0.08)",
                    background:
                      showVideoPreview
                        ? "#0f1116"
                        : "radial-gradient(520px 260px at 50% 18%, rgba(120, 140, 93, 0.2), transparent 62%), linear-gradient(180deg, #f4f1e8 0%, #ece7da 100%)",
                    display: "grid"
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: "1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      zIndex: 2,
                      pointerEvents: "none"
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        padding: "0.45rem 0.72rem",
                        borderRadius: "999px",
                        backgroundColor: showVideoPreview ? "rgba(20,20,19,0.38)" : "rgba(255,255,255,0.8)",
                        backdropFilter: "blur(10px)",
                        color: showVideoPreview ? "rgba(255,255,255,0.94)" : "var(--text-dark)",
                        fontSize: "0.84rem",
                        fontWeight: 700
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor:
                            micStatus === "recording"
                              ? "#788c5d"
                              : micStatus === "muted"
                                ? "#d97757"
                                : "#b0aea5"
                        }}
                      />
                      {attendeeLabel}
                    </div>
                    <span
                      style={{
                        padding: "0.42rem 0.68rem",
                        borderRadius: "999px",
                        backgroundColor: showVideoPreview ? "rgba(20,20,19,0.38)" : "rgba(255,255,255,0.8)",
                        backdropFilter: "blur(10px)",
                        fontSize: "0.8rem",
                        color: showVideoPreview ? "rgba(255,255,255,0.86)" : "var(--text-muted)"
                      }}
                    >
                      {showVideoPreview
                        ? "本地画面"
                        : cameraStatus === "requesting"
                          ? "正在开启摄像头"
                          : "头像占位"}
                    </span>
                  </div>

                  {showVideoPreview ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: "scaleX(-1)"
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        placeItems: "center",
                        padding: "3rem 2rem",
                        textAlign: "center",
                        color: "var(--text-dark)"
                      }}
                    >
                      <div>
                        <div
                          style={{
                            width: "124px",
                            height: "124px",
                            margin: "0 auto 1.25rem",
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            background: "linear-gradient(135deg, rgba(120,140,93,0.18), rgba(106,155,204,0.14))",
                            border: "1px solid rgba(20,20,19,0.08)"
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="38"
                            height="38"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" />
                            <path d="M4 20a8 8 0 0 1 16 0" />
                          </svg>
                        </div>
                        <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.12rem", fontWeight: 700 }}>
                          {attendeeLabel}
                        </div>
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      margin: "0 1rem 1rem",
                      padding: "0.82rem 1rem",
                      borderRadius: "18px",
                      backgroundColor: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      backdropFilter: "blur(10px)",
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        marginBottom: "0.35rem"
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.76rem",
                          color: "rgba(255,255,255,0.62)",
                          fontWeight: 700
                        }}
                      >
                        实时字幕
                      </span>
                      <span
                        style={{
                          fontSize: "0.76rem",
                          color: "rgba(255,255,255,0.58)"
                        }}
                      >
                        {partialUserTranscript.trim()
                          ? "正在实时识别你的发言"
                          : micStatus === "processing"
                          ? "正在识别你的语音"
                          : micStatus === "recording"
                            ? "你的发言将实时显示在这里"
                            : micStatus === "muted"
                              ? "当前麦克风已静音"
                              : "等待你的发言"}
                      </span>
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        height: "3.4rem",
                        fontSize: "0.94rem",
                        color: "rgba(255,255,255,0.92)",
                        lineHeight: 1.7,
                        position: "relative"
                      }}
                    >
                      <div
                        onTransitionEnd={handleUserCaptionTransitionEnd}
                        style={{
                          display: "grid",
                          width: "100%",
                          transform: `translateY(-${userCaptionLineIndex * 1.7}rem)`,
                          transition: userCaptionTransitionEnabled
                            ? "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)"
                            : "none"
                        }}
                      >
                        {visibleUserCaptionLines.map((line, index) => (
                          <span
                            key={`user-caption-line-${index}-${line}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              minHeight: "1.7rem",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {line}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: "1rem 1.25rem 1.3rem",
                  borderTop: "1px solid rgba(20,20,19,0.06)",
                  backgroundColor: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(12px)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={toggleRealtimeMic}
                      disabled={autoEnding}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem", minWidth: "146px", justifyContent: "center" }}
                    >
                      {micStatus === "muted" || micStatus === "idle" || micStatus === "denied" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v11" /><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12" /><path d="M15 9.34V6a3 3 0 0 0-5.83-1" /><path d="M17 16.95A7 7 0 0 1 5 12v-2" /><path d="M19 10v2a7 7 0 0 1-.62 2.91" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                      )}
                      {micButtonLabel}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        void toggleRealtimeVideo();
                      }}
                      disabled={autoEnding}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem", minWidth: "146px", justifyContent: "center" }}
                    >
                      {profile?.videoEnabled ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"></path><rect x="2" y="6" width="14" height="12" rx="2" ry="2"></rect></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"></path><rect x="2" y="6" width="14" height="12" rx="2" ry="2"></rect><line x1="2" y1="2" x2="22" y2="22"></line></svg>
                      )}
                      {profile?.videoEnabled ? "关闭视频" : "开启视频"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleManualEnd}
                      disabled={autoEnding}
                      style={{ backgroundColor: "#d97757", minWidth: "146px", justifyContent: "center" }}
                    >
                      {autoEnding ? "正在结束..." : "结束面试"}
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "0.28rem",
                      width: "100%",
                      textAlign: "center",
                      justifyItems: "center"
                    }}
                  >
                    <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {micStatus === "recording"
                        ? "麦克风已打开，可以直接说话。"
                        : micStatus === "processing"
                          ? "正在识别你的语音..."
                          : micStatus === "muted"
                            ? "当前已静音，面试官仍会继续提问。"
                            : micStatus === "denied" || micStatus === "error"
                              ? micErrorMsg
                              : "点击麦克风后会开始采集你的语音。"}
                    </span>
                    {(cameraErrorMsg || audioErrorMsg) && (
                      <span style={{ fontSize: "0.82rem", color: "var(--accent-orange)" }}>
                        {cameraErrorMsg || audioErrorMsg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <style>{`
            @keyframes pulse-ring {
              0% { transform: scale(1); opacity: 0.7; }
              100% { transform: scale(1.28); opacity: 0; }
            }
            @keyframes realtime-caption-marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
        </div>
      )}
    </section>
  );
}

/**
 * 为面试房间提供 Suspense 边界，兼容查询参数读取时的异步渲染。
 * @returns 带 Suspense 包裹的面试房间组件。
 */
export default function Interview() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InterviewContent />
    </Suspense>
  );
}
