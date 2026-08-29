export interface WorkspaceFolder {
  id: string;
  title: string;
  type: "folder";
  parentId: string | null;
  order: number;
}

export interface WorkspaceFile {
  id: string;
  title: string;
  type: "file";
  parentId: string | null;
  order: number;
  favorite: boolean;
  openedAt: number;
}

export type WorkspaceNode = WorkspaceFolder | WorkspaceFile;
export type DropMode = "before" | "inside" | "after";

export interface WorkspaceTrashEntry {
  id: string;
  deletedAt: number;
  nodes: WorkspaceNode[];
}

export const initialNodes: WorkspaceNode[] = [
  { id: "product", title: "产品", type: "folder", parentId: null, order: 0 },
  { id: "work", title: "工作", type: "folder", parentId: null, order: 1 },
  { id: "personal", title: "个人", type: "folder", parentId: null, order: 2 },
  { id: "product-plan", title: "产品规划", type: "file", parentId: "product", order: 0, favorite: true, openedAt: 6 },
  { id: "roadmaps", title: "路线图", type: "folder", parentId: "product", order: 1 },
  { id: "web-roadmap", title: "Web 端路线图", type: "file", parentId: "roadmaps", order: 0, favorite: false, openedAt: 5 },
  { id: "app-notes", title: "App 端设计记录", type: "file", parentId: "roadmaps", order: 1, favorite: false, openedAt: 2 },
  { id: "weekly", title: "本周工作", type: "file", parentId: "work", order: 0, favorite: true, openedAt: 4 },
  { id: "meeting", title: "会议记录", type: "file", parentId: "work", order: 1, favorite: false, openedAt: 3 },
  { id: "reading", title: "阅读清单", type: "file", parentId: "personal", order: 0, favorite: false, openedAt: 1 },
];

export function isWorkspaceFile(node: WorkspaceNode): node is WorkspaceFile {
  return node.type === "file";
}

export function childNodes(nodes: WorkspaceNode[], parentId: string | null) {
  return nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.order - b.order);
}

export function searchFiles(nodes: WorkspaceNode[], query: string) {
  const files = nodes.filter(isWorkspaceFile);
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return files;
  return files.filter((file) => file.title.toLocaleLowerCase("zh-CN").includes(normalized));
}

export function folderPath(nodes: WorkspaceNode[], nodeId: string) {
  const path: WorkspaceFolder[] = [];
  let current = nodes.find((node) => node.id === nodeId);
  while (current?.parentId) {
    const parent = nodes.find((node) => node.id === current?.parentId);
    if (!parent || parent.type !== "folder") break;
    path.unshift(parent);
    current = parent;
  }
  return path;
}

export function folderDepth(nodes: WorkspaceNode[], folderId: string | null) {
  if (!folderId) return 0;
  return folderPath(nodes, folderId).length + 1;
}

function subtreeFolderHeight(nodes: WorkspaceNode[], folderId: string): number {
  const folders = childNodes(nodes, folderId).filter((node): node is WorkspaceFolder => node.type === "folder");
  return 1 + Math.max(0, ...folders.map((folder) => subtreeFolderHeight(nodes, folder.id)));
}

function descendantIds(nodes: WorkspaceNode[], nodeId: string): Set<string> {
  const ids = new Set<string>();
  const visit = (parentId: string) => {
    for (const child of childNodes(nodes, parentId)) {
      ids.add(child.id);
      if (child.type === "folder") visit(child.id);
    }
  };
  visit(nodeId);
  return ids;
}

export function canMoveNode(nodes: WorkspaceNode[], nodeId: string, parentId: string | null) {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return false;
  if (parentId) {
    const parent = nodes.find((item) => item.id === parentId);
    if (!parent || parent.type !== "folder") return false;
  }
  if (node.type === "folder") {
    if (parentId === node.id || descendantIds(nodes, node.id).has(parentId ?? "")) return false;
    return folderDepth(nodes, parentId) + subtreeFolderHeight(nodes, node.id) <= 3;
  }
  return true;
}

function normalizeOrders(nodes: WorkspaceNode[]) {
  const next = [...nodes];
  const parentIds = new Set(next.map((node) => node.parentId));
  for (const parentId of parentIds) {
    childNodes(next, parentId).forEach((node, order) => {
      const index = next.findIndex((item) => item.id === node.id);
      next[index] = { ...next[index]!, order };
    });
  }
  return next;
}

export function moveWorkspaceNode(nodes: WorkspaceNode[], nodeId: string, parentId: string | null, index = Number.POSITIVE_INFINITY) {
  if (!canMoveNode(nodes, nodeId, parentId)) return nodes;
  const siblings = childNodes(nodes, parentId).filter((node) => node.id !== nodeId);
  const targetIndex = Math.max(0, Math.min(index, siblings.length));
  siblings.splice(targetIndex, 0, nodes.find((node) => node.id === nodeId)!);
  const moved = nodes.map((node) => node.id === nodeId ? { ...node, parentId } : node);
  return normalizeOrders(moved.map((node) => {
    const order = siblings.findIndex((sibling) => sibling.id === node.id);
    return order >= 0 ? { ...node, order } : node;
  }));
}

