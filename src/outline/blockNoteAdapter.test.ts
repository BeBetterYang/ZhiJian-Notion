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

  it("projects and restores description with quote styling", () => {
    const tree = createInitialTree();
    tree.nodes.web.description = { text: "这是描述内容" };
    const [projected] = treeToBlockNote(tree);
    const web = projected.children?.[0] as Block;
    expect(web.children?.[0].type).toBe("quote");
    expect(web.children?.[0].id).toBe("web::description");
    const parsed = blockNoteToTree([projected as Block], tree)!;
    expect(parsed.nodes.web.description?.text).toBe("这是描述内容");
    expect(parsed.nodes.web.blocks).toBeUndefined();
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

  it("projects a link on part of a row back as a link", () => {
    const tree = createInitialTree();
    tree.nodes.web.content = {
      text: "人民法院应当",
      spans: [
        { text: "人民法院", marks: { linkUrl: "https://example.com/a", textColor: "red" } },
        { text: "应当", marks: { textColor: "red" } },
      ],
    };
    const [projected] = treeToBlockNote(tree);
    const web = projected.children?.[0] as Block;
    const inline = web.content as unknown as Array<Record<string, unknown>>;
    expect(inline[0]).toMatchObject({ type: "link", href: "https://example.com/a" });
    expect(inline[1]).toMatchObject({ type: "text", text: "应当" });
    // And back again, so an edit elsewhere in the row cannot wash the link out.
    const parsed = blockNoteToTree([projected as Block], tree)!;
    expect(parsed.nodes.web.content.spans?.[0].marks?.linkUrl).toBe("https://example.com/a");
  });

  it("normalizes extra top-level blocks under the single root", () => {
    const tree = blockNoteToTree([
      block("root", "根标题", {}),
      block("heading-2", "同级标题", {}),
    ])!;
    tree.nodes["heading-2"].type = "heading";
    tree.nodes["heading-2"].props = { headingLevel: 2 };
    expect(tree.rootId).toBe("root");
    expect(tree.nodes["heading-2"].parentId).toBe("root");
    expect(tree.nodes.root.children).toContain("heading-2");
  });
});

function block(id: string, text: string, styles: Record<string, unknown>): Block {
  return { id, type: "paragraph", props: {}, content: [{ type: "text", text, styles }], children: [] } as unknown as Block;
}
