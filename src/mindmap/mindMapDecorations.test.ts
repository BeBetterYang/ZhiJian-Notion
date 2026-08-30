import { describe, expect, it } from "vitest";
import { createInitialTree, type ZhiJianMindMapDecorations } from "../core/tree";
import { cloneTree } from "../core/tree/utils";
import { TreeStore } from "../core/treeStore";
import { treeToMindElixir } from "./mindElixirAdapter";
import { isMindMapDecorationOperation, sameMindMapDecorations } from "./mindMapDecorations";

const summary = { id: "s1", label: "摘要", parent: "root", start: 0, end: 1 };
const arrow = { id: "a1", label: "连接", from: "web", to: "app" };

function treeWithDecorations(mindMap: ZhiJianMindMapDecorations = { summaries: [summary], arrows: [arrow] }) {
  return { ...createInitialTree(), mindMap };
}

describe("mindMapDecorations", () => {
  it("tells the map's own operations apart from node operations", () => {
    expect(isMindMapDecorationOperation({ name: "createSummary", obj: summary })).toBe(true);
    expect(isMindMapDecorationOperation({ name: "removeSummary", obj: { id: "s1" } })).toBe(true);
    expect(isMindMapDecorationOperation({ name: "createArrow", obj: arrow })).toBe(true);
    expect(isMindMapDecorationOperation({ name: "reshapeArrow", obj: arrow, origin: arrow })).toBe(true);
    // A node operation carries a node id in the same place — it must not be read
    // as an annotation, or the store would be handed the wrong set entirely.
    expect(isMindMapDecorationOperation({ name: "finishEdit", obj: { id: "web", topic: "Web端" }, origin: "旧" })).toBe(
      false,
    );
  });

  it("treats an absent set and an empty one as the same, so a drag commits nothing", () => {
    expect(sameMindMapDecorations(undefined, { summaries: [], arrows: [] })).toBe(true);
    expect(sameMindMapDecorations({ summaries: [summary] }, { summaries: [summary], arrows: [] })).toBe(true);
    expect(sameMindMapDecorations({ arrows: [arrow] }, { arrows: [{ ...arrow, delta1: { x: 1, y: 2 } }] })).toBe(false);
  });
});

describe("mind map decorations on the tree", () => {
  it("survives a clone, which is what carries them through commit, undo and redo", () => {
    const clone = cloneTree(treeWithDecorations());
    expect(clone.mindMap?.summaries).toEqual([summary]);
    expect(clone.mindMap?.arrows).toEqual([arrow]);
  });

  it("clones deeply, so a later edit cannot reach back into history", () => {
    const original = treeWithDecorations({ arrows: [{ ...arrow, delta1: { x: 1, y: 2 } }] });
    const clone = cloneTree(original);
    clone.mindMap!.arrows![0].delta1!.x = 99;
    expect(original.mindMap?.arrows?.[0].delta1?.x).toBe(1);
  });

  it("round trips through the store, so switching views does not lose them", () => {
    const store = new TreeStore(createInitialTree());
    store.setMindMapDecorations({ summaries: [summary], arrows: [arrow] });
    expect(store.getSnapshot().mindMap).toEqual({ summaries: [summary], arrows: [arrow] });
    store.updateContent("web", "改过的");
    expect(store.getSnapshot().mindMap?.arrows).toEqual([arrow]);
    store.undo();
    expect(store.getSnapshot().mindMap?.arrows).toEqual([arrow]);
  });

  it("updates live annotations without erasing the document theme", () => {
    const store = new TreeStore(createInitialTree());
    store.setMindMapTheme({ id: "ocean", version: 1 });
    store.setMindMapDecorations({ summaries: [summary], arrows: [arrow] });

    expect(store.getSnapshot().mindMap?.theme).toEqual({ id: "ocean", version: 1 });
  });

  it("drops annotations whose nodes the outline deleted while the map was away", () => {
    const store = new TreeStore(createInitialTree());
    store.setMindMapDecorations({ summaries: [summary], arrows: [arrow] });
    store.deleteNode("app");
    store.setMindMapDecorations(store.getSnapshot().mindMap ?? {});
    expect(store.getSnapshot().mindMap?.arrows).toEqual([]);
    expect(store.getSnapshot().mindMap?.summaries).toEqual([summary]);
  });

  it("hands them to mind-elixir with the data, which is what re-renders them", () => {
    const data = treeToMindElixir(treeWithDecorations());
    expect(data.summaries).toEqual([{ ...summary, style: { stroke: "#8e9093", labelColor: "#555658" } }]);
    expect(data.arrows).toEqual([{ ...arrow, style: { stroke: "#b8babd", labelColor: "#555658" } }]);
  });

  it("leaves out a summary whose child range no longer exists", () => {
    const tree = treeWithDecorations({ summaries: [{ ...summary, end: 5 }] });
    expect(treeToMindElixir(tree).summaries).toEqual([]);
  });

  it("leaves out annotations the current projection cannot draw", () => {
    const tree = treeWithDecorations();
    // 进入当前主题 on a leaf: the summary's parent and the arrow's ends are both
    // outside the subtree being drawn, so neither has anywhere to land.
    const zoomed = treeToMindElixir(tree, { rootNodeId: "web" });
    expect(zoomed.summaries).toEqual([]);
    expect(zoomed.arrows).toEqual([]);
    // A search that filtered one of the arrow's ends away, likewise.
    const filtered = treeToMindElixir(tree, { visibleNodeIds: new Set(["root", "web"]) });
    expect(filtered.arrows).toEqual([]);
    expect(filtered.summaries).toEqual([]);
  });
});
