import { describe, expect, it } from "vitest";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import { zoomPath, zoomedOutlineCss } from "./outlineZoom";

function node(id: string, parentId: string | null, children: string[]): ZhiJianNode {
  return { id, parentId, children, content: { text: id }, type: "text" };
}

/**
 * root
 * ├── a
 * │   ├── a1 → a1x
 * │   └── a2
 * └── b
 */
function sampleTree(): ZhiJianTree {
  return {
    rootId: "root",
    nodes: Object.fromEntries(
      [
        node("root", null, ["a", "b"]),
        node("a", "root", ["a1", "a2"]),
        node("a1", "a", ["a1x"]),
        node("a1x", "a1", []),
        node("a2", "a", []),
        node("b", "root", []),
      ].map((item) => [item.id, item]),
    ),
  };
}

describe("zoomPath", () => {
  it("reads from the root down to the zoomed node", () => {
    expect(zoomPath(sampleTree(), "a1")).toEqual(["root", "a", "a1"]);
  });

  it("is empty with no zoom, on the root itself, and for a node that has gone", () => {
    const tree = sampleTree();

    expect(zoomPath(tree, null)).toEqual([]);
    expect(zoomPath(tree, "root")).toEqual([]);
    expect(zoomPath(tree, "deleted")).toEqual([]);
  });
});

describe("zoomedOutlineCss", () => {
  it("writes nothing when the whole document is showing", () => {
    const tree = sampleTree();

    expect(zoomedOutlineCss(tree, null)).toBe("");
    expect(zoomedOutlineCss(tree, "root")).toBe("");
  });

  it("hides each ancestor's own row and its other children", () => {
    const css = zoomedOutlineCss(sampleTree(), "a1");

    expect(css).toContain('.bn-block-outer[data-id="a2"]');
    expect(css).toContain('.bn-block-outer[data-id="b"]');
    expect(css).not.toMatch(/:is\([^}]*data-id="a1x"/);
    expect(css).toContain('[data-id="root"] > .bn-block > .bn-block-content { display: none; }');
    expect(css).toContain('[data-id="a"] > .bn-block > .bn-block-content { display: none; }');
    expect(css).toContain('[data-id="root"] > .bn-block > .bn-block-group > .bn-block-outer:not([data-id="a"]) { display: none; }');
    expect(css).toContain('[data-id="a"] > .bn-block > .bn-block-group > .bn-block-outer:not([data-id="a1"]) { display: none; }');
    // The zoomed node keeps its own row and its own children.
    expect(css).not.toContain('[data-id="a1"] > .bn-block > .bn-block-content { display: none; }');
    expect(css).not.toContain('[data-id="a1"] > .bn-block > .bn-block-group > .bn-block-outer:not(');
  });

  it("takes back the indent of every level it hid", () => {
    const css = zoomedOutlineCss(sampleTree(), "a1");

    expect(css).toContain('[data-id="root"] > .bn-block > .bn-block-group { margin-left: 0; margin-top: 0; padding-left: 0; }');
    expect(css).toContain('[data-id="a"] > .bn-block > .bn-block-group { margin-left: 0; margin-top: 0; padding-left: 0; }');
    expect(css).toContain('[data-id="a"]::before { display: none !important; }');
    expect(css).toContain('[data-id="a1"]::before { display: none !important; }');
  });

  it("presents the focused node like the document root title", () => {
    const css = zoomedOutlineCss(sampleTree(), "a1");

    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-content { font-size: 34px; font-weight: 700; line-height: 1.2; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-content::before { content: none !important; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-content { background-image: none !important; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-group { margin-left: 0; margin-top: 16px; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-group > .bn-block-outer::before { display: none; }');
  });

  it("hides only the title when a 1 级主题 is zoomed", () => {
    const css = zoomedOutlineCss(sampleTree(), "a");

    expect(css).toContain('[data-id="root"] > .bn-block > .bn-block-group > .bn-block-outer:not([data-id="a"]) { display: none; }');
    expect(css).not.toContain('[data-id="a"] > .bn-block > .bn-block-content { display: none; }');
  });

  it("quotes an id that would otherwise close the attribute selector early", () => {
    const tree = sampleTree();
    tree.nodes['we"ird'] = node('we"ird', "root", []);
    tree.nodes.root.children.push('we"ird');

    expect(zoomedOutlineCss(tree, 'we"ird')).toContain(':not([data-id="we\\"ird"])');
  });
});
