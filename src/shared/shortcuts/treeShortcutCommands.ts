import { everySpanHasMark, withRichTextMarks, type ZhiJianTree } from "../../core/tree";
import type { TreeStore } from "../../core/treeStore";
import {
  SHORTCUT_BACKGROUND_COLORS,
  SHORTCUT_HEADING_LEVELS,
  SHORTCUT_TEXT_COLORS,
  type ShortcutId,
} from "./shortcutRegistry";

/**
 * The shortcuts that act on the tree rather than on the text inside a node:
 * collapsing, reordering, duplicating and deleting. Both views send them here, so
 * Ctrl+Shift+↓ moves the same node the same way whether it was pressed on an
 * outline row or on the map.
 *
 * The decisions are pure functions of the tree; `applyTreeShortcut` is the thin
 * part that commits them.
 */

export type CollapseScope =
  | { kind: "node" }
  | { kind: "siblings" }
  | { kind: "level"; level: number }
  | { kind: "all" };

/** How deep a node sits, counting the root as 0 — so "1 级主题" is depth 1. */
export function nodeDepth(tree: ZhiJianTree, nodeId: string) {
  let depth = 0;
  let current = tree.nodes[nodeId];
  while (current?.parentId) {
    depth += 1;
    current = tree.nodes[current.parentId];
  }
  return depth;
}

/**
 * Which rows a collapse shortcut is aimed at. Only rows with children of their own
 * are ever included — the rest have nothing to hide, and counting them would let
 * an empty row decide the direction the whole group toggles in.
 */
export function collapseTargets(tree: ZhiJianTree, nodeId: string | null, scope: CollapseScope) {
  const collapsible = (id: string) =>
    id !== tree.rootId && (tree.nodes[id]?.children.length ?? 0) > 0;

  if (scope.kind === "node") {
    return nodeId && collapsible(nodeId) ? [nodeId] : [];
  }
  if (scope.kind === "siblings") {
    const parentId = nodeId ? tree.nodes[nodeId]?.parentId : null;
    const siblings = parentId ? tree.nodes[parentId]?.children ?? [] : nodeId ? [nodeId] : [];
    return siblings.filter(collapsible);
  }
  if (scope.kind === "level") {
    return Object.keys(tree.nodes).filter(
      (id) => collapsible(id) && nodeDepth(tree, id) === scope.level,
    );
  }
  return Object.keys(tree.nodes).filter(collapsible);
}

/**
 * Which way a group toggles: one row still open means the press closes them all.
 * Fully closed is the only state a press opens, so a half-open group never needs
 * two presses to reach a state you can see.
 */
export function nextCollapsedValue(tree: ZhiJianTree, ids: string[]) {
  return ids.some((id) => tree.nodes[id]?.props?.collapsed !== true);
}

