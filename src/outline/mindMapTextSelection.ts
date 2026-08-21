import type { MindMapTextSelection } from "../mindmap/MindMapEditor";

// This module owns the two-way "text-selection offset" bridge between the two
// editors. In the mindmap a plain node is edited by mind-elixir's native
// contenteditable (#input-box), but the formatting toolbar it shows is bound to
// the *hidden* outline BlockNote instance. To make the toolbar act on the right
// range, the native DOM selection is mirrored into the outline editor:
//
//   textOffset  — half 1: DOM point in #input-box  -> visible-text char offset
//   resolveMindMapTextRange — half 2: char offset  -> absolute BlockNote range
//
// INVARIANT: both halves must count the SAME unit — visible text characters from
// the start of the node's content. resolveMindMapTextRange adds the offset
// straight onto blockRange.from, and BlockNote/ProseMirror positions advance one
// per visible character. If textOffset ever counted DOM nodes, markup, or node
// chrome instead of visible characters, rich nodes (bold spans, links) would
// desync and the toolbar would format the wrong range. Keep the two in lockstep;
// the tests in this module's spec lock that agreement.

interface TextRange {
  from: number;
  to: number;
}

/**
 * Visible-text character offset of a DOM point (node, offset) measured from the
 * start of `root`. Markup between the two points does not count — only the text
 * a user can see — which is exactly what resolveMindMapTextRange expects.
 */
export function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function resolveMindMapTextRange(
  blockId: string,
  blockRange: TextRange,
  selection: MindMapTextSelection | null,
): TextRange {
  if (!selection || selection.nodeId !== blockId) {
    return blockRange;
  }

  const startOffset = Math.min(selection.from, selection.to);
  const endOffset = Math.max(selection.from, selection.to);

  return {
    from: clamp(blockRange.from + startOffset, blockRange.from, blockRange.to),
    to: clamp(blockRange.from + endOffset, blockRange.from, blockRange.to),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
