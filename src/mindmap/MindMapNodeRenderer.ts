import {
  getNodeStyle,
  normalizeRichText,
  richTextToPlainText,
  type RichTextContent,
  type ZhiJianNode,
  type ZhiJianNodeBlock,
  type ZhiJianNodeType,
  type ZhiJianTableCell,
} from "../core/tree";
import { getCachedImageAssetUrl } from "../shared/imageAssetStore";
import { CLOZE_CLASS } from "./mindMapCloze";
import { resolveMindMapTheme, type MindMapTheme } from "./mindMapTheme";

export interface MindMapNodeMetadata {
  type: ZhiJianNodeType;
  plainText: string;
  checked?: boolean;
  hasQuote?: boolean;
  imageCount?: number;
  branchColor?: string;
  level?: number;
}

export interface MindMapNodeVisualStyle {
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  fontStyle?: string;
  color?: string;
  background?: string;
  textDecoration?: string;
  borderColor?: string;
  borderRadius?: string;
  accentColor?: string;
  userColor?: string;
}

export interface MindMapNodeThemeContext {
  theme?: MindMapTheme;
  level?: number;
  branchColor?: string;
  roundedFrames?: boolean;
}

const HEADING_FONT_SIZE = {
  1: "var(--zhijian-type-heading-1-size)",
  2: "var(--zhijian-type-heading-2-size)",
  3: "var(--zhijian-type-heading-3-size)",
} as const;
const BODY_FONT_SIZE = "var(--zhijian-type-body-size)";
const ROOT_FONT_SIZE = "20px";
const ROUNDED_FRAME_RADIUS = "16px";

/**
 * The node box's own typography. Deliberately blind to the text's marks: a mark
 * belongs to the run of text it was applied to, and the box covers the whole text,
 * so reading the first run's marks here dressed the rest of the text in them —
 * bolding a node's first word turned the entire node bold, and one italic run left
 * every following word slanted. Each run wears its own marks instead: the display
 * layer writes them per span below, and BlockNote writes them in the editor.
 */
export function getMindMapNodeVisualStyle(
  node: ZhiJianNode,
  isRoot: boolean,
  context: MindMapNodeThemeContext = {},
): MindMapNodeVisualStyle {
  const style = getNodeStyle(node.props?.style);
  const userStyle = style as typeof style & { borderColor?: string; borderRadius?: string };
  const theme = context.theme ?? resolveMindMapTheme();
  const themed = isRoot
    ? theme.root
    : context.level === 1
      ? theme.level1
      : theme.child;
  const headingLevel = node.type === "heading" ? node.props?.headingLevel ?? 1 : undefined;
  const fontSize = isRoot ? ROOT_FONT_SIZE : headingLevel ? HEADING_FONT_SIZE[headingLevel] : BODY_FONT_SIZE;

  return {
    fontSize,
    lineHeight: isRoot || node.type === "heading"
      ? "var(--zhijian-type-heading-line-height)"
      : "var(--zhijian-type-body-line-height)",
    // Size alone carries the heading levels here; weight is left to the text's own
    // bold mark, so a heading is only heavy when the user made it heavy.
    fontWeight: style.fontWeight ?? (node.type === "heading"
      ? "var(--zhijian-type-heading-weight)"
      : "var(--zhijian-type-body-weight)"),
    fontStyle: style.fontStyle,
    color: style.color ?? themed.text,
    background: style.backgroundColor ?? themed.background,
    textDecoration: style.textDecorationLine || style.textDecoration,
    borderColor: userStyle.borderColor ?? themed.border,
    borderRadius: userStyle.borderRadius
      ?? (context.roundedFrames === undefined ? themed.radius : context.roundedFrames ? ROUNDED_FRAME_RADIUS : "6px"),
    accentColor: context.branchColor ?? theme.connector.color,
    userColor: style.color,
  };
}

export function renderMindMapNodeHtml(
  node: ZhiJianNode,
  isRoot = false,
  searchQuery = "",
  context: MindMapNodeThemeContext = {},
) {
  const id = escapeHtml(node.id);
  const level = isRoot ? 0 : context.level ?? 2;
  return `<div class="mindmap-node-shell" data-node-id="${id}" data-mindmap-level="${level}" style="${renderVisualVariables(getMindMapNodeVisualStyle(node, isRoot, context))}"><div class="mindmap-node-display">${renderMindMapNodeDisplayHtml(node, searchQuery)}</div><div class="mindmap-node-editor-slot" data-zhijian-node-content="${id}"></div></div>`;
}

