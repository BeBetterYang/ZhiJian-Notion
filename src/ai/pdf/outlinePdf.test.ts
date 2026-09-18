import { describe, expect, it } from "vitest";
import { normalizePdfOutline } from "./outlinePdf";

describe("normalizePdfOutline", () => {
  it("keeps nested outline depth and uses the first valid child page", () => {
    expect(normalizePdfOutline([
      { title: "第一章", page: 3, items: [{ title: "小节", page: 5 }] },
      { title: "无效目录", page: 0, items: [{ title: "有效小节", page: 10 }] },
      { title: "", page: 12 },
      { title: "越界", page: 999 },
    ], 20)).toEqual([
      { title: "第一章", page: 3, depth: 0, children: [{ title: "小节", page: 5, depth: 1 }] },
      { title: "无效目录", page: 10, depth: 0, children: [{ title: "有效小节", page: 10, depth: 1 }] },
    ]);
  });
});
