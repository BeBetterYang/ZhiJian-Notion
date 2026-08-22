import type { MindElixirData, NodeObj } from "mind-elixir";
import MindElixir from "mind-elixir";
import {
  richTextToPlainText,
  type ZhiJianNode,
  type ZhiJianTree,
} from "../core/tree";
import { getMindMapNodeVisualStyle, renderMindMapNodeHtml, type MindMapNodeMetadata } from "./MindMapNodeRenderer";

export function treeToMindElixir(tree: ZhiJianTree): MindElixirData {
  const visit = (node: ZhiJianNode): NodeObj<MindMapNodeMetadata> => {
    const visual = getMindMapNodeVisualStyle(node, node.id === tree.rootId);
    const topic = node.type === "table" ? "表格" : richTextToPlainText(node.content) || " ";
    return {
      id: node.id,
      topic,
      note: node.description ? richTextToPlainText(node.description) : undefined,
      expanded: !node.props?.collapsed,
      style: {
        fontSize: visual.fontSize,
        lineHeight: visual.lineHeight,
        color: visual.color,
        background: visual.background,
        fontWeight: visual.fontWeight,
        fontStyle: visual.fontStyle,
        textDecoration: visual.textDecoration,
      } as NodeObj["style"] & { fontStyle?: string },
      dangerouslySetInnerHTML: renderMindMapNodeHtml(node, node.id === tree.rootId),
      metadata: {
        type: node.type,
        plainText: topic,
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
