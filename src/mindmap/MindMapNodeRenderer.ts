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

export interface MindMapNodeMetadata {
  type: ZhiJianNodeType;
  plainText: string;
  checked?: boolean;
  hasQuote?: boolean;
  imageCount?: number;
}

export interface MindMapNodeVisualStyle {
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  fontStyle?: string;
  color?: string;
  background?: string;
  textDecoration?: string;
}

/**
 * The heading scale, keyed by level. It is deliberately flat — a map reads as a
 * shape first, and headings that tower over the body text break that shape. The
 * root carries the level-1 size, since it is the document title, and everything
 * that is not a heading sits at the body size. Both the display layer and the
 * in-node editor read this through `--mindmap-font-size`, so a node cannot change
 * size when it starts being edited.
 */
const HEADING_FONT_SIZE = { 1: "20px", 2: "18px", 3: "17px" } as const;
const BODY_FONT_SIZE = "16px";

/**
 * The node box's own typography. Deliberately blind to the text's marks: a mark
 * belongs to the run of text it was applied to, and the box covers the whole text,
 * so reading the first run's marks here dressed the rest of the text in them —
 * bolding a node's first word turned the entire node bold, and one italic run left
 * every following word slanted. Each run wears its own marks instead: the display
 * layer writes them per span below, and BlockNote writes them in the editor.
 */
export function getMindMapNodeVisualStyle(node: ZhiJianNode, isRoot: boolean): MindMapNodeVisualStyle {
  const style = getNodeStyle(node.props?.style);
  const headingLevel = node.type === "heading" ? node.props?.headingLevel ?? 1 : undefined;
  const fontSize = isRoot ? HEADING_FONT_SIZE[1] : headingLevel ? HEADING_FONT_SIZE[headingLevel] : BODY_FONT_SIZE;

  return {
    fontSize,
    lineHeight: isRoot || node.type === "heading" ? "1.4" : "1.5",
    // Size alone carries the heading levels here; weight is left to the text's own
    // bold mark, so a heading is only heavy when the user made it heavy.
    fontWeight: style.fontWeight ?? "400",
    fontStyle: style.fontStyle,
    color: style.color,
    background: style.backgroundColor,
    textDecoration: style.textDecorationLine || style.textDecoration,
  };
}

export function renderMindMapNodeHtml(node: ZhiJianNode, isRoot = false, searchQuery = "") {
  const id = escapeHtml(node.id);
  return `<div class="mindmap-node-shell" data-node-id="${id}" style="${renderVisualVariables(getMindMapNodeVisualStyle(node, isRoot))}"><div class="mindmap-node-display">${renderMindMapNodeDisplayHtml(node, searchQuery)}</div><div class="mindmap-node-editor-slot" data-zhijian-node-content="${id}"></div></div>`;
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
      ? `<span class="mindmap-node-todo ${node.props?.checked ? "is-checked" : ""}"><span class="mindmap-node-checkbox" data-node-id="${escapeHtml(node.id)}" role="checkbox" aria-checked="${node.props?.checked ? "true" : "false"}">${node.props?.checked ? "✓" : ""}</span><span class="${richTextClass}">${renderRichTextHtml(node.content, searchQuery)}</span></span>`
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
}

function renderTableHtml(node: ZhiJianNode) {
  const rows = node.props?.table?.rows ?? [];
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td${renderCellAttributes(cell)}>${renderRichTextHtml(cell.content)}</td>`).join("")}</tr>`).join("");
  return `<div class="mindmap-node-table"><table><tbody>${body}</tbody></table>${rows.length ? "" : "表格"}</div>`;
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
    const inner = `<span${attributes}>${renderHighlightedText(span.text, searchQuery)}</span>`;
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
  ].filter(Boolean).join(";");
}

function setOptionalVariable(element: HTMLElement, name: string, value?: string) {
  if (value) element.style.setProperty(name, value);
  else element.style.removeProperty(name);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
