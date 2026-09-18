import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronsRight, FileCode2, FileText, Languages, List, PanelsTopLeft, RotateCcw, Search, Square } from "lucide-react";
import catFaceUrl from "./cat-face.svg";
import type { TreeStore } from "../../core/treeStore";
import type { WorkspaceSession } from "../../workspace/auth";
import type { WorkspaceApiOptions } from "../../workspace/serverApi";
import type { AIChatProvider } from "./api";
import { useAIChat, type AIChatMessage } from "./useAIChat";
import { AI_CHAT_MESSAGE_MAX_CHARS } from "./api";

const QUICK_ACTIONS = [
  { label: "总结文档", Icon: List },
  { label: "提炼重点", Icon: FileCode2 },
  { label: "检查结构", Icon: Languages },
  { label: "生成后续内容", Icon: Search },
] as const;
type AIChatLayout = "floating" | "sidebar";
const AI_CHAT_LAYOUT_KEY = "zhijian.ai-chat-layout.v1:";
const AI_CHAT_PANEL_WIDTH_KEY = "zhijian.ai-chat-panel-width.v1:";
const DEFAULT_AI_CHAT_PANEL_WIDTH = 392;
const MIN_AI_CHAT_PANEL_WIDTH = 300;
const MAX_AI_CHAT_PANEL_WIDTH = 640;
const AI_CHAT_LAYOUT_MENU_WIDTH = 156;

