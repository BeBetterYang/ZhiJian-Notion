import { describe, expect, it } from "vitest";
import {
  hasNodeAttachments,
  isOutlineBlockContentEmpty,
  outlineEnterAction,
  outlineNodeKeyAction,
  partitionNodeChildren,
  previousFocusableBlockId,
  type OutlineBlockLike,
} from "./outlineNodeKeymap";

function block(id: string, type = "paragraph", children: OutlineBlockLike[] = []): OutlineBlockLike {
  return { id, type, children };
}

const KEY_DEFAULTS = {
  isRoot: false,
  isEmpty: true,
  atStart: true,
  atEnd: true,
  selectionEmpty: true,
};

describe("partitionNodeChildren", () => {
  it("splits attachments from child nodes", () => {
    const target = block("n1", "paragraph", [
      block("n1::description", "quote"),
      block("img", "image"),
      block("child", "paragraph"),
    ]);

    expect(partitionNodeChildren(target)).toEqual({
      attachments: [target.children[0], target.children[1]],
      childNodes: [target.children[2]],
    });
  });

  it("reports no attachments for a node with only child nodes", () => {
    expect(hasNodeAttachments(block("n1", "paragraph", [block("c1"), block("c2", "table")]))).toBe(false);
  });
});

describe("outlineNodeKeyAction", () => {
  it("reads emptiness from BlockNote content instead of wrapper node size", () => {
    expect(isOutlineBlockContentEmpty({ content: "" })).toBe(true);
    expect(isOutlineBlockContentEmpty({ content: [] })).toBe(true);
    expect(isOutlineBlockContentEmpty({ content: [{ type: "text", text: "" }] })).toBe(true);
    expect(isOutlineBlockContentEmpty({ content: [{ type: "text", text: "Web端" }] })).toBe(false);
    expect(isOutlineBlockContentEmpty({ content: "Web端" })).toBe(false);
  });

  it("protects a node whose image would be stranded", () => {
    const target = block("n1", "paragraph", [block("img", "image")]);

    expect(outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Backspace", block: target })).toBe(
      "protect-attachments",
    );
    expect(outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Delete", block: target })).toBe(
      "protect-attachments",
    );
  });

  it("protects a node that still holds text alongside a quote", () => {
    const target = block("n1", "paragraph", [block("n1::description", "quote")]);

    expect(
      outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Backspace", block: target, isEmpty: false }),
    ).toBe("protect-attachments");
  });

  it("deletes an empty node in one press", () => {
    expect(outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Backspace", block: block("n1") })).toBe(
      "delete-empty-node",
    );
  });

  it("keeps child nodes from triggering the guard", () => {
    const target = block("n1", "paragraph", [block("c1")]);

    expect(outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Backspace", block: target })).toBe(
      "delete-empty-node",
    );
  });

  it("takes an emptied quote away in one press", () => {
    expect(outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Backspace", block: block("q1", "quote") })).toBe(
      "delete-empty-node",
    );
    // A quote with text in it keeps BlockNote's own Backspace.
    expect(
      outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Backspace", block: block("q1", "quote"), isEmpty: false }),
    ).toBe("default");
    // Forward delete from an empty quote is not the "take the note away" gesture.
    expect(outlineNodeKeyAction({ ...KEY_DEFAULTS, key: "Delete", block: block("q1", "quote") })).toBe(
      "default",
    );
  });

  it("defers to BlockNote for text, the root, tables, attachments and mid-line carets", () => {
    const cases = [
      { ...KEY_DEFAULTS, key: "Backspace", block: block("n1"), isEmpty: false },
      { ...KEY_DEFAULTS, key: "Backspace", block: block("root"), isRoot: true },
      { ...KEY_DEFAULTS, key: "Backspace", block: block("t1", "table") },
      { ...KEY_DEFAULTS, key: "Backspace", block: block("q1", "quote"), isEmpty: false },
      { ...KEY_DEFAULTS, key: "Backspace", block: block("i1", "image") },
      { ...KEY_DEFAULTS, key: "Backspace", block: block("n1"), atStart: false, isEmpty: false },
      { ...KEY_DEFAULTS, key: "Delete", block: block("n1"), atEnd: false, isEmpty: false },
      { ...KEY_DEFAULTS, key: "Delete", block: block("n1") },
      { ...KEY_DEFAULTS, key: "a", block: block("n1") },
      { ...KEY_DEFAULTS, key: "Backspace", block: block("n1"), selectionEmpty: false },
    ] as const;

    for (const params of cases) {
      expect(outlineNodeKeyAction(params), `${params.key} on ${params.block.type}`).toBe("default");
    }
  });

  it("protects an attachment-holding node even when the caret sits mid-text", () => {
    // Only the merge-away presses are intercepted; a caret in the middle of the
    // line deletes a character as usual.
    const target = block("n1", "paragraph", [block("img", "image")]);

    expect(
      outlineNodeKeyAction({
        ...KEY_DEFAULTS,
        key: "Backspace",
        block: target,
        atStart: false,
        isEmpty: false,
      }),
    ).toBe("default");
  });
});

describe("outlineEnterAction", () => {
  it("jumps past the attachments at the end of a node with them", () => {
    const target = block("n1", "paragraph", [block("img", "image"), block("c1")]);

    expect(outlineEnterAction({ block: target, atEnd: true, selectionEmpty: true })).toBe(
      "insert-past-attachments",
    );
  });

  it("stays out of splits, mid-line breaks and attachment blocks", () => {
    const withImage = block("n1", "paragraph", [block("img", "image")]);

    expect(outlineEnterAction({ block: withImage, atEnd: false, selectionEmpty: true })).toBe("default");
    expect(outlineEnterAction({ block: withImage, atEnd: true, selectionEmpty: false })).toBe("default");
    expect(outlineEnterAction({ block: block("n1"), atEnd: true, selectionEmpty: true })).toBe("default");
    expect(
      outlineEnterAction({
        block: block("q1", "quote", [block("img", "image")]),
        atEnd: true,
        selectionEmpty: true,
      }),
    ).toBe("default");
  });
});

describe("previousFocusableBlockId", () => {
  const document = [
    block("root", "heading", [
      block("a", "paragraph", [block("a1")]),
      block("img", "image"),
      block("b"),
      block("t", "table"),
      block("c"),
    ]),
  ];

  it("reads the outline in document order, not sibling order", () => {
    expect(previousFocusableBlockId(document, "img")).toBe("a1");
    expect(previousFocusableBlockId(document, "a1")).toBe("a");
    expect(previousFocusableBlockId(document, "a")).toBe("root");
  });

  it("steps over blocks that hold no line-end caret", () => {
    expect(previousFocusableBlockId(document, "b")).toBe("a1");
    expect(previousFocusableBlockId(document, "c")).toBe("b");
  });

  it("returns undefined at the top of the document and for unknown ids", () => {
    expect(previousFocusableBlockId(document, "root")).toBeUndefined();
    expect(previousFocusableBlockId(document, "missing")).toBeUndefined();
  });
});
