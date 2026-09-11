import { describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import { MIND_MAP_CLIPBOARD_MIME, readMindMapNodeClipboard, writeMindMapNodeClipboard } from "./mindMapClipboard";

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
});