export function AIChatWidget({ documentId, documentTitle, store, session, onSessionRefresh, provider, visible = true }: {
  documentId: string;
  documentTitle: string;
  store: TreeStore;
  session: WorkspaceSession;
  onSessionRefresh: WorkspaceApiOptions["onSessionRefresh"];
  provider?: AIChatProvider;
  visible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<AIChatLayout>(() => loadChatLayout(session.userId));
  const [panelWidth, setPanelWidth] = useState(() => loadChatPanelWidth(session.userId));
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [layoutMenuPosition, setLayoutMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const chat = useAIChat({ documentId, store, session, onSessionRefresh, provider });
  useEffect(() => {
    if (!visible) {
      setOpen(false);
      setLayoutMenuOpen(false);
      setLayoutMenuPosition(null);
    }
  }, [visible]);
  useEffect(() => {
    if (!layoutMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(".ai-chat-layout-menu, .ai-chat-launcher, .ai-chat-header")) {
        setLayoutMenuOpen(false);
        setLayoutMenuPosition(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [layoutMenuOpen]);
  useEffect(() => {
    const shell = panelRef.current?.closest<HTMLElement>(".workspace-shell-ui");
    if (!shell) return;
    if (open && visible && layout === "sidebar") {
      shell.style.setProperty("--ai-chat-panel-width", `${panelWidth}px`);
    } else {
      shell.style.removeProperty("--ai-chat-panel-width");
    }
    return () => {
      shell.style.removeProperty("--ai-chat-panel-width");
    };
  }, [layout, open, panelWidth, visible]);
  const openLayoutMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setLayoutMenuPosition(null);
    setLayoutMenuOpen(true);
  };
  const toggleLayoutMenuFromHeader = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (layoutMenuOpen) {
      setLayoutMenuOpen(false);
      setLayoutMenuPosition(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = Math.min(Math.max(8, bounds.right - AI_CHAT_LAYOUT_MENU_WIDTH), window.innerWidth - AI_CHAT_LAYOUT_MENU_WIDTH - 8);
    const top = Math.min(bounds.bottom + 6, window.innerHeight - 92);
    setLayoutMenuPosition({ top: Math.max(8, top), left });
    setLayoutMenuOpen(true);
  };
  const chooseLayout = (nextLayout: AIChatLayout) => {
    setLayout(nextLayout);
    saveChatLayout(session.userId, nextLayout);
    setLayoutMenuOpen(false);
    setLayoutMenuPosition(null);
  };
  const resizePanel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (layout !== "sidebar") return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampChatPanelWidth(startWidth + startX - moveEvent.clientX);
      setPanelWidth(nextWidth);
      saveChatPanelWidth(session.userId, nextWidth);
    };
    const stopResizing = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
  };
  if (!visible) return null;
  if (!open) {
    return (
      <>
        <button type="button" className="ai-chat-launcher" aria-label="和 AI 聊聊" title="和 AI 聊聊" onClick={() => { setLayoutMenuOpen(false); setOpen(true); }} onContextMenu={openLayoutMenu}><img src={catFaceUrl} alt="" /></button>
        {layoutMenuOpen ? <AIChatLayoutMenu layout={layout} position={layoutMenuPosition} onChoose={chooseLayout} /> : null}
      </>
    );
  }
  return (
    <>
      <AIChatPanel documentTitle={documentTitle} chat={chat} layout={layout} panelRef={panelRef} onResize={resizePanel} onClose={() => setOpen(false)} onOpenLayoutMenu={toggleLayoutMenuFromHeader} onContextMenu={openLayoutMenu} />
      {layoutMenuOpen ? <AIChatLayoutMenu layout={layout} position={layoutMenuPosition} onChoose={chooseLayout} /> : null}
    </>
  );
}

function AIChatLayoutMenu({ layout, position, onChoose }: { layout: AIChatLayout; position: { top: number; left: number } | null; onChoose: (layout: AIChatLayout) => void }) {
  return (
    <div className={`ai-chat-layout-menu${position ? " is-anchored" : ""}`} style={position ?? undefined} role="menu" aria-label="AI 聊天布局">
      <button type="button" role="menuitemradio" aria-checked={layout === "floating"} className={layout === "floating" ? "is-active" : ""} onClick={() => onChoose("floating")}>悬浮模式</button>
      <button type="button" role="menuitemradio" aria-checked={layout === "sidebar"} className={layout === "sidebar" ? "is-active" : ""} onClick={() => onChoose("sidebar")}>侧边栏模式</button>
    </div>
  );
}

export function AIChatPanel({ documentTitle, chat, layout, panelRef, onResize, onClose, onOpenLayoutMenu, onContextMenu }: {
  documentTitle: string;
  chat: ReturnType<typeof useAIChat>;
  layout?: AIChatLayout;
  panelRef?: React.RefObject<HTMLElement | null>;
  onResize?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onOpenLayoutMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMessages = chat.messages.length > 0;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat.messages]);

  const send = (value: string) => {
    if (!value.trim() || chat.isStreaming) return;
    setInput("");
    void chat.sendMessage(value);
  };

  return (
    <section ref={panelRef} className={`ai-chat-panel is-${layout ?? "sidebar"}`} role="dialog" aria-modal="false" aria-label="和 AI 聊聊">
      {layout !== "floating" ? <div className="ai-chat-resizer" role="separator" aria-label="调整 AI 面板宽度" onPointerDown={onResize} /> : null}
      <header className="ai-chat-header" onContextMenu={onContextMenu}>
        <div className="ai-chat-header-actions">
          <button type="button" className="icon-button" aria-label="切换 AI 显示模式" title="切换 AI 显示模式" onClick={onOpenLayoutMenu}><PanelsTopLeft /></button>
          <button type="button" className="ai-chat-close icon-button" aria-label="关闭 AI 聊天" title="关闭" onClick={onClose}><ChevronsRight /></button>
        </div>
      </header>
      <div className="ai-chat-messages" ref={scrollRef}>
        {!hasMessages ? (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-icon"><img src={catFaceUrl} alt="" /></div>
            <h2>喵呜～人，你有什么要求？</h2>
            <div className="ai-chat-quick-actions">
              {QUICK_ACTIONS.map(({ label, Icon }) => <button type="button" key={label} onClick={() => send(label)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
            </div>
          </div>
        ) : chat.messages.map((message) => <AIChatMessageView key={message.id} message={message} onRetry={message.status === "error" ? chat.retry : undefined} />)}
        {chat.contextTruncated ? <p className="ai-chat-context-note">文档较长，本次回答使用了开头部分内容。</p> : null}
        {chat.error && !chat.messages.some((message) => message.status === "error") ? <p className="ai-chat-error">{chat.error}</p> : null}
      </div>
      <form className="ai-chat-composer" onSubmit={(event) => { event.preventDefault(); send(input); }}>
        {documentTitle ? <div className="ai-chat-composer-context"><span title={documentTitle}><FileText aria-hidden="true" />{documentTitle}</span></div> : null}
        <div className="ai-chat-composer-main">
          <textarea
            value={input}
            rows={1}
            placeholder="使用 AI 处理各种任务..."
            maxLength={AI_CHAT_MESSAGE_MAX_CHARS}
            aria-label="输入问题"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
          />
          {chat.isStreaming ? <button type="button" className="ai-chat-submit is-stop" aria-label="停止生成" title="停止生成" onClick={chat.stop}><Square /></button> : <button type="submit" className="ai-chat-submit" aria-label="发送问题" title="发送" disabled={!input.trim()}><ArrowUp /></button>}
        </div>
      </form>
    </section>
  );
}

function loadChatLayout(userId: string): AIChatLayout {
  try {
    return window.localStorage.getItem(`${AI_CHAT_LAYOUT_KEY}${userId}`) === "floating" ? "floating" : "sidebar";
  } catch {
    return "sidebar";
  }
}

function saveChatLayout(userId: string, layout: AIChatLayout) {
  try {
    window.localStorage.setItem(`${AI_CHAT_LAYOUT_KEY}${userId}`, layout);
  } catch {
    // Preferences are best effort when browser storage is unavailable.
  }
}

function clampChatPanelWidth(width: number) {
  return Math.min(MAX_AI_CHAT_PANEL_WIDTH, Math.max(MIN_AI_CHAT_PANEL_WIDTH, width));
}

function loadChatPanelWidth(userId: string) {
  try {
    const storedWidth = window.localStorage.getItem(`${AI_CHAT_PANEL_WIDTH_KEY}${userId}`);
    if (!storedWidth) return DEFAULT_AI_CHAT_PANEL_WIDTH;
    const value = Number(storedWidth);
    return Number.isFinite(value) ? clampChatPanelWidth(value) : DEFAULT_AI_CHAT_PANEL_WIDTH;
  } catch {
    return DEFAULT_AI_CHAT_PANEL_WIDTH;
  }
}

function saveChatPanelWidth(userId: string, width: number) {
  try {
    window.localStorage.setItem(`${AI_CHAT_PANEL_WIDTH_KEY}${userId}`, String(clampChatPanelWidth(width)));
  } catch {
    // Preferences are best effort when browser storage is unavailable.
  }
}

function AIChatMessageView({ message, onRetry }: { message: AIChatMessage; onRetry?: () => void }) {
  return (
    <article className={`ai-chat-message is-${message.role}`}>
      <div className="ai-chat-message-role">{message.role === "user" ? "你" : "AI"}</div>
      <div className="ai-chat-message-content">{message.content || (message.status === "streaming" ? <span className="ai-chat-cursor" aria-label="正在生成" /> : "")}</div>
      {message.status === "error" && onRetry ? <button type="button" className="ai-chat-retry" onClick={onRetry}><RotateCcw />重试</button> : null}
    </article>
  );
}
