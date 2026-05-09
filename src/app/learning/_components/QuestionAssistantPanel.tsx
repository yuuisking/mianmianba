"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Mermaid from "@/components/Mermaid";

type QuestionAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type QuestionAssistantSessionTitleState = "pending" | "auto" | "custom";

type QuestionAssistantSession = {
  id: string;
  questionId: string;
  kbId: string;
  categoryId: string;
  questionTitle: string;
  categoryName: string;
  knowledgeBaseName: string;
  title: string;
  titleState: QuestionAssistantSessionTitleState;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastPreview: string;
  messages: QuestionAssistantMessage[];
};

type QuestionAssistantPanelProps = {
  questionId: string;
  kbId: string;
  categoryId: string;
  questionTitle: string;
  categoryName: string;
  knowledgeBaseName: string;
  triggerMode?: "click" | "hover";
};

const STORAGE_KEY = "learning-question-assistant-v2";
const MAX_SESSION_COUNT = 20;

/**
 * 为题目页的面面吧智能助手创建 Markdown 渲染组件，并在 Mermaid 代码块上启用图表渲染。
 * @returns {Components} ReactMarkdown 组件映射。
 */
function createMarkdownComponents(): Components {
  return {
    /**
     * 渲染 Mermaid 代码块，其余代码块保持普通展示。
     * @param {object} props Markdown code 节点属性。
     * @returns {ReactNode} 渲染后的代码节点。
     */
    code(props): ReactNode {
      const { className, children, ...rest } = props;
      const match = /language-(\w+)/.exec(className || "");
      if (match?.[1] === "mermaid") {
        return <Mermaid chart={String(children).replace(/\n$/, "")} />;
      }

      return (
        <code className={className} {...rest}>
          {children as ReactNode}
        </code>
      );
    },
  };
}

/**
 * 判断一段文本是否包含 Mermaid 图表起始语法。
 * @param {string} value 原始文本。
 * @returns {boolean} 是否疑似 Mermaid 图表内容。
 */
function containsBareMermaid(value: string): boolean {
  return /(^|\n)\s*mermaid\s+(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|xychart-beta)\b/i.test(
    value
  );
}

/**
 * 将模型输出中不规范的 Mermaid 文本纠正为标准 Markdown 代码块。
 * @param {string} value 助手原始回答。
 * @returns {string} 可被 Markdown 正确识别的回答文本。
 */
function normalizeAssistantMarkdown(value: string): string {
  if (!value.trim()) {
    return value;
  }

  const normalized = value.replace(
    /```mermaid\s+(?=(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|xychart-beta)\b)/gi,
    "```mermaid\n"
  );

  if (/```mermaid[\s\S]*```/i.test(normalized) || !containsBareMermaid(normalized)) {
    return normalized;
  }

  const bareMatch = normalized.match(
    /(^|\n)(\s*mermaid\s+(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|xychart-beta)\b[\s\S]*)/i
  );
  if (!bareMatch || bareMatch.index === undefined) {
    return normalized;
  }

  const diagramStart = bareMatch.index + bareMatch[1].length;
  const before = normalized.slice(0, diagramStart).trimEnd();
  const diagramAndTail = normalized.slice(diagramStart).trimStart();
  const tailMatch = diagramAndTail.match(/(?:流程图说明|图示说明|补充说明|说明)[:：]/);
  const diagramPart = (tailMatch ? diagramAndTail.slice(0, tailMatch.index) : diagramAndTail)
    .replace(/^mermaid\s+/i, "")
    .trim();
  const tailPart = tailMatch ? diagramAndTail.slice(tailMatch.index).trim() : "";

  return [before, `\`\`\`mermaid\n${diagramPart}\n\`\`\``, tailPart].filter(Boolean).join("\n\n");
}

/**
 * 生成浏览器端稳定可用的本地消息标识。
 * @returns {string} 本地唯一标识。
 */
function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 将时间字符串格式化为侧边栏中的短时间。
 * @param {string} value ISO 时间。
 * @returns {string} `MM-DD HH:mm` 格式时间。
 */
