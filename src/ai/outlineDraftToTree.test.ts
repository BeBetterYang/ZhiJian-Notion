import { describe, expect, it } from "vitest";
import { outlineDraftToTree } from "./outlineDraftToTree";
import type { AIOutlineDraft } from "./types";

const draft: AIOutlineDraft = {
  type: "ai-outline-draft",
  version: 1,
  title: "课程大纲",
  source: { fileName: "课程.pdf", title: "课程讲义", pageCount: 10 },
  nodes: [{
    id: "chapter",
    title: "第一章",
    summary: "章节摘要",
    sourcePages: { startPage: 2, endPage: 4 },
    children: [{
      id: "section",
      title: "第一节",
      children: [{ id: "point", title: "知识点", children: [] }],
    }],
  }],
};

describe("outlineDraftToTree", () => {
  it("creates a valid tree with hierarchy and headings", () => {
    const tree = outlineDraftToTree(draft);
    const root = tree.nodes[tree.rootId];
    const chapter = tree.nodes[root.children[0]];
    const section = tree.nodes[chapter.children[0]];
    const point = tree.nodes[section.children[0]];

    expect(root.content.text).toBe("课程大纲");
    expect(chapter.type).toBe("heading");
    expect(chapter.props?.headingLevel).toBe(2);
    expect(chapter.description?.text).toBe("章节摘要");
    expect(section.props?.headingLevel).toBe(3);
    expect(point.type).toBe("text");
    expect(point.parentId).toBe(section.id);
  });
});
