"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Mermaid from "@/components/Mermaid";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type QuickFact = {
  k: string;
  v: string;
};

type ContentSection = {
  id: string;
  h2: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: string;
};

type TopicContent = {
  title: string;
  breadcrumb: string[];
  quickFacts: QuickFact[];
  sections: ContentSection[];
};

type KbInfo = {
  id: string;
  name: string;
  subtitle: string;
  tags: string[];
  updatedAt: string;
  stats: { topics: number; paths: number };
};

type TopicReference = {
  id: string;
  title: string;
};

type AssistantCitation = {
  topicId: string;
  title: string;
  source: "current_document" | "neighbor_document" | "knowledge_base" | "external_knowledge";
  reason: string;
};

type AssistantContextDoc = {
  topicId: string;
  title: string;
  source: "current_document" | "neighbor_document" | "knowledge_base" | "external_knowledge";
};

type AssistantStreamDone = {
  type: "done";
  sessionTitle: string;
  refusal: boolean;
  answer: string;
  refusalReason: string;
  citations: AssistantCitation[];
  verificationPoints: string[];
  followUp: string[];
  contextDocs: AssistantContextDoc[];
};

type AssistantStreamEvent =
  | {
      type: "session";
      sessionTitle: string;
      contextDocs: AssistantContextDoc[];
    }
  | {
      type: "delta";
      delta: string;
    }
  | AssistantStreamDone
  | {
      type: "error";
      error: string;
    };

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  refusal?: boolean;
  citations?: AssistantCitation[];
  verificationPoints?: string[];
  followUp?: string[];
};

type AssistantSessionTitleState = "pending" | "auto" | "custom";

type AssistantSession = {
  id: string;
  kbId: string;
  kbName: string;
  topicId: string;
  topicTitle: string;
  title: string;
  titleState: AssistantSessionTitleState;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastPreview: string;
  messages: AssistantMessage[];
};

type AssistantMode = "document" | "general";

type DocumentAssistantPanelProps = {
  kb: KbInfo;
  topicId: string;
  content: TopicContent | null;
  topicOptions: TopicReference[];
  mode?: AssistantMode;
  isOpen: boolean;
  onToggle: () => void;
  onSelectTopic?: (topicId: string) => void;
};

const STORAGE_KEY = "learning-document-assistant-v2";
const MAX_SESSION_COUNT = 20;
const GENERAL_ASSISTANT_KB_ID = "__learning-general__";
const GENERAL_ASSISTANT_TOPIC_ID = "__learning-general__";

/**
 * 为学习助手消息创建 Markdown 组件映射，并在需要时渲染 Mermaid 图表。
 * @param {boolean} enableMermaid 是否启用 Mermaid 图表渲染。
 * @returns {Components} 供 ReactMarkdown 使用的组件集合。
 */
