export type EditingTarget = { nodeId: string; focusBlockId?: string } | null;

export type DisplayClickAction = "ignore" | "select" | "edit";

export function displayClickAction(
  selectedNodeId: string | null,
  editingTarget: EditingTarget,
  nodeId: string,
  interactiveTarget: boolean,
): DisplayClickAction {
  if (interactiveTarget || editingTarget?.nodeId === nodeId) return "ignore";
  return selectedNodeId === nodeId ? "edit" : "select";
}

export function shouldExitEditing(editingTarget: EditingTarget, selectedNodeId: string) {
  return editingTarget !== null && editingTarget.nodeId !== selectedNodeId;
}

export function mindMapUpdateMode(structureChanged: boolean, editing: boolean) {
  if (!structureChanged) return "content" as const;
  return editing ? "defer-structure" as const : "refresh-structure" as const;
}

export function resolveMindMapFocusBlockId(nodeId: string, availableBlockIds: string[], requestedBlockId?: string) {
  return requestedBlockId && availableBlockIds.includes(requestedBlockId) ? requestedBlockId : nodeId;
}
