import {
  normalizeRichText,
  type RichTextContent,
  type RichTextMarks,
  type ZhiJianNode,
  type ZhiJianNodeBlock,
  type ZhiJianTableData,
  type ZhiJianTree,
} from "../core/tree";

export type EditingTarget = { nodeId: string; focusBlockId?: string; focusPoint?: { x: number; y: number } } | null;

export type DisplayClickAction = "ignore" | "select" | "edit";

export function displayClickAction(
  selectedNodeId: string | null,
  editingTarget: EditingTarget,
  nodeId: string,
  interactiveTarget: boolean,
  clickCount = 1,
): DisplayClickAction {
  if (interactiveTarget || editingTarget?.nodeId === nodeId) return "ignore";
  // A single click anywhere on an already-selected node — its text included —
  // enters editing. This is checked before the repeat-click guard on purpose:
  // selecting and then clicking again is a fast sequence, so the browser reports
  // the second click with `detail === 2`, and deferring it to the dblclick
  // handler made editing look like it needed a real double click.
  if (selectedNodeId === nodeId) return "edit";
  // The second click of a double click on an unselected node is a different
  // story: the first click selected it, so the dblclick handler owns the
  // transition into editing and knows the caret coordinates.
  return clickCount > 1 ? "ignore" : "select";
}

export function shouldExitEditing(editingTarget: EditingTarget, selectedNodeId: string) {
  return editingTarget !== null && editingTarget.nodeId !== selectedNodeId;
}

export function sameEditingTarget(a: EditingTarget, b: EditingTarget) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.nodeId === b.nodeId &&
    a.focusBlockId === b.focusBlockId &&
    a.focusPoint?.x === b.focusPoint?.x &&
    a.focusPoint?.y === b.focusPoint?.y
  );
}

export function mindMapUpdateMode(structureChanged: boolean, editing: boolean) {
  if (!structureChanged) return "content" as const;
  return editing ? "defer-structure" as const : "refresh-structure" as const;
}

export function resolveMindMapFocusBlockId(nodeId: string, availableBlockIds: string[], requestedBlockId?: string) {
  return requestedBlockId && availableBlockIds.includes(requestedBlockId) ? requestedBlockId : nodeId;
}

/**
 * Which part of a node's own text the toolbar should act on.
 *
 * A plain node's toolbar is bound to the hidden outline editor rather than to the
 * editor the text is being typed in — see `outline/mindMapTextSelection.ts` for why
 * — and the outline can only mirror a range it has been told about. The offsets are
 * counted in characters from the start of the node's text, which is the unit both
 * halves of that bridge agree on.
 *
 * Null means the whole node: nothing is selected, or the selection reaches past the
 * node's own text into a quote it carries, and those blocks are formatted by the
 * node's own toolbar instead.
 */
export function nodeTextSelectionOffsets(
  selection: { from: number; to: number },
  nodeTextRange: { from: number; to: number } | null,
) {
  if (!nodeTextRange || selection.from >= selection.to) return null;
  if (selection.from < nodeTextRange.from || selection.to > nodeTextRange.to) return null;
  return { from: selection.from - nodeTextRange.from, to: selection.to - nodeTextRange.from };
}

/**
 * True when Enter must be swallowed by the in-node editor.
 *
 * That editor projects exactly one node, so a second top-level block has nowhere
 * to go: the parse discards it, and any quote or image the split carried along
 * with it is discarded too. Splitting the primary block is therefore never what
 * Enter does here — ending the edit is, which leaves the node selected so that the
 * next Enter adds the following node and Tab adds a child. Carets inside a table
 * cell or an attachment keep the default behaviour, which stays within one block
 * and round-trips cleanly.
 */
export function suppressMindMapEnter(params: {
  nodeId: string;
  blockId: string;
  blockType: string;
  shiftKey: boolean;
}) {
  if (params.shiftKey || params.blockType === "table") return false;
  return params.blockId === params.nodeId;
}

/**
 * How many nodes a collapse handle is keeping out of sight: the whole subtree, not
 * just the row of children, because every one of them is hidden with it.
 */
export function hiddenDescendantCount(tree: Pick<ZhiJianTree, "nodes">, nodeId: string): number {
  const node = tree.nodes[nodeId];
  if (!node) return 0;
  return node.children.reduce((total, childId) => total + 1 + hiddenDescendantCount(tree, childId), 0);
}

/**
 * Whether an edited node's box may leave the map's flow while the edit lasts.
 *
 * mind-elixir lays every node out in normal flow, so typing a character grows the
 * box, pushes the node's own subtree and every later sibling, and costs a full
 * connector relink — per keystroke. `"float"` pins the node's frame at the size it
 * already has and lets the box grow above the map instead, so the layout only
 * settles once, on the way out.
 *
 * Tables and images stay `"live"` on purpose: their geometry is the thing being
 * edited — dragging an image's resize handle, adding a table row — so the map has
 * to follow along while it happens.
 */
