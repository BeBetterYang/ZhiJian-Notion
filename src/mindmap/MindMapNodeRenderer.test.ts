import { describe, expect, it } from "vitest";
import type { RichTextSpan, ZhiJianNode } from "../core/tree";
import { getMindMapNodeVisualStyle, renderMindMapNodeDisplayHtml } from "./MindMapNodeRenderer";

function tableNode(cells: ZhiJianNode["props"]): ZhiJianNode {
  return {
    id: "n1",
    parentId: "root",
    type: "table",
    content: { text: "" },
    children: [],
    props: cells,
  };
}

function textNode(spans: RichTextSpan[]): ZhiJianNode {
  return {
    id: "n1",
    parentId: "root",
    type: "text",
    content: { text: spans.map((span) => span.text).join(""), spans },
    children: [],
  };
}

describe("renderMindMapNodeDisplayHtml table cells", () => {
  it("repeats the cell colours BlockNote's stylesheet paints, so a coloured cell survives leaving the editor", () => {
    const html = renderMindMapNodeDisplayHtml(
      tableNode({
        table: {
          rows: [[
            { content: { text: "1" }, backgroundColor: "blue", textColor: "red" },
            { content: { text: "2" } },
          ]],
        },
      }),
    );

    expect(html).toContain('<td data-background-color="blue" data-text-color="red">');
    // A cell with no colour of its own stays a plain cell.
    expect(html).toContain("<td>");
  });

  it("carries a cell's alignment through", () => {
    const html = renderMindMapNodeDisplayHtml(
      tableNode({ table: { rows: [[{ content: { text: "1" }, textAlignment: "center" }]] } }),
    );

    expect(html).toContain('<td data-text-alignment="center">');
  });
});

describe("marks belong to the run they were applied to", () => {
  it("dresses only the marked run, leaving the rest of the node's text alone", () => {
    const html = renderMindMapNodeDisplayHtml(
      textNode([
        { text: "加粗", marks: { bold: true } },
        { text: "普通" },
        { text: "斜体", marks: { italic: true } },
      ]),
    );

    expect(html).toContain('<span style="font-weight:700">加粗</span>');
    expect(html).toContain("<span>普通</span>");
    expect(html).toContain('<span style="font-style:italic">斜体</span>');
  });

  it("keeps the node box itself unmarked, so one bold word cannot bold the whole node", () => {
    const style = getMindMapNodeVisualStyle(
      textNode([{ text: "加粗", marks: { bold: true, italic: true, textColor: "blue" } }, { text: "普通" }]),
      false,
    );

    expect(style.fontWeight).toBe("400");
    expect(style.fontStyle).toBeUndefined();
    expect(style.color).toBeUndefined();
  });

  it("hands a palette colour back to BlockNote by name, so the map matches the outline", () => {
    const html = renderMindMapNodeDisplayHtml(
      textNode([
        { text: "蓝字", marks: { textColor: "blue" } },
        { text: "自定义", marks: { textColor: "#123456" } },
      ]),
    );

    expect(html).toContain('<span data-text-color="blue">蓝字</span>');
    // Not one of BlockNote's names, so it can only be a plain CSS colour.
    expect(html).toContain('<span style="color:#123456">自定义</span>');
  });
});
