import { describe, expect, it } from "vitest";
import { cloneTree, createInitialTree } from "./utils";

describe("cloneTree", () => {
  it("deep clones document icons", () => {
    const tree = createInitialTree();
    tree.document = { icon: { type: "asset", assetId: "asset-a", storagePath: "user/asset-a.webp", name: "图标" } };

    const clone = cloneTree(tree);
    expect(clone.document).toEqual(tree.document);
    expect(clone.document).not.toBe(tree.document);
    expect(clone.document?.icon).not.toBe(tree.document.icon);
  });
});
