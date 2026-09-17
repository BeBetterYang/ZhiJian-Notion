import { useState, type DragEvent, type ReactNode } from "react";
import { FileText, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import { DocumentIcon, DocumentIconFromStore } from "../shared/documentIcon/DocumentIcon";
import { latestTreeUpdatedAt } from "../core/tree";
import { childNodes, isWorkspaceFile, type DropMode, type WorkspaceFile, type WorkspaceFolder, type WorkspaceNode } from "./workspaceData";
import { TreeStore } from "../core/treeStore";

interface FolderViewProps {
  folder: WorkspaceFolder;
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
  const children = childNodes(nodes, folder.id);
  const folders = children.filter((node): node is WorkspaceFolder => node.type === "folder");
  const files = children.filter(isWorkspaceFile);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; mode: DropMode } | null>(null);

  const clearDrag = () => {
    setDraggedNodeId(null);
    setDropTarget(null);
  };

  const startDrag = (event: DragEvent<HTMLDivElement>, node: WorkspaceNode) => {
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
    const mode = dropTarget?.nodeId === node.id ? dropTarget.mode : "after";
    if (draggedNodeId && draggedNodeId !== node.id) onMoveNode(draggedNodeId, node.id, mode);
    clearDrag();
  };

  return (
    <div className="folder-view">
      <div className="folder-view-content">
        <header className="folder-view-heading">
          <FolderOpen className="folder-view-heading-icon" aria-hidden="true" />
          <h1>{folder.title || "无标题"}</h1>
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
            <h2 id="folder-view-files-title" className="folder-view-section-title">文档</h2>
            <div className="folder-view-list">
              {files.map((file) => (
                <FolderViewRow
                  key={file.id}
                  node={file}
                  nodes={nodes}
                  stores={stores}
                  onOpen={() => onSelectFile(file)}
                  draggable
                  dragging={draggedNodeId === file.id}
                  dropMode={dropTarget?.nodeId === file.id ? dropTarget.mode : null}
                  onDragStart={(event) => startDrag(event, file)}
                  onDragOver={(event) => updateDropTarget(event, file)}
                  onDrop={(event) => finishDrop(event, file)}
                  onDragEnd={clearDrag}
                  onOpenNodeMenu={onOpenNodeMenu}
                  menuOpen={openMenuNodeId === file.id}
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

function FolderViewRow({ node, nodes, stores, onOpen, onOpenNodeMenu, menuOpen, renderNodeMenu, draggable, dragging, dropMode, onDragStart, onDragOver, onDrop, onDragEnd }: {
  node: WorkspaceNode;
  nodes: WorkspaceNode[];
  stores?: Map<string, TreeStore>;
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
  const store = node.type === "file" ? stores?.get(node.id) : undefined;
  const childCount = node.type === "folder" ? childNodes(nodes, node.id).length : 0;
  const documentTimes = store ? getDocumentTimes(store) : null;
  return (
    <div
      className={`folder-view-row${dragging ? " is-dragging" : ""}${dropMode ? ` drop-${dropMode}` : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <button type="button" className="folder-view-row-main" onClick={onOpen} aria-label={`打开${node.type === "folder" ? "文件夹" : "文档"} ${node.title || "无标题"}`}>
        {node.type === "folder" ? <Folder aria-hidden="true" /> : store ? <DocumentIconFromStore store={store} size="sidebar" /> : <DocumentIcon size="sidebar" />}
        <span className="folder-view-row-copy">
          <span>{node.title || "无标题"}</span>
          {documentTimes ? (
            <span className="folder-view-row-meta" aria-label={`最近编辑 ${formatFolderDate(documentTimes.lastEditedAt)}，创建时间 ${formatFolderDate(documentTimes.createdAt)}`}>
              <span>最近编辑 {formatFolderDate(documentTimes.lastEditedAt)}</span>
              <span>创建时间 {formatFolderDate(documentTimes.createdAt)}</span>
            </span>
          ) : null}
        </span>
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

function getDocumentTimes(store: TreeStore) {
  const tree = store.getSnapshot();
  const createdAt = tree.nodes[tree.rootId]?.meta?.createdAt ?? 0;
  const lastEditedAt = latestTreeUpdatedAt(tree);
  if (createdAt <= 0 && lastEditedAt <= 0) return null;
  return { createdAt, lastEditedAt };
}

function formatFolderDate(timestamp: number) {
  if (timestamp <= 0) return "未知";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
