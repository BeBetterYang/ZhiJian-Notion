import { richTextToPlainText, type ZhiJianNode, type ZhiJianTree } from "../core/tree";

export const MIND_MAP_CLIPBOARD_MIME = "application/x-zhijian-node";

/**
 * A text selection inside displayed text or an edited text block belongs to the
 * text layer, not to MindElixir's node clipboard. Table selections stay out of
 * this guard so the editor's cell-aware clipboard handler can preserve its behavior.
 */
export function isMindMapTextClipboardSelection(event: ClipboardEvent) {
  if (event.type !== "copy" && event.type !== "cut") return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString()) return false;

  const endpoints = [selection.anchorNode, selection.focusNode].map(selectionElement);
  const displayedText = endpoints.every((element) => element?.closest(".mindmap-node-display"));
  const editedText = endpoints.every((element) => element?.closest(".mindmap-node-editor .ProseMirror"));
  const editedQuote = endpoints.every((element) => element?.closest(".mindmap-node-editor [data-content-type='quote'], .mindmap-node-editor .mindmap-node-quote"));
  if (!displayedText && !editedText && !editedQuote) return false;
  if (endpoints.some((element) => element?.closest(".mindmap-node-editor table, .mindmap-node-editor [data-content-type='table']"))) return false;
  return true;
}

interface MindMapClipboardPayload {
  version: 1;
  subtrees: ZhiJianNode[][];
}

export function writeMindMapNodeClipboard(
  event: ClipboardEvent,
  tree: ZhiJianTree,
  selectedNodeIds: string[],
) {
  const subtrees = selectedSubtrees(tree, selectedNodeIds);
  if (!subtrees.length || !event.clipboardData) return false;
  const payload: MindMapClipboardPayload = { version: 1, subtrees };
  const serialized = JSON.stringify(payload);
  event.clipboardData.setData(MIND_MAP_CLIPBOARD_MIME, serialized);
  event.clipboardData.setData(
    "text/plain",
    subtrees.map(([node]) => richTextToPlainText(node.content)).join("\n"),
  );
  return true;
}

export function selectedMindMapNodeIds(tree: ZhiJianTree, selectedNodeIds: string[]) {
  const selected = new Set(selectedNodeIds.filter((id) => tree.nodes[id]));
  return orderedNodes(tree)
    .filter((node) => selected.has(node.id) && !hasSelectedAncestor(tree, node.id, selected))
    .map((node) => node.id);
}

export function readMindMapNodeClipboard(event: ClipboardEvent) {
  const serialized = event.clipboardData?.getData(MIND_MAP_CLIPBOARD_MIME);
  if (!serialized) return null;
  try {
    const payload = JSON.parse(serialized) as MindMapClipboardPayload;
    if (payload.version !== 1 || !Array.isArray(payload.subtrees)) return null;
    if (payload.subtrees.some((subtree) => !Array.isArray(subtree) || !subtree[0])) return null;
    return payload;
  } catch {
    return null;
  }
}

function selectedSubtrees(tree: ZhiJianTree, selectedNodeIds: string[]) {
  const roots = selectedMindMapNodeIds(tree, selectedNodeIds).map((id) => tree.nodes[id]).filter(Boolean);
  return roots.map((root) => collectSubtree(tree, root.id));
}

function orderedNodes(tree: ZhiJianTree) {
  const nodes: ZhiJianNode[] = [];
  const visit = (id: string) => {
    const node = tree.nodes[id];
    if (!node) return;
    nodes.push(node);
    node.children.forEach(visit);
  };
  visit(tree.rootId);
  return nodes;
}

function hasSelectedAncestor(tree: ZhiJianTree, id: string, selected: Set<string>) {
  let parentId = tree.nodes[id]?.parentId;
  while (parentId) {
    if (selected.has(parentId)) return true;
    parentId = tree.nodes[parentId]?.parentId ?? null;
  }
  return false;
}

function collectSubtree(tree: ZhiJianTree, id: string) {
  const nodes: ZhiJianNode[] = [];
  const visit = (nodeId: string) => {
    const node = tree.nodes[nodeId];
    if (!node) return;
    nodes.push(node);
    node.children.forEach(visit);
  };
  visit(id);
  return nodes;
}

function selectionElement(node: Node | null) {
  return node instanceof Element ? node : node?.parentElement ?? null;
}
