import type { Block } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { blockNoteToTree, treeToBlockNote } from "./blockNoteAdapter";
import type { ZhiJianTree } from "../core/tree";

describe("blockNoteAdapter styles", () => {
  it("extracts BlockNote text styles into ZhiJianTree node style", () => {
    const tree = blockNoteToTree([
      block("root", "产品规划", {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        textColor: "#dc2626",
        backgroundColor: "#fee2e2",
      }),
    ]);

    const style = tree?.nodes.root.props?.style as Record<string, unknown>;
    expect(style.fontWeight).toBe("700");
    expect(style.fontStyle).toBe("italic");
    expect(style.textDecoration).toBe("underline line-through");
    expect(style.color).toBe("#dc2626");
    expect(style.backgroundColor).toBe("#fee2e2");
  });

  it("projects ZhiJianTree node style back to BlockNote styles", () => {
    const tree: ZhiJianTree = {
      rootId: "root",
      nodes: {
        root: {
          id: "root",
          parentId: null,
          children: [],
          content: "产品规划",
          type: "text",
          props: {
            style: {
              fontWeight: "700",
              fontStyle: "italic",
              textDecoration: "underline line-through",
              color: "#2563eb",
              backgroundColor: "#dbeafe",
            },
          },
        },
      },
    };

    const [projected] = treeToBlockNote(tree);
    const content = projected.content;

    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content) && typeof content[0] !== "string" && "styles" in content[0]) {
      expect(content[0].styles).toMatchObject({
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        textColor: "#2563eb",
        backgroundColor: "#dbeafe",
      });
    }
  });
});

function block(id: string, text: string, styles: Record<string, unknown>): Block {
  return {
    id,
    type: "paragraph",
    props: {},
    content: [
      {
        type: "text",
        text,
        styles,
      },
    ],
    children: [],
  } as unknown as Block;
}
