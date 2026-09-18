import { describe, expect, it } from "vitest";
import { normalizePdfText, reconstructPdfPageText } from "./normalizePdfText";

describe("normalizePdfText", () => {
  it("cleans line endings, control characters, whitespace and zero-width characters", () => {
    expect(normalizePdfText("  第一行\r\n\r\n\n 第二行\u200b\t 内容\u0000 ")).toBe("第一行\n\n第二行 内容");
  });

  it("does not insert spaces between Chinese glyph items but keeps Latin word spacing", () => {
    expect(reconstructPdfPageText([
      { str: "市", transform: [1, 0, 0, 1, 0, 100] },
      { str: "场", transform: [1, 0, 0, 1, 20, 100] },
      { str: "market", transform: [1, 0, 0, 1, 40, 100] },
      { str: "analysis", transform: [1, 0, 0, 1, 80, 100] },
      { str: "下一行", hasEOL: true, transform: [1, 0, 0, 1, 0, 80] },
    ])).toBe("市场 market analysis\n下一行");
  });
});
