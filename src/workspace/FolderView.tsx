import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, FileText, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import { DocumentIcon, DocumentIconFromStore } from "../shared/documentIcon/DocumentIcon";
import { latestTreeUpdatedAt } from "../core/tree";
import { childNodes, isWorkspaceFile, type DropMode, type WorkspaceFile, type WorkspaceFolder, type WorkspaceNode } from "./workspaceData";
import { TreeStore } from "../core/treeStore";

export type FolderFileSortKey = "custom" | "title" | "createdAt" | "lastEditedAt";
export type SortDirection = "asc" | "desc";

export interface FolderFileViewItem {
  file: WorkspaceFile;
  createdAt: number;
  lastEditedAt: number;
}

export interface FolderSortPreference {
  key: FolderFileSortKey;
  direction: SortDirection;
}

export const FOLDER_VIEW_SORT_STORAGE_KEY = "zhijian.workspace.folder-view-sort.v1";
export type FolderViewCollection = "documents" | "recent" | "favorites";

const DEFAULT_SORT_PREFERENCE: FolderSortPreference = { key: "custom", direction: "asc" };
const SORT_OPTIONS: Array<{ key: FolderFileSortKey; label: string }> = [
  { key: "custom", label: "自定义" },
  { key: "title", label: "标题" },
  { key: "createdAt", label: "创建时间" },
  { key: "lastEditedAt", label: "最后编辑时间" },
];

interface FolderViewProps {
  folder: WorkspaceFolder | null;
  collection?: FolderViewCollection;
  collectionFiles?: WorkspaceFile[];
  nodes: WorkspaceNode[];
  stores: Map<string, TreeStore>;
  onSelectFolder: (folder: WorkspaceFolder) => void;
  onSelectFile: (file: WorkspaceFile) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onMoveNode: (nodeId: string, targetId: string, mode: DropMode) => void;
  onOpenNodeMenu: (node: WorkspaceNode, anchor: HTMLElement) => void;
  openMenuNodeId: string | null;
  renderNodeMenu: (node: WorkspaceNode) => ReactNode;
}

