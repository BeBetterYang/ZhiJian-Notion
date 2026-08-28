import { describe, expect, it } from "vitest";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import {
  CLOZE_CLASS,
  CLOZE_REVEALED_CLASS,
  clozeAtEvent,
  toggleClozeReveal,
  treeHasClozeContent,
} from "./mindMapCloze";

const node = (id: string, node: Partial<ZhiJianNode>): ZhiJianNode => ({
  id,
  type: "text",
  content: { text: "" },
  children: [],
  ...node,
} as ZhiJianNode);

const tree = (...nodes: ZhiJianNode[]): Pick<ZhiJianTree, "nodes"> => ({
  nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
});

describe("treeHasClozeContent", () => {
  it("is false for a document nobody has hollowed out", () => {
    expect(
      treeHasClozeContent(
        tree(
          node("a", { content: { text: "正文", spans: [{ text: "正文", marks: { bold: true } }] } }),
          node("b", { blocks: [{ id: "q", type: "quote", content: { text: "引用" } }] }),
        ),
      ),
    ).toBe(false);
  });

  it("finds a cloze wherever text can be written", () => {
    const clozed = { text: "藏起来", spans: [{ text: "藏起来", marks: { cloze: true } }] };
    for (const [label, entry] of [
      ["content", node("a", { content: clozed })],
      ["description", node("a", { description: clozed })],
      ["quote", node("a", { blocks: [{ id: "q", type: "quote", content: clozed }] })],
      [
        "table cell",
        node("a", {
          type: "table",
          props: { table: { rows: [[{ content: { text: "" } }, { content: clozed }]] } },
        }),
      ],
      // A whole-content mark rather than a span, which is how a run that covers the
      // entire text is normalized.
      ["whole content", node("a", { content: { text: "藏起来", marks: { cloze: true } } })],
    ] as const) {
      expect(treeHasClozeContent(tree(entry)), label).toBe(true);
    }
  });
});

describe("clozeAtEvent", () => {
  const canvas = (html: string) => {
    const element = document.createElement("div");
    element.innerHTML = html;
    return element;
  };

  it("claims a press on a cloze run, and on anything inside it", () => {
    const element = canvas(
      `<span class="${CLOZE_CLASS}">藏<mark class="zhijian-search-mark">起来</mark></span>`,
    );
    expect(clozeAtEvent(element.querySelector(".zhijian-search-mark"))).toBe(
      element.querySelector(`.${CLOZE_CLASS}`),
    );
  });

  it("leaves a link, a control and the open editor alone", () => {
    for (const html of [
      `<a href="#"><span class="${CLOZE_CLASS}">链接</span></a>`,
      `<button><span class="${CLOZE_CLASS}">按钮</span></button>`,
      `<div class="mindmap-node-editor"><span class="${CLOZE_CLASS}">编辑中</span></div>`,
    ]) {
      expect(clozeAtEvent(canvas(html).querySelector(`.${CLOZE_CLASS}`)), html).toBe(null);
    }
  });

  it("answers null for plain text and for non-elements", () => {
    expect(clozeAtEvent(canvas("<span>正文</span>").querySelector("span"))).toBe(null);
    expect(clozeAtEvent(null)).toBe(null);
    expect(clozeAtEvent(document)).toBe(null);
  });
});

describe("toggleClozeReveal", () => {
  it("uncovers on the first press and hides again on the next", () => {
    const element = document.createElement("span");
    element.className = CLOZE_CLASS;
    toggleClozeReveal(element);
    expect(element.classList.contains(CLOZE_REVEALED_CLASS)).toBe(true);
    toggleClozeReveal(element);
    expect(element.classList.contains(CLOZE_REVEALED_CLASS)).toBe(false);
  });
});
