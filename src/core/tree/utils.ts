import type { ZhiJianNode, ZhiJianTree } from "./types";
import { normalizeRichText, plainTextContent } from "./richText";

export function cloneTree(tree: ZhiJianTree): ZhiJianTree {
  return {
    rootId: tree.rootId,
    nodes: Object.fromEntries(
      Object.entries(tree.nodes).map(([id, node]) => [id, cloneNode(node)]),
    ),
  };
}

export function cloneNode(node: ZhiJianNode): ZhiJianNode {
  return {
    ...node,
    children: [...node.children],
    content: normalizeRichText(node.content),
    description: node.description ? normalizeRichText(node.description) : undefined,
    props: node.props ? { ...node.props } : undefined,
    meta: node.meta ? { ...node.meta } : undefined,
  };
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
