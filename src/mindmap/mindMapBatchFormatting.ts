import { everySpanHasMark, withRichTextMarks, type ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";

export type MindMapBatchPalette = "textColor" | "backgroundColor";
export type MindMapBatchTextStyle = "bold" | "italic" | "underline" | "strike";

export function editableMindMapBatchNodeIds(tree: ZhiJianTree, nodeIds: string[]) {
  return [...new Set(nodeIds)].filter((nodeId) => {
    const node = tree.nodes[nodeId];
    return Boolean(node && nodeId !== tree.rootId && node.type !== "table");
  });
}

export function applyMindMapBatchColor(
  store: TreeStore,
  nodeIds: string[],
  kind: MindMapBatchPalette,
  value: string | null,
) {
  const tree = store.getSnapshot();
  const targets = editableMindMapBatchNodeIds(tree, nodeIds);
  if (!targets.length) return;
  store.updateNodes(targets.map((id) => ({
    id,
    content: withRichTextMarks(tree.nodes[id]!.content, { [kind]: value }),
  })));
}

export function toggleMindMapBatchTextStyle(
  store: TreeStore,
  nodeIds: string[],
  style: MindMapBatchTextStyle,
) {
  const tree = store.getSnapshot();
  const targets = editableMindMapBatchNodeIds(tree, nodeIds);
  if (!targets.length) return;
  const enabled = targets.every((id) => everySpanHasMark(tree.nodes[id]!.content, style, true));
  const patch: Partial<Record<MindMapBatchTextStyle, boolean | null>> = {
    [style]: enabled ? null : true,
  };
  store.updateNodes(targets.map((id) => ({
    id,
    content: withRichTextMarks(tree.nodes[id]!.content, patch),
  })));
}

export function toggleMindMapBatchTodo(store: TreeStore, nodeIds: string[]) {
  const tree = store.getSnapshot();
  const targets = editableMindMapBatchNodeIds(tree, nodeIds);
  if (!targets.length) return;
  const type = targets.every((id) => tree.nodes[id]!.type === "todo") ? "text" : "todo";
  store.updateTypes(targets.map((id) => ({ id, type })));
}
