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

    const marks = tree?.nodes.root.content.spans?.[0]?.marks;
    expect(marks).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      textColor: "#dc2626",
      backgroundColor: "#fee2e2",
    });
  });

  it("projects ZhiJianTree node style back to BlockNote styles", () => {
    const tree: ZhiJianTree = {
      rootId: "root",
      nodes: {
        root: {
          id: "root",
          parentId: null,
          children: [],
          content: { text: "产品规划" },
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

  it("round-trips table cell text and column widths", () => {
    const tableBlock = {
      id: "table",
      type: "table",
      props: {},
      content: {
        type: "tableContent",
        columnWidths: [120, 180],
        headerRows: 1,
        rows: [
          {
            cells: [
              {
                type: "tableCell",
                props: {
                  backgroundColor: "red",
                  textColor: "blue",
                  textAlignment: "center",
                },
                content: [{ type: "text", text: "名称", styles: { bold: true } }],
              },
              [{ type: "text", text: "进度", styles: {} }],
            ],
          },
        ],
      },
      children: [],
    } as unknown as Block;

    const tree = blockNoteToTree([tableBlock])!;
    expect(tree.nodes.table.props?.table?.rows[0][0].content.text).toBe("名称");
    expect(tree.nodes.table.props?.table?.rows[0][0].content.spans?.[0].marks?.bold).toBe(
      true,
    );
    expect(tree.nodes.table.props?.table?.columnWidths).toEqual([120, 180]);

    const [projected] = treeToBlockNote(tree);
    expect((projected.content as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("round-trips image metadata and preview width", () => {
    const imageBlock = {
      id: "image",
      type: "image",
      props: {
        url: "data:image/png;base64,abc",
        name: "规划图.png",
        caption: "产品规划",
        previewWidth: 420,
        showPreview: true,
      },
      content: undefined,
      children: [],
    } as unknown as Block;

    const tree = blockNoteToTree([imageBlock])!;
    expect(tree.nodes.image.content).toEqual({ text: "" });
    expect(tree.nodes.image.props?.image).toMatchObject({
      url: "data:image/png;base64,abc",
      caption: "产品规划",
      previewWidth: 420,
    });

    const [projected] = treeToBlockNote(tree);
    expect(projected.props).toMatchObject({
      url: "data:image/png;base64,abc",
      caption: "产品规划",
      previewWidth: 420,
    });
  });

  it("round-trips a quote as a dedicated node type", () => {
    const quoteBlock = {
      id: "quote",
      type: "quote",
      props: {},
      content: [{ type: "text", text: "引用当前节点", styles: {} }],
      children: [],
    } as unknown as Block;

    const tree = blockNoteToTree([quoteBlock])!;
    expect(tree.nodes.quote.type).toBe("quote");
    expect(tree.nodes.quote.content.text).toBe("引用当前节点");

    const [projected] = treeToBlockNote(tree);
    expect(projected.type).toBe("quote");
    expect(projected.content).toEqual("引用当前节点");
  });

  it("normalizes additional top-level blocks into root children", () => {
    const tree = blockNoteToTree([
      block("root", "产品规划", {}),
      block("text", "新增正文", {}),
      {
        id: "table",
        type: "table",
        props: {},
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [[{ type: "text", text: "内容", styles: {} }]],
            },
          ],
        },
        children: [],
      } as unknown as Block,
    ])!;

    expect(tree.nodes.root.children).toEqual(["text", "table"]);
    expect(tree.nodes.text.parentId).toBe("root");
    expect(tree.nodes.table.parentId).toBe("root");
    expect(tree.nodes.table.props?.table?.rows[0][0].content.text).toBe("内容");
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
