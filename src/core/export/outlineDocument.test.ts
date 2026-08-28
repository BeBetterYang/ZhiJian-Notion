import { describe, expect, it } from "vitest";
import type { ZhiJianTree } from "../tree";
import { outlineExportFileName, treeToOutlineHtmlDocument } from "./outlineDocument";

function sampleTree(): ZhiJianTree {
  return {
    rootId: "root",
    nodes: {
      root: { id: "root", parentId: null, children: ["todo", "table"], type: "heading", content: { text: "产品/规划" } },
      todo: {
        id: "todo",
        parentId: "root",
        children: [],
        type: "todo",
        content: { text: "完成链接", spans: [{ text: "完成", marks: { bold: true, textColor: "blue" } }, { text: "链接", marks: { linkUrl: "https://example.com" } }] },
        description: { text: "节点描述" },
        blocks: [
          { id: "quote", type: "quote", content: { text: "引用内容", marks: { italic: true } } },
          { id: "image", type: "image", image: { name: "示例图", url: "data:image/png;base64,AA==" } },
        ],
        props: { checked: true },
      },
      table: {
        id: "table",
        parentId: "root",
        children: [],
        type: "table",
        content: { text: "" },
        props: { table: { rows: [[{ content: { text: "表格内容" }, backgroundColor: "lightYellow" }]] } },
      },
    },
  };
}

describe("outline document export", () => {
  it("renders the canonical tree content and formatting as standalone HTML", async () => {
    const html = await treeToOutlineHtmlDocument(sampleTree());

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("产品/规划");
    expect(html).toContain("font-weight:700");
    expect(html).toContain("https://example.com");
    expect(html).toContain("节点描述");
    expect(html).toContain("引用内容");
    expect(html).toContain('src="data:image/png;base64,AA=="');
    expect(html).toContain("表格内容");
    expect(html).toContain("#fbf3db");
  });

  it("marks each row with its kind so the export keeps the heading sizes and bullet offsets", async () => {
    const tree = sampleTree();
    tree.nodes.heading = { id: "heading", parentId: "root", children: [], type: "heading", content: { text: "小节" }, props: { headingLevel: 3 } };
    tree.nodes.root.children.push("heading");
    const html = await treeToOutlineHtmlDocument(tree);

    expect(html).toContain('<li class="row heading-3">');
    expect(html).toContain('<li class="row todo">');
    expect(html).toContain('<li class="row table">');
  });

  it("adds Word namespaces and sanitizes file names", async () => {
    expect(await treeToOutlineHtmlDocument(sampleTree(), true)).toContain("urn:schemas-microsoft-com:office:word");
    expect(outlineExportFileName(sampleTree(), "大纲.doc")).toBe("产品-规划-大纲.doc");
  });
});
