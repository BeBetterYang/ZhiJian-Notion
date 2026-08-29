import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";
import { createInitialTree } from "../core/tree";
import { assignGroupedSideDirections, createMindMapStructureSignature, treeToMindElixir } from "./mindElixirAdapter";

describe("mindElixirAdapter", () => {
  it("groups the first half of main branches on the right in side layout", () => {
    const children = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), topic: String(index + 1) })) as NodeObj[];
    assignGroupedSideDirections(children);
    expect(children.map((child) => child.direction)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("keeps the extra branch on the right for an odd branch count", () => {
    const children = Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1), topic: String(index + 1) })) as NodeObj[];
    assignGroupedSideDirections(children);
    expect(children.map((child) => child.direction)).toEqual([1, 1, 1, 0, 0]);
  });

  it("projects one domain node with quote and images as one visual node", () => {
    const tree = createInitialTree();
    tree.nodes.web.blocks = [
      { id: "quote", type: "quote", content: { text: "引用" } },
      { id: "image-1", type: "image", image: { url: "asset:1" } },
      { id: "image-2", type: "image", image: { url: "asset:2" } },
    ];
    const children = treeToMindElixir(tree).nodeData.children as NodeObj[];
    expect(children).toHaveLength(2);
    expect(children[0].dangerouslySetInnerHTML).toContain('class="mindmap-node-shell"');
    expect(children[0].dangerouslySetInnerHTML).toContain('class="mindmap-node-editor-slot"');
    expect(children[0].dangerouslySetInnerHTML).toContain("引用");
    expect(children[0].metadata).toMatchObject({ hasQuote: true, imageCount: 2 });
    expect(children[0].dangerouslySetInnerHTML).toContain("asset:1");
  });

  it("keeps tables as their own visual node", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "table";
    tree.nodes.web.props = { table: { rows: [[{ content: { text: "单元格" } }]] } };
    const table = (treeToMindElixir(tree).nodeData.children as NodeObj[])[0];
    expect(table.dangerouslySetInnerHTML).toContain('class="mindmap-node-table"');
    expect(table.dangerouslySetInnerHTML).toContain("单元格");
    expect(table.dangerouslySetInnerHTML).toContain("单元格");
  });

  it("mounts described nodes for inline quote-style editing", () => {
    const tree = createInitialTree();
    tree.nodes.web.description = { text: "这是描述内容" };
    const web = (treeToMindElixir(tree).nodeData.children as NodeObj[])[0];
    expect(web.dangerouslySetInnerHTML).toContain('class="mindmap-node-quote mindmap-node-description"');
    expect(web.note).toBe("这是描述内容");
  });

  it("projects todo state without embedding renderer HTML", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "todo";
    tree.nodes.web.props = { checked: true };
    tree.nodes.web.content = { text: "任务", spans: [{ text: "任务", marks: { bold: true } }] };
    const node = (treeToMindElixir(tree).nodeData.children as NodeObj[])[0];
    expect(node.metadata).toMatchObject({ type: "todo", checked: true });
    expect(node.dangerouslySetInnerHTML).toContain('class="mindmap-node-checkbox" data-node-id="web" type="checkbox" checked');
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

  // The root carries the level-1 heading size, and the display layer and the
  // in-node editor both read it off the same variable so a node cannot change size
  // the moment it starts being edited.
  it("uses one 20px visual token for the root display and editor shell", () => {
    const root = treeToMindElixir(createInitialTree()).nodeData;
    expect(root.style?.fontSize).toBe("20px");
    expect(root.dangerouslySetInnerHTML).toContain("--mindmap-font-size:20px");
  });

  it("draws the map from the zoomed node, keeping its own id", () => {
    const tree = createInitialTree();
    tree.nodes.web.children = ["web-child"];
    tree.nodes["web-child"] = { id: "web-child", parentId: "web", children: [], type: "text", content: { text: "子" } };
    const zoomed = treeToMindElixir(tree, { rootNodeId: "web" }).nodeData;
    expect(zoomed.id).toBe("web");
    expect((zoomed.children as NodeObj[]).map((child) => child.id)).toEqual(["web-child"]);
    // Standing in as the root, it takes the root's own size and frame.
    expect(zoomed.style?.fontSize).toBe("20px");
  });

  it("falls back to the document root when the zoomed node is gone", () => {
    const tree = createInitialTree();
    expect(treeToMindElixir(tree, { rootNodeId: "deleted" }).nodeData.id).toBe(tree.rootId);
    expect(createMindMapStructureSignature(tree, null, "deleted")).toBe(createMindMapStructureSignature(tree));
  });

  it("signs only the zoomed subtree, so an edit above it forces no rebuild", () => {
    const tree = createInitialTree();
    const zoomedSignature = createMindMapStructureSignature(tree, null, "web");
    expect(zoomedSignature).not.toBe(createMindMapStructureSignature(tree));
    tree.nodes[tree.rootId].children = [...tree.nodes[tree.rootId].children, "outside"];
    tree.nodes.outside = { id: "outside", parentId: tree.rootId, children: [], type: "text", content: { text: "外" } };
    expect(createMindMapStructureSignature(tree, null, "web")).toBe(zoomedSignature);
  });
});
