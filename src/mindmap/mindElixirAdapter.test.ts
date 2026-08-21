import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";
import { createInitialTree } from "../core/tree";
import { createMindMapStructureSignature, renderMindMapNode, treeToMindElixir } from "./mindElixirAdapter";

describe("mindElixirAdapter", () => {
  it("projects one domain node with quote and images as one visual node", () => {
    const tree = createInitialTree();
    tree.nodes.web.blocks = [
      { id: "quote", type: "quote", content: { text: "引用" } },
      { id: "image-1", type: "image", image: { url: "asset:1" } },
      { id: "image-2", type: "image", image: { url: "asset:2" } },
    ];
    const children = treeToMindElixir(tree).nodeData.children as NodeObj[];
    expect(children).toHaveLength(2);
    expect(children[0].dangerouslySetInnerHTML).toContain('data-zhijian-node-content="web"');
    expect(children[0].metadata).toMatchObject({ hasQuote: true, imageCount: 2 });
    expect(JSON.stringify(children[0])).not.toContain("asset:1");
  });

  it("keeps tables as their own visual node", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "table";
    tree.nodes.web.props = { table: { rows: [[{ content: { text: "单元格" } }]] } };
    const table = (treeToMindElixir(tree).nodeData.children as NodeObj[])[0];
    expect(table.dangerouslySetInnerHTML).toContain('data-zhijian-media-node="web"');
    expect(JSON.stringify(table)).not.toContain("单元格");
  });

  it("mounts described nodes for inline quote-style editing", () => {
    const tree = createInitialTree();
    tree.nodes.web.description = { text: "这是描述内容" };
    const web = (treeToMindElixir(tree).nodeData.children as NodeObj[])[0];
    expect(web.dangerouslySetInnerHTML).toContain('data-zhijian-node-content="web"');
    expect(web.note).toBe("这是描述内容");
  });

  it("renders todo state and rich text", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "todo";
    tree.nodes.web.props = { checked: true };
    tree.nodes.web.content = { text: "任务", spans: [{ text: "任务", marks: { bold: true } }] };
    const node = (treeToMindElixir(tree).nodeData.children as NodeObj[])[0];
    expect(renderMindMapNode(node.topic, node)).toContain("mindmap-todo is-checked");
    expect(renderMindMapNode(node.topic, node)).toContain("font-weight:700");
  });

  it("does not change visible structure when blocks change", () => {
    const tree = createInitialTree();
    const initial = createMindMapStructureSignature(tree);
    tree.nodes.web.blocks = [{ id: "quote", type: "quote", content: { text: "引用" } }];
    expect(createMindMapStructureSignature(tree)).toBe(initial);
    tree.nodes.web.children = ["new-child"];
    tree.nodes["new-child"] = { id: "new-child", parentId: "web", children: [], type: "text", content: { text: "新" } };
    expect(createMindMapStructureSignature(tree)).not.toBe(initial);
  });
});
