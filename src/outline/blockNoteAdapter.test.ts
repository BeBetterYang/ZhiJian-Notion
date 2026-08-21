import type { Block } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { createInitialTree, type ZhiJianTree } from "../core/tree";
import { blockNoteToTree, treeToBlockNote } from "./blockNoteAdapter";

describe("blockNoteAdapter", () => {
  it("round-trips rich text marks", () => {
    const tree = blockNoteToTree([block("root", "产品规划", {
      bold: true, italic: true, underline: true, strike: true,
      textColor: "#dc2626", backgroundColor: "#fee2e2",
    })])!;
    expect(tree.nodes.root.content.spans?.[0].marks).toMatchObject({
      bold: true, italic: true, underline: true, strike: true,
      textColor: "#dc2626", backgroundColor: "#fee2e2",
    });
  });

  it("maps quote and images to blocks owned by one node", () => {
    const tree: ZhiJianTree = {
      rootId: "root",
      nodes: { root: {
        id: "root", parentId: null, children: [], type: "text", content: { text: "正文" },
        blocks: [
          { id: "quote", type: "quote", content: { text: "引用" } },
          { id: "image", type: "image", image: { url: "asset:image", previewWidth: 240 } },
        ],
      } },
    };
    const [projected] = treeToBlockNote(tree);
    expect(projected.children?.map((child) => child.type)).toEqual(["quote", "image"]);
    const parsed = blockNoteToTree([projected as Block])!;
    expect(parsed.nodes.root.blocks?.map((block) => block.id)).toEqual(["quote", "image"]);
    expect(parsed.nodes.root.children).toEqual([]);
  });

  it("keeps table data in an exclusive table node", () => {
    const table = {
      id: "table", type: "table", props: {},
      content: { type: "tableContent", rows: [{ cells: [[{ type: "text", text: "内容", styles: {} }]] }] },
      children: [],
    } as unknown as Block;
    const tree = blockNoteToTree([table])!;
    expect(tree.nodes.table.type).toBe("table");
    expect(tree.nodes.table.props?.table?.rows[0][0].content.text).toBe("内容");
  });

  it("preserves heading and todo node types", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "heading";
    tree.nodes.web.props = { headingLevel: 2 };
    tree.nodes.app.type = "todo";
    tree.nodes.app.props = { checked: true };
    const parsed = blockNoteToTree(treeToBlockNote(tree) as unknown as Block[], tree)!;
    expect(parsed.nodes.web.type).toBe("heading");
    expect(parsed.nodes.app.props?.checked).toBe(true);
  });
});

function block(id: string, text: string, styles: Record<string, unknown>): Block {
  return { id, type: "paragraph", props: {}, content: [{ type: "text", text, styles }], children: [] } as unknown as Block;
}
