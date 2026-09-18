import type { WorkspaceSession } from "../../workspace/auth";
import { workspaceFetch, type WorkspaceApiOptions } from "../../workspace/serverApi";
import type { SerializedAIContext } from "./serializeTreeForAI";

export const AI_CHAT_MESSAGE_MAX_CHARS = 4_000;
export const AI_CHAT_HISTORY_MAX_MESSAGES = 16;
export const AI_CHAT_HISTORY_MAX_CHARS = 24_000;

export interface AIChatProvider {
  apiKey: string;
  model: string;
  apiUrl: string;
}

export interface AIChatRequest {
  documentId: string;
  document: SerializedAIContext;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: AIChatProvider;
}

export type AIStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function requestAIChat(
  session: WorkspaceSession,
  request: AIChatRequest,
  options?: WorkspaceApiOptions & { signal?: AbortSignal },
) {
  const response = await workspaceFetch("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(request),
    signal: options?.signal,
  }, session, options);
  if (!response.ok) {
    let message = "AI 生成失败，请稍后重试。";
    try {
      const payload = await response.json() as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) message = payload.error;
    } catch {
      // Keep a stable client-facing message for non-JSON/API fallback responses.
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error("AI 服务没有返回流式内容。");
  return response.body;
}

export async function readAIStream(body: ReadableStream<Uint8Array>, onEvent: (event: AIStreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const records = buffer.split(/\r?\n\r?\n/);
      buffer = records.pop() ?? "";
      records.forEach((record) => readRecord(record, onEvent));
      if (done) break;
    }
    if (buffer.trim()) readRecord(buffer, onEvent);
  } finally {
    reader.releaseLock();
  }
}

function readRecord(record: string, onEvent: (event: AIStreamEvent) => void) {
  const line = record.split(/\r?\n/).find((value) => value.startsWith("data:"));
  if (!line) return;
  try {
    const payload = JSON.parse(line.slice(5).trim()) as AIStreamEvent;
    if (payload.type === "text-delta" || payload.type === "done" || payload.type === "error") onEvent(payload);
  } catch {
    // Ignore malformed event records; the server already normalizes provider output.
  }
}
