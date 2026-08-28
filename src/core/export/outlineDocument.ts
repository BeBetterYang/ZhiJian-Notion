import {
  getNodeStyle,
  normalizeRichText,
  richTextToPlainText,
  type RichTextContent,
  type ZhiJianImageData,
  type ZhiJianNode,
  type ZhiJianTableData,
  type ZhiJianTree,
} from "../tree";
import { getCachedImageAssetUrl } from "../../shared/imageAssetStore";

export function outlineExportTitle(tree: ZhiJianTree) {
  return richTextToPlainText(tree.nodes[tree.rootId]?.content ?? { text: "" }).trim() || "无标题";
}

export function outlineExportFileName(tree: ZhiJianTree, suffix: string) {
  const title = outlineExportTitle(tree).replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  return `${title}-${suffix}`;
}

export async function treeToOutlineHtmlDocument(tree: ZhiJianTree, word = false) {
  const root = tree.nodes[tree.rootId];
  if (!root) throw new Error("文档根节点不存在。");
  const imageUrls = await resolveDocumentImageUrls(tree);
  const body = [
    `<main class="document">`,
    `<h1>${renderRichText(root.content)}</h1>`,
    renderNodeExtras(root, imageUrls),
    root.children.length ? `<ul class="outline">${root.children.map((id) => renderNode(tree, id, imageUrls)).join("")}</ul>` : "",
    `</main>`,
  ].join("");
  const title = escapeHtml(outlineExportTitle(tree));
  const namespaces = word
    ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"'
    : "";
  return `<!doctype html><html${namespaces} lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${OUTLINE_EXPORT_CSS}</style></head><body>${body}</body></html>`;
}

function renderNode(tree: ZhiJianTree, nodeId: string, imageUrls: Map<string, string>): string {
  const node = tree.nodes[nodeId];
  if (!node) return "";
  const primary = node.type === "table"
    ? renderTable(node.props?.table)
    : `<div class="node-primary ${node.type}">${node.type === "todo" ? `<span class="todo-box">${node.props?.checked ? "✓" : ""}</span>` : ""}${renderRichText(node.content, node)}</div>`;
  // The row's kind travels on the `li`, not just on the text: the bullet and the
  // indent guide are drawn there, and where they sit depends on how tall the row's
  // first line is — a level-1 heading's bullet is far lower than a body row's.
  const rowClass = node.type === "heading"
    ? `row heading-${node.props?.headingLevel ?? 1}`
    : `row ${node.type}`;
  return `<li class="${rowClass}">${primary}${renderNodeExtras(node, imageUrls)}${node.children.length ? `<ul>${node.children.map((id) => renderNode(tree, id, imageUrls)).join("")}</ul>` : ""}</li>`;
}

