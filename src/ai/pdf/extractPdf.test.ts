import { describe, expect, it, vi } from "vitest";
import { PdfImportError } from "../types";

const getDocument = vi.hoisted(() => vi.fn());
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument }));

import { extractPdf, isLikelyScannedPdf } from "./extractPdf";

describe("isLikelyScannedPdf", () => {
  it("detects a mostly image-only document", () => {
    expect(isLikelyScannedPdf(Array.from({ length: 50 }, (_, index) => ({ page: index + 1, text: index < 2 ? "少量文字" : "", charCount: index < 2 ? 4 : 0 })))).toBe(true);
  });

  it("keeps a text PDF out of the scanned path", () => {
    expect(isLikelyScannedPdf(Array.from({ length: 50 }, (_, index) => ({ page: index + 1, text: "正文".repeat(20), charCount: 40 })))).toBe(false);
  });

  it("keeps a short single-page text PDF out of the scanned path", () => {
    expect(isLikelyScannedPdf([{ page: 1, text: "短文", charCount: 2 }])).toBe(false);
  });
});

describe("extractPdf", () => {
  it("reads metadata, resolves string destinations to 1-based pages and cleans the PDF proxy", async () => {
    const cleanup = vi.fn(async () => undefined);
    const destroy = vi.fn(async () => undefined);
    const pdf = {
      numPages: 3,
      getMetadata: vi.fn(async () => ({ info: { Title: "课程讲义", Author: "枝间" } })),
      getOutline: vi.fn(async () => [{ title: "第二章", dest: "chapter-2", items: [{ title: "小节", dest: [{ page: 3 }], items: [] }] }]),
      getDestination: vi.fn(async () => [{ page: 2 }]),
      getPageIndex: vi.fn(async (ref: { page: number }) => ref.page - 1),
      getPage: vi.fn(async (page: number) => ({
        getTextContent: vi.fn(async () => ({ items: [{ str: `第 ${page} 页 ${"正文 ".repeat(120)}`, hasEOL: true, transform: [1, 0, 0, 1, 0, 100] }] })),
      })),
      cleanup,
    };
    getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });
    const progress: string[] = [];
    const document = await extractPdf({
      name: "课程讲义.pdf",
      type: "application/pdf",
      size: 12,
      arrayBuffer: async () => new ArrayBuffer(12),
    } as File, { onProgress: (value) => progress.push(value.stage) });

    expect(document.title).toBe("课程讲义");
    expect(document.author).toBe("枝间");
    expect(document.pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(document.outline?.[0]).toMatchObject({ title: "第二章", page: 2, depth: 0 });
    expect(document.outline?.[0]?.children?.[0]).toMatchObject({ title: "小节", page: 3, depth: 1 });
    expect(document.stats?.totalChars).toBeGreaterThan(500);
    expect(progress).toEqual(["loading", "metadata", "outline", "pages", "pages", "pages", "pages", "normalizing", "done"]);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("surfaces cancellation as a non-user-error code", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(extractPdf({ name: "取消.pdf", type: "application/pdf", size: 1, arrayBuffer: async () => new ArrayBuffer(1) } as File, { signal: controller.signal }))
      .rejects.toMatchObject({ code: "ABORTED" } satisfies Partial<PdfImportError>);
  });
});
