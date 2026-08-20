import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";
import { createInitialTree } from "../core/tree";
import { renderMindMapNode, treeToMindElixir } from "./mindElixirAdapter";

describe("mindElixirAdapter", () => {
  it("renders rich text without disabling MindElixir native editing", () => {
    const tree = createInitialTree();
    tree.nodes.web.content = {
      text: "Web端",
      spans: [{ text: "Web", marks: { bold: true } }, { text: "端" }],
    };

    const data = treeToMindElixir(tree);
    const webNode = data.nodeData.children?.[0] as NodeObj;

    expect(webNode.dangerouslySetInnerHTML).toBeUndefined();
    expect(renderMindMapNode(webNode.topic, webNode)).toContain("font-weight:700");
  });

  it("renders newly edited text instead of stale rich text metadata", () => {
    const data = treeToMindElixir(createInitialTree());
    const webNode = data.nodeData.children?.[0] as NodeObj;

    expect(renderMindMapNode("Web 新内容", webNode)).toBe("Web 新内容");
  });

  it("creates BlockNote mount points for table and image nodes", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "table";
    tree.nodes.web.props = {
      table: {
        rows: [
          Array.from({ length: 10 }, (_, index) => ({
            content: { text: `第 ${index + 1} 列` },
          })),
        ],
        columnWidths: Array.from({ length: 10 }, () => 480),
      },
    };
    tree.nodes.app.type = "image";
    tree.nodes.app.props = {
      image: { url: "data:image/png;base64,abc", previewWidth: 320 },
    };

    const data = treeToMindElixir(tree);
    const tableNode = data.nodeData.children?.[0] as NodeObj;
    const imageNode = data.nodeData.children?.[1] as NodeObj;

    expect(tableNode.dangerouslySetInnerHTML).toBe(
      '<div class="mindmap-blocknote-slot mindmap-blocknote-slot-table" data-zhijian-media-node="web"></div>',
    );
    expect(imageNode.dangerouslySetInnerHTML).toBe(
      '<div class="mindmap-blocknote-slot mindmap-blocknote-slot-image" data-zhijian-media-node="app"></div>',
    );
    expect(JSON.stringify(tableNode)).not.toContain("第 10 列");
    expect(JSON.stringify(tableNode)).not.toContain("480");
    expect(JSON.stringify(imageNode)).not.toContain("320");
    expect(imageNode.image).toBeUndefined();
  });

  it("renders Todo and quote nodes with mindmap-specific compact styles", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "todo";
    tree.nodes.web.props = { checked: true };
    tree.nodes.app.type = "quote";
    tree.nodes.app.content = { text: "先验证，再发布" };

    const data = treeToMindElixir(tree);
    const todoNode = data.nodeData.children?.[0] as NodeObj;
    const quoteNode = data.nodeData.children?.[1] as NodeObj;

    expect(renderMindMapNode(todoNode.topic, todoNode)).toContain(
      'class="mindmap-todo is-checked"',
    );
    expect(renderMindMapNode(todoNode.topic, todoNode)).toContain(
      'data-node-id="web"',
    );
    expect(renderMindMapNode(quoteNode.topic, quoteNode)).toContain(
      'class="mindmap-quote"',
    );
  });
});
