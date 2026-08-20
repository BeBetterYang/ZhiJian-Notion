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
import {
  renderMindMapNode,
  type MindMapNodeMetadata,
} from "./MindMapNodeRenderer";

export function treeToMindElixir(tree: ZhiJianTree): MindElixirData {
  const visit = (group: MindMapNodeGroup): NodeObj<MindMapNodeMetadata> => {
    const node = tree.nodes[group.primaryId];
    const style = getNodeStyle(node.props?.style);
    const marks = firstMarks(node.content);
    const plainText =
      node.type === "table"
        ? "表格"
        : node.type === "image"
          ? node.props?.image?.name ?? "图片"
          : richTextToPlainText(node.content) || " ";
    const isTable = node.type === "table";
    const usesGroupEditor =
      node.type === "image" || Boolean(group.quoteId) || group.imageIds.length > 0;
    const attachmentIds = [
      ...(group.quoteId && group.quoteId !== node.id ? [group.quoteId] : []),
      ...group.imageIds.filter((id) => id !== node.id),
    ];
    const childGroups = groupSiblingNodes(
      tree,
      [node.id, ...attachmentIds].flatMap((id) => tree.nodes[id]?.children ?? []),
    );
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
      dangerouslySetInnerHTML: isTable
        ? mediaSlotHtml(node)
        : usesGroupEditor
          ? groupSlotHtml(group)
          : undefined,
      metadata: {
        type: node.type,
        plainText,
        richTextHtml: isTable || usesGroupEditor ? undefined : richTextToHtml(node.content),
        checked: node.type === "todo" ? node.props?.checked ?? false : undefined,
      },
      children: childGroups.map(visit),
    };
  };

  const root = tree.nodes[tree.rootId];
  return {
    nodeData: visit({
      primaryId: tree.rootId,
      quoteId: root.type === "quote" ? root.id : undefined,
      imageIds: root.type === "image" ? [root.id] : [],
    }),
    direction: MindElixir.SIDE,
  };
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

interface MindMapNodeGroup {
  primaryId: string;
  quoteId?: string;
  imageIds: string[];
}

function groupSiblingNodes(tree: ZhiJianTree, ids: string[]) {
  return ids.reduce<MindMapNodeGroup[]>((groups, id) => {
    const node = tree.nodes[id];
    const previous = groups.at(-1);
    if (node.type === "quote" && previous && tree.nodes[previous.primaryId].type !== "table") {
      previous.quoteId ??= id;
      return groups;
    }
    if (node.type === "image" && previous && tree.nodes[previous.primaryId].type !== "table") {
      previous.imageIds.push(id);
      return groups;
    }
    groups.push({
      primaryId: id,
      quoteId: node.type === "quote" ? id : undefined,
      imageIds: node.type === "image" ? [id] : [],
    });
    return groups;
  }, []);
}

function mediaSlotHtml(node: ZhiJianNode) {
  return `<div class="mindmap-blocknote-slot mindmap-blocknote-slot-${node.type}" data-zhijian-media-node="${escapeHtml(node.id)}"></div>`;
}

function groupSlotHtml(group: MindMapNodeGroup) {
  return `<div class="mindmap-node-group-slot" data-zhijian-group-primary="${escapeHtml(group.primaryId)}" data-zhijian-group-quote="${escapeHtml(group.quoteId ?? "")}" data-zhijian-group-images="${escapeHtml(group.imageIds.join(","))}"></div>`;
}

export { renderMindMapNode };

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
