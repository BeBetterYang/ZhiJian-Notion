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
      '<div class="mindmap-node-group-slot" data-zhijian-group-primary="app" data-zhijian-group-quote="" data-zhijian-group-images="app"></div>',
    );
    expect(JSON.stringify(tableNode)).not.toContain("第 10 列");
    expect(JSON.stringify(tableNode)).not.toContain("480");
    expect(JSON.stringify(imageNode)).not.toContain("320");
    expect(imageNode.image).toBeUndefined();
  });

  it("renders Todo directly and groups a sibling quote with the preceding node", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "todo";
    tree.nodes.web.props = { checked: true };
    tree.nodes.quote = {
      id: "quote",
      parentId: "root",
      children: [],
      content: { text: "先验证，再发布" },
      type: "quote",
    };
    tree.nodes.root.children.push("quote");

    const data = treeToMindElixir(tree);
    const todoNode = data.nodeData.children?.[0] as NodeObj;
    const appNode = data.nodeData.children?.[1] as NodeObj;

    expect(renderMindMapNode(todoNode.topic, todoNode)).toContain(
      'class="mindmap-todo is-checked"',
    );
    expect(renderMindMapNode(todoNode.topic, todoNode)).toContain(
      'data-node-id="web"',
    );
    expect(appNode.dangerouslySetInnerHTML).toContain(
      'data-zhijian-group-quote="quote"',
    );
  });

  it("uses a blank topic for an empty text node", () => {
    const tree = createInitialTree();
    tree.nodes.web.content = { text: "" };

    const data = treeToMindElixir(tree);
    expect(data.nodeData.children?.[0].topic).toBe(" ");
  });

  it("groups consecutive sibling images into one projected gallery node", () => {
    const tree = createInitialTree();
    const imageIds = ["image-1", "image-2", "image-3", "image-4"];
    imageIds.forEach((id) => {
      tree.nodes[id] = {
        id,
        parentId: "root",
        children: [],
        content: { text: "" },
        type: "image",
        props: { image: { url: `asset:${id}` } },
      };
    });
    tree.nodes.root.children = ["web", ...imageIds, "app"];

    const data = treeToMindElixir(tree);
    const webNode = data.nodeData.children?.[0] as NodeObj;

    expect(data.nodeData.children).toHaveLength(2);
    expect(webNode.dangerouslySetInnerHTML).toContain(
      'data-zhijian-group-images="image-1,image-2,image-3,image-4"',
    );
  });

  it("keeps tables standalone and never groups images across them", () => {
    const tree = createInitialTree();
    tree.nodes["image-before"] = {
      id: "image-before",
      parentId: "root",
      children: [],
      content: { text: "" },
      type: "image",
      props: { image: { url: "asset:image-before" } },
    };
    tree.nodes.table = {
      id: "table",
      parentId: "root",
      children: [],
      content: { text: "" },
      type: "table",
    };
    tree.nodes["image-after"] = {
      id: "image-after",
      parentId: "root",
      children: [],
      content: { text: "" },
      type: "image",
      props: { image: { url: "asset:image-after" } },
    };
    tree.nodes.root.children = ["web", "image-before", "table", "image-after"];

    const children = treeToMindElixir(tree).nodeData.children as NodeObj[];

    expect(children).toHaveLength(3);
    expect(children[0].dangerouslySetInnerHTML).toContain(
      'data-zhijian-group-images="image-before"',
    );
    expect(children[1].dangerouslySetInnerHTML).toContain(
      'data-zhijian-media-node="table"',
    );
    expect(children[2].dangerouslySetInnerHTML).toContain(
      'data-zhijian-group-images="image-after"',
    );
  });
});