export function FolderView({
  folder,
  collection,
  collectionFiles = [],
  nodes,
  stores,
  onSelectFolder,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onMoveNode,
  onOpenNodeMenu,
  openMenuNodeId,
  renderNodeMenu,
}: FolderViewProps) {
  const children = folder
    ? childNodes(nodes, folder.id)
    : collection === "documents" ? childNodes(nodes, null) : collectionFiles;
  const folders = children.filter((node): node is WorkspaceFolder => node.type === "folder");
  const files = children.filter(isWorkspaceFile);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; mode: DropMode } | null>(null);
  const sortStorageId = folder?.id ?? `collection:${collection ?? "documents"}`;
  const [sortPreference, setSortPreference] = useState<FolderSortPreference>(() => loadFolderSortPreference(sortStorageId));
  const fileIds = files.map((file) => file.id).join("\u0000");
  const [, refreshDocumentMetadata] = useState(0);

  useEffect(() => {
    setSortPreference(loadFolderSortPreference(sortStorageId));
  }, [sortStorageId]);

  // Folder View 只订阅当前文件夹的文档 store，编辑文档后时间排序和行尾日期会及时更新。
  useEffect(() => {
    const unsubs: Array<() => boolean> = [];
    files.forEach((file) => {
      const unsubscribe = stores.get(file.id)?.subscribe(() => refreshDocumentMetadata((value) => value + 1));
      if (unsubscribe) unsubs.push(unsubscribe);
    });
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
    // fileIds 比 files 数组本身稳定，避免普通渲染造成重复订阅。
  }, [fileIds, stores]);

  const fileItems = useMemo(() => files.map((file) => {
    const store = stores.get(file.id);
    const times = store ? getDocumentTimes(store) : { createdAt: 0, lastEditedAt: 0 };
    return { file, ...times };
  }), [files, stores]);
  const sortedFileItems = useMemo(
    () => sortFolderFileItems(fileItems, sortPreference.key, sortPreference.direction),
    [fileItems, sortPreference],
  );
  const canReorderFiles = collection !== "recent" && collection !== "favorites"
    && sortPreference.key === "custom" && sortPreference.direction === "asc";

  const updateSortPreference = (next: FolderSortPreference) => {
    setSortPreference(next);
    saveFolderSortPreference(sortStorageId, next);
  };

  const headingTitle = folder?.title || (collection === "recent" ? "最近打开" : collection === "favorites" ? "星标文件" : "我的文档");

  const clearDrag = () => {
    setDraggedNodeId(null);
    setDropTarget(null);
  };

  const startDrag = (event: DragEvent<HTMLDivElement>, node: WorkspaceNode) => {
    if (node.type === "file" && !canReorderFiles) {
      event.preventDefault();
      return;
    }
    if ((event.target as Element).closest(".folder-view-row-more")) {
      event.preventDefault();
      return;
    }
    setDraggedNodeId(node.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
    const preview = document.createElement("div");
    preview.className = "tree-drag-preview";
    preview.textContent = node.title || "无标题";
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 0, 14);
    requestAnimationFrame(() => preview.remove());
  };

  const updateDropTarget = (event: DragEvent<HTMLDivElement>, node: WorkspaceNode) => {
    event.preventDefault();
    if (!draggedNodeId || draggedNodeId === node.id) return;
    const draggedNode = nodes.find((item) => item.id === draggedNodeId);
    if (draggedNode?.type === "file" && !canReorderFiles) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    const mode: DropMode = node.type === "folder" && ratio >= 0.25 && ratio <= 0.75
      ? "inside"
      : ratio < 0.5 ? "before" : "after";
    setDropTarget({ nodeId: node.id, mode });
    event.dataTransfer.dropEffect = "move";
  };

  const finishDrop = (event: DragEvent<HTMLDivElement>, node: WorkspaceNode) => {
    event.preventDefault();
    const draggedNode = draggedNodeId ? nodes.find((item) => item.id === draggedNodeId) : null;
    const mode = dropTarget?.nodeId === node.id ? dropTarget.mode : "after";
    if (draggedNode && draggedNode.type === "file" && !canReorderFiles) {
      clearDrag();
      return;
    }
    if (draggedNodeId && draggedNodeId !== node.id) onMoveNode(draggedNodeId, node.id, mode);
    clearDrag();
  };

  return (
    <div className="folder-view">
      <div className="folder-view-content">
        <header className="folder-view-heading">
          <FolderOpen className="folder-view-heading-icon" aria-hidden="true" />
          <h1>{headingTitle}</h1>
          <p>{folders.length} 个文件夹 · {files.length} 篇文档</p>
        </header>

        {folders.length ? (
          <section className="folder-view-section" aria-labelledby="folder-view-folders-title">
            <h2 id="folder-view-folders-title" className="folder-view-section-title">子文件夹</h2>
            <div className="folder-view-list">
              {folders.map((child) => (
                <FolderViewRow
                  key={child.id}
                  node={child}
                  nodes={nodes}
                  stores={stores}
                  onOpen={() => onSelectFolder(child)}
                  draggable
                  dragging={draggedNodeId === child.id}
                  dropMode={dropTarget?.nodeId === child.id ? dropTarget.mode : null}
                  onDragStart={(event) => startDrag(event, child)}
                  onDragOver={(event) => updateDropTarget(event, child)}
                  onDrop={(event) => finishDrop(event, child)}
                  onDragEnd={clearDrag}
                  onOpenNodeMenu={onOpenNodeMenu}
                  menuOpen={openMenuNodeId === child.id}
                  renderNodeMenu={renderNodeMenu}
                />
              ))}
            </div>
          </section>
        ) : null}

        {files.length ? (
          <section className="folder-view-section" aria-labelledby="folder-view-files-title">
            <div className="folder-view-section-heading">
              <h2 id="folder-view-files-title" className="folder-view-section-title">文档</h2>
              <FolderSortControl preference={sortPreference} onChange={updateSortPreference} />
            </div>
            <div className="folder-view-list">
              {sortedFileItems.map((item) => (
                <FolderViewRow
                  key={item.file.id}
                  node={item.file}
                  nodes={nodes}
                  stores={stores}
                  fileItem={item}
                  visibleMeta={getVisibleMetadata(item, sortPreference.key)}
                  onOpen={() => onSelectFile(item.file)}
                  draggable={canReorderFiles}
                  dragging={draggedNodeId === item.file.id}
                  dropMode={dropTarget?.nodeId === item.file.id ? dropTarget.mode : null}
                  onDragStart={(event) => startDrag(event, item.file)}
                  onDragOver={(event) => updateDropTarget(event, item.file)}
                  onDrop={(event) => finishDrop(event, item.file)}
                  onDragEnd={clearDrag}
                  onOpenNodeMenu={onOpenNodeMenu}
                  menuOpen={openMenuNodeId === item.file.id}
                  renderNodeMenu={renderNodeMenu}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!children.length ? (
          <div className="folder-view-empty">
            <Folder className="folder-view-empty-icon" aria-hidden="true" />
            <p>这里还没有内容</p>
            <div className="folder-view-empty-actions">
              <button type="button" onClick={onCreateFile}><FileText />新建文档</button>
              <button type="button" onClick={onCreateFolder}><Folder />新建文件夹</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FolderSortControl({ preference, onChange }: { preference: FolderSortPreference; onChange: (preference: FolderSortPreference) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = SORT_OPTIONS.find((option) => option.key === preference.key)?.label ?? "自定义";
  const DirectionIcon = preference.direction === "asc" ? ArrowUp : ArrowDown;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="folder-sort-control" ref={menuRef}>
      <button
        type="button"
        className="folder-sort-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}<DirectionIcon aria-hidden="true" />
      </button>
      {open ? (
        <div className="folder-sort-menu" role="menu" aria-label="文档排序">
          <div className="folder-sort-menu-label">排序</div>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={preference.key === option.key}
              className={preference.key === option.key ? "is-selected" : undefined}
              onClick={() => onChange({ ...preference, key: option.key })}
            >
              <span>{option.label}</span>
            </button>
          ))}
          <div className="menu-divider" />
          <div className="folder-sort-menu-label">方向</div>
          {(["asc", "desc"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              role="menuitemradio"
              aria-checked={preference.direction === direction}
              className={preference.direction === direction ? "is-selected" : undefined}
              onClick={() => {
                onChange({ ...preference, direction });
                setOpen(false);
              }}
            >
              {direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
              <span>{direction === "asc" ? "正序" : "倒序"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FolderViewRow({ node, nodes, stores, fileItem, visibleMeta, onOpen, onOpenNodeMenu, menuOpen, renderNodeMenu, draggable, dragging, dropMode, onDragStart, onDragOver, onDrop, onDragEnd }: {
  node: WorkspaceNode;
  nodes: WorkspaceNode[];
  stores: Map<string, TreeStore>;
  fileItem?: FolderFileViewItem;
  visibleMeta?: { text: string; title: string };
  onOpen: () => void;
  onOpenNodeMenu: (node: WorkspaceNode, anchor: HTMLElement) => void;
  menuOpen: boolean;
  renderNodeMenu: (node: WorkspaceNode) => ReactNode;
  draggable: boolean;
  dragging: boolean;
  dropMode: DropMode | null;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const store = node.type === "file" ? stores.get(node.id) : undefined;
  const childCount = node.type === "folder" ? childNodes(nodes, node.id).length : 0;
  const fullMetadata = fileItem ? `最后编辑 ${formatFolderDate(fileItem.lastEditedAt)}，创建时间 ${formatFolderDate(fileItem.createdAt)}` : undefined;
  return (
    <div
      className={`folder-view-row${dragging ? " is-dragging" : ""}${dropMode ? ` drop-${dropMode}` : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <button type="button" className="folder-view-row-main" onClick={onOpen} aria-label={`打开${node.type === "folder" ? "文件夹" : "文档"} ${node.title || "无标题"}`} title={fullMetadata}>
        {node.type === "folder" ? <Folder aria-hidden="true" /> : store ? <DocumentIconFromStore store={store} size="sidebar" /> : <DocumentIcon size="sidebar" />}
        <span className="folder-view-row-copy">
          <span>{node.title || "无标题"}</span>
          {visibleMeta ? <span className="folder-view-row-meta" title={visibleMeta.title}>{visibleMeta.text}</span> : null}
        </span>
        {fullMetadata ? <span className="folder-view-a11y-meta" aria-label={fullMetadata}>{fullMetadata}</span> : null}
        {node.type === "folder" ? <small>{childCount} 个项目</small> : null}
      </button>
      <button
        type="button"
        className="folder-view-row-more icon-button workspace-node-menu-trigger"
        data-node-menu-trigger="true"
        aria-label={`${node.title || "无标题"}的更多操作`}
        title="更多"
        aria-expanded={menuOpen}
        onClick={(event) => onOpenNodeMenu(node, event.currentTarget)}
      >
        <MoreHorizontal />
      </button>
      {menuOpen ? renderNodeMenu(node) : null}
    </div>
  );
}

export function sortFolderFileItems(items: FolderFileViewItem[], key: FolderFileSortKey, direction: SortDirection) {
  return [...items].sort((a, b) => {
    let comparison = 0;
    if (key === "title") {
      comparison = (a.file.title || "无标题").localeCompare(b.file.title || "无标题", "zh-CN", { numeric: true, sensitivity: "base" });
    } else if (key === "createdAt" || key === "lastEditedAt") {
      const aTime = a[key];
      const bTime = b[key];
      if (aTime <= 0 && bTime > 0) return 1;
      if (bTime <= 0 && aTime > 0) return -1;
      comparison = aTime - bTime;
    } else {
      comparison = a.file.order - b.file.order;
    }
    if (comparison !== 0) return comparison * (direction === "asc" ? 1 : -1);
    const orderComparison = a.file.order - b.file.order;
    return orderComparison !== 0 ? orderComparison : a.file.id.localeCompare(b.file.id);
  });
}

function getVisibleMetadata(item: FolderFileViewItem, key: FolderFileSortKey) {
  if (key === "createdAt" && item.createdAt > 0) return { text: formatFolderDateCompact(item.createdAt), title: `创建时间 ${formatFolderDate(item.createdAt)}` };
  if (key === "lastEditedAt" && item.lastEditedAt > 0) return { text: formatFolderDateCompact(item.lastEditedAt), title: `最后编辑 ${formatFolderDate(item.lastEditedAt)}` };
  return undefined;
}

function getDocumentTimes(store: TreeStore) {
  const tree = store.getSnapshot();
  return {
    createdAt: tree.nodes[tree.rootId]?.meta?.createdAt ?? 0,
    lastEditedAt: latestTreeUpdatedAt(tree),
  };
}

export function formatFolderDate(timestamp: number) {
  if (timestamp <= 0) return "未知";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatFolderDateCompact(timestamp: number, now = Date.now()) {
  if (timestamp <= 0) return "未知";
  const date = new Date(timestamp);
  const current = new Date(now);
  const startOfDay = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startOfDay - dateStart) / 86_400_000);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (dayDifference === 0) return `今天 ${time}`;
  if (dayDifference === 1) return `昨天 ${time}`;
  if (date.getFullYear() === current.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function loadFolderSortPreference(folderId: string): FolderSortPreference {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FOLDER_VIEW_SORT_STORAGE_KEY) ?? "{}");
    const value = raw?.[folderId];
    if (value?.key && SORT_OPTIONS.some((option) => option.key === value.key) && (value.direction === "asc" || value.direction === "desc")) {
      return { key: value.key, direction: value.direction };
    }
  } catch {
    // Ignore malformed view preferences and use the upgrade-safe default.
  }
  return DEFAULT_SORT_PREFERENCE;
}

function saveFolderSortPreference(folderId: string, preference: FolderSortPreference) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FOLDER_VIEW_SORT_STORAGE_KEY) ?? "{}");
    window.localStorage.setItem(FOLDER_VIEW_SORT_STORAGE_KEY, JSON.stringify({ ...raw, [folderId]: preference }));
  } catch {
    // A storage failure must not prevent sorting in the current view.
  }
}
