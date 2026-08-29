import type { NodeObj, Operation } from "mind-elixir";
import { plainTextContent } from "../core/tree";
import type { TreeStore } from "../core/treeStore";

export function applyMindElixirOperation(operation: Operation, store: TreeStore) {
  switch (operation.name) {
    case "addChild":
    case "insertSibling":
    case "insertBefore":
      createNodeFromMind(operation.obj, store);
      return;
    case "removeNodes":
      operation.objs.forEach((obj) => store.deleteNode(obj.id));
      return;
    case "moveNodeIn":
    case "moveNodeBefore":
    case "moveNodeAfter":
      if ("objs" in operation) {
        moveNodesFromMind(operation.name, operation.objs, operation.toObj, store);
      } else {
        createNodeFromMind(operation.obj, store);
      }
      return;
    case "reshapeNode":
      if (typeof operation.obj.expanded === "boolean") {
        store.updateProps(operation.obj.id, { collapsed: operation.obj.expanded === false });
      }
      return;
    default:
      return;
  }
}

function createNodeFromMind(obj: NodeObj, store: TreeStore) {
  if (store.getNode(obj.id)) {
    return;
  }
  const parentId = obj.parent?.id ?? store.getSnapshot().rootId;
  if (obj.id === store.getSnapshot().rootId || !store.getNode(parentId)) {
    return;
  }
  store.createNode({
    id: obj.id,
    parentId,
    index: getIndexInParent(obj),
    content: plainTextContent(obj.topic.trim()),
    type: "text",
  });
}

/**
 * A drop next to another node, reported *after* MindElixir has already reordered its
 * own copy of the tree.
 *
 * So the anchor's index cannot be read from `toObj.parent.children` — by the time this
 * runs the dragged node is sitting in that list too, and using it made the store
 * disagree with what the map was showing: dragging a node before its previous sibling
 * computed the sibling's new index (1) and put the node back where it started, and with
 * three children the node landed one slot past the anchor. The map kept the drop, the
 * store kept the old order, and the next projection — a reload, or a trip through the
 * outline — took the move back.
 *
 * The store's own list is the one that decides, and `moveNode` splices into it with the
 * dragged node already taken out, so the anchor is looked up in that same list.
 */
function moveNodesFromMind(
  name: "moveNodeIn" | "moveNodeBefore" | "moveNodeAfter",
  objs: NodeObj[],
  toObj: NodeObj,
  store: TreeStore,
) {
  if (name === "moveNodeIn") {
    objs.forEach((obj) => {
      if (store.getNode(obj.id)) store.moveNode(obj.id, toObj.id);
    });
    return;
  }
  const parentId = store.getNode(toObj.id)?.parentId;
  if (!parentId) {
    return;
  }
  objs.forEach((obj, offset) => {
    if (!store.getNode(obj.id)) {
      return;
    }
    const siblings = (store.getNode(parentId)?.children ?? []).filter((id) => id !== obj.id);
    const anchor = siblings.indexOf(toObj.id);
    if (anchor < 0) {
      return;
    }
    // Dropping several nodes before the anchor needs no offset: each one is inserted
    // immediately ahead of the anchor, whose index the next lookup already finds moved
    // along. Dropping them after it does, or the second would land ahead of the first.
    store.moveNode(obj.id, parentId, name === "moveNodeBefore" ? anchor : anchor + 1 + offset);
  });
}

function getIndexInParent(obj: NodeObj) {
  return Math.max(0, obj.parent?.children?.findIndex((child) => child.id === obj.id) ?? 0);
}
