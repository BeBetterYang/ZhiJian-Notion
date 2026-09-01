import {
  normalizeRichText,
  type RichTextContent,
  type RichTextMarks,
  type ZhiJianNode,
  type ZhiJianNodeBlock,
  type ZhiJianTableData,
  type ZhiJianTree,
} from "../core/tree";

export type EditingTarget = {
  nodeId: string;
  focusBlockId?: string;
  focusPoint?: { x: number; y: number };
  focusTableCell?: { row: number; column: number };
} | null;

export interface MindMapPointerSession {
  pointerId: number;
  nodeId: string;
  selectedNodeId: string | null;
  startX: number;
  startY: number;
  dragged: boolean;
  /** What the press aimed at, for the click that follows it. */
  press?: MindMapPressTarget;
}

export function updateMindMapPointerSession(
  session: MindMapPointerSession | null,
  pointerId: number,
  x: number,
  y: number,
  threshold = 8,
) {
  if (!session || session.pointerId !== pointerId || session.dragged) return session;
  if (Math.hypot(x - session.startX, y - session.startY) < threshold) return session;
  return { ...session, dragged: true };
}

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
    a.focusPoint?.y === b.focusPoint?.y &&
    a.focusTableCell?.row === b.focusTableCell?.row &&
    a.focusTableCell?.column === b.focusTableCell?.column
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

const GEOMETRY_EDITOR_SELECTOR = [
  '[data-content-type="table"]',
  '[data-content-type="image"]',
  ".tableWrapper",
  ".bn-file-block-content-wrapper",
  "table",
  "img",
].join(", ");

export interface MindMapMeasuredSize {
  width: number;
  height: number;
}

export function unscaledMindMapSize(
  size: MindMapMeasuredSize,
  scale: number,
): MindMapMeasuredSize {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    width: size.width / safeScale,
    height: size.height / safeScale,
  };
}

export function mindMapScaleFromTransform(transform: string, fallback = 1) {
  if (!transform || transform === "none") return fallback;
  const match = /^(matrix|matrix3d)\((.+)\)$/.exec(transform);
  if (!match) return fallback;
  const values = match[2].split(",").map(Number);
  const scale = Math.hypot(values[0], values[1]);
  return Number.isFinite(scale) && scale > 0 ? scale : fallback;
}

export function mindMapMeasuredSizeChanged(
  previous: MindMapMeasuredSize | null,
  next: MindMapMeasuredSize | null,
  tolerance = 0.01,
) {
  if (!previous || !next) return false;
  return Math.abs(previous.width - next.width) > tolerance || Math.abs(previous.height - next.height) > tolerance;
}

export function isMindMapGeometryEditorElement(element: Element | null) {
  if (!element) return false;
  const editor = element.matches(".mindmap-node-editor")
    ? element
    : element.querySelector(".mindmap-node-editor") ?? element.closest(".mindmap-node-editor");
  return Boolean(editor?.querySelector(GEOMETRY_EDITOR_SELECTOR));
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
 * Everything mind-elixir draws *beside* the nodes: the arrow and summary shapes and
 * the labels on them. mind-elixir owns their double click itself — `editArrowLabel`
 * and `editSummary` — and none of them belongs to a node, so `mindMapPressTarget`
 * answers null for them. Without this guard the map's own dblclick handler fell back
 * to the last node press and opened *that* node's editor, which is how editing a
 * summary or a connector label jumped to the previously edited node.
 */
const MINDMAP_ANNOTATION_SELECTOR = [".svg-label", ".topiclinks", ".summary"].join(", ");

export function isMindMapAnnotationTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest(MINDMAP_ANNOTATION_SELECTOR) !== null : false;
}

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

/**
 * MindElixir only starts a node drag when the pointer event targets `me-tpc`
 * itself. The lightweight display fills that topic, so ordinary presses land on
 * nested spans or images. Controls and the edit layer keep their own gestures.
 */
export function mindMapDisplayDragTopic(target: EventTarget | null) {
  if (!(target instanceof Element) || !target.closest(".mindmap-node-display")) return null;
  if (target.closest("a,button,input,select,textarea,[role=checkbox]")) return null;
  return target.closest<HTMLElement>("me-tpc");
}

/**
 * On the canvas while a node is being dragged. It stands the display layer down for
 * hit-testing, because MindElixir looks for the drop target with `elementFromPoint`
 * and accepts nothing but a topic element — see the rule in `styles.css`.
 */
export const MINDMAP_DRAGGING_CLASS = "is-node-dragging";

/**
 * Everything a press on a node's display says about what the user aimed at.
 *
 * Read on the press rather than on the release, because the release cannot be
 * trusted to say it. Handing the press to MindElixir is what lets an unselected
 * node be dragged from its own text (see `mindMapDisplayDragTopic`), and MindElixir
 * captures the pointer on the topic — which retargets the click that follows to
 * `me-tpc`, an element *above* the display. A handler reading the node out of the
 * click's own target therefore found nothing at all and dropped the gesture, which
 * is how clicking a selected node stopped opening its editor.
 */
export interface MindMapPressTarget {
  nodeId: string;
  blockId?: string;
  tableCell?: { row: number; column: number };
  point: { x: number; y: number };
  /** A link or a control, which owns the gesture itself. */
  interactive: boolean;
}

export function mindMapPressTarget(
  target: EventTarget | null,
  point: { x: number; y: number },
): MindMapPressTarget | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(".mindmap-node-editor")) return null;
  const nodeId = target.closest<HTMLElement>(".mindmap-node-shell[data-node-id]")?.dataset.nodeId;
  if (!nodeId) return null;
  const cell = target.closest<HTMLElement>("td[data-table-row][data-table-column]");
  return {
    nodeId,
    blockId: target.closest<HTMLElement>("[data-block-id]")?.dataset.blockId,
    tableCell: cell
      ? { row: Number(cell.dataset.tableRow), column: Number(cell.dataset.tableColumn) }
      : undefined,
    point,
    interactive: Boolean(target.closest("a,button,input,select,textarea,[role=checkbox]")),
  };
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
    marks.cloze ? "c" : "",
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
