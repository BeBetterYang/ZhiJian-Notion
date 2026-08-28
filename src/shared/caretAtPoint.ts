import type { BlockNoteEditor } from "@blocknote/core";

export interface CaretPoint {
  x: number;
  y: number;
}

/**
 * Which document position a click's coordinates name.
 *
 * A line of text is only as wide as itself while the row around it fills whatever
 * space it is given — the full width of the outline, the width of the picture a
 * mindmap node holds — so a click beside a short line lands on the row and on no
 * character at all. The browser answers that with the block element rather than a
 * text node, and turns it into the *start* of the line, which is the one place the
 * click cannot have meant. Landing in a line without naming a character means its
 * end; landing in no line at all (beside an image, between blocks) is left to the
 * caller.
 */
export function caretPositionAtPoint(params: {
  position: number;
  onCharacter: boolean;
  lineEnd: number | null;
}) {
  return params.onCharacter ? params.position : params.lineEnd;
}

/**
 * Places the caret at viewport coordinates. Returns false when they name no
 * position in the text, which leaves the caller to decide where the caret goes.
 */
export function placeCaretAtPoint(editor: BlockNoteEditor, point?: CaretPoint) {
  const target = point ? caretTargetAtPoint(editor, point) : null;
  if (!target) return false;
  editor._tiptapEditor.commands.setTextSelection(target.caret);
  return true;
}

/**
 * Places the caret in the table cell the click landed on, at the end of its text.
 *
 * The cell comes from the map's lightweight preview of the table, which is what the
 * click was taken on — the editor only exists afterwards, and lays its own table out
 * to its own column widths, so the coordinates name the cell reliably and a position
 * within the cell's text not at all. Appending is the project's rule for a click
 * that names no character, and it is what the user is about to do in a cell.
 */
export function placeCaretInTableCell(
  editor: BlockNoteEditor,
  cell?: { row: number; column: number },
) {
  if (!cell) return false;
  const view = editor._tiptapEditor.view;
  try {
    const caret = tableCellTextEnd(view.state.doc, cell);
    if (caret === null) return false;
    // Focus first. Focusing is itself something the browser and BlockNote each
    // answer with a caret of their own — over a table document that caret is its
    // last cell, which is where the caret used to end up — so a selection set
    // before the focus is simply overwritten by it.
    view.focus();
    editor._tiptapEditor.commands.setTextSelection(caret);
    return true;
  } catch {
    return false;
  }
}

type ProseMirrorNode = BlockNoteEditor["prosemirrorState"]["doc"];

/**
 * Where a cell's text ends, counted through the document rather than measured off
 * the rendered table.
 *
 * Reading the cell out of the DOM meant depending on both the moment BlockNote
 * paints its table — a frame later than the editor exists, and the caret placement
 * silently fell through to the end of the *table block*, which is its last cell —
 * and on the markup it paints, which puts header rows in `th` and is free to wrap
 * rows in a `thead` that would throw `nth-child` off by a row. The document has the
 * rows and cells in it as soon as the editor does, and counts them exactly once.
 */
function tableCellTextEnd(doc: ProseMirrorNode, cell: { row: number; column: number }) {
  let caret: number | null = null;
  doc.descendants((node, position) => {
    if (caret !== null) return false;
    if (node.type.name !== "table") return true;
    caret = cellTextEndWithin(doc, node, position, cell);
    return false;
  });
  return caret;
}

function cellTextEndWithin(
  doc: ProseMirrorNode,
  table: ProseMirrorNode,
  tablePosition: number,
  cell: { row: number; column: number },
) {
  if (cell.row >= table.childCount) return null;
  // A node's position plus its size is the position of the next one, so walking the
  // rows and then the cells before the target is what names it.
  let rowPosition = tablePosition + 1;
  for (let index = 0; index < cell.row; index += 1) rowPosition += table.child(index).nodeSize;
  const row = table.child(cell.row);
  if (cell.column >= row.childCount) return null;
  let cellPosition = rowPosition + 1;
  for (let index = 0; index < cell.column; index += 1) cellPosition += row.child(index).nodeSize;
  const target = row.child(cell.column);
  // A cell holds its text in a paragraph, so the caret belongs one level further in
  // than the cell itself; a cell that holds inline content directly does not.
  const inside = cellPosition + (target.firstChild?.isTextblock ? 2 : 1);
  const resolved = doc.resolve(Math.min(inside, doc.content.size - 1));
  return resolved.parent.isTextblock ? resolved.end() : resolved.pos;
}

/**
 * The same placement, run once the browser has had its say.
 *
 * Moving the caret is the *default action* of a click, and a default action runs
 * after every handler of the events leading up to it — so a caret placed on
 * pointerdown or mousedown is overwritten again before the button is even
 * released. `click` is the first moment the browser is finished, which makes it
 * the only place where the position a click actually meant can be made to stick.
 *
 * A click that ended a drag is left alone: the text it selected is the point of
 * it, and so is the word a double click picked out.
 */
export function correctCaretAfterClick(editor: BlockNoteEditor, point: CaretPoint) {
  if (document.getSelection()?.isCollapsed === false) return;
  placeCaretAtPoint(editor, point);
}

/** Returns the line-end position only when the point is beside, not on, text. */
export function caretPositionBesideText(editor: BlockNoteEditor, point: CaretPoint) {
  const target = caretTargetAtPoint(editor, point);
  return !target || target.onCharacter ? null : target.caret;
}

/** Extends a text selection from a previously resolved line-end anchor. */
export function extendSelectionFromCaret(
  editor: BlockNoteEditor,
  anchor: number,
  point: CaretPoint,
) {
  const position = editor._tiptapEditor.view.posAtCoords({
    left: point.x,
    top: point.y,
  });
  if (!position) return false;
  editor._tiptapEditor.commands.setTextSelection({ from: anchor, to: position.pos });
  return true;
}

function caretTargetAtPoint(editor: BlockNoteEditor, point: CaretPoint) {
  const view = editor._tiptapEditor.view;
  const position = view.posAtCoords({ left: point.x, top: point.y });
  if (!position) return null;
  const resolved = view.state.doc.resolve(position.pos);
  const onCharacter = isOnCharacter(point);
  const caret = caretPositionAtPoint({
    position: position.pos,
    onCharacter,
    lineEnd: resolved.parent.isTextblock ? resolved.end() : null,
  });
  return caret === null ? null : { caret, onCharacter };
}

/**
 * Whether the point sits on a character rather than on the empty part of a row.
 *
 * The browser answers this by what it puts under the point: a text node when the
 * coordinates fall within the text, and the containing element when they fall
 * beside it.
 */
function isOnCharacter(point: CaretPoint) {
  const node = document.caretPositionFromPoint
    ? document.caretPositionFromPoint(point.x, point.y)?.offsetNode
    : document.caretRangeFromPoint?.(point.x, point.y)?.startContainer;
  return node?.nodeType === Node.TEXT_NODE;
}
