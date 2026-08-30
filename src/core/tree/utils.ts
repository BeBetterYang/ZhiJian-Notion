import type { ZhiJianMindMapDecorations, ZhiJianNode, ZhiJianNodeBlock, ZhiJianTree } from "./types";
import { normalizeRichText, plainTextContent } from "./richText";

export function cloneTree(tree: ZhiJianTree): ZhiJianTree {
  return {
    rootId: tree.rootId,
    nodes: Object.fromEntries(
      Object.entries(tree.nodes).map(([id, node]) => [id, cloneNode(node)]),
    ),
    mindMap: tree.mindMap ? cloneMindMapDecorations(tree.mindMap) : undefined,
  };
}

function cloneMindMapDecorations(decorations: ZhiJianMindMapDecorations): ZhiJianMindMapDecorations {
  return {
    theme: decorations.theme ? { ...decorations.theme } : undefined,
    connector: decorations.connector ? { ...decorations.connector } : undefined,
    frame: decorations.frame ? { ...decorations.frame } : undefined,
    canvas: decorations.canvas ? { ...decorations.canvas } : undefined,
    layout: decorations.layout ? { ...decorations.layout } : undefined,
    summaries: decorations.summaries?.map((summary) => ({
      ...summary,
      style: summary.style ? { ...summary.style } : undefined,
    })),
    arrows: decorations.arrows?.map((arrow) => ({
      ...arrow,
      delta1: arrow.delta1 ? { ...arrow.delta1 } : undefined,
      delta2: arrow.delta2 ? { ...arrow.delta2 } : undefined,
      style: arrow.style ? { ...arrow.style } : undefined,
    })),
  };
}

export function cloneNode(node: ZhiJianNode): ZhiJianNode {
  return {
    ...node,
    children: [...node.children],
    content: normalizeRichText(node.content),
    description: node.description ? normalizeRichText(node.description) : undefined,
    blocks: node.blocks?.map(cloneNodeBlock),
    props: node.props ? { ...node.props } : undefined,
    meta: node.meta ? { ...node.meta } : undefined,
  };
}

function cloneNodeBlock(block: ZhiJianNodeBlock): ZhiJianNodeBlock {
  return block.type === "quote"
    ? { ...block, content: normalizeRichText(block.content) }
    : { ...block, image: { ...block.image } };
}

export function nowMeta() {
  const now = Date.now();
  return { createdAt: now, updatedAt: now };
}

export function touchNode(node: ZhiJianNode): ZhiJianNode {
  return {
    ...node,
    meta: {
      createdAt: node.meta?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    },
  };
}

export function createInitialTree(): ZhiJianTree {
  const root = node("root", null, "产品规划", ["web", "app"], "heading");
  const web = node("web", "root", "Web端");
  const app = node("app", "root", "App端");
  return {
    rootId: root.id,
    nodes: {
      [root.id]: root,
      [web.id]: web,
      [app.id]: app,
    },
  };
}

export function node(
  id: string,
  parentId: string | null,
  content: string,
  children: string[] = [],
  type: ZhiJianNode["type"] = "text",
): ZhiJianNode {
  return {
    id,
    parentId,
    children,
    content: plainTextContent(content),
    type,
    meta: nowMeta(),
  };
}