function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * 将消息压缩成历史列表可读摘要。
 * @param {string} content 原始消息内容。
 * @returns {string} 历史摘要。
 */
function buildPreviewText(content: string): string {
  const normalized = normalizeAssistantMarkdown(content).replace(/\s+/g, " ").trim();
  if (normalized.length <= 36) {
    return normalized;
  }

  return `${normalized.slice(0, 35).trim()}...`;
}

/**
 * 将任意标题清洗成适合侧边栏展示的一行短标题。
 * @param {string} value 原始标题文本。
 * @returns {string} 清洗后的标题。
 */
function sanitizeSessionTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length <= 24 ? normalized : `${normalized.slice(0, 23).trim()}…`;
}

/**
 * 将本地存储中的题目助手会话标准化为当前版本结构。
 * @param {QuestionAssistantSession} session 原始会话对象。
 * @returns {QuestionAssistantSession} 兼容当前字段的会话对象。
 */
function normalizeAssistantSession(session: QuestionAssistantSession): QuestionAssistantSession {
  const title = sanitizeSessionTitle(session.title) || "新对话";
  const titleState =
    session.titleState === "pending" || session.titleState === "auto" || session.titleState === "custom"
      ? session.titleState
      : title === "新对话"
        ? "pending"
        : "auto";

  return {
    ...session,
    title,
    titleState,
    isPinned: session.isPinned === true,
  };
}

/**
 * 读取浏览器本地存储中的题目助手历史会话。
 * @returns {QuestionAssistantSession[]} 已持久化的会话数组。
 */
function readAssistantSessions(): QuestionAssistantSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is QuestionAssistantSession => {
        return Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as QuestionAssistantSession).id === "string" &&
            typeof (item as QuestionAssistantSession).questionId === "string" &&
            Array.isArray((item as QuestionAssistantSession).messages)
        );
      })
      .map((item) => normalizeAssistantSession(item));
  } catch {
    return [];
  }
}

/**
 * 将题目助手会话写回浏览器本地存储。
 * @param {QuestionAssistantSession[]} sessions 会话数组。
 * @returns {void} 同步写入 localStorage。
 */
