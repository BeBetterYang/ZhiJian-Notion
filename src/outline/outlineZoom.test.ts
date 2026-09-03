import { describe, expect, it } from "vitest";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import { focusBreadcrumbItems, isProtectedOutlineRoot, zoomPath, zoomedOutlineCss } from "./outlineZoom";

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

describe("isProtectedOutlineRoot", () => {
  it("protects both the document root and the current focus root", () => {
    expect(isProtectedOutlineRoot("root", "root", "a1")).toBe(true);
    expect(isProtectedOutlineRoot("a1", "root", "a1")).toBe(true);
    expect(isProtectedOutlineRoot("a1x", "root", "a1")).toBe(false);
    expect(isProtectedOutlineRoot("a", "root", null)).toBe(false);
  });
});

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

    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-content { font-size: 34px; font-weight: 400; line-height: 1.2; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-content::before { content: none !important; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-content { background-image: none !important; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-group { margin-left: 0; margin-top: 16px; }');
    expect(css).toContain('[data-id="a1"] > .bn-block > .bn-block-group > .bn-block-outer::before { display: none; }');
  });

  it("只放大不加粗，heading 里面那层也跟着继承", () => {
    // 700 会把「用户自己加没加粗」这件事盖掉；heading 自带的粗细不继承的话，同样绕过上面那条。
    const css = zoomedOutlineCss(sampleTree(), "a1");

    expect(css).not.toContain("font-weight: 700");
    expect(css).toContain(
      '[data-id="a1"] > .bn-block > .bn-block-content[data-content-type="heading"] > :is(h1, h2, h3) { font-size: inherit; font-weight: inherit; line-height: inherit; }',
    );
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

describe("focusBreadcrumbItems", () => {
  it("从一级主题一直排到专注的那个节点，不带文档根", () => {
    // 文档根那一级由工作区拿文件名画，点它是退出专注，所以不在这个列表里。
    const items = focusBreadcrumbItems(sampleTree(), "a1x");

    expect(items.map((item) => item.id)).toEqual(["a", "a1", "a1x"]);
    expect(items.map((item) => item.label)).toEqual(["a", "a1", "a1x"]);
    expect(items.map((item) => item.current)).toEqual([false, false, true]);
  });

  it("每一级都带上父节点 children 的原顺序，并标出自己", () => {
    const items = focusBreadcrumbItems(sampleTree(), "a1");

    expect(items[0].siblings).toEqual([
      { id: "a", label: "a", current: true },
      { id: "b", label: "b", current: false },
    ]);
    expect(items[1].siblings).toEqual([
      { id: "a1", label: "a1", current: true },
      { id: "a2", label: "a2", current: false },
    ]);
  });

  it("独生子只剩自己一个，工作区据此不弹层", () => {
    const items = focusBreadcrumbItems(sampleTree(), "a1x");

    expect(items.at(-1)?.siblings).toEqual([{ id: "a1x", label: "a1x", current: true }]);
  });

  it("空标题在面包屑和弹层里都显示「未命名」", () => {
    const tree = sampleTree();
    tree.nodes.a2.content = { text: "" };

    const items = focusBreadcrumbItems(tree, "a2");

    expect(items.at(-1)?.label).toBe("未命名");
    expect(items.at(-1)?.siblings.map((sibling) => sibling.label)).toEqual(["a1", "未命名"]);
  });

  it("没在专注、专注在根上、专注的节点已经没了，都是空列表", () => {
    const tree = sampleTree();

    expect(focusBreadcrumbItems(tree, null)).toEqual([]);
    expect(focusBreadcrumbItems(tree, "root")).toEqual([]);
    expect(focusBreadcrumbItems(tree, "deleted")).toEqual([]);
  });
});