export function placeWorkspaceNode(nodes: WorkspaceNode[], nodeId: string, targetId: string, mode: DropMode) {
  if (nodeId === targetId) return nodes;
  const target = nodes.find((node) => node.id === targetId);
  if (!target) return nodes;
  if (mode === "inside" && target.type === "folder") return moveWorkspaceNode(nodes, nodeId, target.id);
  const siblings = childNodes(nodes, target.parentId).filter((node) => node.id !== nodeId);
  const targetIndex = siblings.findIndex((node) => node.id === target.id);
  return moveWorkspaceNode(nodes, nodeId, target.parentId, targetIndex + (mode === "after" ? 1 : 0));
}

function makeId(type: WorkspaceNode["type"], suffix = "") {
  return `${type}-${Date.now().toString(36)}${suffix}`;
}

export function createWorkspaceNode(nodes: WorkspaceNode[], type: WorkspaceNode["type"], parentId: string | null = null) {
  if (type === "folder" && folderDepth(nodes, parentId) >= 3) return { node: null, nodes };
  const shiftedNodes = nodes.map((node) => node.parentId === parentId ? { ...node, order: node.order + 1 } : node);
  const base = { id: makeId(type), title: type === "file" ? "无标题" : "新建文件夹", parentId, order: 0 };
  const node: WorkspaceNode = type === "file"
    ? { ...base, type: "file", favorite: false, openedAt: Math.max(0, ...nodes.filter(isWorkspaceFile).map((file) => file.openedAt)) + 1 }
    : { ...base, type: "folder" };
  return { node, nodes: [...shiftedNodes, node] };
}

export function renameWorkspaceNode(nodes: WorkspaceNode[], nodeId: string, title: string) {
  const normalized = title.trim() || "无标题";
  return nodes.map((node) => node.id === nodeId ? { ...node, title: normalized } : node);
}

export function deleteWorkspaceNode(nodes: WorkspaceNode[], nodeId: string) {
  const deleted = descendantIds(nodes, nodeId);
  deleted.add(nodeId);
  return normalizeOrders(nodes.filter((node) => !deleted.has(node.id)));
}

export function trashWorkspaceNode(nodes: WorkspaceNode[], nodeId: string) {
  const deleted = descendantIds(nodes, nodeId);
  deleted.add(nodeId);
  const trashedNodes = nodes.filter((node) => deleted.has(node.id));
  if (!trashedNodes.length) return { nodes, entry: null };
  return {
    nodes: normalizeOrders(nodes.filter((node) => !deleted.has(node.id))),
    entry: { id: nodeId, deletedAt: Date.now(), nodes: trashedNodes } satisfies WorkspaceTrashEntry,
  };
}

export function restoreWorkspaceTrashEntry(nodes: WorkspaceNode[], entry: WorkspaceTrashEntry) {
  const restoredIds = new Set(entry.nodes.map((node) => node.id));
  const root = entry.nodes.find((node) => node.id === entry.id);
  if (!root) return nodes;
  const parentId = root.parentId && (nodes.some((node) => node.id === root.parentId) || restoredIds.has(root.parentId))
    ? root.parentId
    : null;
  const shifted = nodes.map((node) => node.parentId === parentId ? { ...node, order: node.order + 1 } : node);
  const restored = entry.nodes.map((node) => node.id === root.id ? { ...node, parentId, order: 0 } : node);
  return normalizeOrders([...shifted, ...restored]);
}

export function duplicateWorkspaceNode(nodes: WorkspaceNode[], nodeId: string) {
  const source = nodes.find((node) => node.id === nodeId);
  if (!source) return { node: null, nodes };
  let sequence = 0;
  const clones: WorkspaceNode[] = [];
  const clone = (node: WorkspaceNode, parentId: string | null): WorkspaceNode => {
    const id = makeId(node.type, `-${sequence++}`);
    const copy = { ...node, id, title: `${node.title} 副本`, parentId, order: childNodes([...nodes, ...clones], parentId).length };
    clones.push(copy);
    if (node.type === "folder") childNodes(nodes, node.id).forEach((child) => clone(child, id));
    return copy;
  };
  const root = clone(source, source.parentId);
  return { node: root, nodes: normalizeOrders([...nodes, ...clones]) };
}

export function markFileOpened(nodes: WorkspaceNode[], fileId: string) {
  const openedAt = Math.max(0, ...nodes.filter(isWorkspaceFile).map((file) => file.openedAt)) + 1;
  return nodes.map((node) => node.id === fileId && node.type === "file" ? { ...node, openedAt } : node);
}
