import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAIOutline } from "./aiOutlineApi";

const session = { email: "test@example.com", name: "测试", userId: "user-1", accessToken: "token" };
const document = { type: "pdf" as const, fileName: "课程.pdf", title: "课程讲义", pageCount: 2, pages: [] };
const chunks = [{ id: "chunk-1", startPage: 1, endPage: 2, text: "[第 1 页]\n正文", charCount: 12, source: "pages" as const }];
const docxDocument = { type: "docx" as const, fileName: "课程.docx", title: "课程讲义", sections: [{ id: "section-1", title: "第一章", text: "正文", charCount: 2 }] };
const docxChunks = [{ id: "chunk-1", startSection: 1, endSection: 1, text: "## 第一章\n正文", charCount: 11, source: "headings" as const }];
const draft = {
  type: "ai-outline-draft" as const,
  version: 1 as const,
  title: "课程大纲",
  source: { fileName: "课程.pdf", title: "课程讲义", pageCount: 2 },
  nodes: [{ id: "node-1", title: "第一章", sourcePages: { startPage: 1, endPage: 2 }, children: [] }],
};

describe("generateAIOutline", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends source and chunks, then validates the returned draft", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(draft), { status: 200 }));
    await expect(generateAIOutline(session, document, chunks, {
      provider: { enabled: true, apiKey: "user-key", model: "test-model", apiUrl: "https://ai.test/v1/chat/completions" },
    })).resolves.toEqual(draft);
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/outline", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
      body: expect.stringContaining("user-key"),
    }));
  });

  it("turns an invalid server draft into a user-facing generation error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ type: "wrong" }), { status: 200 }));
    await expect(generateAIOutline(session, document, chunks)).rejects.toThrow("格式不正确");
  });

  it("sends DOCX section ranges instead of PDF page ranges", async () => {
    const docxDraft = {
      ...draft,
      source: { format: "docx" as const, fileName: "课程.docx", title: "课程讲义", sectionCount: 1 },
      nodes: [{ id: "node-1", title: "第一章", sourceSections: { startSection: 1, endSection: 1 }, children: [] }],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(docxDraft), { status: 200 }));
    await expect(generateAIOutline(session, docxDocument, docxChunks)).resolves.toEqual(docxDraft);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.source).toEqual({ format: "docx", fileName: "课程.docx", title: "课程讲义", sectionCount: 1 });
    expect(body.chunks[0]).toEqual({ title: undefined, startSection: 1, endSection: 1, text: "## 第一章\n正文" });
  });
});
