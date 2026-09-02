import { describe, expect, it } from "vitest";
import { createInitialTree, plainTextContent } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import { insertMindMapTable, isEmptyMindMapNode } from "./mindMapTableInsertion";

describe("mind-map table insertion", () => {
  it("turns an empty node into the table instead of adding one next to it", () => {
    const store = new TreeStore(createInitialTree());
    const empty = store.createNode({ parentId: "root", index: 2 })!;

    const target = insertMindMapTable(store, empty);

    expect(target).toBe(empty);
    expect(store.getNode(empty)?.type).toBe("table");
    expect(store.getNode(empty)?.props?.table?.rows).toHaveLength(2);
    expect(store.getNode("root")?.children).toEqual(["web", "app", empty]);
  });

  it("adds the table right after a node that already says something", () => {
    const store = new TreeStore(createInitialTree());

    const target = insertMindMapTable(store, "web");

    expect(target).not.toBe("web");
    expect(store.getNode("web")?.type).toBe("text");
    expect(store.getNode(target!)?.type).toBe("table");
    expect(store.getNode("root")?.children).toEqual(["web", target, "app"]);
  });

  it("adds a second table next to the first rather than converting it again", () => {
    const store = new TreeStore(createInitialTree());
    const first = insertMindMapTable(store, "web")!;

    const second = insertMindMapTable(store, first);

    expect(second).not.toBe(first);
    expect(store.getNode(second!)?.type).toBe("table");
    expect(store.getNode("root")?.children).toEqual(["web", first, second, "app"]);
  });

  it("hangs the table under the root, which has no siblings and never changes type", () => {
    const store = new TreeStore(createInitialTree());

    const target = insertMindMapTable(store, "root");

    expect(store.getNode("root")?.type).toBe("heading");
    expect(store.getNode(target!)?.type).toBe("table");
    expect(store.getNode("root")?.children).toEqual([target, "web", "app"]);
  });

  it("counts a node with only whitespace as empty, and one with an image as not", () => {
    const store = new TreeStore(createInitialTree());
    store.updateContent("web", plainTextContent("   "));
    expect(isEmptyMindMapNode(store.getNode("web")!)).toBe(true);

    store.addNodeBlock("web", { id: "shot", type: "image", image: { url: "blob:x" } });
    expect(isEmptyMindMapNode(store.getNode("web")!)).toBe(false);
  });
});
