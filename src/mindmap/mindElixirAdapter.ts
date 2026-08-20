import type { MindElixirData, NodeObj } from "mind-elixir";
import MindElixir from "mind-elixir";
import {
  firstMarks,
  getNodeStyle,
  normalizeRichText,
  richTextToPlainText,
  type ZhiJianNode,
  type ZhiJianNodeType,
  type ZhiJianTree,
} from "../core/tree";

interface MindMetadata {
  type?: ZhiJianNodeType;
  props?: ZhiJianNode["props"];
  plainText?: string;
  richTextHtml?: string;
}

export function treeToMindElixir(tree: ZhiJianTree): MindElixirData {
  const visit = (id: string): NodeObj<MindMetadata> => {
    const node = tree.nodes[id];
    const style = getNodeStyle(node.props?.style);
    const marks = firstMarks(node.content);
    const plainText =
      node.type === "table"
        ? tableSummary(node)
        : richTextToPlainText(node.content) || node.type;
    const isMedia = node.type === "table" || node.type === "image";
    return {
      id: node.id,
      topic: plainText,
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
      dangerouslySetInnerHTML: isMedia ? mediaSlotHtml(node) : undefined,
      tags: node.type === "todo" ? [node.props?.checked ? "done" : "todo"] : undefined,
      metadata: {
        type: node.type,
        props: node.props,
        plainText,
        richTextHtml: isMedia ? undefined : richTextToHtml(node.content),
      },
      children: node.children.map(visit),
    };
  };

  return {
    nodeData: visit(tree.rootId),
    direction: MindElixir.SIDE,
  };
}

function tableSummary(node: ZhiJianNode) {
  const table = node.props?.table;
  if (!table?.rows.length) {
    return "表格";
  }
  const columns = Math.max(0, ...table.rows.map((row) => row.length));
  return `表格 ${table.rows.length}×${columns}`;
}

function mediaSlotHtml(node: ZhiJianNode) {
  const width =
    node.type === "table"
      ? Math.max(
          180,
          node.props?.table?.columnWidths?.reduce<number>(
            (sum, value) => sum + (value ?? 100),
            0,
          ) ??
            Math.max(1, node.props?.table?.rows[0]?.length ?? 1) * 100,
        )
      : node.props?.image?.previewWidth ?? 180;
  const height =
    node.type === "table"
      ? Math.max(68, (node.props?.table?.rows.length ?? 2) * 34)
      : Math.round(width * 0.625);
  return `<div class="mindmap-blocknote-slot" data-zhijian-media-node="${escapeHtml(node.id)}" style="width:${width}px;min-height:${height}px"></div>`;
}

export function renderMindMapRichText(topic: string, obj: NodeObj) {
  const metadata = (obj as NodeObj<MindMetadata>).metadata;
  if (metadata?.plainText === topic && metadata.richTextHtml) {
    return metadata.richTextHtml;
  }
  return escapeHtml(topic);
}

function richTextToHtml(content: ZhiJianNode["content"]) {
  const richText = normalizeRichText(content);
  const spans = richText.spans?.length
    ? richText.spans
    : [{ text: richText.text, marks: richText.marks }];
  return spans
    .map((span) => {
      const style = [
        span.marks?.bold ? "font-weight:700" : "",
        span.marks?.italic ? "font-style:italic" : "",
        span.marks?.underline || span.marks?.strike
          ? `text-decoration:${[
              span.marks.underline ? "underline" : "",
              span.marks.strike ? "line-through" : "",
            ]
              .filter(Boolean)
              .join(" ")}`
          : "",
        span.marks?.textColor ? `color:${escapeHtml(span.marks.textColor)}` : "",
        span.marks?.backgroundColor
          ? `background:${escapeHtml(span.marks.backgroundColor)}`
          : "",
      ]
        .filter(Boolean)
        .join(";");
      const text = escapeHtml(span.text);
      const inner = span.marks?.linkUrl
        ? `<a href="${escapeHtml(span.marks.linkUrl)}" target="_blank" rel="noreferrer">${text}</a>`
        : text;
      return `<span style="${style}">${inner}</span>`;
    })
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function marksToTextDecoration(marks: ReturnType<typeof firstMarks>) {
  const values = [];
  if (marks?.underline) {
    values.push("underline");
  }
  if (marks?.strike) {
    values.push("line-through");
  }
  return values.length ? values.join(" ") : undefined;
}
