import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";
import { createInitialTree, richTextToPlainText } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import { applyMindElixirOperation } from "./mindElixirCommands";

describe("applyMindElixirOperation", () => {
  it("updates edited node text through TreeStore command", () => {
    const store = new TreeStore(createInitialTree());

    applyMindElixirOperation(
      {
        name: "finishEdit",
        obj: node("web", "Web 编辑器"),
        origin: "Web端",
      },
      store,
    );

    expect(richTextToPlainText(store.getNode("web")!.content)).toBe("Web 编辑器");
  });

  it("updates quote text through the shared description field", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "quote";
    tree.nodes.web.content = { text: "" };
    tree.nodes.web.description = { text: "旧引用" };
    const store = new TreeStore(tree);

    applyMindElixirOperation(
      {
        name: "finishEdit",
        obj: node("web", "新引用"),
        origin: "旧引用",
      },
      store,
    );

    expect(store.getNode("web")?.content.text).toBe("");
    expect(store.getNode("web")?.description?.text).toBe("新引用");
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
});

function node(id: string, topic: string, parent?: NodeObj): NodeObj {
  return {
    id,
    topic,
    parent,
  } as NodeObj;
}
