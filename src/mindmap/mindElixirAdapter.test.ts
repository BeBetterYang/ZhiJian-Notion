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

  it("projects the document layout direction without changing the tree", () => {
    const tree = createInitialTree();
    const nodesBefore = JSON.stringify(tree.nodes);
    tree.mindMap = { layout: { type: "org-chart", direction: "up" } };

    expect(treeToMindElixir(tree).direction).toBe(3);
    expect(JSON.stringify(tree.nodes)).toBe(nodesBefore);
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

  it("gives a first-level branch and every descendant the same palette colour", () => {
    const tree = createInitialTree();
    tree.nodes.web.children = ["web-child"];
    tree.nodes["web-child"] = { id: "web-child", parentId: "web", children: [], type: "text", content: { text: "子节点" } };
    const projected = treeToMindElixir(tree).nodeData.children as NodeObj[];
    const web = projected[0];
    const app = projected[1];
    const child = web.children?.[0];

    expect(web.branchColor).toBe("#b8babd");
    expect(child?.branchColor).toBe(web.branchColor);
    expect(app.branchColor).toBe("#b8babd");
  });

  it("uses the Yanpi swatches for the root and direct child without framing deeper text", () => {
    const tree = createInitialTree();
    tree.mindMap = { theme: { id: "yanpi", version: 1 } };
    tree.nodes.web.children = ["web-child"];
    tree.nodes["web-child"] = { id: "web-child", parentId: "web", children: [], type: "text", content: { text: "子节点" } };

    const root = treeToMindElixir(tree).nodeData;
    const directChild = (root.children as NodeObj[])[0];
    const descendant = directChild.children?.[0];

    expect(root.style).toMatchObject({ background: "#9b8a76", boxShadow: "none" });
    expect(directChild.style).toMatchObject({
      background: "#d5d1ca",
      boxShadow: "inset 0 0 0 1px #d5d1ca",
    });
    expect(descendant?.style).toMatchObject({ background: "transparent", boxShadow: "none" });
  });

  it("projects the selected frame corner style onto every node box", () => {
    const tree = createInitialTree();
    tree.mindMap = { frame: { rounded: true } };
    const rounded = treeToMindElixir(tree).nodeData;
    expect(rounded.style).toMatchObject({ borderRadius: "999px" });
    expect(rounded.children?.[0].style).toMatchObject({ borderRadius: "999px" });

    tree.mindMap.frame = { rounded: false };
    const square = treeToMindElixir(tree).nodeData;
    expect(square.style).toMatchObject({ borderRadius: "6px" });
    expect(square.children?.[0].style).toMatchObject({ borderRadius: "6px" });
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
