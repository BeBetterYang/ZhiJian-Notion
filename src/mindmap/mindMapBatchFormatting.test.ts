import { describe, expect, it } from "vitest";
import { createInitialTree, everySpanHasMark } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import {
  applyMindMapBatchColor,
  editableMindMapBatchNodeIds,
  toggleMindMapBatchTextStyle,
  toggleMindMapBatchTodo,
} from "./mindMapBatchFormatting";

describe("mind-map batch formatting", () => {
  it("applies text and background colours to every selected text node in one undo step", () => {
    const store = new TreeStore(createInitialTree());

    applyMindMapBatchColor(store, ["web", "app"], "textColor", "blue");
    applyMindMapBatchColor(store, ["web", "app"], "backgroundColor", "yellow");

    for (const id of ["web", "app"]) {
      const content = store.getNode(id)!.content;
      expect(everySpanHasMark(content, "textColor", "blue")).toBe(true);
      expect(everySpanHasMark(content, "backgroundColor", "yellow")).toBe(true);
    }

    store.undo();
    for (const id of ["web", "app"]) {
      expect(everySpanHasMark(store.getNode(id)!.content, "backgroundColor", undefined)).toBe(true);
      expect(everySpanHasMark(store.getNode(id)!.content, "textColor", "blue")).toBe(true);
    }
    store.undo();
    for (const id of ["web", "app"]) {
      expect(everySpanHasMark(store.getNode(id)!.content, "textColor", undefined)).toBe(true);
    }
  });

  it("turns a mixed selection into todos and toggles the whole selection back", () => {
    const store = new TreeStore(createInitialTree());
    store.updateType("web", "todo");

    toggleMindMapBatchTodo(store, ["web", "app"]);
    expect(store.getNode("web")?.type).toBe("todo");
    expect(store.getNode("app")?.type).toBe("todo");

    toggleMindMapBatchTodo(store, ["web", "app"]);
    expect(store.getNode("web")?.type).toBe("text");
    expect(store.getNode("app")?.type).toBe("text");
    store.undo();
    expect(store.getNode("web")?.type).toBe("todo");
    expect(store.getNode("app")?.type).toBe("todo");
  });

  it("toggles bold, italic, underline and strike across the complete selection", () => {
    const store = new TreeStore(createInitialTree());

    for (const style of ["bold", "italic", "underline", "strike"] as const) {
      toggleMindMapBatchTextStyle(store, ["web", "app"], style);
      expect(everySpanHasMark(store.getNode("web")!.content, style, true)).toBe(true);
      expect(everySpanHasMark(store.getNode("app")!.content, style, true)).toBe(true);
    }

    toggleMindMapBatchTextStyle(store, ["web", "app"], "bold");
    expect(everySpanHasMark(store.getNode("web")!.content, "bold", undefined)).toBe(true);
    expect(everySpanHasMark(store.getNode("app")!.content, "bold", undefined)).toBe(true);
    store.undo();
    expect(everySpanHasMark(store.getNode("web")!.content, "bold", true)).toBe(true);
    expect(everySpanHasMark(store.getNode("app")!.content, "bold", true)).toBe(true);
  });

  it("ignores the root, duplicate ids and table nodes", () => {
    const store = new TreeStore(createInitialTree());
    store.updateType("app", "table");
    expect(editableMindMapBatchNodeIds(store.getSnapshot(), ["root", "web", "web", "app"]))
      .toEqual(["web"]);
  });
});
