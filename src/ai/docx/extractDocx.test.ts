import mammoth from "mammoth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocxImportError } from "./docxErrors";
import { extractDocx } from "./extractDocx";

vi.mock("mammoth", () => ({ default: { convertToHtml: vi.fn() } }));

const mockedConvertToHtml = vi.mocked(mammoth.convertToHtml);

describe("extractDocx", () => {
  beforeEach(() => vi.clearAllMocks());

  it("converts headings, paragraphs, lists and tables into sections", async () => {
    mockedConvertToHtml.mockResolvedValueOnce({
      value: "<h1>第一章</h1><p>正文内容</p><ol><li>第一项</li><li>第二项</li></ol><table><tr><th>项目</th><th>金额</th></tr><tr><td>收入</td><td>100</td></tr></table><h2>第二章</h2><p>后续内容</p>",
      messages: [],
    });
    const progress: string[] = [];
    const file = { name: "课程.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 4, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)) } as unknown as File;
    const document = await extractDocx(file, {
      onProgress: (next) => progress.push(next.stage),
    });

    expect(document.title).toBe("课程");
    expect(document.sections).toEqual([
      expect.objectContaining({ title: "第一章", level: 1, text: expect.stringContaining("正文内容") }),
      expect.objectContaining({ title: "第二章", level: 2, text: "后续内容" }),
    ]);
    expect(document.sections[0].text).toContain("1. 第一项\n2. 第二项");
    expect(document.sections[0].text).toContain("项目 | 金额\n收入 | 100");
    expect(document.stats).toEqual(expect.objectContaining({ sectionCount: 2, titledSectionCount: 2 }));
    expect(progress).toEqual(["loading", "parsing", "normalizing", "done"]);
  });

  it("rejects unsupported files", async () => {
    const file = { name: "课程.doc", type: "application/msword", size: 4 } as File;
    await expect(extractDocx(file)).rejects.toEqual(expect.any(DocxImportError));
  });
});
