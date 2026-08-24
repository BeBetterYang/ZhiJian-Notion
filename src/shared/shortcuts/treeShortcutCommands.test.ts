import { describe, expect, it } from "vitest";
import type { ZhiJianNode, ZhiJianTree } from "../../core/tree";
import { TreeStore } from "../../core/treeStore";
import {
  applyNodeTextShortcut,
  applyTreeShortcut,
  collapseTargets,
  focusAfterDelete,
  nextCollapsedValue,
  nodeDepth,
  siblingSwapIndex,
  zoomInTargetId,
  zoomOutTargetId,
} from "./treeShortcutCommands";

function node(id: string, parentId: string | null, children: string[], props?: ZhiJianNode["props"]): ZhiJianNode {
  return { id, parentId, children, content: { text: id }, type: "text", props };
}

/**
 * root
 * ├── a        (a1, a2)
 * │   ├── a1   (a1x)
 * │   │   └── a1x
 * │   └── a2
 * ├── b        (b1)
 * │   └── b1
 * └── c
 */
function sampleTree(): ZhiJianTree {
  return {
    rootId: "root",
    nodes: Object.fromEntries(
      [
        node("root", null, ["a", "b", "c"]),
        node("a", "root", ["a1", "a2"]),
        node("a1", "a", ["a1x"]),
        node("a1x", "a1", []),
        node("a2", "a", []),
        node("b", "root", ["b1"]),
        node("b1", "b", []),
        node("c", "root", []),
      ].map((item) => [item.id, item]),
    ),
  };
}

describe("nodeDepth", () => {
  it("counts the root as 0, so 1 级主题 is its children", () => {
    const tree = sampleTree();

    expect(nodeDepth(tree, "root")).toBe(0);
    expect(nodeDepth(tree, "a")).toBe(1);
    expect(nodeDepth(tree, "a1")).toBe(2);
    expect(nodeDepth(tree, "a1x")).toBe(3);
  });
});

describe("collapseTargets", () => {
  const tree = sampleTree();

  it("takes just the row for a plain toggle, and nothing for a row with no children", () => {
    expect(collapseTargets(tree, "a", { kind: "node" })).toEqual(["a"]);
    expect(collapseTargets(tree, "c", { kind: "node" })).toEqual([]);
    expect(collapseTargets(tree, null, { kind: "node" })).toEqual([]);
  });

  it("takes every sibling that has children, the row included", () => {
    expect(collapseTargets(tree, "a", { kind: "siblings" })).toEqual(["a", "b"]);
    // Pressed on a childless row, the siblings are still the group.
    expect(collapseTargets(tree, "c", { kind: "siblings" })).toEqual(["a", "b"]);
  });

  it("takes a whole level", () => {
    expect(collapseTargets(tree, "a1x", { kind: "level", level: 1 }).sort()).toEqual(["a", "b"]);
    expect(collapseTargets(tree, "a1x", { kind: "level", level: 2 })).toEqual(["a1"]);
    expect(collapseTargets(tree, "a1x", { kind: "level", level: 3 })).toEqual([]);
  });

  it("never includes the root, which would empty the view", () => {
    expect(collapseTargets(tree, "root", { kind: "node" })).toEqual([]);
    expect(collapseTargets(tree, "a", { kind: "all" }).sort()).toEqual(["a", "a1", "b"]);
  });
});

describe("nextCollapsedValue", () => {
  it("closes a group while any of it is open, and only then opens it", () => {
    const tree = sampleTree();
    expect(nextCollapsedValue(tree, ["a", "b"])).toBe(true);

    tree.nodes.a.props = { collapsed: true };
    expect(nextCollapsedValue(tree, ["a", "b"])).toBe(true);

    tree.nodes.b.props = { collapsed: true };
    expect(nextCollapsedValue(tree, ["a", "b"])).toBe(false);
  });
});

describe("siblingSwapIndex", () => {
  const tree = sampleTree();

  it("gives the index the node lands on, and null at either end", () => {
    expect(siblingSwapIndex(tree, "b", -1)).toBe(0);
    expect(siblingSwapIndex(tree, "b", 1)).toBe(2);
    expect(siblingSwapIndex(tree, "a", -1)).toBeNull();
    expect(siblingSwapIndex(tree, "c", 1)).toBeNull();
    expect(siblingSwapIndex(tree, "root", -1)).toBeNull();
  });
});

