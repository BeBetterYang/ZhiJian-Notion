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
});
