import { describe, expect, it } from "vitest";
import { createInitialTree, richTextToPlainText } from "../tree";
import { TreeStore } from "./TreeStore";

describe("TreeStore", () => {
  it("creates the product planning seed tree", () => {
    const tree = new TreeStore(createInitialTree()).getSnapshot();
    expect(richTextToPlainText(tree.nodes[tree.rootId].content)).toBe("产品规划");
    expect(tree.nodes[tree.rootId].children).toEqual(["web", "app"]);
  });

  it("persists only the selected mind-map theme without changing document nodes", () => {
    const store = new TreeStore(createInitialTree());
    const nodesBefore = JSON.stringify(store.getSnapshot().nodes);
    store.setMindMapTheme({ id: "forest", version: 1 });

    expect(store.getSnapshot().mindMap?.theme).toEqual({ id: "forest", version: 1 });
    expect(JSON.stringify(store.getSnapshot().nodes)).toBe(nodesBefore);
  });

  it("updates content, description and undo/redo", () => {
    const store = new TreeStore(createInitialTree());
    store.updateContent("web", "Web 编辑器");
    store.updateDescription("web", "第一阶段");
    expect(store.getNode("web")?.content.text).toBe("Web 编辑器");
    expect(store.getNode("web")?.description?.text).toBe("第一阶段");
    store.undo();
    expect(store.getNode("web")?.description).toBeUndefined();
    store.redo();
    expect(store.getNode("web")?.description?.text).toBe("第一阶段");
  });

  it("keeps one IME composition to a single undo step", () => {
    const store = new TreeStore(createInitialTree());
    store.beginHistoryCoalescing();
    // What the editor reports while 你 is being typed: one change per pinyin
    // letter, none of them text the user ever wrote.
    store.updateContent("web", "Web端n");
    store.updateContent("web", "Web端ni");
    store.endHistoryCoalescing();
    // The finished character is flushed just after `compositionend`.
    store.updateContent("web", "Web端你");
    store.undo();
    expect(store.getNode("web")?.content.text).toBe("Web端");
    store.redo();
    expect(store.getNode("web")?.content.text).toBe("Web端你");
    // The composition is over, so the next edit is a step of its own again.
    store.updateContent("web", "Web端你好");
    store.undo();
    expect(store.getNode("web")?.content.text).toBe("Web端你");
  });

  it("records the state a composition started from even when it makes one change", () => {
    const store = new TreeStore(createInitialTree());
    store.beginHistoryCoalescing();
    store.endHistoryCoalescing();
    store.updateContent("web", "端");
    store.undo();
    expect(store.getNode("web")?.content.text).toBe("Web端");
  });

  it("ends a coalesced run at an undo", () => {
    const store = new TreeStore(createInitialTree());
    store.updateContent("web", "Web端n");
    store.beginHistoryCoalescing();
    store.undo();
    expect(store.getNode("web")?.content.text).toBe("Web端");
    // Without the boundary this edit would fold into the run left open above and
    // undo would jump past it.
    store.updateContent("web", "前端");
    store.updateContent("web", "前端开发");
    store.undo();
    expect(store.getNode("web")?.content.text).toBe("前端");
  });

  it("updates and clears the complete node document", () => {
    const store = new TreeStore(createInitialTree());
    store.updateNodeDocument("web", "正文", [], "描述");
    expect(store.getNode("web")?.description?.text).toBe("描述");
    store.updateNodeDocument("web", "正文", [], "");
    expect(store.getNode("web")?.description).toBeUndefined();
  });

  it("writes table cells back through the node document", () => {
    const store = new TreeStore(createInitialTree());
    store.updateType("web", "table");
    // A table node keeps its cells in props, so without this channel every table
    // edit made in the mindmap editor was parsed and then silently dropped.
    store.updateNodeDocument("web", "", [], undefined, { rows: [[{ content: { text: "甲" } }]] });
    expect(store.getNode("web")?.props?.table?.rows[0][0].content.text).toBe("甲");
    store.updateNodeDocument("web", "", [], undefined);
    expect(store.getNode("web")?.props?.table?.rows[0][0].content.text).toBe("甲");
  });

  it("manages node-internal blocks without creating tree siblings", () => {
    const store = new TreeStore(createInitialTree());
    store.addNodeBlock("web", { id: "quote-1", type: "quote", content: { text: "引用" } });
    store.addNodeBlock("web", { id: "image-1", type: "image", image: { url: "asset:image-1", previewWidth: 320 } });
    expect(store.getNode("web")?.blocks?.map((block) => block.id)).toEqual(["quote-1", "image-1"]);
    expect(store.getNode("root")?.children).toEqual(["web", "app"]);
    store.moveNode("web", "root", 1);
    expect(store.getNode("web")?.blocks?.[1].id).toBe("image-1");
    store.deleteNode("web");
    expect(store.getNode("web")).toBeNull();
    expect(store.getNode("app")?.blocks).toBeUndefined();
  });

  it("updates, reorders and removes node blocks", () => {
    const store = new TreeStore(createInitialTree());
    store.updateNodes([{ id: "web", blocks: [
      { id: "a", type: "quote", content: { text: "A" } },
      { id: "b", type: "quote", content: { text: "B" } },
    ] }]);
    store.updateNodeBlock("web", "a", { content: { text: "已更新" } });
    store.moveNodeBlock("web", "b", 0);
    expect(store.getNode("web")?.blocks?.map((block) => block.type === "quote" ? block.content.text : "")).toEqual(["B", "已更新"]);
    store.deleteNodeBlock("web", "b");
    expect(store.getNode("web")?.blocks?.map((block) => block.id)).toEqual(["a"]);
  });

  it("keeps type-specific table and todo state isolated", () => {
    const store = new TreeStore(createInitialTree());
    store.updateType("web", "table");
    expect(store.getNode("web")?.props?.table?.rows).toHaveLength(2);
    store.updateType("web", "todo");
    expect(store.getNode("web")?.props?.table).toBeUndefined();
    expect(store.getNode("web")?.props?.checked).toBe(false);
  });

  it("protects the single root heading from deletion and style changes", () => {
    const store = new TreeStore(createInitialTree());
    store.updateType("root", "todo");
    store.updateStyle("root", { color: "red", fontSize: "40px" });
    store.updateProps("root", { style: { color: "red" }, headingLevel: 3 });
    store.deleteNode("root");
    expect(store.getNode("root")?.type).toBe("heading");
    expect(store.getNode("root")?.props).toEqual({ headingLevel: 1 });

    const next = createInitialTree();
    next.nodes.root.type = "text";
    next.nodes.root.props = { style: { color: "red" } };
    store.replaceTreeFromView(next);
    expect(store.getNode("root")?.type).toBe("heading");
    expect(store.getNode("root")?.props).toEqual({ headingLevel: 1 });
  });
});
