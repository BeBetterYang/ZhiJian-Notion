import {
  firstMarks,
  getNodeStyle,
  normalizeRichText,
  type RichTextContent,
  type ZhiJianNode,
  type ZhiJianNodeBlock,
  type ZhiJianNodeType,
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

export function getMindMapNodeVisualStyle(node: ZhiJianNode, isRoot: boolean): MindMapNodeVisualStyle {
  const style = getNodeStyle(node.props?.style);
  const marks = firstMarks(node.content);
  const headingLevel = node.type === "heading" ? node.props?.headingLevel ?? 1 : undefined;
  const fontSize = isRoot || headingLevel === 1
    ? "20px"
    : headingLevel === 2
      ? "18px"
      : "16px";
  const decorations = [marks?.underline ? "underline" : "", marks?.strike ? "line-through" : ""]
    .filter(Boolean)
    .join(" ");

  return {
    fontSize,
    lineHeight: isRoot || node.type === "heading" ? "1.4" : "1.5",
    fontWeight: isRoot || node.type === "heading" || marks?.bold ? "700" : style.fontWeight ?? "400",
    fontStyle: marks?.italic ? "italic" : style.fontStyle,
    color: marks?.textColor ?? style.color,
    background: marks?.backgroundColor ?? style.backgroundColor,
    textDecoration: decorations || style.textDecorationLine || style.textDecoration,
  };
}

export function renderMindMapNodeHtml(node: ZhiJianNode, isRoot = false) {
  const id = escapeHtml(node.id);
  return `<div class="mindmap-node-shell" data-node-id="${id}" style="${renderVisualVariables(getMindMapNodeVisualStyle(node, isRoot))}"><div class="mindmap-node-display">${renderMindMapNodeDisplayHtml(node)}</div><div class="mindmap-node-editor-slot" data-zhijian-node-content="${id}"></div></div>`;
}

export function renderMindMapNodeDisplayHtml(node: ZhiJianNode) {
  const primary = node.type === "table"
    ? renderTableHtml(node)
    : node.type === "todo"
      ? `<span class="mindmap-node-todo ${node.props?.checked ? "is-checked" : ""}"><span class="mindmap-node-checkbox" data-node-id="${escapeHtml(node.id)}" role="checkbox" aria-checked="${node.props?.checked ? "true" : "false"}">${node.props?.checked ? "✓" : ""}</span><span class="mindmap-node-rich-text">${renderRichTextHtml(node.content)}</span></span>`
      : `<span class="mindmap-node-rich-text">${renderRichTextHtml(node.content)}</span>`;
  const description = node.description
    ? `<div class="mindmap-node-quote mindmap-node-description" data-block-id="${escapeHtml(`${node.id}::description`)}">${renderRichTextHtml(node.description)}</div>`
    : "";
  const quotes = (node.blocks ?? [])
    .filter((block): block is Extract<ZhiJianNodeBlock, { type: "quote" }> => block.type === "quote")
    .map((block) => `<div class="mindmap-node-quote" data-block-id="${escapeHtml(block.id)}">${renderRichTextHtml(block.content)}</div>`)
    .join("");
  const images = (node.blocks ?? [])
    .filter((block): block is Extract<ZhiJianNodeBlock, { type: "image" }> => block.type === "image")
    .map((block) => {
      const url = block.image.assetId ? getCachedImageAssetUrl(block.image.assetId) : block.image.url;
      return `<div class="mindmap-node-image" data-block-id="${escapeHtml(block.id)}">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(block.image.name ?? "图片")}">` : "图片"}</div>`;
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
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${renderRichTextHtml(cell.content)}</td>`).join("")}</tr>`).join("");
  return `<div class="mindmap-node-table"><table><tbody>${body}</tbody></table>${rows.length ? "" : "表格"}</div>`;
}

function renderRichTextHtml(content: RichTextContent) {
  const normalized = normalizeRichText(content);
  const spans = normalized.spans?.length ? normalized.spans : [{ text: normalized.text, marks: normalized.marks }];
  return spans.map((span) => {
    const style = [
      span.marks?.bold ? "font-weight:700" : "",
      span.marks?.italic ? "font-style:italic" : "",
      span.marks?.underline || span.marks?.strike
        ? `text-decoration:${[span.marks.underline ? "underline" : "", span.marks.strike ? "line-through" : ""].filter(Boolean).join(" ")}`
        : "",
      span.marks?.textColor ? `color:${escapeHtml(span.marks.textColor)}` : "",
      span.marks?.backgroundColor ? `background:${escapeHtml(span.marks.backgroundColor)}` : "",
    ].filter(Boolean).join(";");
    const inner = `<span${style ? ` style="${style}"` : ""}>${escapeHtml(span.text)}</span>`;
    return span.marks?.linkUrl ? `<a href="${escapeHtml(span.marks.linkUrl)}" target="_blank" rel="noreferrer">${inner}</a>` : inner;
  }).join("");
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
