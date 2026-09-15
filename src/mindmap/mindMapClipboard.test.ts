import { describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import { isMindMapTextClipboardSelection, MIND_MAP_CLIPBOARD_MIME, readMindMapNodeClipboard, writeMindMapNodeClipboard } from "./mindMapClipboard";

describe("mind map node clipboard", () => {
  it("copies complete parent subtrees once and keeps tree order", () => {
    const store = new TreeStore(createInitialTree());
    const childId = store.createNode({ parentId: "web", content: "子节点" });
    const data = new Map<string, string>();
    const clipboardData = {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: (type: string) => data.get(type) ?? "",
    } as unknown as DataTransfer;

    expect(writeMindMapNodeClipboard(
      { clipboardData } as ClipboardEvent,
      store.getSnapshot(),
      [childId, "app", "web"],
    )).toBe(true);

    const payload = readMindMapNodeClipboard({ clipboardData } as ClipboardEvent)!;
    expect(payload.subtrees).toHaveLength(2);
    expect(payload.subtrees.map(([node]) => node.id)).toEqual(["web", "app"]);
    expect(payload.subtrees[0].map((node) => node.id)).toEqual(["web", childId]);
    expect(clipboardData.setData).toHaveBeenCalledWith(MIND_MAP_CLIPBOARD_MIME, expect.any(String));
  });

  it("recognizes quote and regular node text without taking over table selections", () => {
    const editor = document.createElement("div");
    editor.className = "mindmap-node-editor";
    const paragraph = document.createElement("div");
    paragraph.className = "ProseMirror";
    paragraph.textContent = "节点正文中的部分文字";
    editor.append(paragraph);
    const quote = document.createElement("blockquote");
    quote.dataset.contentType = "quote";
    quote.textContent = "引用中的部分文字";
    editor.append(quote);
    const table = document.createElement("table");
    table.innerHTML = "<tbody><tr><td>表格文字</td></tr></tbody>";
    editor.append(table);
    document.body.append(editor);

    const selection = window.getSelection()!;
    const paragraphText = paragraph.firstChild!;
    selection.setBaseAndExtent(paragraphText, 0, paragraphText, 3);
    expect(isMindMapTextClipboardSelection({ type: "cut" } as ClipboardEvent)).toBe(true);

    const quoteText = quote.firstChild!;
    selection.setBaseAndExtent(quoteText, 0, quoteText, 3);
    expect(isMindMapTextClipboardSelection({ type: "copy" } as ClipboardEvent)).toBe(true);

    const display = document.createElement("div");
    display.className = "mindmap-node-display";
    display.textContent = "展示中的引用文字";
    document.body.append(display);
    const displayText = display.firstChild!;
    selection.setBaseAndExtent(displayText, 0, displayText, 3);
    expect(isMindMapTextClipboardSelection({ type: "cut" } as ClipboardEvent)).toBe(true);

    const cellText = table.querySelector("td")!.firstChild!;
    selection.setBaseAndExtent(cellText, 0, cellText, 3);
    expect(isMindMapTextClipboardSelection({ type: "copy" } as ClipboardEvent)).toBe(false);

    selection.removeAllRanges();
    editor.remove();
    display.remove();
  });
});
