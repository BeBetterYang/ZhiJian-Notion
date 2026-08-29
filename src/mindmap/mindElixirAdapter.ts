import type { MindElixirData, NodeObj } from "mind-elixir";
import MindElixir from "mind-elixir";
import {
  richTextToPlainText,
  type ZhiJianNode,
  type ZhiJianTree,
} from "../core/tree";
import { getMindMapNodeVisualStyle, renderMindMapNodeHtml, type MindMapNodeMetadata } from "./MindMapNodeRenderer";
import { resolveMindMapTheme, type MindMapTheme } from "./mindMapTheme";

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
  const theme = resolveMindMapTheme(tree.mindMap?.theme);
  const visit = (node: ZhiJianNode, level = 0): NodeObj<MindMapNodeMetadata> => {
    const branchColor = mindMapBranchColor(tree, node.id, theme);
    const visual = getMindMapNodeVisualStyle(node, node.id === rootId, { theme, level, branchColor });
    const topic = node.type === "table" ? "表格" : richTextToPlainText(node.content) || " ";
    const children = node.children
      .filter((childId) => !options.visibleNodeIds || options.visibleNodeIds.has(childId))
      .map((childId) => visit(tree.nodes[childId], level + 1));
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
      branchColor,
      dangerouslySetInnerHTML: renderMindMapNodeHtml(node, node.id === rootId, options.searchQuery, {
        theme,
        level,
        branchColor,
      }),
      metadata: {
        type: node.type,
        plainText: topic,
        checked: node.type === "todo" ? node.props?.checked ?? false : undefined,
        hasQuote: node.blocks?.some((block) => block.type === "quote") ?? false,
        imageCount: node.blocks?.filter((block) => block.type === "image").length ?? 0,
        branchColor,
        level,
      },
      children,
    };
  };

  // The direction travels with the data: `init` prefers it over the instance's
  // own, so this is what actually decides the layout. One direction, like an
  // outline read left to right — `SIDE` splits the root's children between the two
  // sides, which reads as two maps.
  //
  // 摘要 and 连接 travel with it as well, and that is what makes them survive: both
  // `init` and `refresh` read them straight off the data and re-render them, so a
  // structural rebuild — or a switch to the outline and back, which is an `init`
  // over a fresh instance — no longer leaves the map's own annotations behind.
  const nodeData = visit(tree.nodes[rootId]);
  assignGroupedSideDirections(nodeData.children ?? []);
  return {
    nodeData,
    direction: MindElixir.RIGHT,
    summaries: visibleSummaries(tree, rootId, theme, options.visibleNodeIds),
    arrows: visibleArrows(tree, rootId, theme, options.visibleNodeIds),
  };
}

export function mindMapBranchColor(tree: ZhiJianTree, nodeId: string, theme = resolveMindMapTheme(tree.mindMap?.theme)) {
  if (nodeId === tree.rootId) return undefined;
  let branch = tree.nodes[nodeId];
  while (branch?.parentId && branch.parentId !== tree.rootId) {
    branch = tree.nodes[branch.parentId];
  }
  if (!branch || branch.parentId !== tree.rootId) return undefined;
  const index = tree.nodes[tree.rootId]?.children.indexOf(branch.id) ?? -1;
  return index >= 0 ? theme.branchPalette[index % theme.branchPalette.length] : undefined;
}

/**
 * MindElixir alternates unspecified main branches left/right in SIDE mode. Keep
 * document order readable instead: the first half stays together on the right,
 * followed by the second half on the left.
 */
export function assignGroupedSideDirections(children: NodeObj[]) {
  const rightCount = Math.ceil(children.length / 2);
  children.forEach((child, index) => {
    child.direction = index < rightCount ? MindElixir.RIGHT : MindElixir.LEFT;
  });
}

/**
 * The summaries the current projection can actually draw.
 *
 * A summary is anchored to child indices of one parent, so it only means anything
 * while that parent is in the projection with its children unfiltered — under
 * 进入当前主题 the parent may be outside the visible subtree, and a search filters
 * children out from under it, which would slide the indices onto other nodes.
 */
function visibleSummaries(
  tree: ZhiJianTree,
  rootId: string,
  theme: MindMapTheme,
  visibleNodeIds?: Set<string> | null,
) {
  return (tree.mindMap?.summaries ?? []).filter((summary) => {
    const parent = tree.nodes[summary.parent];
    if (!parent || !isInSubtree(tree, summary.parent, rootId)) return false;
    if (visibleNodeIds && parent.children.some((childId) => !visibleNodeIds.has(childId))) return false;
    return summary.end < parent.children.length;
  }).map((summary) => ({
    ...summary,
    style: {
      stroke: mindMapBranchColor(tree, summary.parent, theme) ?? theme.summary.stroke,
      labelColor: theme.summary.labelColor,
      ...summary.style,
    },
  }));
}

/**
 * The arrows whose two ends are both drawn in the current projection.
 *
 * An arrow crossing out of the subtree under 进入当前主题, or into a node a search
 * filtered away, has one end with nowhere to land — mind-elixir looks the node up
 * on the canvas to draw from, so it has to be left out rather than drawn to a
 * stale position.
 */
function visibleArrows(tree: ZhiJianTree, rootId: string, theme: MindMapTheme, visibleNodeIds?: Set<string> | null) {
  const drawn = (nodeId: string) =>
    Boolean(tree.nodes[nodeId]) &&
    isInSubtree(tree, nodeId, rootId) &&
    (!visibleNodeIds || visibleNodeIds.has(nodeId) || nodeId === rootId);
  return (tree.mindMap?.arrows ?? []).filter((arrow) => drawn(arrow.from) && drawn(arrow.to)).map((arrow) => ({
    ...arrow,
    style: {
      stroke: mindMapBranchColor(tree, arrow.from, theme) ?? theme.arrow.stroke,
      labelColor: theme.arrow.labelColor,
      ...arrow.style,
    },
  }));
}

function isInSubtree(tree: ZhiJianTree, nodeId: string, rootId: string) {
  let current: string | null | undefined = nodeId;
  while (current) {
    if (current === rootId) return true;
    current = tree.nodes[current]?.parentId;
  }
  return false;
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
