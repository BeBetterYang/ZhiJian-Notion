import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";
import { createInitialTree } from "../core/tree";
import { renderMindMapRichText, treeToMindElixir } from "./mindElixirAdapter";

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
    expect(renderMindMapRichText(webNode.topic, webNode)).toContain("font-weight:700");
  });

  it("renders newly edited text instead of stale rich text metadata", () => {
    const data = treeToMindElixir(createInitialTree());
    const webNode = data.nodeData.children?.[0] as NodeObj;

    expect(renderMindMapRichText("Web 新内容", webNode)).toBe("Web 新内容");
  });

  it("creates BlockNote mount points for table and image nodes", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "table";
    tree.nodes.web.props = {
      table: {
        rows: [[{ content: { text: "版本" } }, { content: { text: "V2" } }]],
      },
    };
    tree.nodes.app.type = "image";
    tree.nodes.app.props = {
      image: { url: "data:image/png;base64,abc", previewWidth: 320 },
    };

    const data = treeToMindElixir(tree);
    const tableNode = data.nodeData.children?.[0] as NodeObj;
    const imageNode = data.nodeData.children?.[1] as NodeObj;

    expect(tableNode.dangerouslySetInnerHTML).toContain(
      'data-zhijian-media-node="web"',
    );
    expect(tableNode.dangerouslySetInnerHTML).toContain("width:200px");
    expect(imageNode.dangerouslySetInnerHTML).toContain(
      'data-zhijian-media-node="app"',
    );
    expect(imageNode.dangerouslySetInnerHTML).toContain("width:320px");
    expect(imageNode.image).toBeUndefined();
  });
});
