import type { MindElixirData, NodeObj } from "mind-elixir";
import MindElixir from "mind-elixir";
import {
  firstMarks,
  getNodeStyle,
  normalizeRichText,
  richTextToPlainText,
  type ZhiJianNode,
  type ZhiJianTree,
} from "../core/tree";
import { renderMindMapNode, type MindMapNodeMetadata } from "./MindMapNodeRenderer";

export function treeToMindElixir(tree: ZhiJianTree): MindElixirData {
  const visit = (node: ZhiJianNode): NodeObj<MindMapNodeMetadata> => {
    const style = getNodeStyle(node.props?.style);
    const marks = firstMarks(node.content);
    const topic = node.type === "table" ? "表格" : richTextToPlainText(node.content) || " ";
    const hasContentBlocks = Boolean(node.blocks?.length || node.description);
    return {
      id: node.id,
      topic,
      note: node.description ? richTextToPlainText(node.description) : undefined,
      expanded: !node.props?.collapsed,
      style: {
        fontSize: style.fontSize,
        color: marks?.textColor ?? style.color,
        background: marks?.backgroundColor ?? style.backgroundColor,
        fontWeight: marks?.bold ? "700" : style.fontWeight,
        fontStyle: marks?.italic ? "italic" : style.fontStyle,
        textDecoration: marksToTextDecoration(marks) ?? style.textDecorationLine ?? style.textDecoration,
      } as NodeObj["style"] & { fontStyle?: string },
      dangerouslySetInnerHTML: node.type === "table"
        ? mediaSlotHtml(node.id)
        : hasContentBlocks
          ? contentSlotHtml(node.id)
          : undefined,
      metadata: {
        type: node.type,
        plainText: topic,
        richTextHtml: node.type === "table" || hasContentBlocks ? undefined : richTextToHtml(node.content),
        checked: node.type === "todo" ? node.props?.checked ?? false : undefined,
        hasQuote: node.blocks?.some((block) => block.type === "quote") ?? false,
        imageCount: node.blocks?.filter((block) => block.type === "image").length ?? 0,
      },
      children: node.children.map((childId) => visit(tree.nodes[childId])),
    };
  };

  return { nodeData: visit(tree.nodes[tree.rootId]), direction: MindElixir.SIDE };
}

export function createMindMapStructureSignature(tree: ZhiJianTree) {
  const root = treeToMindElixir(tree).nodeData;
  const visit = (node: typeof root): unknown => ({
    id: node.id,
    expanded: node.expanded,
    children: node.children?.map(visit) ?? [],
  });
  return JSON.stringify(visit(root));
}

function mediaSlotHtml(id: string) {
  return `<div class="mindmap-blocknote-slot mindmap-blocknote-slot-table" data-zhijian-media-node="${escapeHtml(id)}"></div>`;
}

function contentSlotHtml(id: string) {
  return `<div class="mindmap-node-content-slot" data-zhijian-node-content="${escapeHtml(id)}"></div>`;
}

export { renderMindMapNode };

function richTextToHtml(content: ZhiJianNode["content"]) {
  const richText = normalizeRichText(content);
  const spans = richText.spans?.length ? richText.spans : [{ text: richText.text, marks: richText.marks }];
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
    const text = escapeHtml(span.text);
    const inner = span.marks?.linkUrl
      ? `<a href="${escapeHtml(span.marks.linkUrl)}" target="_blank" rel="noreferrer">${text}</a>`
      : text;
    return `<span style="${style}">${inner}</span>`;
  }).join("");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function marksToTextDecoration(marks: ReturnType<typeof firstMarks>) {
  const values = [];
  if (marks?.underline) values.push("underline");
  if (marks?.strike) values.push("line-through");
  return values.length ? values.join(" ") : undefined;
}
