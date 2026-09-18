/* global fetch, Response */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_CHAT_LIMITS,
  buildAIChatMessages,
  openAIChatStream,
  validateAIChatRequest,
} from "./_aiChatCore.js";

afterEach(() => vi.restoreAllMocks());

const request = {
  documentId: "file-1",
  document: { title: "产品规划", content: "- 目标", truncated: false },
  messages: [{ role: "user", content: "请总结" }],
};

describe("AI chat core", () => {
  it("validates the shared request limits", () => {
    expect(validateAIChatRequest(request)).toEqual(request);
    expect(() => validateAIChatRequest({ ...request, messages: [] })).toThrow("会话消息需要");
    expect(() => validateAIChatRequest({ ...request, document: { ...request.document, content: "x".repeat(AI_CHAT_LIMITS.maxDocumentChars + 1) } })).toThrow("上下文过大");
    expect(() => validateAIChatRequest({ ...request, messages: [{ role: "system", content: "x" }] })).toThrow("角色不正确");
    expect(() => validateAIChatRequest({ ...request, documentId: "" })).toThrow("文档 ID");
    expect(() => validateAIChatRequest({ ...request, messages: [
      { role: "user", content: "x".repeat(AI_CHAT_LIMITS.maxMessageChars) },
      { role: "assistant", content: "x".repeat(AI_CHAT_LIMITS.maxMessageChars) },
      { role: "user", content: "x".repeat(AI_CHAT_LIMITS.maxMessageChars) },
      { role: "assistant", content: "x".repeat(AI_CHAT_LIMITS.maxMessageChars) },
      { role: "user", content: "x".repeat(AI_CHAT_LIMITS.maxMessageChars) },
      { role: "assistant", content: "x".repeat(AI_CHAT_LIMITS.maxMessageChars) },
      { role: "user", content: "x".repeat(AI_CHAT_LIMITS.maxMessageChars) },
    ] })).toThrow("历史过长");
  });

  it("builds an untrusted document context after the system prompt", () => {
    const messages = buildAIChatMessages(validateAIChatRequest(request));
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("不可信");
    expect(messages[1].content).toContain("<document_context>");
    expect(messages.at(-1)).toEqual(request.messages[0]);
  });

  it("normalizes provider SSE into safe text events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"！\"}}]}\n\ndata: [DONE]\n\n",
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));
    const stream = await openAIChatStream(request, { OPENAI_API_KEY: "secret", OPENAI_MODEL: "test-model" });
    const events = [];
    for await (const event of stream) events.push(event);
    expect(events).toEqual([
      "data: {\"type\":\"text-delta\",\"text\":\"你好\"}\n\n",
      "data: {\"type\":\"text-delta\",\"text\":\"！\"}\n\n",
      "data: {\"type\":\"done\"}\n\n",
    ]);
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }));
  });

  it("surfaces provider stream errors instead of ending normally", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "data: {\"error\":{\"message\":\"provider detail\"}}\n\n",
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));
    const stream = await openAIChatStream(request, { OPENAI_API_KEY: "secret", OPENAI_MODEL: "test-model" });
    const events = [];
    for await (const event of stream) events.push(event);
    expect(events).toEqual(["data: {\"type\":\"error\",\"message\":\"AI 服务暂时不可用，请重试。\"}\n\n"]);
  });

  it("uses the user provider config before server defaults", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "data: [DONE]\n\n",
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));
    await openAIChatStream({
      ...request,
      provider: { apiKey: "user-key", model: "user-model", apiUrl: "https://user-ai.test/v1/chat/completions" },
    }, { OPENAI_API_KEY: "server-key", OPENAI_MODEL: "server-model", OPENAI_API_URL: "https://server-ai.test/v1/chat/completions" });
    expect(fetch).toHaveBeenCalledWith("https://user-ai.test/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer user-key" }),
      body: expect.stringContaining('"model":"user-model"'),
    }));
  });

  it("requires server-side provider configuration", async () => {
    await expect(openAIChatStream(request, {})).rejects.toMatchObject({
      message: "AI 聊天服务尚未配置。",
      statusCode: 503,
    });
  });
});
