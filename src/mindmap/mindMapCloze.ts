import { normalizeRichText, type RichTextContent, type ZhiJianTree } from "../core/tree";

/**
 * 挖空 (cloze) on the map: text that is there but not shown.
 *
 * The mark itself lives on the span — see `RichTextMarks.cloze` — and everything in
 * this file is about the map's side of it: which runs are hidden, whether the
 * document has any at all, and which of them a pointer landed on. Whether a single
 * cloze is currently revealed is deliberately *not* stored in the tree: it is a
 * reading state, not a property of the document, so it lives on the element as a
 * class and resets whenever the map is redrawn.
 */
export const CLOZE_CLASS = "mindmap-cloze";
export const CLOZE_REVEALED_CLASS = "is-revealed";
/** On the canvas, while 一键显示 is on: every cloze reads as revealed. */
export const CLOZE_REVEAL_ALL_CLASS = "is-cloze-revealed";

export function treeHasClozeContent(tree: Pick<ZhiJianTree, "nodes">) {
  return Object.values(tree.nodes).some((node) => {
    if (hasClozeSpan(node.content) || hasClozeSpan(node.description)) return true;
    if ((node.blocks ?? []).some((block) => block.type === "quote" && hasClozeSpan(block.content))) return true;
    return (node.props?.table?.rows ?? []).some((row) => row.some((cell) => hasClozeSpan(cell.content)));
  });
}

function hasClozeSpan(content?: RichTextContent) {
  if (!content) return false;
  const rich = normalizeRichText(content);
  if (rich.marks?.cloze) return true;
  return (rich.spans ?? []).some((span) => span.marks?.cloze);
}

/**
 * The cloze a press landed on, if any — the one gesture that must work whether the
 * node is selected or not, and must never turn into a selection or an edit.
 *
 * A cloze inside a link is left to the link: following it is what a reader expects
 * of blue underlined text they can click, and the run is still revealed by the
 * 一键显示 button.
 */
export function clozeAtEvent(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  if (target.closest("a,button,input,select,textarea")) return null;
  // Only at rest: while the node is being edited the same run is BlockNote's to
  // handle, and a click there is placing a caret.
  if (target.closest(".mindmap-node-editor")) return null;
  return target.closest<HTMLElement>(`.${CLOZE_CLASS}`);
}

export function toggleClozeReveal(element: HTMLElement) {
  element.classList.toggle(CLOZE_REVEALED_CLASS);
}
