import { describe, expect, it } from "vitest";
import type { DocxSourceDocument } from "../types";
import { chunkDocx } from "./chunkDocx";

const document: DocxSourceDocument = {
  type: "docx",
  fileName: "课程.docx",
  title: "课程",
  sections: [
    { id: "section-1", title: "第一章", level: 1, text: "第一章内容", charCount: 8 },
    { id: "section-2", title: "第二章", level: 1, text: "第二章内容", charCount: 8 },
  ],
};

describe("chunkDocx", () => {
  it("keeps section ranges and headings in the chunk text", () => {
    const chunks = chunkDocx(document, { targetChars: 100, maxChars: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startSection: 1, endSection: 2, source: "headings" });
    expect(chunks[0].text).toContain("## 第一章");
  });

  it("splits sections before exceeding the max size", () => {
    expect(chunkDocx(document, { targetChars: 1, maxChars: 12 })).toHaveLength(2);
  });
});
