import { describe, expect, it } from "vitest";
import type { PdfSourceDocument } from "../types";
import { chunkPdf, isUsablePdfOutline } from "./chunkPdf";

function documentWithPages(charCounts: number[], outline?: PdfSourceDocument["outline"]): PdfSourceDocument {
  return {
    type: "pdf",
    fileName: "测试.pdf",
    title: "测试",
    pageCount: charCounts.length,
    pages: charCounts.map((charCount, index) => ({ page: index + 1, text: String(index + 1).repeat(charCount), charCount })),
    ...(outline ? { outline } : {}),
  };
}

describe("chunkPdf", () => {
  it("uses reliable outline page ranges first", () => {
    const result = chunkPdf(documentWithPages(
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [{ title: "第一章", page: 3, depth: 0 }, { title: "第二章", page: 10, depth: 0 }],
    ), { targetChars: 400, maxChars: 800 });
    expect(result.map((chunk) => [chunk.title, chunk.startPage, chunk.endPage])).toEqual([
      ["前置内容", 1, 2], ["第一章", 3, 9], ["第二章", 10, 12],
    ]);
    expect(result.every((chunk) => chunk.source === "outline")).toBe(true);
  });

  it("falls back to page chunks without splitting a page", () => {
    const result = chunkPdf(documentWithPages([8_000, 7_000, 9_000, 8_000]), { targetChars: 20_000, maxChars: 30_000 });
    expect(result.map((chunk) => [chunk.startPage, chunk.endPage])).toEqual([[1, 3], [4, 4]]);
    expect(result[0].text).toContain("[第 1 页]");
  });

  it("keeps a single page intact even when it exceeds maxChars", () => {
    const result = chunkPdf(documentWithPages([40_000]), { targetChars: 20_000, maxChars: 30_000 });
    expect(result).toHaveLength(1);
    expect(result[0].startPage).toBe(1);
    expect(result[0].endPage).toBe(1);
  });
});

describe("isUsablePdfOutline", () => {
  it("requires multiple ordered pages", () => {
    expect(isUsablePdfOutline(undefined, 10)).toBe(false);
    expect(isUsablePdfOutline([{ title: "唯一", page: 3, depth: 0 }], 10)).toBe(false);
    expect(isUsablePdfOutline([{ title: "一", page: 3, depth: 0 }, { title: "二", page: 3, depth: 0 }], 10)).toBe(false);
    expect(isUsablePdfOutline([{ title: "一", page: 3, depth: 0 }, { title: "二", page: 8, depth: 0 }], 10)).toBe(true);
  });
});
