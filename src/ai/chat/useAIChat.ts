import { useCallback, useEffect, useRef, useState } from "react";
import type { TreeStore } from "../../core/treeStore";
import type { WorkspaceSession } from "../../workspace/auth";
import type { WorkspaceApiOptions } from "../../workspace/serverApi";
import { AI_CHAT_HISTORY_MAX_CHARS, AI_CHAT_HISTORY_MAX_MESSAGES, AI_CHAT_MESSAGE_MAX_CHARS, requestAIChat, readAIStream, type AIChatProvider, type AIChatRequest } from "./api";
import { serializeTreeForAI } from "./serializeTreeForAI";

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "error";
}

interface Conversation {
  messages: AIChatMessage[];
  contextTruncated: boolean;
}

export function useAIChat({ documentId, store, session, onSessionRefresh, provider }: {
  documentId: string;
  store: TreeStore;
  session: WorkspaceSession;
  onSessionRefresh: WorkspaceApiOptions["onSessionRefresh"];
  provider?: AIChatProvider;
}) {
  const conversations = useRef(new Map<string, Conversation>());
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [conversation, setConversation] = useState<Conversation>(() => readConversation(conversations.current, documentId));
  const [error, setError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    abortRef.current?.abort();
    setConversation(readConversation(conversations.current, documentId));
    setError("");
    setIsStreaming(false);
  }, [documentId]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const updateConversation = useCallback((id: string, update: (current: Conversation) => Conversation) => {
    const next = update(readConversation(conversations.current, id));
    conversations.current.set(id, next);
    if (id === documentId) setConversation(next);
  }, [documentId]);

  const sendMessage = useCallback(async (value: string) => {
    const content = value.trim();
    if (!content || isStreaming) return;
    const currentDocumentId = documentId;
    const currentRequestId = ++requestId.current;
    const context = serializeTreeForAI(store.getSnapshot());
    const userMessage: AIChatMessage = { id: `user-${currentRequestId}`, role: "user", content };
    const assistantMessage: AIChatMessage = { id: `assistant-${currentRequestId}`, role: "assistant", content: "", status: "streaming" };
    const existing = readConversation(conversations.current, currentDocumentId);
    const nextMessages = trimConversationMessages([...existing.messages, userMessage, assistantMessage]);
    conversations.current.set(currentDocumentId, { messages: nextMessages, contextTruncated: context.truncated });
    if (currentDocumentId === documentId) setConversation({ messages: nextMessages, contextTruncated: context.truncated });
    setError("");
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const request: AIChatRequest = {
        documentId: currentDocumentId,
        document: context,
        messages: nextMessages
          .filter((message) => message.status !== "streaming")
          .map(({ role, content: messageContent }) => ({ role, content: limitText(messageContent, AI_CHAT_MESSAGE_MAX_CHARS) })),
        provider: provider ? {
          apiKey: provider.apiKey,
          model: provider.model,
          apiUrl: provider.apiUrl,
        } : undefined,
      };
      const body = await requestAIChat(session, request, { signal: controller.signal, onSessionRefresh });
      await readAIStream(body, (event) => {
        if (event.type === "text-delta") {
          updateConversation(currentDocumentId, (current) => ({
            ...current,
            messages: current.messages.map((message) => message.id === assistantMessage.id ? { ...message, content: message.content + event.text } : message),
          }));
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      });
      updateConversation(currentDocumentId, (current) => ({
        ...current,
        messages: current.messages.map((message) => message.id === assistantMessage.id ? { ...message, status: undefined } : message),
      }));
    } catch (requestError) {
      if (controller.signal.aborted || currentRequestId !== requestId.current) {
        updateConversation(currentDocumentId, (current) => ({
          ...current,
          messages: current.messages.map((message) => message.id === assistantMessage.id ? { ...message, status: undefined } : message),
        }));
      } else {
        const message = requestError instanceof Error ? requestError.message : "AI 生成失败，请稍后重试。";
        setError(message);
        updateConversation(currentDocumentId, (current) => ({
          ...current,
          messages: current.messages.map((item) => item.id === assistantMessage.id
            ? { ...item, content: item.content ? `${item.content}\n\n${message}` : message, status: "error" }
            : item),
        }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (currentRequestId === requestId.current) setIsStreaming(false);
    }
  }, [documentId, isStreaming, onSessionRefresh, provider, session, store, updateConversation]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(() => {
    const current = readConversation(conversations.current, documentId);
    const failedIndex = [...current.messages].reverse().findIndex((message) => message.role === "assistant" && message.status === "error");
    if (failedIndex < 0) return;
    const assistantIndex = current.messages.length - 1 - failedIndex;
    const user = current.messages[assistantIndex - 1];
    if (!user || user.role !== "user") return;
    const messages = current.messages.slice(0, assistantIndex);
    conversations.current.set(documentId, { ...current, messages });
    setConversation({ ...current, messages });
    void sendMessage(user.content);
  }, [documentId, sendMessage]);

  return { messages: conversation.messages, contextTruncated: conversation.contextTruncated, error, isStreaming, sendMessage, stop, retry };
}

function readConversation(conversations: Map<string, Conversation>, documentId: string): Conversation {
  return conversations.get(documentId) ?? { messages: [], contextTruncated: false };
}

function trimConversationMessages(messages: AIChatMessage[]) {
  const kept: AIChatMessage[] = [];
  let chars = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const nextChars = chars + Array.from(message.content).length;
    if (kept.length >= AI_CHAT_HISTORY_MAX_MESSAGES || (kept.length > 0 && nextChars > AI_CHAT_HISTORY_MAX_CHARS)) break;
    kept.push(message);
    chars = nextChars;
  }
  return kept.reverse();
}

function limitText(value: string, maxChars: number) {
  return Array.from(value).slice(0, maxChars).join("");
}