export function mindMapEditingLayout(node?: Pick<ZhiJianNode, "type" | "blocks">) {
  if (!node || node.type === "table") return "live" as const;
  return node.blocks?.some((block) => block.type === "image") ? ("live" as const) : ("float" as const);
}

/**
 * Everything mind-elixir renders that a pointer can legitimately land on: nodes,
 * their expand handles, the toolbar, the context menu, the inline input, the link
 * controller handles, the box-select overlay, and arrow/summary shapes.
 */
const MINDMAP_CHROME_SELECTOR = [
  "me-tpc",
  "me-epd",
  ".mindmap-node-shell",
  ".mind-elixir-toolbar",
  ".context-menu",
  "#input-box",
  ".circle",
  ".selection-area",
  ".svg-label",
  ".topiclinks",
  ".summary",
].join(", ");

/**
 * True when a pointer event landed on empty canvas rather than on a node or a
 * control, which is the signal to drop the current selection.
 *
 * mind-elixir cannot answer this for us. It clears its own selection when a drag
 * starts on the blank surface, but the `unselectNodes` bus event is only fired
 * from its box-select move handler, so a plain click on empty canvas leaves the
 * app's selected node untouched.
 */
export function isBlankMindMapSurface(target: EventTarget | null) {
  return target instanceof Element ? target.closest(MINDMAP_CHROME_SELECTOR) === null : false;
}

const UNIT = "\u001f";
const SPAN = "\u001d";
const FIELD = "\u001e";
const CELL = "\u001c";
const ROW = "\u001b";

/**
 * A projection-stable digest of everything the node editor owns.
 *
 * The mindmap editor compares the store node against the node parsed back out
 * of BlockNote to decide whether a change came from the user or from the
 * outside. `JSON.stringify` cannot be used for that: it is sensitive to key
 * order and to representational choices the round trip does not preserve
 * (`spans` vs plain `text`, `undefined` vs a BlockNote default). Any such
 * asymmetry reads as a permanent difference and makes the node reproject — and
 * therefore lose its caret — on every keystroke. This digest normalizes both
 * sides into the same shape so equal documents always compare equal.
 */
export function nodeDocumentSignature(
  node: Pick<ZhiJianNode, "content" | "description" | "blocks" | "type" | "props">,
) {
  return [
    richTextSignature(node.content),
    descriptionSignature(node.description),
    node.type === "table" ? tableSignature(node.props?.table) : "",
    ...(node.blocks ?? []).map(blockSignature),
  ].join(UNIT);
}

function descriptionSignature(description?: RichTextContent) {
  // The store drops a description once its text is blank, so a blank one has to
  // compare equal to a missing one.
  const normalized = description ? normalizeRichText(description) : undefined;
  return normalized?.text.trim() ? richTextSignature(normalized) : "";
}

function richTextSignature(content?: string | RichTextContent) {
  const rich = normalizeRichText(content ?? "");
  const spans = rich.spans?.length ? rich.spans : [{ text: rich.text, marks: rich.marks }];
  return spans.map((span) => `${span.text}${FIELD}${marksSignature(span.marks)}`).join(SPAN);
}

function marksSignature(marks?: RichTextMarks) {
  if (!marks) return "";
  return [
    marks.bold ? "b" : "",
    marks.italic ? "i" : "",
    marks.underline ? "u" : "",
    marks.strike ? "s" : "",
    marks.textColor ?? "",
    marks.backgroundColor ?? "",
    marks.linkUrl ?? "",
  ].join(",");
}

function blockSignature(block: ZhiJianNodeBlock) {
  if (block.type === "quote") {
    return ["q", block.id, richTextSignature(block.content)].join(FIELD);
  }
  const image = block.image;
  // Every default below matches the one the BlockNote projection applies, so an
  // omitted field and its materialized default share a signature.
  return [
    "i",
    block.id,
    image.assetId ?? image.url ?? "",
    image.name ?? "图片",
    image.caption ?? "",
    image.previewWidth ?? 480,
    image.showPreview ?? true,
  ].join(FIELD);
}

function tableSignature(table?: ZhiJianTableData) {
  if (!table) return "";
  const rows = table.rows
    .map((row) => row
      .map((cell) => [
        richTextSignature(cell.content),
        cell.backgroundColor ?? "",
        cell.textColor ?? "",
        cell.textAlignment ?? "",
        cell.colspan ?? 1,
        cell.rowspan ?? 1,
      ].join(","))
      .join(CELL))
    .join(ROW);
  // `columnWidths` is deliberately excluded: BlockNote materializes an entry per
  // column, so a stored `undefined` would never compare equal to it.
  return [rows, table.headerRows ?? 0, table.headerCols ?? 0].join(FIELD);
}
