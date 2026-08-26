import type { Block } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { createInitialTree, type ZhiJianNode, type ZhiJianTree } from "../core/tree";
import { blockNoteToTree, treeToBlockNote } from "../outline/blockNoteAdapter";
import {
  displayClickAction,
  hiddenDescendantCount,
  isBlankMindMapSurface,
  isMindMapGeometryEditorElement,
  mindMapMeasuredSizeChanged,
  mindMapScaleFromTransform,
  mindMapUpdateMode,
  nodeDocumentSignature,
  nodeTextSelectionOffsets,
  resolveMindMapFocusBlockId,
  sameEditingTarget,
  shouldExitEditing,
  suppressMindMapEnter,
  unscaledMindMapSize,
} from "./mindMapInteraction";

describe("MindMap interaction state", () => {
  it("selects on first click and edits on a second click", () => {
    expect(displayClickAction(null, null, "web", false)).toBe("select");
    expect(displayClickAction("web", null, "web", false)).toBe("edit");
  });

  it("edits a selected node on a single click even when the browser reports a repeat click", () => {
    // Selecting and then clicking the text is a fast sequence, so the second
    // click arrives with `detail === 2`. It still has to enter editing.
    expect(displayClickAction("web", null, "web", false, 2)).toBe("edit");
    expect(displayClickAction("web", null, "web", false, 1)).toBe("edit");
  });

  it("leaves the second click on a still-unselected node to the dblclick handler", () => {
    expect(displayClickAction(null, null, "web", false, 2)).toBe("ignore");
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

describe("nodeTextSelectionOffsets", () => {
  // A node's own text runs from position 3 to 7 in its little document — the two
  // numbers `blockTextRange` reports for the primary block.
  const nodeText = { from: 3, to: 7 };

  it("reports a partial selection as offsets from the start of the node's text", () => {
    expect(nodeTextSelectionOffsets({ from: 4, to: 6 }, nodeText)).toEqual({ from: 1, to: 3 });
    expect(nodeTextSelectionOffsets({ from: 3, to: 7 }, nodeText)).toEqual({ from: 0, to: 4 });
  });

  it("reports nothing for a caret, so the toolbar paints the whole node", () => {
    expect(nodeTextSelectionOffsets({ from: 5, to: 5 }, nodeText)).toBeNull();
  });

  it("reports nothing for a selection that leaves the node's own text", () => {
    // Into a quote hanging off the node, or across both — those blocks belong to
    // the node's own toolbar, which formats them directly.
    expect(nodeTextSelectionOffsets({ from: 5, to: 12 }, nodeText)).toBeNull();
    expect(nodeTextSelectionOffsets({ from: 9, to: 12 }, nodeText)).toBeNull();
  });

  it("reports nothing for a block that holds no text of its own", () => {
    expect(nodeTextSelectionOffsets({ from: 1, to: 4 }, null)).toBeNull();
  });
});

describe("isBlankMindMapSurface", () => {
  const inCanvas = (html: string) => {
    const canvas = document.createElement("div");
    canvas.className = "map-container";
    canvas.innerHTML = html;
    return canvas;
  };

  it("treats the canvas and its layout containers as empty surface", () => {
    const canvas = inCanvas("<me-main><me-wrapper></me-wrapper></me-main>");
    expect(isBlankMindMapSurface(canvas)).toBe(true);
    expect(isBlankMindMapSurface(canvas.querySelector("me-wrapper"))).toBe(true);
  });

  it("never treats a node or its injected content as empty surface", () => {
    const canvas = inCanvas(
      `<me-tpc><div class="mindmap-node-shell" data-node-id="web">
         <div class="mindmap-node-display"><span class="mindmap-node-rich-text">正文</span></div>
       </div></me-tpc>`,
    );
    expect(isBlankMindMapSurface(canvas.querySelector("me-tpc"))).toBe(false);
    // The text a click actually lands on is several levels below the node.
    expect(isBlankMindMapSurface(canvas.querySelector(".mindmap-node-rich-text"))).toBe(false);
  });

  it("never treats mind-elixir's own chrome as empty surface", () => {
    const canvas = inCanvas(
      `<me-epd></me-epd>
       <div class="mind-elixir-toolbar rb"><span class="icon"></span></div>
       <div class="context-menu"><ul class="menu-list"><li>添加</li></ul></div>
       <div id="input-box"></div><div class="circle"></div><div class="selection-area"></div>`,
    );
    for (const selector of ["me-epd", ".mind-elixir-toolbar .icon", ".context-menu li", "#input-box", ".circle", ".selection-area"]) {
      expect(isBlankMindMapSurface(canvas.querySelector(selector)), selector).toBe(false);
    }
  });

  it("ignores anything that is not an element", () => {
    expect(isBlankMindMapSurface(null)).toBe(false);
    expect(isBlankMindMapSurface(document)).toBe(false);
  });
});

describe("sameEditingTarget", () => {
  it("treats an equal target as unchanged so re-entering an edit does not remount", () => {
    expect(sameEditingTarget(null, null)).toBe(true);
    expect(sameEditingTarget({ nodeId: "web" }, { nodeId: "web" })).toBe(true);
    expect(
      sameEditingTarget(
        { nodeId: "web", focusBlockId: "quote", focusPoint: { x: 12, y: 34 } },
        { nodeId: "web", focusBlockId: "quote", focusPoint: { x: 12, y: 34 } },
      ),
    ).toBe(true);
  });

  it("distinguishes a different node, block, or caret point", () => {
    expect(sameEditingTarget({ nodeId: "web" }, { nodeId: "app" })).toBe(false);
    expect(sameEditingTarget({ nodeId: "web" }, null)).toBe(false);
    expect(sameEditingTarget({ nodeId: "web" }, { nodeId: "web", focusBlockId: "quote" })).toBe(false);
    expect(
      sameEditingTarget(
        { nodeId: "web", focusPoint: { x: 12, y: 34 } },
        { nodeId: "web", focusPoint: { x: 12, y: 35 } },
      ),
    ).toBe(false);
  });
});

describe("nodeDocumentSignature", () => {
  // The editor compares the store node against the node parsed back out of
  // BlockNote. Any field the projection normalizes has to survive that trip with
  // an equal signature, or the node reprojects on every keystroke.
  const roundTrip = (node: ZhiJianNode) => {
    const single: ZhiJianTree = { rootId: node.id, nodes: { [node.id]: { ...node, children: [] } } };
    const projected = treeToBlockNote(single) as unknown as Block[];
    return blockNoteToTree(projected, single)!.nodes[node.id];
  };
  const baseNode = (overrides: Partial<ZhiJianNode> = {}): ZhiJianNode => ({
    id: "web", parentId: null, children: [], type: "text", content: { text: "正文" }, ...overrides,
  });

  it("survives a projection round trip for text, description, quotes and images", () => {
    const node = baseNode({
      description: { text: "描述" },
      blocks: [
        { id: "quote", type: "quote", content: { text: "引用" } },
        { id: "image", type: "image", image: { url: "asset:image" } },
      ],
    });
    expect(nodeDocumentSignature(roundTrip(node))).toBe(nodeDocumentSignature(node));
  });

  it("survives a projection round trip for a table node", () => {
    const node = baseNode({
      type: "table",
      content: { text: "" },
      props: { table: { rows: [[{ content: { text: "甲" } }, { content: { text: "乙" } }]] } },
    });
    expect(nodeDocumentSignature(roundTrip(node))).toBe(nodeDocumentSignature(node));
  });

  it("survives a projection round trip for marked-up rich text", () => {
    const node = baseNode({
      content: { text: "粗体", spans: [{ text: "粗体", marks: { bold: true, textColor: "#dc2626" } }] },
    });
    expect(nodeDocumentSignature(roundTrip(node))).toBe(nodeDocumentSignature(node));
  });

  it("equates plain text with its single-span form and a blank description with none", () => {
    expect(nodeDocumentSignature(baseNode({ content: { text: "正文" } }))).toBe(
      nodeDocumentSignature(baseNode({ content: { text: "正文", spans: [{ text: "正文" }] } })),
    );
    expect(nodeDocumentSignature(baseNode({ description: { text: "  " } }))).toBe(
      nodeDocumentSignature(baseNode()),
    );
  });

  it("equates an omitted image field with the default BlockNote materializes", () => {
    const stored = baseNode({ blocks: [{ id: "image", type: "image", image: { url: "asset:image" } }] });
    const materialized = baseNode({
      blocks: [{ id: "image", type: "image", image: { url: "asset:image", name: "图片", caption: "", previewWidth: 480, showPreview: true } }],
    });
    expect(nodeDocumentSignature(stored)).toBe(nodeDocumentSignature(materialized));
  });

  it("still reports a real edit as a difference", () => {
    const node = baseNode({ blocks: [{ id: "quote", type: "quote", content: { text: "引用" } }] });
    expect(nodeDocumentSignature(baseNode({ content: { text: "改过的正文" } }))).not.toBe(nodeDocumentSignature(baseNode()));
    expect(nodeDocumentSignature(baseNode({ description: { text: "描述" } }))).not.toBe(nodeDocumentSignature(baseNode()));
    expect(nodeDocumentSignature(node)).not.toBe(nodeDocumentSignature(baseNode()));
    expect(
      nodeDocumentSignature(baseNode({ content: { text: "正文", spans: [{ text: "正文", marks: { bold: true } }] } })),
    ).not.toBe(nodeDocumentSignature(baseNode()));
  });

  it("reports a table cell edit as a difference so it can be committed", () => {
    const table = (text: string) => baseNode({
      type: "table", content: { text: "" }, props: { table: { rows: [[{ content: { text } }]] } },
    });
    expect(nodeDocumentSignature(table("甲"))).not.toBe(nodeDocumentSignature(table("乙")));
  });
});


describe("suppressMindMapEnter", () => {
  const primary = { nodeId: "n1", blockId: "n1", blockType: "paragraph", shiftKey: false };

  it("swallows a split of the primary block, which the single-node editor cannot represent", () => {
    expect(suppressMindMapEnter(primary)).toBe(true);
    expect(suppressMindMapEnter({ ...primary, blockType: "heading" })).toBe(true);
    expect(suppressMindMapEnter({ ...primary, blockType: "checkListItem" })).toBe(true);
  });

  it("leaves a soft break, a table cell and the attachments alone", () => {
    expect(suppressMindMapEnter({ ...primary, shiftKey: true })).toBe(false);
    expect(suppressMindMapEnter({ ...primary, blockType: "table" })).toBe(false);
    expect(suppressMindMapEnter({ ...primary, blockId: "n1::description", blockType: "quote" })).toBe(false);
    expect(suppressMindMapEnter({ ...primary, blockId: "q1", blockType: "quote" })).toBe(false);
  });
});

describe("mind map geometry measurement", () => {
  it("keeps subpixel DOM size changes instead of rounding them away", () => {
    expect(mindMapMeasuredSizeChanged({ width: 120, height: 40 }, { width: 120, height: 40 })).toBe(false);
    expect(mindMapMeasuredSizeChanged({ width: 120, height: 40 }, { width: 120.005, height: 40 })).toBe(false);
    expect(mindMapMeasuredSizeChanged({ width: 120, height: 40 }, { width: 120.025, height: 40 })).toBe(true);
    expect(mindMapMeasuredSizeChanged({ width: 120, height: 40 }, { width: 120, height: 40.025 })).toBe(true);
  });

  it("converts transformed client rects back to fractional canvas pixels", () => {
    expect(unscaledMindMapSize({ width: 80.3125, height: 32.4375 }, 0.8)).toEqual({
      width: 100.390625,
      height: 40.546875,
    });
  });

  it("reads fractional scale from 2d and 3d CSS matrices", () => {
    expect(mindMapScaleFromTransform("matrix(0.8, 0, 0, 0.8, 12.5, -4.25)")).toBe(0.8);
    expect(mindMapScaleFromTransform("matrix3d(0.75, 0, 0, 0, 0, 0.75, 0, 0, 0, 0, 1, 0, 20, 30, 0, 1)")).toBe(0.75);
    expect(mindMapScaleFromTransform("none", 0.625)).toBe(0.625);
  });

  it("only treats table and image editors as live geometry editors", () => {
    const text = document.createElement("div");
    text.innerHTML = `<div class="mindmap-node-editor"><div data-content-type="paragraph">正文</div></div>`;
    expect(isMindMapGeometryEditorElement(text)).toBe(false);

    const table = document.createElement("div");
    table.innerHTML = `<div class="mindmap-node-editor"><div data-content-type="table"><table><tr><td>1</td></tr></table></div></div>`;
    expect(isMindMapGeometryEditorElement(table)).toBe(true);

    const image = document.createElement("div");
    image.innerHTML = `<div class="mindmap-node-editor"><div data-content-type="image"><img src="asset:test" /></div></div>`;
    expect(isMindMapGeometryEditorElement(image)).toBe(true);
  });
});

describe("hiddenDescendantCount", () => {
  // a → b → (c, d), plus e as a's second child.
  const tree: ZhiJianTree = {
    rootId: "a",
    nodes: {
      a: node("a", null, ["b", "e"]),
      b: node("b", "a", ["c", "d"]),
      c: node("c", "b", []),
      d: node("d", "b", []),
      e: node("e", "a", []),
    },
  };

  it("counts the whole subtree, not just the row of children", () => {
    expect(hiddenDescendantCount(tree, "a")).toBe(4);
    expect(hiddenDescendantCount(tree, "b")).toBe(2);
  });

  it("counts nothing for a leaf, which has no handle to label", () => {
    expect(hiddenDescendantCount(tree, "c")).toBe(0);
  });

  it("counts nothing for a node that is no longer in the tree", () => {
    expect(hiddenDescendantCount(tree, "gone")).toBe(0);
  });
});

function node(id: string, parentId: string | null, children: string[]): ZhiJianNode {
  return {
    id,
    parentId,
    children,
    content: { text: id },
    type: "text",
    meta: { createdAt: 0, updatedAt: 0 },
  };
}
