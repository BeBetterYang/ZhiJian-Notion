import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";
import { createInitialTree, richTextToPlainText } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import { applyMindElixirOperation } from "./mindElixirCommands";

describe("applyMindElixirOperation", () => {
  it("ignores MindElixir native finishEdit data", () => {
    const store = new TreeStore(createInitialTree());

    applyMindElixirOperation(
      {
        name: "finishEdit",
        obj: node("web", "Web 编辑器"),
        origin: "Web端",
      },
      store,
    );

    expect(richTextToPlainText(store.getNode("web")!.content)).toBe("Web端");
  });

  it("creates child nodes from MindElixir addChild operation", () => {
    const store = new TreeStore(createInitialTree());
    const parent = node("web", "Web端");
    const child = node("api", "API", parent);
    parent.children = [child];

    applyMindElixirOperation({ name: "addChild", obj: child }, store);

    expect(store.getNode("api")?.parentId).toBe("web");
    expect(richTextToPlainText(store.getNode("api")!.content)).toBe("API");
  });

  it("deletes nodes from MindElixir removeNodes operation", () => {
    const store = new TreeStore(createInitialTree());

    applyMindElixirOperation({ name: "removeNodes", objs: [node("app", "App端")] }, store);

    expect(store.getNode("app")).toBeNull();
    expect(store.getNode("root")?.children).toEqual(["web"]);
  });

  it("moves nodes from MindElixir moveNodeIn operation", () => {
    const store = new TreeStore(createInitialTree());

    applyMindElixirOperation(
      {
        name: "moveNodeIn",
        objs: [node("app", "App端")],
        toObj: node("web", "Web端"),
      },
      store,
    );

    expect(store.getNode("app")?.parentId).toBe("web");
    expect(store.getNode("web")?.children).toEqual(["app"]);
  });

  // MindElixir reorders its own tree before it reports the operation, so `toObj.parent`
  // either already counts the dragged node among the anchor's siblings or — for a
  // synthesized `toObj` — says nothing at all. Both cases have to land on the store's
  // own order, which is why every case below leaves `toObj` without a parent.
  it("drops a node immediately before its anchor", () => {
    const store = new TreeStore(createInitialTree());

    applyMindElixirOperation(
      { name: "moveNodeBefore", objs: [node("app", "App端")], toObj: node("web", "Web端") },
      store,
    );

    expect(store.getNode("root")?.children).toEqual(["app", "web"]);
  });

  it("drops a node immediately after its anchor", () => {
    const store = new TreeStore(createInitialTree());

    applyMindElixirOperation(
      { name: "moveNodeAfter", objs: [node("web", "Web端")], toObj: node("app", "App端") },
      store,
    );

    expect(store.getNode("root")?.children).toEqual(["app", "web"]);
  });

  it("drops the last of three children ahead of the first", () => {
    const store = threeChildStore();

    applyMindElixirOperation(
      { name: "moveNodeBefore", objs: [node("ops", "运营")], toObj: node("web", "Web端") },
      store,
    );

    expect(store.getNode("root")?.children).toEqual(["ops", "web", "app"]);
  });

  it("keeps the order of several nodes dropped after one anchor", () => {
    const store = threeChildStore();

    applyMindElixirOperation(
      {
        name: "moveNodeAfter",
        objs: [node("web", "Web端"), node("ops", "运营")],
        toObj: node("app", "App端"),
      },
      store,
    );

    expect(store.getNode("root")?.children).toEqual(["app", "web", "ops"]);
  });
});

/** Root with `web`, `app`, `ops` — three children, so an off-by-one shows up. */
function threeChildStore() {
  const store = new TreeStore(createInitialTree());
  const parent = node("root", "根节点");
  const child = node("ops", "运营", parent);
  parent.children = [node("web", "Web端"), node("app", "App端"), child];
  applyMindElixirOperation({ name: "addChild", obj: child }, store);
  return store;
}

function node(id: string, topic: string, parent?: NodeObj): NodeObj {
  return {
    id,
    topic,
    parent,
  } as NodeObj;
}
