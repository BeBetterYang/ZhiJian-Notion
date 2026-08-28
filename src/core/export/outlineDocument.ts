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
  const title = escapeHtml(outlineExportTitle(tree));
  if (word) return wordDocument(tree, root, imageUrls, title);
  const body = [
    `<main class="document">`,
    `<h1>${renderRichText(root.content)}</h1>`,
    renderNodeExtras(root, imageUrls),
    root.children.length ? `<ul class="outline">${root.children.map((id) => renderNode(tree, id, imageUrls)).join("")}</ul>` : "",
    `</main>`,
  ].join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${OUTLINE_EXPORT_CSS}</style></head><body>${body}</body></html>`;
}

/**
 * The Word file is the same document, laid out the way Word can actually lay it out.
 *
 * Word reads HTML through its own renderer, which knows nothing of `:has()`, CSS
 * gradients, `calc()`, `min()` or generated content — so the screen's stylesheet
 * reached it as a page with no bullets, no indent guides and a reading column as wide
 * as whatever window Word felt like using, which is what "变形" was. So the rows are
 * emitted as plain indented paragraphs with a real bullet character and a hanging
 * indent, the sizes are stated in points, and the page itself is declared A4 with 2cm
 * margins through `@page WordSection1` and the `mso` block Word looks for. Nothing in
 * here relies on a feature Word will drop, so the file opens at a fixed measure and
 * paginates on its own.
 */
function wordDocument(tree: ZhiJianTree, root: ZhiJianNode, imageUrls: Map<string, string>, title: string) {
  const body = [
    `<div class="WordSection1">`,
    `<p class="doc-title">${renderRichText(root.content)}</p>`,
    renderWordExtras(root, imageUrls, 0),
    ...root.children.map((id) => renderWordNode(tree, id, imageUrls, 0)),
    `</div>`,
  ].join("");
  return [
    `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="zh-CN">`,
    `<head><meta charset="utf-8"><title>${title}</title>`,
    `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->`,
    `<style>${WORD_EXPORT_CSS}</style></head>`,
    `<body>${body}</body></html>`,
  ].join("");
}

/** One paragraph per row, indented by depth; children follow their parent in order. */
function renderWordNode(tree: ZhiJianTree, nodeId: string, imageUrls: Map<string, string>, depth: number): string {
  const node = tree.nodes[nodeId];
  if (!node) return "";
  const indent = depth * WORD_INDENT_PT;
  const rows = node.type === "table"
    ? `<div style="margin:6pt 0 6pt ${indent + WORD_HANGING_PT}pt">${renderTable(node.props?.table)}</div>`
    : `<p class="${node.type === "heading" ? `word-h${node.props?.headingLevel ?? 1}` : "word-row"}" style="margin-left:${indent + WORD_HANGING_PT}pt;text-indent:-${WORD_HANGING_PT}pt">`
      + `<span class="marker">${node.type === "todo" ? (node.props?.checked ? "☑" : "☐") : "•"}&nbsp;</span>`
      + `${renderRichText(node.content, node)}</p>`;
  return rows
    + renderWordExtras(node, imageUrls, indent + WORD_HANGING_PT)
    + node.children.map((id) => renderWordNode(tree, id, imageUrls, depth + 1)).join("");
}

function renderWordExtras(node: ZhiJianNode, imageUrls: Map<string, string>, indent: number) {
  const at = `margin-left:${indent}pt`;
  return [
    node.description ? `<p class="word-note" style="${at}">${renderRichText(node.description)}</p>` : "",
    ...(node.blocks ?? []).map((block) => {
      if (block.type === "quote") return `<p class="word-quote" style="${at}">${renderRichText(block.content)}</p>`;
      const src = imageUrls.get(block.id) ?? "";
      if (!src) return "";
      const caption = block.image.caption?.trim();
      // Only a width is given, so Word keeps the aspect ratio itself; the cap is the
      // A4 text column (17cm ≈ 482pt) so a picture can never widen the page.
      const width = Math.round(Math.min(block.image.previewWidth ?? 480, 620));
      return `<p class="word-figure" style="${at}"><img src="${escapeAttribute(src)}" alt="${escapeAttribute(block.image.name ?? "图片")}" width="${width}"></p>`
        + (caption ? `<p class="word-caption" style="${at}">${escapeHtml(caption)}</p>` : "");
    }),
  ].filter(Boolean).join("");
}

const WORD_INDENT_PT = 18;
const WORD_HANGING_PT = 14;

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
*{box-sizing:border-box}body{margin:0;background:#fff;color:#242831;font-family:SourceSansPro,-apple-system,"PingFang SC","Apple Color Emoji",BlinkMacSystemFont,Helvetica,Arial,"Segoe UI Emoji","Segoe UI Symbol","Microsoft YaHei",微软雅黑,黑体,Heiti,sans-serif,SimSun,宋体,serif;font-size:16px;line-height:1.55}.document{width:min(900px,calc(100% - 64px));margin:48px auto 80px}.document>h1{font-size:34px;line-height:1.2;margin:0 0 24px;font-weight:700}
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

/**
 * Word's own stylesheet dialect: points everywhere, A4 declared as a named page
 * section, and no selector or value Word will discard. The screen's 16px body is
 * 12pt here, and the heading sizes carry over at the same ratio (48/32/20.8px →
 * 36/24/15.5pt), so a document keeps its shape when it moves onto paper.
 */
const WORD_EXPORT_CSS = `
@page WordSection1{size:21.0cm 29.7cm;margin:2.0cm 2.0cm 2.0cm 2.0cm}
div.WordSection1{page:WordSection1}
body{margin:0;color:#242831;font-family:"PingFang SC","Microsoft YaHei",宋体,Calibri,sans-serif;font-size:12.0pt;line-height:1.5}
p{margin:0 0 6.0pt 0}
p.doc-title{margin:0 0 14.0pt 0;font-size:25.5pt;font-weight:700;line-height:1.2}
p.word-row{font-size:12.0pt}
p.word-h1{font-size:36.0pt;font-weight:700;margin-top:12.0pt}
p.word-h2{font-size:24.0pt;font-weight:700;margin-top:10.0pt}
p.word-h3{font-size:15.5pt;font-weight:700;margin-top:8.0pt}
span.marker{font-size:12.0pt;color:#686970}
p.word-note,p.word-quote{color:#6f7076;font-size:10.5pt}
p.word-quote{border-left:1.5pt solid #c7c8cc;padding-left:9.0pt}
p.word-caption{color:#777777;font-size:9.5pt}
p.word-figure{margin-bottom:8.0pt}
a{color:#1677d2;text-decoration:underline}
table{border-collapse:collapse;margin:6.0pt 0;mso-table-lspace:0pt;mso-table-rspace:0pt}
th,td{padding:4.0pt 6.0pt;border:0.75pt solid #d5d7dc;vertical-align:top;font-size:11.0pt}
th{font-weight:650;background:#f6f7f8}
`;
