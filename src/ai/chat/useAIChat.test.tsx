import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../../core/tree";
import { TreeStore } from "../../core/treeStore";
import type { WorkspaceSession } from "../../workspace/auth";

const { requestAIChat } = vi.hoisted(() => ({ requestAIChat: vi.fn() }));
vi.mock("./api", () => ({
  AI_CHAT_HISTORY_MAX_CHARS: 24_000,
  AI_CHAT_HISTORY_MAX_MESSAGES: 16,
  AI_CHAT_MESSAGE_MAX_CHARS: 4_000,
  requestAIChat,
  readAIStream: vi.fn(async (_body, onEvent) => {
    onEvent({ type: "text-delta", text: "这是摘要" });
    onEvent({ type: "done" });
  }),
}));

import { useAIChat } from "./useAIChat";

const session: WorkspaceSession = { email: "test@example.com", name: "测试", userId: "user-1", accessToken: "token" };

describe("useAIChat", () => {
  it("uses the latest tree snapshot and keeps the response out of the document store", async () => {
    const store = new TreeStore(createInitialTree());
    const before = JSON.stringify(store.getSnapshot());
    requestAIChat.mockResolvedValue(new ReadableStream<Uint8Array>());
    const provider = { apiKey: "user-key", model: "user-model", apiUrl: "https://user-ai.test/v1/chat/completions" };
    const { result } = renderHook(() => useAIChat({ documentId: "file-1", store, session, onSessionRefresh: vi.fn(), provider }));

    await act(async () => {
      await result.current.sendMessage("请总结");
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    expect(requestAIChat).toHaveBeenCalledWith(session, expect.objectContaining({
      documentId: "file-1",
      document: expect.objectContaining({ title: "产品规划", content: expect.stringContaining("产品规划") }),
      messages: [{ role: "user", content: "请总结" }],
      provider,
    }), expect.anything());
    expect(result.current.messages.map((message) => message.content)).toEqual(["请总结", "这是摘要"]);
    expect(JSON.stringify(store.getSnapshot())).toBe(before);
  });

  it("keeps conversations isolated by document and trims old history", async () => {
    const firstStore = new TreeStore(createInitialTree());
    const secondStore = new TreeStore(createInitialTree());
    requestAIChat.mockResolvedValue(new ReadableStream<Uint8Array>());
    const { result, rerender } = renderHook(
      ({ documentId, store }) => useAIChat({ documentId, store, session, onSessionRefresh: vi.fn() }),
      { initialProps: { documentId: "file-1", store: firstStore } },
    );

    for (let index = 0; index < 10; index += 1) {
      await act(async () => { await result.current.sendMessage(`问题 ${index}`); });
    }
    expect(result.current.messages.length).toBeLessThanOrEqual(16);

    rerender({ documentId: "file-2", store: secondStore });
    expect(result.current.messages).toEqual([]);
    await act(async () => { await result.current.sendMessage("第二篇文档的问题"); });
    expect(result.current.messages[0]?.content).toBe("第二篇文档的问题");

    rerender({ documentId: "file-1", store: firstStore });
    expect(result.current.messages.some((message) => message.content === "问题 9")).toBe(true);
    expect(result.current.messages.some((message) => message.content === "第二篇文档的问题")).toBe(false);
  });
});
