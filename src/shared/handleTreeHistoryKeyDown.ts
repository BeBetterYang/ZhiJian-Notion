import type { TreeStore } from "../core/treeStore";

export function handleTreeHistoryKeyDown(event: KeyboardEvent, store: TreeStore) {
  const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z";
  if (!isUndo) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.shiftKey) {
    store.redo();
  } else {
    store.undo();
  }
  return true;
}