function renderNodeExtras(node: ZhiJianNode, imageUrls: Map<string, string>) {
  const blocks = [
    node.description ? `<blockquote>${renderRichText(node.description)}</blockquote>` : "",
    ...(node.blocks ?? []).map((block) => {
      if (block.type === "quote") return `<blockquote>${renderRichText(block.content)}</blockquote>`;
      const src = imageUrls.get(block.id) ?? "";
      if (!src) return "";
      const caption = block.image.caption?.trim();
      return `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(block.image.name ?? "图片")}">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
    }),
  ].filter(Boolean);
  return blocks.length ? `<div class="node-extras">${blocks.join("")}</div>` : "";
}

function renderRichText(content: RichTextContent, node?: ZhiJianNode) {
  const normalized = normalizeRichText(content);
  const spans = normalized.spans?.length ? normalized.spans : [{ text: normalized.text, marks: normalized.marks }];
  const nodeStyle = node ? getNodeStyle(node.props?.style) : undefined;
  return spans.map((span) => {
    const marks = span.marks;
    const decorations = [
      marks?.underline || nodeStyle?.textDecoration?.includes("underline") || nodeStyle?.textDecorationLine?.includes("underline") ? "underline" : "",
      marks?.strike || nodeStyle?.textDecoration?.includes("line-through") || nodeStyle?.textDecorationLine?.includes("line-through") ? "line-through" : "",
    ].filter(Boolean);
    const styles = [
      marks?.textColor && marks.textColor !== "default" ? `color:${exportColor(marks.textColor)}` : nodeStyle?.color ? `color:${exportColor(nodeStyle.color)}` : "",
      marks?.backgroundColor && marks.backgroundColor !== "default" ? `background-color:${exportColor(marks.backgroundColor)}` : nodeStyle?.backgroundColor ? `background-color:${exportColor(nodeStyle.backgroundColor)}` : "",
      marks?.bold || nodeStyle?.fontWeight === "700" ? "font-weight:700" : "",
      marks?.italic || nodeStyle?.fontStyle === "italic" ? "font-style:italic" : "",
      decorations.length ? `text-decoration-line:${decorations.join(" ")}` : "",
    ].filter(Boolean).join(";");
    const text = escapeHtml(span.text).replaceAll("\n", "<br>") || "&nbsp;";
    const styled = styles ? `<span style="${escapeAttribute(styles)}">${text}</span>` : text;
    const link = marks?.linkUrl ?? nodeStyle?.linkUrl;
    return link ? `<a href="${escapeAttribute(link)}">${styled}</a>` : styled;
  }).join("");
}

function renderTable(table?: ZhiJianTableData) {
  if (!table?.rows.length) return '<table><tbody><tr><td>&nbsp;</td></tr></tbody></table>';
  return `<table><tbody>${table.rows.map((row, rowIndex) => `<tr>${row.map((cell) => {
    const tag = rowIndex < (table.headerRows ?? 0) ? "th" : "td";
    const styles = [
      cell.backgroundColor && cell.backgroundColor !== "default" ? `background-color:${exportColor(cell.backgroundColor)}` : "",
      cell.textColor && cell.textColor !== "default" ? `color:${exportColor(cell.textColor)}` : "",
      cell.textAlignment ? `text-align:${cell.textAlignment}` : "",
    ].filter(Boolean).join(";");
    return `<${tag}${cell.colspan ? ` colspan="${cell.colspan}"` : ""}${cell.rowspan ? ` rowspan="${cell.rowspan}"` : ""}${styles ? ` style="${escapeAttribute(styles)}"` : ""}>${renderRichText(cell.content)}</${tag}>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
}

async function resolveDocumentImageUrls(tree: ZhiJianTree) {
  const entries = Object.values(tree.nodes).flatMap((node) => (node.blocks ?? []).flatMap((block) => block.type === "image" ? [[block.id, block.image] as const] : []));
  const resolved = await Promise.all(entries.map(async ([blockId, image]) => [blockId, await embeddableImageUrl(image)] as const));
  return new Map(resolved.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}

async function embeddableImageUrl(image: ZhiJianImageData) {
  const source = image.assetId ? getCachedImageAssetUrl(image.assetId) : image.url ?? "";
  if (!source || source.startsWith("data:")) return source;
  try {
    const response = await fetch(source);
    if (!response.ok) return source;
    return await blobToDataUrl(await response.blob());
  } catch {
    return source;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function exportColor(value: string) {
  return EXPORT_COLORS[value] ?? value;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

const EXPORT_COLORS: Record<string, string> = {
  gray: "#787774", red: "#e03e3e", orange: "#d9730d", yellow: "#dfab01", green: "#0f7b6c", blue: "#0b6e99", purple: "#6940a5", pink: "#ad1a72",
  lightGray: "#f1f1ef", lightRed: "#fbe4e4", lightOrange: "#faebdd", lightYellow: "#fbf3db", lightGreen: "#ddedea", lightBlue: "#ddebf1", lightPurple: "#eae4f2", lightPink: "#f4dfeb",
};

/**
 * The exported page is meant to read as the outline does on screen, so the parts a
 * reader recognises are carried over rather than approximated: the heading sizes,
 * the 6px bullet, and the indent guide that starts on the parent's first line — a
 * line-height below its bullet — and ends with the last line of its last child.
 *
 * The line is one gradient per parent, running the full height of everything nested
 * under it, and the stretch below the last child's own text is painted back out in
 * white: that child's note, pictures and children are guided by its own line, one
 * level to the right. The erasers reach a few pixels past their boxes so the margins
 * between them do not let the line show through.
 *
 * `--dot` is that bullet's centre, measured down from the row's top: `0.775em` of
 * the row's own font size, which is half of the 1.55 line height. It cannot be
 * written as an `em` on the list item, because the item's font size is the body's —
 * only the text inside it is a heading — so each row kind carries the number.
 */
const OUTLINE_EXPORT_CSS = `
*{box-sizing:border-box}body{margin:0;background:#fff;color:#242831;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.55}.document{width:min(900px,calc(100% - 64px));margin:48px auto 80px}.document>h1{font-size:34px;line-height:1.2;margin:0 0 24px;font-weight:700}
.outline,.outline ul{list-style:none;margin:0;padding:0}
.outline li{--dot:12.4px;position:relative;margin:6px 0;padding-left:38px}
.outline li.heading-1{--dot:37.2px}.outline li.heading-2{--dot:24.8px}.outline li.heading-3{--dot:16.12px}.outline li.table{--dot:28.4px}
.outline li::before{content:"";position:absolute;left:21px;top:calc(var(--dot) - 3px);width:6px;height:6px;border-radius:50%;background:#686970}
.outline li:has(>ul){background-image:linear-gradient(#cfcfcf,#cfcfcf);background-repeat:no-repeat;background-position:23.5px calc(var(--dot) + 12px);background-size:1px calc(100% - var(--dot) - 12px)}
.outline li>ul{margin-left:-14px}
.outline li>ul>li:last-child>.node-extras,.outline li>ul>li:last-child>ul{position:relative}
.outline li>ul>li:last-child>.node-extras::before{content:"";position:absolute;left:-39.5px;top:-5px;bottom:-11px;width:1px;background:#fff}
.outline li>ul>li:last-child>ul::before{content:"";position:absolute;left:-25.5px;top:-7px;bottom:-7px;width:1px;background:#fff}
.node-primary{min-height:1.55em}.node-primary.heading{font-weight:700}.outline li.heading-1>.node-primary{font-size:48px}.outline li.heading-2>.node-primary{font-size:32px}.outline li.heading-3>.node-primary{font-size:20.8px}
.todo-box{display:inline-flex;width:16px;height:16px;margin-right:8px;border:1px solid #76777d;border-radius:3px;align-items:center;justify-content:center;font-size:12px;vertical-align:-1px}.node-extras{margin:5px 0 10px}.node-extras blockquote{margin:4px 0;padding-left:12px;border-left:2px solid #c7c8cc;color:#6f7076;font-size:14px}.node-extras figure{margin:10px 0}.node-extras img{display:block;max-width:min(560px,100%);max-height:420px;object-fit:contain}.node-extras figcaption{margin-top:5px;color:#777;font-size:13px}a{color:#1677d2;text-decoration:underline}table{border-collapse:collapse;margin:8px 0;max-width:100%}th,td{min-width:80px;padding:7px 9px;border:1px solid #d5d7dc;vertical-align:top}th{font-weight:650;background:#f6f7f8}@page{margin:20mm} @media print{.document{width:auto;margin:0}}
`;
