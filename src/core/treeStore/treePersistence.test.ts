import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../tree";
import { TreeStore } from "./TreeStore";
import { attachTreePersistence, loadPersistedTree, persistTree } from "./treePersistence";

const STORAGE_KEY = "zhijian.tree.v1";

describe("treePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("round-trips a persisted tree", () => {
    const tree = createInitialTree();
    tree.mindMap = {
      theme: { id: "morandi", version: 1 },
      frame: { rounded: true },
      canvas: { background: "#f1f3f5" },
      layout: { type: "timeline", direction: "down" },
    };
    persistTree(tree);
    expect(loadPersistedTree()).toEqual(tree);
  });

  it("keeps workspace documents isolated under custom storage keys", () => {
    const first = createInitialTree();
    const second = createInitialTree();
    second.nodes.root.content.text = "第二个文档";

    persistTree(first, "zhijian.workspace.document.first.v1");
    persistTree(second, "zhijian.workspace.document.second.v1");

    expect(loadPersistedTree("zhijian.workspace.document.first.v1")?.nodes.root.content.text).toBe("产品规划");
    expect(loadPersistedTree("zhijian.workspace.document.second.v1")?.nodes.root.content.text).toBe("第二个文档");
    expect(loadPersistedTree()).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(loadPersistedTree()).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{ not json");
    expect(loadPersistedTree()).toBeNull();
  });

  it("returns null when the root node is missing from the payload", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rootId: "root", nodes: {} }));
    expect(loadPersistedTree()).toBeNull();
  });

  it("persists store snapshots after a debounce and flushes on dispose", () => {
    vi.useFakeTimers();
    const store = new TreeStore(createInitialTree());
    const dispose = attachTreePersistence(store, 400);

    store.updateContent("web", "Web 平台");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    vi.advanceTimersByTime(400);
    expect(loadPersistedTree()?.nodes.web.content.text).toBe("Web 平台");

    store.updateContent("app", "App 平台");
    dispose();
    expect(loadPersistedTree()?.nodes.app.content.text).toBe("App 平台");
  });
});
