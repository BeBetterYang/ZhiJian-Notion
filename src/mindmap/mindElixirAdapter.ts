import type { MindElixirData, NodeObj } from "mind-elixir";
import MindElixir from "mind-elixir";
import {
  richTextToPlainText,
  type ZhiJianNode,
  type ZhiJianTree,
} from "../core/tree";
import { getMindMapNodeVisualStyle, renderMindMapNodeHtml, type MindMapNodeMetadata } from "./MindMapNodeRenderer";

export interface MindElixirProjectionOptions {
  visibleNodeIds?: Set<string> | null;
  searchQuery?: string;
  /**
   * 进入当前主题: the node the map is drawn from, standing in as its root. The ids do
   * not change, so an edit made while zoomed still writes back to the node it came
   * from — the projection is narrower, not different.
   */
  rootNodeId?: string | null;
}

export function treeToMindElixir(tree: ZhiJianTree, options: MindElixirProjectionOptions = {}): MindElixirData {
  const rootId = options.rootNodeId && tree.nodes[options.rootNodeId] ? options.rootNodeId : tree.rootId;
  const visit = (node: ZhiJianNode): NodeObj<MindMapNodeMetadata> => {
    const visual = getMindMapNodeVisualStyle(node, node.id === rootId);
    const topic = node.type === "table" ? "表格" : richTextToPlainText(node.content) || " ";
    const children = node.children
      .filter((childId) => !options.visibleNodeIds || options.visibleNodeIds.has(childId))
      .map((childId) => visit(tree.nodes[childId]));
    return {
      id: node.id,
      topic,
      note: node.description ? richTextToPlainText(node.description) : undefined,
      expanded: options.visibleNodeIds ? true : !node.props?.collapsed,
      style: {
        fontSize: visual.fontSize,
        lineHeight: visual.lineHeight,
        color: visual.color,
        background: visual.background,
        fontWeight: visual.fontWeight,
        fontStyle: visual.fontStyle,
        textDecoration: visual.textDecoration,
      } as NodeObj["style"] & { fontStyle?: string },
      dangerouslySetInnerHTML: renderMindMapNodeHtml(node, node.id === rootId, options.searchQuery),
      metadata: {
        type: node.type,
        plainText: topic,
        checked: node.type === "todo" ? node.props?.checked ?? false : undefined,
        hasQuote: node.blocks?.some((block) => block.type === "quote") ?? false,
        imageCount: node.blocks?.filter((block) => block.type === "image").length ?? 0,
      },
      children,
    };
  };

  // The direction travels with the data: `init` prefers it over the instance's
  // own, so this is what actually decides the layout. One direction, like an
  // outline read left to right — `SIDE` splits the root's children between the two
  // sides, which reads as two maps.
  return { nodeData: visit(tree.nodes[rootId]), direction: MindElixir.RIGHT };
}

/**
 * A digest of everything mind-elixir has to rebuild its DOM for: which nodes
 * exist, how they nest, and which of them are collapsed.
 *
 * Walks the tree directly rather than going through `treeToMindElixir`. This runs
 * on every keystroke, and projecting the map first meant rendering every node's
 * HTML just to read three fields back off it — work that grew with the document
 * and was thrown away every time.
 */
export function createMindMapStructureSignature(
  tree: ZhiJianTree,
  visibleNodeIds?: Set<string> | null,
  rootNodeId?: string | null,
) {
  const visit = (nodeId: string): string => {
    const node = tree.nodes[nodeId];
    if (!node) return "";
    const children = node.children.filter((childId) => !visibleNodeIds || visibleNodeIds.has(childId));
    return `${nodeId}${visibleNodeIds ? "+" : node.props?.collapsed ? "-" : "+"}(${children.map(visit).join(",")})`;
  };
  const rootId = rootNodeId && tree.nodes[rootNodeId] ? rootNodeId : tree.rootId;
  return `${visibleNodeIds ? [...visibleNodeIds].sort().join("|") : ""}:${visit(rootId)}`;
}
