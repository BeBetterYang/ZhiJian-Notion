import { describe, expect, it } from "vitest";
import { createInitialTree } from "../core/tree";
import { displayClickAction, mindMapUpdateMode, resolveMindMapFocusBlockId, shouldExitEditing } from "./mindMapInteraction";

describe("MindMap interaction state", () => {
  it("selects on first click and edits on a second click", () => {
    expect(displayClickAction(null, null, "web", false)).toBe("select");
    expect(displayClickAction("web", null, "web", false)).toBe("edit");
  });

  it("keeps editor interaction active and only exits for another node", () => {
    expect(displayClickAction("web", { nodeId: "web" }, "web", false)).toBe("ignore");
    expect(shouldExitEditing({ nodeId: "web" }, "web")).toBe(false);
    expect(shouldExitEditing({ nodeId: "web" }, "app")).toBe(true);
  });

  it("preserves links and controls as direct actions", () => {
    expect(displayClickAction("web", null, "web", true)).toBe("ignore");
  });

  it("never refreshes structure for content typing and defers structural refresh while editing", () => {
    expect(mindMapUpdateMode(false, true)).toBe("content");
    expect(mindMapUpdateMode(true, true)).toBe("defer-structure");
    expect(mindMapUpdateMode(true, false)).toBe("refresh-structure");
  });

  it("keeps internal block focus separate from the selected tree node", () => {
    const node = createInitialTree().nodes.web;
    node.description = { text: "描述" };
    node.blocks = [{ id: "quote", type: "quote", content: { text: "引用" } }];
    const blockIds = [node.id, `${node.id}::description`, "quote"];
    expect(resolveMindMapFocusBlockId(node.id, blockIds, "quote")).toBe("quote");
    expect(resolveMindMapFocusBlockId(node.id, blockIds, `${node.id}::description`)).toBe(`${node.id}::description`);
    expect(resolveMindMapFocusBlockId(node.id, blockIds, "missing")).toBe(node.id);
  });
});