describe("focusAfterDelete", () => {
  it("falls back from the row above to the row below to the parent", () => {
    const tree = sampleTree();

    expect(focusAfterDelete(tree, "b")).toBe("a");
    expect(focusAfterDelete(tree, "a")).toBe("b");
    expect(focusAfterDelete(tree, "b1")).toBe("b");
    expect(focusAfterDelete(tree, "root")).toBeNull();
  });
});

describe("zoom targets", () => {
  const tree = sampleTree();

  it("refuses to zoom into the document title", () => {
    expect(zoomInTargetId(tree, "a1")).toBe("a1");
    expect(zoomInTargetId(tree, "root")).toBeNull();
    expect(zoomInTargetId(tree, null)).toBeNull();
  });

  it("walks back out one level at a time, ending at the whole document", () => {
    expect(zoomOutTargetId(tree, "a1x")).toBe("a1");
    expect(zoomOutTargetId(tree, "a1")).toBe("a");
    expect(zoomOutTargetId(tree, "a")).toBeNull();
    expect(zoomOutTargetId(tree, null)).toBeNull();
  });
});

describe("applyTreeShortcut", () => {
  it("collapses a whole level in one undo step", () => {
    const store = new TreeStore(sampleTree());

    expect(applyTreeShortcut("toggle-collapse-level-1", { store, nodeId: "a1x" })).toBe(true);
    expect(store.getNode("a")?.props?.collapsed).toBe(true);
    expect(store.getNode("b")?.props?.collapsed).toBe(true);
    expect(store.getNode("a1")?.props?.collapsed).toBeUndefined();

    store.undo();
    expect(store.getNode("a")?.props?.collapsed).toBeUndefined();
    expect(store.getNode("b")?.props?.collapsed).toBeUndefined();
  });

  it("toggles one row both ways", () => {
    const store = new TreeStore(sampleTree());

    applyTreeShortcut("toggle-collapse", { store, nodeId: "a" });
    expect(store.getNode("a")?.props?.collapsed).toBe(true);
    applyTreeShortcut("toggle-collapse", { store, nodeId: "a" });
    expect(store.getNode("a")?.props?.collapsed).toBe(false);
  });

  it("moves a node among its siblings and asks for it to keep the caret", () => {
    const store = new TreeStore(sampleTree());
    const focused: string[] = [];

    applyTreeShortcut("move-node-down", { store, nodeId: "a", onFocusNode: (id) => focused.push(id) });

    expect(store.getNode("root")?.children).toEqual(["b", "a", "c"]);
    expect(focused).toEqual(["a"]);
  });

  it("leaves a node alone at the end of its siblings", () => {
    const store = new TreeStore(sampleTree());

    applyTreeShortcut("move-node-up", { store, nodeId: "a" });

    expect(store.getNode("root")?.children).toEqual(["a", "b", "c"]);
  });

  it("duplicates the subtree and moves on to the copy", () => {
    const store = new TreeStore(sampleTree());
    const focused: string[] = [];

    applyTreeShortcut("duplicate-node", { store, nodeId: "a", onFocusNode: (id) => focused.push(id) });

    const children = store.getNode("root")?.children ?? [];
    expect(children).toHaveLength(4);
    expect(focused).toEqual([children[1]]);
    expect(store.getNode(children[1])?.children).toHaveLength(2);
  });

  it("deletes a row and hands the caret to the row above", () => {
    const store = new TreeStore(sampleTree());
    const focused: string[] = [];

    applyTreeShortcut("delete-node", { store, nodeId: "b", onFocusNode: (id) => focused.push(id) });

    expect(store.getNode("b")).toBeNull();
    expect(store.getNode("b1")).toBeNull();
    expect(focused).toEqual(["a"]);
  });

  it("refuses to delete the document title", () => {
    const store = new TreeStore(sampleTree());

    applyTreeShortcut("delete-node", { store, nodeId: "root" });

    expect(store.getNode("root")).not.toBeNull();
  });

  it("only ticks a todo", () => {
    const tree = sampleTree();
    tree.nodes.c.type = "todo";
    const store = new TreeStore(tree);

    applyTreeShortcut("toggle-todo-done", { store, nodeId: "c" });
    expect(store.getNode("c")?.props?.checked).toBe(true);

    applyTreeShortcut("toggle-todo-done", { store, nodeId: "a" });
    expect(store.getNode("a")?.props?.checked).toBeUndefined();
  });

  it("leaves the text shortcuts to the editor", () => {
    const store = new TreeStore(sampleTree());

    expect(applyTreeShortcut("heading-2", { store, nodeId: "a" })).toBe(false);
    expect(applyTreeShortcut("insert-link", { store, nodeId: "a" })).toBe(false);
  });
});

