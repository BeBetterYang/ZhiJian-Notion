import type { MindElixirData, NodeObj } from "mind-elixir";
import MindElixir from "mind-elixir";
import {
  firstMarks,
  getNodeStyle,
  richTextToPlainText,
  type ZhiJianNode,
  type ZhiJianTree,
} from "../core/tree";
import { renderMindMapNodeHtml, type MindMapNodeMetadata } from "./MindMapNodeRenderer";

export function treeToMindElixir(tree: ZhiJianTree): MindElixirData {
  const visit = (node: ZhiJianNode): NodeObj<MindMapNodeMetadata> => {
    const style = getNodeStyle(node.props?.style);
    const marks = firstMarks(node.content);
    const topic = node.type === "table" ? "表格" : richTextToPlainText(node.content) || " ";
    return {
      id: node.id,
      topic,
      note: node.description ? richTextToPlainText(node.description) : undefined,
      expanded: !node.props?.collapsed,
      style: {
        fontSize: node.id === tree.rootId ? "20px" : style.fontSize,
        color: marks?.textColor ?? style.color,
        background: marks?.backgroundColor ?? style.backgroundColor,
        fontWeight: marks?.bold ? "700" : style.fontWeight,
        fontStyle: marks?.italic ? "italic" : style.fontStyle,
        textDecoration: marksToTextDecoration(marks) ?? style.textDecorationLine ?? style.textDecoration,
      } as NodeObj["style"] & { fontStyle?: string },
      dangerouslySetInnerHTML: renderMindMapNodeHtml(node),
      metadata: {
        type: node.type,
        plainText: topic,
        richTextHtml: undefined,
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

function marksToTextDecoration(marks: ReturnType<typeof firstMarks>) {
  const values = [];
  if (marks?.underline) values.push("underline");
  if (marks?.strike) values.push("line-through");
  return values.length ? values.join(" ") : undefined;
}
