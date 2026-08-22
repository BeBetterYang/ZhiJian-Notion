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

function moveNodesFromMind(
  name: "moveNodeIn" | "moveNodeBefore" | "moveNodeAfter",
  objs: NodeObj[],
  toObj: NodeObj,
  store: TreeStore,
) {
  objs.forEach((obj, offset) => {
    if (!store.getNode(obj.id)) {
      return;
    }
    if (name === "moveNodeIn") {
      store.moveNode(obj.id, toObj.id);
      return;
    }
    const parentId = toObj.parent?.id;
    if (!parentId) {
      return;
    }
    const toIndex = getIndexInParent(toObj);
    store.moveNode(obj.id, parentId, name === "moveNodeBefore" ? toIndex + offset : toIndex + 1 + offset);
  });
}

function getIndexInParent(obj: NodeObj) {
  return Math.max(0, obj.parent?.children?.findIndex((child) => child.id === obj.id) ?? 0);
}
