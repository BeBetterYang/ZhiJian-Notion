import { describe, expect, it, vi } from "vitest";
import type { BlockNoteEditor } from "@blocknote/core";
import {
  caretPositionAtPoint,
  caretPositionBesideText,
  correctCaretAfterClick,
  extendSelectionFromCaret,
  placeCaretInTableCell,
} from "./caretAtPoint";

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

describe("correctCaretAfterClick", () => {
  it("does not overwrite a drag selection", () => {
    const getSelection = vi.spyOn(document, "getSelection").mockReturnValue({
      isCollapsed: false,
    } as Selection);
    const editor = {
      _tiptapEditor: {
        view: { posAtCoords: vi.fn() },
        commands: { setTextSelection: vi.fn() },
      },
    } as unknown as BlockNoteEditor;

    correctCaretAfterClick(editor, { x: 120, y: 40 });

    expect(editor._tiptapEditor.view.posAtCoords).not.toHaveBeenCalled();
    expect(editor._tiptapEditor.commands.setTextSelection).not.toHaveBeenCalled();
    getSelection.mockRestore();
  });
});

describe("outline blank-text gesture", () => {
  function gestureEditor() {
    const setTextSelection = vi.fn();
    const posAtCoords = vi.fn(() => ({ pos: 3, inside: 1 }));
    const doc = {
      resolve: () => ({ parent: { isTextblock: true }, end: () => 9 }),
    };
    const editor = {
      _tiptapEditor: {
        view: { posAtCoords, state: { doc } },
        commands: { setTextSelection },
      },
      prosemirrorState: {
        doc,
      },
    } as unknown as BlockNoteEditor;
    return { editor, posAtCoords, setTextSelection };
  }

  it("records the line end as the anchor for a press beside text", () => {
    const { editor } = gestureEditor();
    expect(caretPositionBesideText(editor, { x: 120, y: 40 })).toBe(9);
  });

  it("extends selection from the recorded line-end anchor", () => {
    const { editor, setTextSelection } = gestureEditor();
    expect(extendSelectionFromCaret(editor, 9, { x: 60, y: 40 })).toBe(true);
    expect(setTextSelection).toHaveBeenCalledWith({ from: 9, to: 3 });
  });
});

describe("placeCaretInTableCell", () => {
  /**
   * A two-by-two table as a document: `<table><tr><td><p>…</p></td>…`. Sizes follow
   * ProseMirror's — a paragraph is its text plus its own two tokens, a cell is its
   * paragraph plus two, and so on — so the positions the code counts are real ones.
   */
  function tableEditor(options: { table?: boolean } = {}) {
    const paragraph = (text: string) => ({
      type: { name: "paragraph" },
      nodeSize: text.length + 2,
      isTextblock: true,
      childCount: 0,
      firstChild: null,
      text,
    });
    const cell = (text: string) => {
      const child = paragraph(text);
      return {
        type: { name: "tableCell" },
        nodeSize: child.nodeSize + 2,
        isTextblock: false,
        childCount: 1,
        firstChild: child,
        child: () => child,
      };
    };
    const row = (...cells: ReturnType<typeof cell>[]) => ({
      type: { name: "tableRow" },
      nodeSize: cells.reduce((total, item) => total + item.nodeSize, 0) + 2,
      isTextblock: false,
      childCount: cells.length,
      firstChild: cells[0],
      child: (index: number) => cells[index],
    });
    const rows = [row(cell("甲乙"), cell("丙丁")), row(cell("戊己"), cell("庚辛"))];
    const table = {
      type: { name: "table" },
      nodeSize: rows.reduce((total, item) => total + item.nodeSize, 0) + 2,
      isTextblock: false,
      childCount: rows.length,
      firstChild: rows[0],
      child: (index: number) => rows[index],
    };
    // The paragraph the node's own text lives in, ahead of the table.
    const lead = paragraph("表格");
    const children = options.table === false ? [lead] : [lead, table];
    const doc = {
      content: { size: children.reduce((total, item) => total + item.nodeSize, 0) + 2 },
      descendants: (visit: (node: unknown, position: number) => boolean | void) => {
        let position = 0;
        for (const child of children) {
          visit(child, position);
          position += child.nodeSize;
        }
      },
      // Every position handed to `resolve` here is inside a paragraph, which is what
      // the code checks before it asks for the end.
      resolve: (position: number) => ({
        pos: position,
        parent: { isTextblock: true },
        end: () => position + 2,
      }),
    };
    const setTextSelection = vi.fn();
    const focus = vi.fn();
    const editor = {
      _tiptapEditor: { view: { focus, state: { doc } }, commands: { setTextSelection } },
      prosemirrorState: { doc },
    } as unknown as BlockNoteEditor;
    return { editor, setTextSelection, focus };
  }

  it("targets the clicked row and column rather than the final cell", () => {
    const { editor, setTextSelection, focus } = tableEditor();
    expect(placeCaretInTableCell(editor, { row: 0, column: 0 })).toBe(true);
    // Focusing is what would otherwise put the caret in the table's last cell, so
    // it has to happen before the selection, not after it.
    expect(focus).toHaveBeenCalled();
    // The lead paragraph runs 0-4, the table opens at 4, its first row at 5, its
    // first cell at 6, that cell's paragraph at 7, and its two characters end at 10.
    expect(setTextSelection).toHaveBeenCalledWith(10);
  });

  it("lands at the end of the clicked cell's text", () => {
    const { editor, setTextSelection } = tableEditor();
    expect(placeCaretInTableCell(editor, { row: 1, column: 1 })).toBe(true);
    expect(setTextSelection).toHaveBeenCalledWith(30);
  });

  it("does nothing when the requested cell no longer exists", () => {
    const { editor, setTextSelection } = tableEditor();
    expect(placeCaretInTableCell(editor, { row: 4, column: 4 })).toBe(false);
    expect(setTextSelection).not.toHaveBeenCalled();
  });

  it("reports back when the editor is not holding the table yet", () => {
    // Which is what lets the caller wait a frame instead of falling through to the
    // end of the table block — its last cell.
    const { editor, focus } = tableEditor({ table: false });
    expect(placeCaretInTableCell(editor, { row: 0, column: 0 })).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });
});