export function renderMindMapNodeDisplayHtml(node: ZhiJianNode, searchQuery = "") {
  // A node with nothing written in it says what it is for. `renderRichTextHtml`
  // always emits a span, so the empty case is marked here rather than left to
  // `:empty`; `styles.css` turns the marker into the same hint BlockNote's own
  // placeholder shows once the node is being edited.
  const richTextClass = `mindmap-node-rich-text${richTextToPlainText(node.content).trim() ? "" : " is-empty"}`;
  const primary = node.type === "table"
    ? renderTableHtml(node)
    : node.type === "todo"
      ? `<span class="mindmap-node-todo ${node.props?.checked ? "is-checked" : ""}"><input class="mindmap-node-checkbox" data-node-id="${escapeHtml(node.id)}" type="checkbox"${node.props?.checked ? " checked" : ""} tabindex="-1" aria-label="切换待办状态"><span class="${richTextClass}">${renderRichTextHtml(node.content, searchQuery)}</span></span>`
      : `<span class="${richTextClass}">${renderRichTextHtml(node.content, searchQuery)}</span>`;
  const description = node.description
    ? `<div class="mindmap-node-quote mindmap-node-description" data-block-id="${escapeHtml(`${node.id}::description`)}">${renderRichTextHtml(node.description, searchQuery)}</div>`
    : "";
  const quotes = (node.blocks ?? [])
    .filter((block): block is Extract<ZhiJianNodeBlock, { type: "quote" }> => block.type === "quote")
    .map((block) => `<div class="mindmap-node-quote" data-block-id="${escapeHtml(block.id)}">${renderRichTextHtml(block.content, searchQuery)}</div>`)
    .join("");
  const images = (node.blocks ?? [])
    .filter((block): block is Extract<ZhiJianNodeBlock, { type: "image" }> => block.type === "image")
    .map((block) => {
      const url = block.image.assetId ? getCachedImageAssetUrl(block.image.assetId) : block.image.url;
      // The same width BlockNote's resize handles read from and write back to the
      // block, so a picture occupies one box whether it is being edited or not. The
      // fallback matches the one the adapter applies when BlockNote omits it.
      const width = ` style="width:${block.image.previewWidth ?? 480}px"`;
      return `<div class="mindmap-node-image" data-block-id="${escapeHtml(block.id)}"${width}>${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(block.image.name ?? "图片")}">` : "图片"}</div>`;
    })
    .join("");
  return `<div class="mindmap-node-renderer" data-node-id="${escapeHtml(node.id)}"><div class="mindmap-node-body"><div class="mindmap-node-primary">${primary}</div>${description}${quotes}${images ? `<div class="mindmap-node-images">${images}</div>` : ""}</div></div>`;
}

export function applyMindMapVisualVariables(element: HTMLElement, style: MindMapNodeVisualStyle) {
  element.style.setProperty("--mindmap-font-size", style.fontSize);
  element.style.setProperty("--mindmap-line-height", style.lineHeight);
  element.style.setProperty("--mindmap-font-weight", style.fontWeight);
  setOptionalVariable(element, "--mindmap-font-style", style.fontStyle);
  setOptionalVariable(element, "--mindmap-color", style.color);
  setOptionalVariable(element, "--mindmap-background", style.background);
  setOptionalVariable(element, "--mindmap-text-decoration", style.textDecoration);
  setOptionalVariable(element, "--mindmap-border-color", style.borderColor);
  setOptionalVariable(element, "--mindmap-border-radius", style.borderRadius);
  setOptionalVariable(element, "--mindmap-accent-color", style.accentColor);
  setOptionalVariable(element, "--mindmap-user-color", style.userColor);
}

function renderTableHtml(node: ZhiJianNode) {
  const rows = node.props?.table?.rows ?? [];
  const body = rows.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => `<td data-table-row="${rowIndex}" data-table-column="${columnIndex}"${renderCellAttributes(cell)}>${renderRichTextHtml(cell.content)}</td>`).join("")}</tr>`).join("");
  return `<div class="mindmap-node-table"><table>${renderColumnGroupHtml(node, rows[0]?.length ?? 0)}<tbody>${body}</tbody></table>${rows.length ? "" : "表格"}</div>`;
}

/**
 * The column widths a resize left behind, in the same `<colgroup>` prosemirror-tables
 * builds from its `colwidth` attributes. Without it a dragged column snapped back to
 * its content width the moment the editor closed, which also resized the node box —
 * the display layer is what mind-elixir measures at rest. Columns nobody has touched
 * are left width-less on both sides, so they keep wrapping at
 * `--mindmap-table-cell-max-width`.
 */
function renderColumnGroupHtml(node: ZhiJianNode, columnCount: number) {
  const widths = node.props?.table?.columnWidths ?? [];
  if (!columnCount || !widths.some((width) => typeof width === "number" && width > 0)) return "";
  const columns = Array.from({ length: columnCount }, (_, index) => {
    const width = widths[index];
    return `<col${typeof width === "number" && width > 0 ? ` style="width:${width}px"` : ""}>`;
  });
  return `<colgroup>${columns.join("")}</colgroup>`;
}

/**
 * A cell keeps its colour and alignment under BlockNote's own names for them, and
 * BlockNote's stylesheet paints `[data-background-color]`, `[data-text-color]` and
 * `[data-text-alignment]` document-wide. Repeating the attributes here is what keeps
 * a coloured cell looking the same once the editor closes — without the display
 * layer holding a second copy of the palette.
 */