function createAssistantMarkdownComponents(enableMermaid: boolean): Components {
  return {
    /**
     * 识别 Mermaid 代码块并渲染为流程图，其余代码块继续按普通 code 处理。
     * @param {object} props Markdown 代码节点属性。
     * @returns {ReactNode} Mermaid 图表或普通 code 节点。
     */
    code(props): ReactNode {
      const { className, children, ...rest } = props;
      const match = /language-(\w+)/.exec(className || "");
      if (enableMermaid && match?.[1] === "mermaid") {
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
 * 生成浏览器端稳定可用的本地会话或消息标识。
 * @returns {string} 唯一标识。
 */
function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 将任意消息压缩成历史列表可读摘要。
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
 * 将时间字符串格式化为助手侧边栏使用的短时间。
 * @param {string} value ISO 时间字符串。
 * @returns {string} 可读时间。
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
 * 将历史会话标题清洗成适合侧边栏展示的一行短标题。
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
 * 将浏览器本地存储中的历史会话标准化为当前版本结构。
 * @param {AssistantSession} session 原始会话对象。
 * @returns {AssistantSession} 兼容当前字段的会话对象。
 */
function normalizeAssistantSession(session: AssistantSession): AssistantSession {
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
 * 读取浏览器本地存储中的历史会话。
 * @returns {AssistantSession[]} 已持久化的会话数组。
 */
function readAssistantSessions(): AssistantSession[] {
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
      .filter((item): item is AssistantSession => {
        return Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as AssistantSession).id === "string" &&
            typeof (item as AssistantSession).kbId === "string" &&
            typeof (item as AssistantSession).topicId === "string" &&
            Array.isArray((item as AssistantSession).messages)
        );
      })
      .map((item) => normalizeAssistantSession(item));
  } catch {
    return [];
  }
}

/**
 * 将会话状态写回浏览器本地存储。
 * @param {AssistantSession[]} sessions 会话数组。
 * @returns {void} 同步写入 localStorage。
 */
function writeAssistantSessions(sessions: AssistantSession[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

/**
 * 按置顶状态和更新时间倒序排列会话，保证置顶会话始终优先展示。
 * @param {AssistantSession[]} sessions 原始会话数组。
 * @returns {AssistantSession[]} 已排序的会话数组。
 */
function sortSessionsByUpdatedAt(sessions: AssistantSession[]): AssistantSession[] {
  return [...sessions].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

/**
 * 创建一个绑定当前文档的新会话。
 * @param {KbInfo} kb 当前知识库信息。
 * @param {string} topicId 当前文档标识。
 * @param {string} topicTitle 当前文档标题。
 * @returns {AssistantSession} 新会话对象。
 */
function createSession(kb: KbInfo, topicId: string, topicTitle: string): AssistantSession {
  const now = new Date().toISOString();
  return {
    id: createLocalId(),
    kbId: kb.id,
    kbName: kb.name,
    topicId,
    topicTitle,
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
 * 仅在会话标题尚未生成且用户未手动重命名时写入首轮自动标题。
 * @param {AssistantSession} session 当前会话。
 * @param {string} nextTitle 服务端返回的候选标题。
 * @returns {AssistantSession} 更新后的会话。
 */
function applyAutoSessionTitle(session: AssistantSession, nextTitle: string): AssistantSession {
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
 * @param {AssistantSession[]} sessions 当前会话数组。
 * @param {AssistantSession} nextSession 最新会话。
 * @returns {AssistantSession[]} 合并后的会话数组。
 */
function upsertSession(sessions: AssistantSession[], nextSession: AssistantSession): AssistantSession[] {
  return sortSessionsByUpdatedAt([
    nextSession,
    ...sessions.filter((session) => session.id !== nextSession.id),
  ]).slice(0, MAX_SESSION_COUNT);
}

/**
 * 将回答来源枚举转成更容易理解的中文标签。
 * @param {AssistantCitation["source"]} source 来源枚举。
 * @returns {string} 中文标签。
 */
function formatCitationSource(source: AssistantCitation["source"]): string {
  if (source === "current_document") {
    return "当前文档";
  }

  if (source === "neighbor_document") {
    return "相邻文档";
  }

  if (source === "external_knowledge") {
    return "外部知识补充";
  }

  return "知识库补充";
}

/**
 * 生成空态下的推荐提问。
 * @param {TopicContent | null} content 当前文档内容。
 * @param {AssistantMode} mode 当前助手模式。
 * @returns {string[]} 推荐问题数组。
 */
function buildStarterPrompts(content: TopicContent | null, mode: AssistantMode): string[] {
  if (mode === "general") {
    return [
      "帮我梳理一下 Java 面试里 HashMap 最常见的追问路径。",
      "我准备前端面试，帮我列一个一周冲刺计划。",
      "给我讲讲什么情况下应该用 Redis，什么情况下不该用。",
      "帮我画一个微服务请求链路的流程图，用 mermaid 表示。",
    ];
  }

  if (!content) {
    return [];
  }

  const firstHeading = content.sections[0]?.h2?.trim();
  const secondHeading = content.sections[1]?.h2?.trim();

  return [
    `先用面试表达讲清《${content.title}》的核心原理。`,
    firstHeading ? `围绕“${firstHeading}”，面试里最容易继续追问什么？` : "",
    secondHeading ? `把“${secondHeading}”和前面的内容串起来再讲一遍。` : "",
    "如果我要把这一页学到能回答面试题，还该补哪些点？",
  ].filter(Boolean);
}

/**
 * 将 NDJSON 文本缓冲区切分成完整事件与残留文本。
 * @param {string} buffer 当前缓冲字符串。
 * @returns {{ events: AssistantStreamEvent[]; rest: string }} 已解析事件与剩余未完成内容。
 */
function parseStreamEvents(buffer: string): { events: AssistantStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: AssistantStreamEvent[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      events.push(JSON.parse(trimmed) as AssistantStreamEvent);
    } catch {
      continue;
    }
  }

  return { events, rest };
}

/**
 * 渲染从品牌规范图中提取后的独立助手图标。
 * @returns {ReactNode} 适合按钮与面板使用的精简图标节点。
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
 * 渲染单条助手消息的引用与追问信息。
 * @param {AssistantMessage} message 当前助手消息。
 * @param {(topicId: string) => void | undefined} onSelectTopic 文档切换回调。
 * @param {boolean} enableTopicJump 是否允许跳转到文档。
 * @returns {ReactNode} 辅助信息区。
 */
function renderAssistantMeta(
  message: AssistantMessage,
  onSelectTopic: ((topicId: string) => void) | undefined,
  enableTopicJump: boolean
): ReactNode {
  if (
    (message.citations?.length ?? 0) === 0 &&
    (message.followUp?.length ?? 0) === 0 &&
    (message.verificationPoints?.length ?? 0) === 0
  ) {
    return null;
  }

  return (
    <div className="learning-assistant-response-meta">
      {(message.citations?.length ?? 0) > 0 ? (
        <div className="learning-assistant-response-card">
          <div className="learning-assistant-response-card__title">参考文档</div>
          <div className="learning-assistant-reference-list">
            {message.citations?.map((citation) => (
              enableTopicJump && onSelectTopic ? (
                <button
                  key={`${message.id}-${citation.topicId}-${citation.reason}`}
                  type="button"
                  className="learning-assistant-reference"
                  onClick={() => onSelectTopic(citation.topicId)}
                >
                  <span>{citation.title}</span>
                  <small>{formatCitationSource(citation.source)} · {citation.reason}</small>
                </button>
              ) : (
                <div key={`${message.id}-${citation.topicId}-${citation.reason}`} className="learning-assistant-reference">
                  <span>{citation.title}</span>
                  <small>{formatCitationSource(citation.source)} · {citation.reason}</small>
                </div>
              )
            ))}
          </div>
        </div>
      ) : null}

      {(message.followUp?.length ?? 0) > 0 ? (
        <div className="learning-assistant-response-card">
          <div className="learning-assistant-response-card__title">你可以继续问</div>
          <ul className="learning-assistant-inline-list">
            {message.followUp?.map((item) => <li key={`${message.id}-${item}`}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {(message.verificationPoints?.length ?? 0) > 0 ? (
        <div className="learning-assistant-response-card learning-assistant-response-card--verify">
          <div className="learning-assistant-response-card__title">建议再核对</div>
          <ul className="learning-assistant-inline-list">
            {message.verificationPoints?.map((item) => <li key={`${message.id}-${item}`}>{item}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 渲染面面吧智能助手的文档对话面板。
 * @param {DocumentAssistantPanelProps} props 知识库、文档与交互参数。
 * @returns {ReactNode} 机器人 Logo 与对话抽屉。
 */
export default function DocumentAssistantPanel(props: DocumentAssistantPanelProps): ReactNode {
  const { kb, topicId, content, topicOptions, mode = "document", isOpen, onToggle, onSelectTopic } = props;
  const markdownComponents = useMemo(() => createAssistantMarkdownComponents(true), []);
  const markdownComponentsWithoutMermaid = useMemo(() => createAssistantMarkdownComponents(false), []);
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [openHistoryMenuSessionId, setOpenHistoryMenuSessionId] = useState("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const sessionsRef = useRef<AssistantSession[]>([]);
  const activeSessionIdRef = useRef("");
  const isGeneralMode = mode === "general";

  const kbSessions = useMemo(
    () => sortSessionsByUpdatedAt(sessions.filter((session) => session.kbId === kb.id)),
    [kb.id, sessions]
  );
  const pinnedSessions = useMemo(() => kbSessions.filter((session) => session.isPinned), [kbSessions]);
  const regularSessions = useMemo(() => kbSessions.filter((session) => !session.isPinned), [kbSessions]);
  const activeSession = kbSessions.find((session) => session.id === activeSessionId) ?? null;
  const starterPrompts = useMemo(() => buildStarterPrompts(content, mode), [content, mode]);
  const hasMessages = (activeSession?.messages.length ?? 0) > 0;

  /**
   * 同步会话到状态与本地存储。
   * @param {AssistantSession[]} nextSessions 最新会话数组。
   * @returns {void} 更新状态并持久化。
   */
  function persistSessions(nextSessions: AssistantSession[]): void {
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);
    writeAssistantSessions(nextSessions);
  }

  /**
   * 创建一个绑定当前文档的新会话并激活。
   * @returns {AssistantSession | null} 新会话对象。
   */
  function createAndActivateSession(): AssistantSession | null {
    const nextSession = createSession(
      kb,
      topicId,
      content?.title || (isGeneralMode ? "学习中心自由提问" : "未选择文档")
    );
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
   * 按照当前文档上下文开启全新对话。
   * @returns {void} 重置当前输入与会话焦点。
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
      const fallback = nextSessions.find((session) => session.kbId === kb.id) ?? null;
      setActiveSessionId(fallback?.id ?? "");
    }
  }

  /**
   * 切换到历史会话，并在必要时跳回对应文档。
   * @param {string} sessionId 目标会话标识。
   * @returns {void} 更新当前激活会话。
   */
  function openSession(sessionId: string): void {
    const nextSession = kbSessions.find((session) => session.id === sessionId);
    if (!nextSession) {
      return;
    }

    setOpenHistoryMenuSessionId("");
    setActiveSessionId(nextSession.id);
    setError("");
    if (!isGeneralMode && nextSession.topicId !== topicId && onSelectTopic) {
      onSelectTopic(nextSession.topicId);
    }
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
              updatedAt: session.updatedAt,
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

    if (activeSessionId && kbSessions.some((session) => session.id === activeSessionId)) {
      return;
    }

    const preferred = kbSessions.find((session) => session.topicId === topicId) ?? kbSessions[0] ?? null;
    setActiveSessionId(preferred?.id ?? "");
  }, [activeSessionId, isHydrated, kbSessions, topicId]);

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
   * 使用推荐问题快速填充输入框。
   * @param {string} prompt 推荐问题。
   * @returns {void} 仅更新输入内容，等待用户确认发送。
   */
  function applyStarterPrompt(prompt: string): void {
    setDraft(prompt);
  }

  /**
   * 发送用户问题，并以流式方式渲染助手回复。
   * @returns {Promise<void>} 对话完成后更新历史会话。
   */
  async function sendMessage(): Promise<void> {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }

    setIsPending(true);
    setError("");

    const userMessage: AssistantMessage = {
      id: createLocalId(),
      role: "user",
      content: trimmedDraft,
      createdAt: new Date().toISOString(),
    };
    const assistantMessageId = createLocalId();
    const streamingMessage: AssistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      citations: [],
      verificationPoints: [],
      followUp: [],
    };

    const currentActiveSession =
      sessionsRef.current.find((session) => session.id === activeSessionIdRef.current && session.kbId === kb.id) ?? null;
    const baseSession =
      currentActiveSession ??
      createAndActivateSession() ??
      createSession(kb, topicId, content?.title || (isGeneralMode ? "学习中心自由提问" : "未选择文档"));
    const optimisticSession: AssistantSession = {
      ...baseSession,
      kbName: kb.name,
      topicId,
      topicTitle: content?.title || (isGeneralMode ? "学习中心自由提问" : "未选择文档"),
      updatedAt: streamingMessage.createdAt,
      lastPreview: buildPreviewText(trimmedDraft),
      messages: [...baseSession.messages, userMessage, streamingMessage],
    };

    persistSessions(upsertSession(sessionsRef.current, optimisticSession));
    setActiveSessionId(optimisticSession.id);
    setDraft("");

    try {
      const response = await fetch("/api/learning/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId: isGeneralMode ? GENERAL_ASSISTANT_KB_ID : optimisticSession.kbId,
          topicId: isGeneralMode ? GENERAL_ASSISTANT_TOPIC_ID : optimisticSession.topicId,
          stream: true,
          messages: optimisticSession.messages
            .filter((message) => message.id !== assistantMessageId)
            .map((message) => ({ role: message.role, content: message.content })),
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "对话助手暂时不可用，请稍后再试。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedAnswer = "";
      let finalEvent: AssistantStreamDone | null = null;

      /**
       * 将最新流式片段写回当前占位助手消息。
       * @param {Partial<AssistantMessage>} patch 需要合并到助手消息上的字段。
       * @returns {void} 同步更新会话列表。
       */
      const patchStreamingMessage = (patch: Partial<AssistantMessage>): void => {
        const nextSessions = sessionsRef.current.map((session) => {
          if (session.id !== optimisticSession.id) {
            return session;
          }

          const nextMessages = session.messages.map((message) =>
            message.id === assistantMessageId ? { ...message, ...patch } : message
          );

          return {
            ...session,
            messages: nextMessages,
            updatedAt: new Date().toISOString(),
            lastPreview: buildPreviewText(
              patch.content && patch.content.trim() ? patch.content : session.lastPreview
            ),
          };
        });

        persistSessions(nextSessions);
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const parsed = parseStreamEvents(buffer);
        buffer = parsed.rest;

        for (const event of parsed.events) {
          if (event.type === "session") {
            const nextSessions = sessionsRef.current.map((session) =>
              session.id === optimisticSession.id
                ? applyAutoSessionTitle(
                    {
                      ...session,
                      updatedAt: new Date().toISOString(),
                    },
                    event.sessionTitle
                  )
                : session
            );
            persistSessions(nextSessions);
            continue;
          }

          if (event.type === "delta") {
            accumulatedAnswer += event.delta;
            patchStreamingMessage({ content: accumulatedAnswer });
            continue;
          }

          if (event.type === "done") {
            finalEvent = event;
            const normalizedAnswer = event.refusal
              ? event.refusalReason
              : normalizeAssistantMarkdown(event.answer);
            patchStreamingMessage({
              content: normalizedAnswer,
              refusal: event.refusal,
              citations: event.citations,
              verificationPoints: event.verificationPoints,
              followUp: event.followUp,
            });

            const nextSessions = sessionsRef.current.map((session) =>
              session.id === optimisticSession.id
                ? applyAutoSessionTitle(
                    {
                      ...session,
                      updatedAt: new Date().toISOString(),
                      lastPreview: buildPreviewText(normalizedAnswer || trimmedDraft),
                    },
                    event.sessionTitle
                  )
                : session
            );
            persistSessions(nextSessions);
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.error);
          }
        }

        if (done) {
          break;
        }
      }

      if (!finalEvent) {
        throw new Error("对话助手没有返回完整结果，请稍后重试。");
      }
    } catch (sendError) {
      const nextSessions = sessionsRef.current.map((session) =>
        session.id === optimisticSession.id
          ? {
              ...session,
              messages: session.messages.filter((message) => message.id !== assistantMessageId),
            }
          : session
      );
      persistSessions(nextSessions);
      setError(sendError instanceof Error ? sendError.message : "对话助手暂时不可用，请稍后再试。");
    } finally {
      setIsPending(false);
    }
  }

  /**
   * 在输入框中按回车直接发送，Shift + Enter 保留换行。
   * @param {React.KeyboardEvent<HTMLTextAreaElement>} event 键盘事件。
   * @returns {Promise<void>} 命中快捷键后触发发送。
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
    <>
      <button
        type="button"
        className={`learning-assistant-entry ${isOpen ? "active" : ""}`}
        onClick={onToggle}
        aria-label={isOpen ? "收起对话助手" : "打开对话助手"}
        aria-expanded={isOpen}
        title={isOpen ? "收起对话助手" : "打开对话助手"}
      >
        <span className="learning-assistant-entry__icon">{renderAssistantLogo()}</span>
        <span className="learning-assistant-entry__copy">
          <strong>面面吧智能助手</strong>
          <span className="learning-assistant-entry__label">文档追问与连续对话</span>
        </span>
      </button>

      <div className={`learning-assistant-overlay ${isOpen ? "active" : ""}`} onClick={onToggle} />

      <aside className={`learning-assistant-panel ${isOpen ? "active" : ""}`} aria-hidden={!isOpen}>
        <div className="learning-assistant-panel__header">
          <div className="learning-assistant-panel__brand">
            <div className="learning-assistant-panel__logo">{renderAssistantLogo()}</div>
            <div>
              <div className="learning-assistant-panel__title">面面吧智能助手</div>
              <div className="learning-assistant-panel__subtitle">
                {isGeneralMode ? "当前模式：学习中心自由提问" : `当前文档：${content?.title || "请先选择文档"}`}
              </div>
            </div>
          </div>
          <div className="learning-assistant-panel__header-actions">
            <button type="button" className="learning-assistant-top-action" onClick={handleNewConversation}>
              新对话
            </button>
            <button type="button" className="learning-assistant-top-action" onClick={onToggle}>
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
              {kbSessions.length > 0 ? (
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
                <div className="learning-assistant-chat__toolbar-label">
                  {isGeneralMode ? "自由对话模式" : "知识库上下文"}
                </div>
                <strong>{kb.name}</strong>
              </div>
              <div className="learning-assistant-chat__toolbar-meta">
                {isGeneralMode ? "未绑定具体文档，可自由提问" : content ? `当前文档：${content.title}` : "请先选择文档"}
              </div>
            </div>
            <div ref={messagesRef} className="learning-assistant-messages">
              {activeSession && hasMessages ? (
                activeSession.messages.map((message) => {
                  const isStreamingMessage =
                    isPending &&
                    message.role === "assistant" &&
                    activeSession.messages[activeSession.messages.length - 1]?.id === message.id;

                  return (
                    <article
                      key={message.id}
                      className={`learning-assistant-message learning-assistant-message--${message.role}`}
                    >
                    <div className="learning-assistant-message__role">
                      <span>{message.role === "assistant" ? "面面吧智能助手" : "你"}</span>
                      <time>{formatTime(message.createdAt)}</time>
                    </div>
                    <div className={`learning-assistant-message__body ${message.role === "assistant" ? "is-assistant" : "is-user"}`}>
                      <div className="markdown-body learning-assistant-markdown">
                        <ReactMarkdown
                          components={isStreamingMessage ? markdownComponentsWithoutMermaid : markdownComponents}
                          remarkPlugins={[remarkGfm]}
                        >
                          {normalizeAssistantMarkdown(
                            message.content || (isPending && message.role === "assistant" ? "正在思考..." : "")
                          )}
                        </ReactMarkdown>
                      </div>
                    </div>
                    {message.role === "assistant"
                      ? renderAssistantMeta(message, onSelectTopic, !isGeneralMode)
                      : null}
                  </article>
                  );
                })
              ) : (
                <div className="learning-assistant-empty-state">
                  <div className="learning-assistant-empty-state__logo">{renderAssistantLogo()}</div>
                  <h3>{isGeneralMode ? "你可以直接开始自由提问" : "你可以继续追问当前文档"}</h3>
                  <p>
                    {isGeneralMode
                      ? "这个入口不绑定具体文档，适合随时问概念、追问面试点、聊学习路径，也支持 Mermaid 流程图。"
                      : "回答优先引用当前文档，再补充同一知识库里的相邻资料，用更克制、更连续的面面吧智能助手节奏来追问。"}
                  </p>
                  <div className="learning-assistant-starters">
                    {starterPrompts.map((prompt) => (
                      <button key={prompt} type="button" className="learning-assistant-starter" onClick={() => applyStarterPrompt(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                placeholder={isGeneralMode ? "想问什么都可以，直接发给面面吧智能助手" : "给面面吧智能助手发送消息"}
                disabled={isPending}
              />
              <div className="learning-assistant-composer__footer">
                <div className="learning-assistant-composer__tips">
                  <span>{isGeneralMode ? "学习中心自由提问" : "基于当前知识库回答"}</span>
                  {!isGeneralMode && topicOptions.length > 1 ? (
                    <div className="learning-assistant-topic-list">
                      {topicOptions.slice(0, 6).map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          className={`learning-assistant-topic-chip ${topic.id === topicId ? "active" : ""}`}
                          onClick={() => onSelectTopic?.(topic.id)}
                        >
                          {topic.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
    </>
  );
}
