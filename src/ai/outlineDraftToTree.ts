import { plainTextContent, type ZhiJianNode, type ZhiJianTree } from "../core/tree";
import { nowMeta } from "../core/tree/utils";
import type { AIOutlineDraft, AIOutlineDraftNode } from "./types";

export function outlineDraftToTree(draft: AIOutlineDraft): ZhiJianTree {
  const rootId = "root";
  const root = createTreeNode(rootId, null, draft.title, 1, "heading");
  const nodes: Record<string, ZhiJianNode> = { [rootId]: root };
  root.children = draft.nodes.map((node, index) => appendNode(nodes, node, rootId, [index]));
  return { rootId, nodes };
}

function appendNode(
  nodes: Record<string, ZhiJianNode>,
  draftNode: AIOutlineDraftNode,
  parentId: string,
  path: number[],
) {
  const id = `ai-${path.join("-")}`;
  const level = Math.min(3, path.length + 1) as 1 | 2 | 3;
  const type = path.length < 3 ? "heading" : "text";
  const node = createTreeNode(id, parentId, draftNode.title, level, type, draftNode);
  nodes[id] = node;
  node.children = draftNode.children.map((child, index) => appendNode(nodes, child, id, [...path, index]));
  return id;
}

function createTreeNode(
  id: string,
  parentId: string | null,
  title: string,
  headingLevel: 1 | 2 | 3,
  type: ZhiJianNode["type"],
  draftNode?: AIOutlineDraftNode,
): ZhiJianNode {
  const description = draftNode ? buildDescription(draftNode) : undefined;
  return {
    id,
    parentId,
    children: [],
    content: plainTextContent(title),
    ...(description ? { description: plainTextContent(description) } : {}),
    type,
    ...(type === "heading" ? { props: { headingLevel } } : {}),
    meta: nowMeta(),
  };
}

function buildDescription(node: AIOutlineDraftNode) {
  return node.summary ?? "";
}
