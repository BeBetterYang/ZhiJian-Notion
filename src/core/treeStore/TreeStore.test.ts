import { describe, expect, it } from "vitest";
import { createInitialTree, richTextToPlainText } from "../tree";
import { TreeStore } from "./TreeStore";

describe("TreeStore", () => {
  it("creates the product planning seed tree", () => {
    const tree = new TreeStore(createInitialTree()).getSnapshot();
    expect(richTextToPlainText(tree.nodes[tree.rootId].content)).toBe("产品规划");
    expect(tree.nodes[tree.rootId].children).toEqual(["web", "app"]);
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
});
