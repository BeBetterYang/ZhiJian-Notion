import { describe, expect, it } from "vitest";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import { collapsedOutlineCss, hasCollapsibleChildren } from "./outlineCollapse";

function node(id: string, children: string[], collapsed?: boolean): ZhiJianNode {
  return {
    id,
    parentId: id === "root" ? null : "root",
    type: "text",
    content: { text: id },
    children,
    props: collapsed === undefined ? undefined : { collapsed },
  };
}

function tree(...nodes: ZhiJianNode[]): ZhiJianTree {
  return { rootId: "root", nodes: Object.fromEntries(nodes.map((item) => [item.id, item])) };
}

describe("collapsedOutlineCss", () => {
  it("writes nothing while every row is expanded", () => {
    expect(collapsedOutlineCss(tree(node("root", ["a"]), node("a", ["a1"])))).toBe("");
  });

  it("hides the children of a collapsed row and rings its marker", () => {
    const css = collapsedOutlineCss(
      tree(node("root", ["a"]), node("a", ["a1", "a2"], true), node("a1", []), node("a2", [])),
    );

    expect(css).toContain('.bn-block-outer[data-id="a1"], .bn-block-outer[data-id="a2"]) { display: none; }');
    expect(css).toContain('.bn-block-outer[data-id="a"]) > .bn-block > .bn-block-content::before');
    // The row itself stays visible — only what hangs under it goes.
    expect(css).not.toContain('.bn-block-outer[data-id="a"]) { display: none; }');
  });

  it("ignores a collapsed row with nothing under it", () => {
    expect(collapsedOutlineCss(tree(node("root", ["a"]), node("a", [], true)))).toBe("");
  });

  it("never honours a collapsed root, which would leave the outline empty", () => {
    const rootNode = node("root", ["a"], true);
    expect(collapsedOutlineCss(tree(rootNode, node("a", [])))).toBe("");
  });

  it("escapes an id before it reaches a selector", () => {
    const css = collapsedOutlineCss(tree(node("root", ['a"b']), node('a"b', ["c"], true), node("c", [])));

    expect(css).toContain('.bn-block-outer[data-id="a\\"b"]');
  });
});

describe("hasCollapsibleChildren", () => {
  it("counts child rows, and answers for a row that is gone", () => {
    const outline = tree(node("root", ["a"]), node("a", ["a1"]), node("a1", []));

    expect(hasCollapsibleChildren(outline, "a")).toBe(true);
    expect(hasCollapsibleChildren(outline, "a1")).toBe(false);
    expect(hasCollapsibleChildren(outline, "missing")).toBe(false);
  });
});
