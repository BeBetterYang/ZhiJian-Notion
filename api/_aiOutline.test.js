/* global Response */

import { describe, expect, it, vi } from "vitest";
import { generateAIOutline, normalizeRequest } from "./_aiOutline.js";

const request = {
  source: { fileName: "课程.pdf", title: "课程讲义", pageCount: 3 },
  chunks: [{ title: "第一章", startPage: 1, endPage: 3, text: "[第 1 页]\n课程内容" }],
};
const docxRequest = {
  source: { format: "docx", fileName: "课程.docx", title: "课程讲义", sectionCount: 2 },
  chunks: [{ title: "第一章", startSection: 1, endSection: 2, text: "## 第一章\n课程内容" }],
};

describe("AI outline request", () => {
  it("reports missing server configuration without calling the provider", async () => {
    const fetchImpl = vi.fn();
    await expect(generateAIOutline(request, {}, fetchImpl)).rejects.toMatchObject({
      statusCode: 503,
      message: "请先在设置 → 偏好中配置 AI 服务。",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps only the source and page-preserving chunk fields", () => {
    expect(normalizeRequest({ ...request, chunks: [{ ...request.chunks[0], ignored: "drop" }] })).toEqual(request);
  });

  it("rejects invalid page ranges and oversized input", () => {
    expect(() => normalizeRequest({ ...request, chunks: [{ ...request.chunks[0], endPage: 4 }] })).toThrow("页码不正确");
    expect(() => normalizeRequest({ ...request, chunks: [{ ...request.chunks[0], text: "x".repeat(40_001) }] })).toThrow("过大");
  });

  it("normalizes DOCX section ranges", () => {
    expect(normalizeRequest({ ...docxRequest, chunks: [{ ...docxRequest.chunks[0], ignored: "drop" }] })).toEqual(docxRequest);
    expect(() => normalizeRequest({ ...docxRequest, chunks: [{ ...docxRequest.chunks[0], endSection: 3 }] })).toThrow("章节范围不正确");
  });

  it("calls an OpenAI-compatible endpoint and parses JSON output", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "```json\n{\"type\":\"ai-outline-draft\",\"version\":1}\n```" } }],
    }), { status: 200 }));
    await expect(generateAIOutline(request, {
      AI_OUTLINE_API_KEY: "test-key",
      AI_OUTLINE_MODEL: "test-model",
      AI_OUTLINE_API_URL: "https://ai.test/v1/chat/completions",
    }, fetchImpl)).resolves.toMatchObject({ type: "ai-outline-draft", version: 1 });
    expect(fetchImpl).toHaveBeenCalledWith("https://ai.test/v1/chat/completions", expect.objectContaining({ method: "POST" }));
  });

  it("accepts a browser-provided API key for user-configured imports", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"type":"ai-outline-draft","version":1}' } }],
    }), { status: 200 }));
    await expect(generateAIOutline({ ...request, provider: {
      apiKey: "user-key",
      model: "user-model",
      apiUrl: "https://user-ai.test/v1/chat/completions",
    } }, {}, fetchImpl)).resolves.toMatchObject({ type: "ai-outline-draft", version: 1 });
    expect(fetchImpl).toHaveBeenCalledWith("https://user-ai.test/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer user-key" }),
    }));
  });

  it("keeps the server provider when the browser config is empty", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"type":"ai-outline-draft","version":1}' } }],
    }), { status: 200 }));
    await expect(generateAIOutline({ ...request, provider: {
      model: "",
      apiUrl: "https://api.openai.com/v1/chat/completions",
    } }, {
      AI_OUTLINE_API_KEY: "server-key",
      AI_OUTLINE_MODEL: "server-model",
      AI_OUTLINE_API_URL: "https://server-ai.test/v1/chat/completions",
    }, fetchImpl)).resolves.toMatchObject({ type: "ai-outline-draft", version: 1 });
    expect(fetchImpl).toHaveBeenCalledWith("https://server-ai.test/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer server-key" }),
    }));
  });

  it("maps provider errors to a safe server error", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "provider detail" },
    }), { status: 429 }));
    await expect(generateAIOutline(request, {
      AI_OUTLINE_API_KEY: "test-key",
      AI_OUTLINE_MODEL: "test-model",
    }, fetchImpl)).rejects.toMatchObject({
      statusCode: 502,
      message: "provider detail",
    });
  });

  it("shows a provider message when it uses a top-level error field", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      message: "模型不存在",
    }), { status: 404 }));
    await expect(generateAIOutline(request, {
      AI_OUTLINE_API_KEY: "test-key",
      AI_OUTLINE_MODEL: "test-model",
    }, fetchImpl)).rejects.toMatchObject({ message: "模型不存在", statusCode: 502 });
  });

  it("maps an aborted provider request to a timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url, options) => new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }));
      const result = generateAIOutline(request, {
        AI_OUTLINE_API_KEY: "test-key",
        AI_OUTLINE_MODEL: "test-model",
      }, fetchImpl);
      const rejection = expect(result).rejects.toMatchObject({
        statusCode: 504,
        message: "AI 生成超时，请稍后重试。",
      });
      await vi.advanceTimersByTimeAsync(90_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
