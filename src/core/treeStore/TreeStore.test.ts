import { describe, expect, it } from "vitest";
import { createInitialTree, richTextToPlainText } from "../tree";
import { TreeStore } from "./TreeStore";

describe("TreeStore", () => {
  it("creates the required product planning seed tree", () => {
    const store = new TreeStore(createInitialTree());
    const tree = store.getSnapshot();

    expect(richTextToPlainText(tree.nodes[tree.rootId].content)).toBe("产品规划");
    expect(tree.nodes[tree.rootId].children).toEqual(["web", "app"]);
    expect(richTextToPlainText(tree.nodes.web.content)).toBe("Web端");
    expect(richTextToPlainText(tree.nodes.app.content)).toBe("App端");
  });

  it("updates content and description through commands", () => {
    const store = new TreeStore(createInitialTree());

    store.updateContent("web", "Web 编辑器");
    store.updateDescription("web", "第一阶段");

    expect(richTextToPlainText(store.getNode("web")!.content)).toBe("Web 编辑器");
    expect(richTextToPlainText(store.getNode("web")!.description!)).toBe("第一阶段");
  });

  it("updates grouped node contents in one history command", () => {
    const store = new TreeStore(createInitialTree());

    store.updateNodes([
      { id: "web", content: "正文" },
      { id: "app", content: "引用" },
    ]);

    expect(store.getNode("web")?.content.text).toBe("正文");
    expect(store.getNode("app")?.content.text).toBe("引用");
    store.undo();
    expect(store.getNode("web")?.content.text).toBe("Web端");
    expect(store.getNode("app")?.content.text).toBe("App端");
  });

  it("keeps child order when nodes are moved", () => {
    const store = new TreeStore(createInitialTree());
    const api = store.createNode({ parentId: "root", content: "API" });

    store.moveNode(api, "root", 1);

    expect(store.getNode("root")?.children).toEqual(["web", api, "app"]);
  });

  it("creates a body and its images as one ordered history command", () => {
    const store = new TreeStore(createInitialTree());

    store.createNodes([
      { id: "empty-body", parentId: "root", index: 2, content: "" },
      { id: "image-1", parentId: "root", index: 3, type: "image" },
      { id: "image-2", parentId: "root", index: 4, type: "image" },
    ]);

    expect(store.getNode("root")?.children).toEqual([
      "web",
      "app",
      "empty-body",
      "image-1",
      "image-2",
    ]);
    store.undo();
    expect(store.getNode("root")?.children).toEqual(["web", "app"]);
  });

  it("indents and outdents nodes by changing parent relationships", () => {
    const store = new TreeStore(createInitialTree());

    store.indent("app");
    expect(store.getNode("web")?.children).toEqual(["app"]);
    expect(store.getNode("app")?.parentId).toBe("web");

    store.outdent("app");
    expect(store.getNode("root")?.children).toEqual(["web", "app"]);
    expect(store.getNode("app")?.parentId).toBe("root");
  });

  it("duplicates a subtree with stable new ids", () => {
    const store = new TreeStore(createInitialTree());
    const child = store.createNode({ parentId: "web", content: "编辑" });

    const copy = store.duplicate("web");

    expect(copy).toBeTruthy();
    expect(store.getNode("root")?.children).toHaveLength(3);
    expect(richTextToPlainText(store.getNode(copy!)!.content)).toBe("Web端");
    expect(store.getNode(copy!)?.children).toHaveLength(1);
    expect(store.getNode(copy!)?.children[0]).not.toBe(child);
  });

  it("undoes and redoes the unified tree history", () => {
    const store = new TreeStore(createInitialTree());

    store.updateContent("app", "iOS App");
    store.undo();
    expect(richTextToPlainText(store.getNode("app")!.content)).toBe("App端");

    store.redo();
    expect(richTextToPlainText(store.getNode("app")!.content)).toBe("iOS App");
  });

  it("initializes domain table data when changing node type", () => {
    const store = new TreeStore(createInitialTree());

    store.updateType("web", "table");

    expect(store.getNode("web")?.props?.table?.rows).toHaveLength(2);
    expect(store.getNode("web")?.props?.table?.rows[0]).toHaveLength(3);
  });

  it("clears type-specific state when changing node type", () => {
    const tree = createInitialTree();
    tree.nodes.web.type = "image";
    tree.nodes.web.props = {
      checked: true,
      headingLevel: 3,
      image: { url: "asset:image", previewWidth: 320 },
      table: { rows: [[{ content: { text: "旧表格" } }]] },
      collapsed: true,
      style: { color: "red" },
    };
    const store = new TreeStore(tree);

    store.updateType("web", "text");

    expect(store.getNode("web")?.props).toEqual({
      collapsed: true,
      style: { color: "red" },
    });
  });

  it("keeps media node text content empty on edit and type change", () => {
    const store = new TreeStore(createInitialTree());

    store.updateType("web", "image");
    store.updateContent("web", "https://example.com/should-not-persist.png");
    expect(store.getNode("web")?.content.text).toBe("");

    store.updateType("app", "table");
    expect(store.getNode("app")?.content.text).toBe("");

    // Converting a text node that had content into an image drops the stale text.
    store.updateContent("app", "text");
    store.updateType("app", "text");
    store.updateContent("app", "残留文本");
    store.updateType("app", "image");
    expect(store.getNode("app")?.content.text).toBe("");
  });
});
