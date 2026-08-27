import { describe, expect, it, vi } from "vitest";
import type { BlockNoteEditor } from "@blocknote/core";
import { caretPositionAtPoint, placeCaretInTableCell } from "./caretAtPoint";

describe("caretPositionAtPoint", () => {
  it("keeps the resolved position when the click landed on a character", () => {
    expect(caretPositionAtPoint({ position: 4, onCharacter: true, lineEnd: 9 })).toBe(4);
  });

  it("appends when the click landed in the line but on no character", () => {
    // A row is as wide as the view gives it while its text is only as wide as
    // itself, so clicking level with a short line but past its last character
    // resolves to the line's *start*.
    expect(caretPositionAtPoint({ position: 1, onCharacter: false, lineEnd: 4 })).toBe(4);
  });

  it("leaves a click that landed in no line to the caller", () => {
    expect(caretPositionAtPoint({ position: 1, onCharacter: false, lineEnd: null })).toBeNull();
  });
});

describe("placeCaretInTableCell", () => {
  it("targets the clicked row and column rather than the final cell", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-content-type="table"><table><tbody><tr><td><p>甲</p></td><td><p>乙</p></td></tr></tbody></table></div>`;
    const setTextSelection = vi.fn();
    const target = root.querySelectorAll("p")[0];
    const editor = {
      domElement: root,
      _tiptapEditor: {
        view: { posAtDOM: vi.fn((node: Node) => node === target ? 7 : 17) },
        commands: { setTextSelection },
      },
      prosemirrorState: { doc: { content: { size: 30 } } },
    } as unknown as BlockNoteEditor;

    expect(placeCaretInTableCell(editor, { row: 0, column: 0 })).toBe(true);
    expect(setTextSelection).toHaveBeenCalledWith(8);
  });

  it("does nothing when the requested cell no longer exists", () => {
    const editor = { domElement: document.createElement("div") } as unknown as BlockNoteEditor;
    expect(placeCaretInTableCell(editor, { row: 4, column: 4 })).toBe(false);
  });
});