function renderCellAttributes(cell: ZhiJianTableCell) {
  return [
    cell.backgroundColor ? ` data-background-color="${escapeHtml(cell.backgroundColor)}"` : "",
    cell.textColor ? ` data-text-color="${escapeHtml(cell.textColor)}"` : "",
    cell.textAlignment ? ` data-text-alignment="${escapeHtml(cell.textAlignment)}"` : "",
  ].join("");
}

function renderRichTextHtml(content: RichTextContent, searchQuery = "") {
  const normalized = normalizeRichText(content);
  const spans = normalized.spans?.length ? normalized.spans : [{ text: normalized.text, marks: normalized.marks }];
  return spans.map((span) => {
    const style = [
      span.marks?.bold ? "font-weight:700" : "",
      span.marks?.italic ? "font-style:italic" : "",
      span.marks?.underline || span.marks?.strike
        ? `text-decoration:${[span.marks.underline ? "underline" : "", span.marks.strike ? "line-through" : ""].filter(Boolean).join(" ")}`
        : "",
      colorDeclaration("color", span.marks?.textColor),
      colorDeclaration("background", span.marks?.backgroundColor),
    ].filter(Boolean).join(";");
    const attributes = `${paletteAttribute("data-text-color", span.marks?.textColor)}${paletteAttribute("data-background-color", span.marks?.backgroundColor)}${style ? ` style="${style}"` : ""}`;
    // 挖空: the run keeps its place — the text is only made invisible, so revealing
    // it cannot resize the node box or move the branch. The class is all the display
    // layer says about it; whether it is currently revealed is a class the click
    // handler toggles on this element. See `mindMapCloze.ts`.
    const clozeClass = span.marks?.cloze ? ` class="${CLOZE_CLASS}"` : "";
    const inner = `<span${clozeClass}${attributes}>${renderHighlightedText(span.text, searchQuery)}</span>`;
    return span.marks?.linkUrl ? `<a href="${escapeHtml(span.marks.linkUrl)}" target="_blank" rel="noreferrer">${inner}</a>` : inner;
  }).join("");
}

function renderHighlightedText(text: string, searchQuery: string) {
  const query = searchQuery.trim();
  if (!query) return escapeHtml(text);
  const lower = text.toLocaleLowerCase("zh-CN");
  const needle = query.toLocaleLowerCase("zh-CN");
  let cursor = 0;
  let html = "";
  while (cursor < text.length) {
    const index = lower.indexOf(needle, cursor);
    if (index < 0) break;
    html += escapeHtml(text.slice(cursor, index));
    html += `<mark class="zhijian-search-mark">${escapeHtml(text.slice(index, index + needle.length))}</mark>`;
    cursor = index + needle.length;
  }
  return html + escapeHtml(text.slice(cursor));
}

/**
 * The colours BlockNote offers, which it stores by name and paints from its own
 * palette. A name is handed straight back to it as an attribute, so a coloured run
 * of text is the same colour here as it is in the outline and in the node's editor —
 * writing `color: blue` instead would have painted the map pure blue where every
 * other view shows BlockNote's #0b6e99. Anything that is not one of these names is
 * a plain CSS colour and is written as one.
 */
const PALETTE_COLOR_NAMES = new Set([
  "gray",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
]);

function paletteAttribute(name: "data-text-color" | "data-background-color", value: string | undefined) {
  return value && PALETTE_COLOR_NAMES.has(value) ? ` ${name}="${value}"` : "";
}

function colorDeclaration(property: "color" | "background", value: string | undefined) {
  return value && !PALETTE_COLOR_NAMES.has(value) ? `${property}:${escapeHtml(value)}` : "";
}

function renderVisualVariables(style: MindMapNodeVisualStyle) {
  return [
    `--mindmap-font-size:${style.fontSize}`,
    `--mindmap-line-height:${style.lineHeight}`,
    `--mindmap-font-weight:${style.fontWeight}`,
    style.fontStyle ? `--mindmap-font-style:${escapeHtml(style.fontStyle)}` : "",
    style.color ? `--mindmap-color:${escapeHtml(style.color)}` : "",
    style.background ? `--mindmap-background:${escapeHtml(style.background)}` : "",
    style.textDecoration ? `--mindmap-text-decoration:${escapeHtml(style.textDecoration)}` : "",
    style.borderColor ? `--mindmap-border-color:${escapeHtml(style.borderColor)}` : "",
    style.borderRadius ? `--mindmap-border-radius:${escapeHtml(style.borderRadius)}` : "",
    style.accentColor ? `--mindmap-accent-color:${escapeHtml(style.accentColor)}` : "",
    style.userColor ? `--mindmap-user-color:${escapeHtml(style.userColor)}` : "",
  ].filter(Boolean).join(";");
}

function setOptionalVariable(element: HTMLElement, name: string, value?: string) {
  if (value) element.style.setProperty(name, value);
  else element.style.removeProperty(name);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
