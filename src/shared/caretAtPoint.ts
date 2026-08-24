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

/**
 * The same placement, made *instead of* the browser's rather than after it — the
 * caller pairs a `true` with `preventDefault()` on the press.
 *
 * Correcting the caret on `click` leaves the browser's own placement on screen
 * until the button comes back up: the caret is drawn at the start of the line and
 * then flicks to the end, and while the button is held it simply sits in the wrong
 * place. Claiming the press before its default action runs means the only caret
 * ever drawn is the right one.
 *
 * Nothing is claimed for a press that lands on a character, which leaves ordinary
 * clicks and drag-selection to the browser.
 */
export function claimCaretBesideText(editor: BlockNoteEditor, point: CaretPoint) {
  const target = caretTargetAtPoint(editor, point);
  if (!target || target.onCharacter) return false;
  editor._tiptapEditor.commands.setTextSelection(target.caret);
  // Focusing the editor is one of the things the prevented press would have done.
  editor._tiptapEditor.view.focus();
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