function writeAssistantSessions(sessions: QuestionAssistantSession[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

/**
 * 按置顶状态和更新时间倒序排列会话。
 * @param {QuestionAssistantSession[]} sessions 原始会话数组。
 * @returns {QuestionAssistantSession[]} 已排序的会话数组。
 */
function sortSessionsByUpdatedAt(sessions: QuestionAssistantSession[]): QuestionAssistantSession[] {
  return [...sessions].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

/**
 * 基于当前题目上下文创建一个新会话。
 * @param {QuestionAssistantPanelProps} props 当前题目与分类上下文。
 * @returns {QuestionAssistantSession} 新会话对象。
 */
function createSession(props: QuestionAssistantPanelProps): QuestionAssistantSession {
  const now = new Date().toISOString();
  return {
    id: createLocalId(),
    questionId: props.questionId,
    kbId: props.kbId,
    categoryId: props.categoryId,
    questionTitle: props.questionTitle,
    categoryName: props.categoryName,
    knowledgeBaseName: props.knowledgeBaseName,
    title: "新对话",
    titleState: "pending",
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    lastPreview: "",
    messages: [],
  };
}

/**
 * 仅在标题尚未生成且用户未手动重命名时写入首轮自动标题。
 * @param {QuestionAssistantSession} session 当前会话。
 * @param {string} nextTitle 候选标题。
 * @returns {QuestionAssistantSession} 更新后的会话。
 */
function applyAutoSessionTitle(
  session: QuestionAssistantSession,
  nextTitle: string
): QuestionAssistantSession {
  const sanitizedTitle = sanitizeSessionTitle(nextTitle);
  if (!sanitizedTitle || session.titleState !== "pending") {
    return session;
  }

  return {
    ...session,
    title: sanitizedTitle,
    titleState: "auto",
  };
}

/**
 * 将单个会话合并回总会话数组，并限制保留数量。
 * @param {QuestionAssistantSession[]} sessions 当前会话数组。
 * @param {QuestionAssistantSession} nextSession 最新会话。
 * @returns {QuestionAssistantSession[]} 合并后的会话数组。
 */
function upsertSession(
  sessions: QuestionAssistantSession[],
  nextSession: QuestionAssistantSession
): QuestionAssistantSession[] {
  return sortSessionsByUpdatedAt([
    nextSession,
    ...sessions.filter((session) => session.id !== nextSession.id),
  ]).slice(0, MAX_SESSION_COUNT);
}

/**
 * 渲染题目页沿用的品牌助手图标。
 * @returns {ReactNode} 适合入口与面板头部的品牌图标。
 */
function renderAssistantLogo(): ReactNode {
  return (
    <img
      src="/branding/mianmianba-assistant-mark.svg"
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
    />
  );
}

/**
 * 题库场景下的面面吧智能助手题目模式，复用原有智能助手的壳子与交互体验。
 * @param {QuestionAssistantPanelProps} props 当前题目与分类上下文。
 * @returns {ReactNode} 浮动入口与助手面板。
 */
export default function QuestionAssistantPanel(props: QuestionAssistantPanelProps): ReactNode {
  const { questionId, kbId, categoryId, questionTitle, categoryName, knowledgeBaseName, triggerMode = "click" } = props;
  const markdownComponents = useMemo(() => createMarkdownComponents(), []);
  const [sessions, setSessions] = useState<QuestionAssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [openHistoryMenuSessionId, setOpenHistoryMenuSessionId] = useState("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const sessionsRef = useRef<QuestionAssistantSession[]>([]);
  const activeSessionIdRef = useRef("");

  const questionSessions = useMemo(
    () =>
      sortSessionsByUpdatedAt(
        sessions.filter(
          (session) =>
            session.questionId === questionId && session.kbId === kbId && session.categoryId === categoryId
        )
      ),
    [categoryId, kbId, questionId, sessions]
  );
  const pinnedSessions = useMemo(
    () => questionSessions.filter((session) => session.isPinned),
    [questionSessions]
  );
  const regularSessions = useMemo(
    () => questionSessions.filter((session) => !session.isPinned),
    [questionSessions]
  );
  const activeSession = questionSessions.find((session) => session.id === activeSessionId) ?? null;
  const hasMessages = (activeSession?.messages.length ?? 0) > 0;
  const isHoverMode = triggerMode === "hover";
  const starterPrompts = useMemo(
    () => [
      `这道题在面试里最容易怎么追问：${questionTitle}`,
      `把这道题的标准回答压缩成 3 个必须记住的点`,
      `如果我是 ${knowledgeBaseName} 面试官，会怎样基于这道题继续深挖`,
      `如果回答这道题，我应该怎么组织成更像面试表达的版本`,
    ],
    [knowledgeBaseName, questionTitle]
  );

  /**
   * 同步会话到状态与本地存储。
   * @param {QuestionAssistantSession[]} nextSessions 最新会话数组。
   * @returns {void} 更新状态并持久化。
   */
  function persistSessions(nextSessions: QuestionAssistantSession[]): void {
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);
    writeAssistantSessions(nextSessions);
  }

  /**
   * 创建一个绑定当前题目的新会话并激活。
   * @returns {QuestionAssistantSession | null} 新会话对象。
   */
  function createAndActivateSession(): QuestionAssistantSession | null {
    const nextSession = createSession(props);
    persistSessions(upsertSession(sessionsRef.current, nextSession));
    setActiveSessionId(nextSession.id);
    setDraft("");
    setError("");
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
    return nextSession;
  }

  /**
   * 按当前题目上下文开启全新对话。
   * @returns {void} 重置输入、菜单与编辑态。
   */
  function handleNewConversation(): void {
    setOpenHistoryMenuSessionId("");
    setEditingSessionId("");
    setEditingTitle("");
    createAndActivateSession();
  }

  /**
   * 删除指定历史会话，并在删除当前会话时自动切到最近可用会话。
   * @param {string} sessionId 目标会话标识。
   * @returns {void} 更新会话列表与当前选中状态。
   */
  function deleteSession(sessionId: string): void {
    const nextSessions = sortSessionsByUpdatedAt(sessionsRef.current.filter((session) => session.id !== sessionId));
    persistSessions(nextSessions);
    setOpenHistoryMenuSessionId((current) => (current === sessionId ? "" : current));
    setEditingSessionId((current) => (current === sessionId ? "" : current));
    setEditingTitle("");

    if (activeSessionIdRef.current === sessionId) {
      const fallback =
        nextSessions.find(
          (session) =>
            session.questionId === questionId && session.kbId === kbId && session.categoryId === categoryId
        ) ?? null;
      setActiveSessionId(fallback?.id ?? "");
    }
  }

  /**
   * 切换到历史会话。
   * @param {string} sessionId 目标会话标识。
   * @returns {void} 更新当前激活会话。
   */
  function openSession(sessionId: string): void {
    const nextSession = questionSessions.find((session) => session.id === sessionId);
    if (!nextSession) {
      return;
    }

    setOpenHistoryMenuSessionId("");
    setActiveSessionId(nextSession.id);
    setError("");
  }

  /**
   * 切换历史会话的置顶状态，并重新排序到合适位置。
   * @param {string} sessionId 目标会话标识。
   * @returns {void} 同步更新本地历史列表。
   */
  function togglePinSession(sessionId: string): void {
    const nextSessions = sortSessionsByUpdatedAt(
      sessionsRef.current.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              isPinned: !session.isPinned,
            }
          : session
      )
    );
    persistSessions(nextSessions);
    setOpenHistoryMenuSessionId("");
  }

  /**
   * 进入历史标题重命名状态，并预填当前标题。
   * @param {string} sessionId 目标会话标识。
   * @returns {void} 打开编辑输入框。
   */
  function startRenameSession(sessionId: string): void {
    const session = sessionsRef.current.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    setOpenHistoryMenuSessionId("");
    setEditingSessionId(sessionId);
    setEditingTitle(session.title);
  }

  /**
   * 取消当前历史标题编辑态。
   * @returns {void} 清空编辑状态。
   */
  function cancelRenameSession(): void {
    setEditingSessionId("");
    setEditingTitle("");
  }

  /**
   * 保存用户手动输入的历史标题，并锁定为自定义标题。
   * @param {string} sessionId 目标会话标识。
   * @returns {void} 更新会话标题。
   */
  function submitRenameSession(sessionId: string): void {
    const sanitizedTitle = sanitizeSessionTitle(editingTitle);
    if (!sanitizedTitle) {
      cancelRenameSession();
      return;
    }

    const nextSessions = sortSessionsByUpdatedAt(
      sessionsRef.current.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: sanitizedTitle,
              titleState: "custom" as const,
            }
          : session
      )
    );
    persistSessions(nextSessions);
    setEditingSessionId("");
    setEditingTitle("");
  }

  useEffect(() => {
    const storedSessions = readAssistantSessions();
    sessionsRef.current = storedSessions;
    setSessions(storedSessions);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (activeSessionId && questionSessions.some((session) => session.id === activeSessionId)) {
      return;
    }

    setActiveSessionId(questionSessions[0]?.id ?? "");
  }, [activeSessionId, isHydrated, questionSessions]);

  useEffect(() => {
    if (!isOpen || !messagesRef.current) {
      return;
    }

    messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [activeSession, isOpen, isPending]);

  useEffect(() => {
    if (!editingSessionId) {
      return;
    }

    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingSessionId]);

  /**
   * 将推荐提问写入输入框，等待用户确认发送。
   * @param {string} prompt 推荐问题。
   * @returns {void} 仅更新输入框。
   */
  function applyStarterPrompt(prompt: string): void {
    setDraft(prompt);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }

  /**
   * 发送问题到题目助手 API，并把返回结果写回当前会话历史。
   * @returns {Promise<void>} 完成一次题目问答。
   */
  async function sendMessage(): Promise<void> {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }

    setIsPending(true);
    setError("");

    const userMessage: QuestionAssistantMessage = {
      id: createLocalId(),
      role: "user",
      content: trimmedDraft,
      createdAt: new Date().toISOString(),
    };

    const baseSession =
      sessionsRef.current.find((session) => session.id === activeSessionIdRef.current) ??
      createAndActivateSession() ??
      createSession(props);
    const optimisticSession: QuestionAssistantSession = applyAutoSessionTitle(
      {
        ...baseSession,
        questionId,
        kbId,
        categoryId,
        questionTitle,
        categoryName,
        knowledgeBaseName,
        updatedAt: userMessage.createdAt,
        lastPreview: buildPreviewText(trimmedDraft),
        messages: [...baseSession.messages, userMessage],
      },
      trimmedDraft
    );

    persistSessions(upsertSession(sessionsRef.current, optimisticSession));
    setActiveSessionId(optimisticSession.id);
    setDraft("");

    try {
      const query = new URLSearchParams({
        kbId,
        categoryId,
      });
      const response = await fetch(`/api/learning/questions/${questionId}/assistant?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: optimisticSession.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "面面吧智能助手暂时不可用，请稍后再试。");
      }

      const assistantMessage: QuestionAssistantMessage = {
        id: createLocalId(),
        role: "assistant",
        content: normalizeAssistantMarkdown(payload.answer || "我暂时没有整理出可靠回答，请换个问法再试一次。"),
        createdAt: new Date().toISOString(),
      };

      const nextSessions = sessionsRef.current.map((session) =>
        session.id === optimisticSession.id
          ? {
              ...session,
              updatedAt: assistantMessage.createdAt,
              lastPreview: buildPreviewText(assistantMessage.content),
              messages: [...session.messages, assistantMessage],
            }
          : session
      );
      persistSessions(sortSessionsByUpdatedAt(nextSessions));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "面面吧智能助手暂时不可用，请稍后再试。");
    } finally {
      setIsPending(false);
    }
  }

  /**
   * 在输入框中按回车直接发送，Shift + Enter 保留换行。
   * @param {KeyboardEvent<HTMLTextAreaElement>} event 键盘事件。
   * @returns {Promise<void>} 命中快捷键时触发发送。
   */
  async function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): Promise<void> {
    if (event.nativeEvent.isComposing || isComposingRef.current || event.nativeEvent.keyCode === 229) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    await sendMessage();
  }

  return (
    <div
      className={isHoverMode ? "learning-assistant-dock" : undefined}
      onMouseEnter={isHoverMode ? () => setIsOpen(true) : undefined}
      onMouseLeave={isHoverMode ? () => setIsOpen(false) : undefined}
    >
      <button
        type="button"
        className={`learning-assistant-entry ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen((current) => (isHoverMode ? true : !current))}
        aria-label={isOpen ? "收起面面吧智能助手" : "打开面面吧智能助手"}
        aria-expanded={isOpen}
        title={isOpen ? "收起面面吧智能助手" : "打开面面吧智能助手"}
      >
        <span className="learning-assistant-entry__icon">{renderAssistantLogo()}</span>
        <span className="learning-assistant-entry__copy">
          <strong>面面吧智能助手</strong>
          <span className="learning-assistant-entry__label">题目深挖与连续对话</span>
        </span>
      </button>

      {!isHoverMode ? (
        <div className={`learning-assistant-overlay ${isOpen ? "active" : ""}`} onClick={() => setIsOpen(false)} />
      ) : null}

      <aside
        className={`learning-assistant-panel ${isOpen ? "active" : ""} ${isHoverMode ? "learning-assistant-panel--hover" : ""}`}
        aria-hidden={!isOpen}
      >
        <div className="learning-assistant-panel__header">
          <div className="learning-assistant-panel__brand">
            <div className="learning-assistant-panel__logo">{renderAssistantLogo()}</div>
            <div>
              <div className="learning-assistant-panel__title">面面吧智能助手</div>
              <div className="learning-assistant-panel__subtitle">当前模式：题目深挖与自由追问</div>
            </div>
          </div>
          <div className="learning-assistant-panel__header-actions">
            <button type="button" className="learning-assistant-top-action" onClick={handleNewConversation}>
              新对话
            </button>
            <button type="button" className="learning-assistant-top-action" onClick={() => setIsOpen(false)}>
              关闭
            </button>
          </div>
        </div>

        <div className="learning-assistant-panel__body">
          <aside className="learning-assistant-sidebar">
            <button
              type="button"
              className="learning-assistant-sidebar__new"
              onClick={handleNewConversation}
            >
              <span>+</span>
              <span>发起新对话</span>
            </button>
            <div className="learning-assistant-sidebar__title">历史会话</div>
            <div className="learning-assistant-history__list">
              {questionSessions.length > 0 ? (
                <>
                  {pinnedSessions.length > 0 ? (
                    <div className="learning-assistant-history__group">
                      <div className="learning-assistant-history__group-label">置顶会话</div>
                      {pinnedSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`learning-assistant-history__item ${session.id === activeSessionId ? "active" : ""} ${session.isPinned ? "is-pinned" : ""} ${editingSessionId === session.id ? "is-editing" : ""}`}
                        >
                          {editingSessionId === session.id ? (
                            <div className="learning-assistant-history__rename">
                              <input
                                ref={renameInputRef}
                                value={editingTitle}
                                maxLength={24}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    submitRenameSession(session.id);
                                  }

                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelRenameSession();
                                  }
                                }}
                                aria-label="重命名历史会话"
                              />
                              <div className="learning-assistant-history__rename-actions">
                                <button type="button" onClick={() => submitRenameSession(session.id)}>
                                  保存
                                </button>
                                <button type="button" onClick={cancelRenameSession}>
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="learning-assistant-history__content"
                                onClick={() => openSession(session.id)}
                                title={session.title}
                              >
                                <div className="learning-assistant-history__title-row">
                                  <span className="learning-assistant-history__pin-tag">置顶</span>
                                  <strong>{session.title}</strong>
                                </div>
                                <small>{formatTime(session.updatedAt)}</small>
                              </button>
                              <div className="learning-assistant-history__actions">
                                <button
                                  type="button"
                                  className="learning-assistant-history__menu-trigger"
                                  aria-label="历史会话操作"
                                  aria-expanded={openHistoryMenuSessionId === session.id}
                                  onClick={() =>
                                    setOpenHistoryMenuSessionId((current) => (current === session.id ? "" : session.id))
                                  }
                                >
                                  ...
                                </button>
                                {openHistoryMenuSessionId === session.id ? (
                                  <div className="learning-assistant-history__menu">
                                    <button type="button" onClick={() => startRenameSession(session.id)}>
                                      重命名
                                    </button>
                                    <button type="button" onClick={() => togglePinSession(session.id)}>
                                      取消置顶
                                    </button>
                                    <button
                                      type="button"
                                      className="danger"
                                      onClick={() => deleteSession(session.id)}
                                    >
                                      删除
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {regularSessions.length > 0 ? (
                    <div className="learning-assistant-history__group">
                      <div className="learning-assistant-history__group-label">普通会话</div>
                      {regularSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`learning-assistant-history__item ${session.id === activeSessionId ? "active" : ""} ${editingSessionId === session.id ? "is-editing" : ""}`}
                        >
                          {editingSessionId === session.id ? (
                            <div className="learning-assistant-history__rename">
                              <input
                                ref={renameInputRef}
                                value={editingTitle}
                                maxLength={24}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    submitRenameSession(session.id);
                                  }

                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelRenameSession();
                                  }
                                }}
                                aria-label="重命名历史会话"
                              />
                              <div className="learning-assistant-history__rename-actions">
                                <button type="button" onClick={() => submitRenameSession(session.id)}>
                                  保存
                                </button>
                                <button type="button" onClick={cancelRenameSession}>
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="learning-assistant-history__content"
                                onClick={() => openSession(session.id)}
                                title={session.title}
                              >
                                <div className="learning-assistant-history__title-row">
                                  <strong>{session.title}</strong>
                                </div>
                                <small>{formatTime(session.updatedAt)}</small>
                              </button>
                              <div className="learning-assistant-history__actions">
                                <button
                                  type="button"
                                  className="learning-assistant-history__menu-trigger"
                                  aria-label="历史会话操作"
                                  aria-expanded={openHistoryMenuSessionId === session.id}
                                  onClick={() =>
                                    setOpenHistoryMenuSessionId((current) => (current === session.id ? "" : session.id))
                                  }
                                >
                                  ...
                                </button>
                                {openHistoryMenuSessionId === session.id ? (
                                  <div className="learning-assistant-history__menu">
                                    <button type="button" onClick={() => startRenameSession(session.id)}>
                                      重命名
                                    </button>
                                    <button type="button" onClick={() => togglePinSession(session.id)}>
                                      置顶
                                    </button>
                                    <button
                                      type="button"
                                      className="danger"
                                      onClick={() => deleteSession(session.id)}
                                    >
                                      删除
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="learning-assistant-history__empty">还没有历史会话。</div>
              )}
            </div>
          </aside>

          <div className="learning-assistant-chat">
            <div className="learning-assistant-chat__toolbar">
              <div>
                <div className="learning-assistant-chat__toolbar-label">题目上下文</div>
                <strong>{questionTitle}</strong>
              </div>
              <div className="learning-assistant-chat__toolbar-meta">
                {knowledgeBaseName} · {categoryName} · 仅围绕当前题目回答
              </div>
            </div>

            <div ref={messagesRef} className="learning-assistant-messages">
              {activeSession && hasMessages ? (
                activeSession.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`learning-assistant-message learning-assistant-message--${message.role}`}
                  >
                    <div className="learning-assistant-message__role">
                      <span>{message.role === "assistant" ? "面面吧智能助手" : "你"}</span>
                      <time>{formatTime(message.createdAt)}</time>
                    </div>
                    <div
                      className={`learning-assistant-message__body ${message.role === "assistant" ? "is-assistant" : "is-user"}`}
                    >
                      <div className="markdown-body learning-assistant-markdown">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                          {normalizeAssistantMarkdown(message.content)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="learning-assistant-empty-state">
                  <div className="learning-assistant-empty-state__logo">{renderAssistantLogo()}</div>
                  <h3>你可以继续追问当前题目</h3>
                  <p>
                    这里沿用原来的面面吧智能助手交互体验，只把回答范围收敛到当前题目、参考答案、关联题和分类上下文。
                  </p>
                  <div className="learning-assistant-starters">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="learning-assistant-starter"
                        onClick={() => applyStarterPrompt(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isPending ? (
                <article className="learning-assistant-message learning-assistant-message--assistant">
                  <div className="learning-assistant-message__role">
                    <span>面面吧智能助手</span>
                    <time>正在生成</time>
                  </div>
                  <div className="learning-assistant-message__body is-assistant">
                    <div className="markdown-body learning-assistant-markdown">
                      <p>正在结合当前题目和参考答案整理回答...</p>
                    </div>
                  </div>
                </article>
              ) : null}
            </div>

            {error ? <div className="notice">{error}</div> : null}

            <div className="learning-assistant-composer">
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                onKeyDown={(event) => void handleComposerKeyDown(event)}
                placeholder="继续追问这道题怎么展开、怎么回答更像面试表达"
                disabled={isPending}
              />
              <div className="learning-assistant-composer__footer">
                <div className="learning-assistant-composer__tips">
                  <span>当前题目深挖模式</span>
                </div>
                <button
                  type="button"
                  className="learning-assistant-send"
                  onClick={() => void sendMessage()}
                  disabled={!draft.trim() || isPending}
                >
                  {isPending ? "回答中..." : "发送"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
