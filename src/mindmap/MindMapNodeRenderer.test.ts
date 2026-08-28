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

function headingNode(level: 1 | 2 | 3): ZhiJianNode {
  return {
    ...textNode([{ text: `标题 ${level}` }]),
    type: "heading",
    props: { headingLevel: level },
  };
}

describe("shared typography tokens", () => {
  it.each([1, 2, 3] as const)("uses the shared heading %s metrics", (level) => {
    const style = getMindMapNodeVisualStyle(headingNode(level), false);
    expect(style.fontSize).toBe(`var(--zhijian-type-heading-${level}-size)`);
    expect(style.lineHeight).toBe("var(--zhijian-type-heading-line-height)");
    expect(style.fontWeight).toBe("var(--zhijian-type-heading-weight)");
  });

  it("keeps the center topic on its independent size", () => {
    expect(getMindMapNodeVisualStyle(headingNode(1), true).fontSize).toBe("20px");
  });
});

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

    expect(html).toContain('data-table-row="0" data-table-column="0" data-background-color="blue" data-text-color="red"');
    // Every cell exposes its position so edit mode can restore the clicked cell.
    expect(html).toContain('data-table-row="0" data-table-column="1"');
  });

  it("carries a cell's alignment through", () => {
    const html = renderMindMapNodeDisplayHtml(
      tableNode({ table: { rows: [[{ content: { text: "1" }, textAlignment: "center" }]] } }),
    );

    expect(html).toContain('data-table-row="0" data-table-column="0" data-text-alignment="center"');
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

    expect(style.fontWeight).toBe("var(--zhijian-type-body-weight)");
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