describe("applyNodeTextShortcut", () => {
  it("sets a heading and its level in one undo step", () => {
    const store = new TreeStore(sampleTree());

    applyNodeTextShortcut("heading-3", { store, nodeId: "a" });
    expect(store.getNode("a")?.type).toBe("heading");
    expect(store.getNode("a")?.props?.headingLevel).toBe(3);

    store.undo();
    expect(store.getNode("a")?.type).toBe("text");
  });

  it("comes back to 正文 and toggles a todo", () => {
    const store = new TreeStore(sampleTree());

    applyNodeTextShortcut("toggle-todo", { store, nodeId: "a" });
    expect(store.getNode("a")?.type).toBe("todo");

    applyNodeTextShortcut("toggle-todo", { store, nodeId: "a" });
    expect(store.getNode("a")?.type).toBe("text");

    applyNodeTextShortcut("heading-1", { store, nodeId: "a" });
    applyNodeTextShortcut("set-paragraph", { store, nodeId: "a" });
    expect(store.getNode("a")?.type).toBe("text");
  });

  it("colours the whole node and clears it again", () => {
    const store = new TreeStore(sampleTree());

    applyNodeTextShortcut("text-color-red", { store, nodeId: "a" });
    expect(store.getNode("a")?.content.marks).toEqual({ textColor: "red" });

    applyNodeTextShortcut("text-color-default", { store, nodeId: "a" });
    expect(store.getNode("a")?.content.marks).toBeUndefined();
  });

  it("keeps a node's runs while colouring every one of them", () => {
    const tree = sampleTree();
    tree.nodes.a.content = {
      text: "粗体普通",
      spans: [
        { text: "粗体", marks: { bold: true } },
        { text: "普通" },
      ],
    };
    const store = new TreeStore(tree);

    applyNodeTextShortcut("text-color-blue", { store, nodeId: "a" });

    expect(store.getNode("a")?.content.spans).toEqual([
      { text: "粗体", marks: { bold: true, textColor: "blue" } },
      { text: "普通", marks: { textColor: "blue" } },
    ]);
  });

  it("toggles a background colour off when it is pressed again", () => {
    const store = new TreeStore(sampleTree());

    applyNodeTextShortcut("background-color-gray", { store, nodeId: "a" });
    expect(store.getNode("a")?.content.marks).toEqual({ backgroundColor: "gray" });

    applyNodeTextShortcut("background-color-gray", { store, nodeId: "a" });
    expect(store.getNode("a")?.content.marks).toBeUndefined();
  });

  it("adds a table as the next sibling and moves to it", () => {
    const store = new TreeStore(sampleTree());
    const focused: string[] = [];

    applyNodeTextShortcut("insert-table", { store, nodeId: "a", onFocusNode: (id) => focused.push(id) });

    const children = store.getNode("root")?.children ?? [];
    expect(children[1]).toBe(focused[0]);
    expect(store.getNode(children[1])?.type).toBe("table");
  });

  it("refuses the document title and the shortcuts that need a dialog", () => {
    const store = new TreeStore(sampleTree());

    expect(applyNodeTextShortcut("heading-2", { store, nodeId: "root" })).toBe(false);
    expect(applyNodeTextShortcut("insert-link", { store, nodeId: "a" })).toBe(false);
    expect(applyNodeTextShortcut("insert-image", { store, nodeId: "a" })).toBe(false);
    expect(applyNodeTextShortcut("toggle-collapse", { store, nodeId: "a" })).toBe(false);
  });
});