/** Where a node lands among its siblings when moved, or null when it cannot move. */
export function siblingSwapIndex(tree: ZhiJianTree, nodeId: string, direction: -1 | 1) {
  const parentId = tree.nodes[nodeId]?.parentId;
  if (!parentId) return null;
  const siblings = tree.nodes[parentId]?.children ?? [];
  const index = siblings.indexOf(nodeId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return null;
  return target;
}

/** Where the caret or selection belongs once a node is taken away. */
export function focusAfterDelete(tree: ZhiJianTree, nodeId: string) {
  const parentId = tree.nodes[nodeId]?.parentId;
  if (!parentId) return null;
  const siblings = tree.nodes[parentId]?.children ?? [];
  const index = siblings.indexOf(nodeId);
  return siblings[index - 1] ?? siblings[index + 1] ?? parentId;
}

/**
 * The node "进入当前主题" opens: the row itself, as long as it is not the document
 * title — zooming into the root is the view you are already looking at.
 */
export function zoomInTargetId(tree: ZhiJianTree, nodeId: string | null) {
  if (!nodeId || nodeId === tree.rootId || !tree.nodes[nodeId]) return null;
  return nodeId;
}

/**
 * The node "返回上一级主题" opens: the parent of the row currently zoomed into, or
 * null once that parent is the root — which is the whole document again.
 */
export function zoomOutTargetId(tree: ZhiJianTree, zoomedNodeId: string | null) {
  if (!zoomedNodeId) return null;
  const parentId = tree.nodes[zoomedNodeId]?.parentId;
  return parentId && parentId !== tree.rootId ? parentId : null;
}

export interface TreeShortcutContext {
  store: TreeStore;
  /** The row the shortcut was pressed on, if there is one. */
  nodeId: string | null;
  /** The node the caret or map selection belongs on once the change is committed. */
  onFocusNode?: (nodeId: string) => void;
}

const COLLAPSE_SCOPES: Partial<Record<ShortcutId, CollapseScope>> = {
  "toggle-collapse": { kind: "node" },
  "toggle-collapse-siblings": { kind: "siblings" },
  "toggle-collapse-level-1": { kind: "level", level: 1 },
  "toggle-collapse-level-2": { kind: "level", level: 2 },
  "toggle-collapse-level-3": { kind: "level", level: 3 },
  "toggle-collapse-all": { kind: "all" },
};

/** Returns true when the shortcut was one of these and has been carried out. */
export function applyTreeShortcut(id: ShortcutId, { store, nodeId, onFocusNode }: TreeShortcutContext) {
  const tree = store.getSnapshot();
  const scope = COLLAPSE_SCOPES[id];
  if (scope) {
    const targets = collapseTargets(tree, nodeId, scope);
    if (!targets.length) return true;
    const collapsed = nextCollapsedValue(tree, targets);
    // One commit for the whole group, so a full collapse is one undo step.
    store.updateNodes(targets.map((targetId) => ({ id: targetId, props: { collapsed } })));
    return true;
  }

  if (id === "toggle-todo-done") {
    const node = nodeId ? tree.nodes[nodeId] : undefined;
    if (!node || node.type !== "todo") return true;
    store.updateProps(node.id, { checked: !(node.props?.checked ?? false) });
    return true;
  }

  if (id === "duplicate-node") {
    if (!nodeId) return true;
    const copyId = store.duplicate(nodeId);
    if (copyId) onFocusNode?.(copyId);
    return true;
  }

  if (id === "delete-node") {
    if (!nodeId || nodeId === tree.rootId) return true;
    const next = focusAfterDelete(tree, nodeId);
    store.deleteNode(nodeId);
    if (next) onFocusNode?.(next);
    return true;
  }

  if (id === "move-node-up" || id === "move-node-down") {
    if (!nodeId) return true;
    const index = siblingSwapIndex(tree, nodeId, id === "move-node-up" ? -1 : 1);
    const parentId = tree.nodes[nodeId]?.parentId;
    if (index === null || !parentId) return true;
    store.moveNode(nodeId, parentId, index);
    onFocusNode?.(nodeId);
    return true;
  }

  return false;
}

/**
 * The same text shortcuts as `blockShortcutCommands`, but written against the tree
 * for the one place there is no editor to run them in: a node selected on the map
 * canvas with its editor closed. A colour there covers the whole node, because a
 * selected node is the whole of the selection.
 *
 * Kept apart from `applyTreeShortcut` so the outline — which always has an editor
 * — keeps taking these through BlockNote, where a colour can land on one word.
 *
 * 嵌入链接 and 添加图片 are not here: both need something asked of the user (a URL,
 * a file) that only the editor's own UI provides.
 */
export function applyNodeTextShortcut(id: ShortcutId, { store, nodeId, onFocusNode }: TreeShortcutContext) {
  if (!nodeId) return false;
  const tree = store.getSnapshot();
  const node = tree.nodes[nodeId];
  if (!node || nodeId === tree.rootId) return false;

  const headingLevel = SHORTCUT_HEADING_LEVELS.get(id);
  if (headingLevel) {
    store.updateType(nodeId, "heading", { headingLevel });
    return true;
  }

  if (id === "set-paragraph") {
    store.updateType(nodeId, "text");
    return true;
  }

  if (id === "toggle-todo") {
    store.updateType(nodeId, node.type === "todo" ? "text" : "todo");
    return true;
  }

  if (SHORTCUT_TEXT_COLORS.has(id)) {
    const textColor = SHORTCUT_TEXT_COLORS.get(id) ?? null;
    store.updateContent(nodeId, withRichTextMarks(node.content, { textColor }));
    return true;
  }

  const backgroundColor = SHORTCUT_BACKGROUND_COLORS.get(id);
  if (backgroundColor) {
    // Toggled, matching the editor side: there is no 默认 key for backgrounds, so
    // the same colour pressed twice is the way back to none.
    const painted = everySpanHasMark(node.content, "backgroundColor", backgroundColor);
    store.updateContent(
      nodeId,
      withRichTextMarks(node.content, { backgroundColor: painted ? null : backgroundColor }),
    );
    return true;
  }

  if (id === "insert-table") {
    // A sibling row after this one, which is what the same key does in the outline:
    // turning the node itself into a table would throw its text away.
    const parentId = node.parentId;
    if (!parentId) return true;
    const index = (tree.nodes[parentId]?.children.indexOf(nodeId) ?? -1) + 1;
    const tableId = store.createNode({ parentId, index, type: "table" });
    if (tableId) onFocusNode?.(tableId);
    return true;
  }

  return false;
}
