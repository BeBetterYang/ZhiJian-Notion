import "mind-elixir/style.css";
import MindElixir, { type MindElixirData, type NodeObj, type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { createMindMapStructureSignature, treeToMindElixir } from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";
import { displayClickAction, mindMapUpdateMode, shouldExitEditing, type EditingTarget } from "./mindMapInteraction";
import { MindMapNodeContent } from "./MindMapNodeGroupBlock";

interface MindMapEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  onSelectionActiveChange: (active: boolean) => void;
  onTextSelectionChange: (selection: MindMapTextSelection | null) => void;
  selectedNodeId: string | null;
  toolbarTarget: HTMLElement | null;
  focusRequest: { nodeId: string; focusBlockId: string; requestId: number } | null;
  onFocusRequestHandled: (requestId: number) => void;
}

export interface MindMapTextSelection {
  nodeId: string;
  from: number;
  to: number;
}

export function MindMapEditor({ store, onSelectNode, onSelectionActiveChange, onTextSelectionChange, selectedNodeId, toolbarTarget, focusRequest, onFocusRequestHandled }: MindMapEditorProps) {
  const tree = useTree(store);
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const suppressOperation = useRef(false);
  const initialTree = useRef(tree);
  const structureSignature = useRef(createMindMapStructureSignature(tree));
  const pendingStructure = useRef<{ data: MindElixirData; signature: string } | null>(null);
  const storeRef = useRef(store);
  const onSelectRef = useRef(onSelectNode);
  const onActiveRef = useRef(onSelectionActiveChange);
  const onTextSelectionRef = useRef(onTextSelectionChange);
  const selectedNodeRef = useRef(selectedNodeId);
  const lastSelectedNodeId = useRef<string | null>(selectedNodeId);
  const editingTargetRef = useRef<EditingTarget>(null);
  const beginNodeEditRef = useRef<(nodeId: string, focusBlockId?: string) => void>(() => undefined);
  const pointerSelectionBefore = useRef<{ nodeId: string; selectedNodeId: string | null } | null>(null);
  const contentHosts = useRef(new Map<string, HTMLDivElement>());
  const [contentTargets, setContentTargets] = useState<Array<{ id: string; host: HTMLElement }>>([]);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);

  const collectTargets = useCallback(() => {
    const slots = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-zhijian-node-content]") ?? []);
    const content = slots.flatMap((slot) => {
      const id = slot.dataset.zhijianNodeContent;
      if (!id) return [];
      const host = ensureHost(contentHosts.current, id);
      if (host.parentElement !== slot) slot.appendChild(host);
      return [{ id, host }];
    });
    pruneHosts(contentHosts.current, content.map((target) => target.id));
    setContentTargets(content);
  }, []);

  const refreshStructure = useCallback((data: MindElixirData, signature: string) => {
    const mind = mindRef.current;
    if (!mind) return;
    structureSignature.current = signature;
    suppressOperation.current = true;
    mind.refresh(data);
    mind.clearHistory?.();
    queueMicrotask(() => {
      suppressOperation.current = false;
      collectTargets();
      const restoreId = selectedNodeRef.current ?? lastSelectedNodeId.current;
      if (!restoreId) return;
      try { mind.selectNode(mind.findEle(restoreId)); } catch { lastSelectedNodeId.current = null; }
    });
  }, [collectTargets]);

  useEffect(() => {
    storeRef.current = store;
    onSelectRef.current = onSelectNode;
    onActiveRef.current = onSelectionActiveChange;
    onTextSelectionRef.current = onTextSelectionChange;
    selectedNodeRef.current = selectedNodeId;
  }, [onSelectNode, onSelectionActiveChange, onTextSelectionChange, selectedNodeId, store]);

  useEffect(() => {
    if (!containerRef.current || mindRef.current) return;
    const mind = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.SIDE,
      editable: true,
      contextMenu: { locale: zh_CN },
      toolBar: true,
      keypress: true,
      allowUndo: false,
      newTopicName: " ",
      markdown: (topic) => topic,
    });
    mind.init(treeToMindElixir(initialTree.current));
    mind.beginEdit = async (element) => {
      const nodeId = (element ?? mind.currentNode)?.nodeObj.id;
      if (nodeId) beginNodeEditRef.current(nodeId);
    };
    queueMicrotask(collectTargets);
    mind.bus.addListener("operation", (operation: Operation) => {
      if (suppressOperation.current) return;
      if ("obj" in operation && operation.obj?.id) {
        const nodeId = operation.obj.id;
        lastSelectedNodeId.current = nodeId;
        selectedNodeRef.current = nodeId;
        if (shouldExitEditing(editingTargetRef.current, nodeId)) setEditingTarget(null);
        onSelectRef.current(nodeId);
        onActiveRef.current(true);
      }
      applyMindElixirOperation(operation, storeRef.current);
      structureSignature.current = createMindMapStructureSignature(storeRef.current.getSnapshot());
      if (operation.name === "addChild" || operation.name === "insertSibling" || operation.name === "insertBefore") beginNodeEditRef.current(operation.obj.id);
    });
    mind.bus.addListener("selectNodes", (nodes) => {
      const nodeId = nodes[0]?.id;
      if (!nodeId) return;
      lastSelectedNodeId.current = nodeId;
      selectedNodeRef.current = nodeId;
      if (shouldExitEditing(editingTargetRef.current, nodeId)) setEditingTarget(null);
      onSelectRef.current(nodeId);
      onActiveRef.current(true);
    });
    mind.bus.addListener("unselectNodes", () => {
      if (editingTargetRef.current) return;
      onActiveRef.current(false);
      onTextSelectionRef.current(null);
    });
    mind.bus.addListener("changeDirection", () => window.requestAnimationFrame(collectTargets));
    mindRef.current = mind;
    return () => { mind.destroy(); mindRef.current = null; };
  }, [collectTargets]);

  const selectTreeNode = useCallback((nodeId: string) => {
    if (shouldExitEditing(editingTargetRef.current, nodeId)) setEditingTarget(null);
    lastSelectedNodeId.current = nodeId;
    selectedNodeRef.current = nodeId;
    onSelectRef.current(nodeId);
    onActiveRef.current(true);
  }, []);

  const selectMindElixirNode = useCallback((nodeId: string) => {
    selectTreeNode(nodeId);
    try {
      const mind = mindRef.current;
      if (mind) mind.selectNode(mind.findEle(nodeId));
    } catch {
      // Collapsed descendants may not be mounted.
    }
  }, [selectTreeNode]);

  const beginNodeEdit = useCallback((nodeId: string, focusBlockId?: string) => {
    selectMindElixirNode(nodeId);
    setEditingTarget({ nodeId, focusBlockId });
  }, [selectMindElixirNode]);
  beginNodeEditRef.current = beginNodeEdit;

  const finishNodeEdit = useCallback(() => {
    setEditingTarget(null);
    onActiveRef.current(true);
  }, []);

  useEffect(() => {
    if (!focusRequest?.nodeId || !tree.nodes[focusRequest.nodeId]) return;
    beginNodeEdit(focusRequest.nodeId, focusRequest.focusBlockId);
  }, [beginNodeEdit, focusRequest, tree.nodes]);

  useEffect(() => {
    const nextSignature = createMindMapStructureSignature(tree);
    const nextData = treeToMindElixir(tree);
    const mode = mindMapUpdateMode(structureSignature.current !== nextSignature, editingTargetRef.current !== null);
    if (mode === "content") {
      const addedShell = updateMindMapNodesInPlace(mindRef.current, nextData.nodeData, editingTargetRef.current?.nodeId);
      if (addedShell) queueMicrotask(collectTargets);
      return;
    }
    if (mode === "defer-structure") {
      pendingStructure.current = { data: nextData, signature: nextSignature };
      return;
    }
    refreshStructure(nextData, nextSignature);
  }, [collectTargets, refreshStructure, tree]);

  useEffect(() => {
    const previous = editingTargetRef.current;
    setShellEditing(containerRef.current, previous?.nodeId, false);
    setShellEditing(containerRef.current, editingTarget?.nodeId, true);
    editingTargetRef.current = editingTarget;
    window.requestAnimationFrame(() => mindRef.current?.linkDiv());
    if (editingTarget === null && pendingStructure.current) {
      const pending = pendingStructure.current;
      pendingStructure.current = null;
      refreshStructure(pending.data, pending.signature);
    }
  }, [editingTarget, refreshStructure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerDown = (event: PointerEvent) => {
      const shell = (event.target as Element | null)?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      if (shell?.dataset.nodeId) pointerSelectionBefore.current = { nodeId: shell.dataset.nodeId, selectedNodeId: selectedNodeRef.current };
      const checkbox = (event.target as Element | null)?.closest<HTMLElement>(".mindmap-node-checkbox");
      const nodeId = checkbox?.dataset.nodeId;
      if (!nodeId || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const node = storeRef.current.getNode(nodeId);
      if (node?.type !== "todo") return;
      storeRef.current.updateProps(nodeId, { checked: !(node.props?.checked ?? false) });
      selectTreeNode(nodeId);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const shell = target?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      const nodeId = shell?.dataset.nodeId;
      if (!nodeId) return;
      const interactive = Boolean(target?.closest("a,button,input,select,textarea,[role=checkbox]"));
      const selectedBefore = pointerSelectionBefore.current?.nodeId === nodeId ? pointerSelectionBefore.current.selectedNodeId : selectedNodeRef.current;
      const action = displayClickAction(selectedBefore, editingTargetRef.current, nodeId, interactive);
      pointerSelectionBefore.current = null;
      if (action === "select") selectMindElixirNode(nodeId);
      if (action === "edit") beginNodeEdit(nodeId, target?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId);
    };
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const shell = target?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      const nodeId = shell?.dataset.nodeId;
      if (!nodeId || target?.closest("a,button,input,select,textarea,[role=checkbox]")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      beginNodeEdit(nodeId, target?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingTargetRef.current || event.key !== "Enter") return;
      const nodeId = lastSelectedNodeId.current ?? selectedNodeRef.current;
      if (!nodeId || !storeRef.current.getNode(nodeId)) return;
      event.preventDefault();
      event.stopPropagation();
      beginNodeEdit(nodeId);
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("click", onClick, true);
    container.addEventListener("dblclick", onDoubleClick, true);
    container.addEventListener("keydown", onKeyDown, true);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("dblclick", onDoubleClick, true);
      container.removeEventListener("keydown", onKeyDown, true);
    };
  }, [beginNodeEdit, selectMindElixirNode, selectTreeNode]);

  useEffect(() => {
    const targets = contentTargets.map(({ host }) => host);
    if (!targets.length) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mindRef.current?.linkDiv());
    });
    targets.forEach((target) => observer.observe(target));
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [contentTargets]);

  return (
    <>
      <div className="mindmap-canvas" ref={containerRef} />
      {contentTargets.map(({ id, host }) => {
        const node = tree.nodes[id];
        return node ? createPortal(
          <MindMapNodeContent node={node} store={store} selected={selectedNodeId === id} editing={editingTarget?.nodeId === id} toolbarTarget={toolbarTarget} onSelect={selectTreeNode} onFinishEdit={finishNodeEdit} focusBlockId={editingTarget?.nodeId === id ? editingTarget.focusBlockId : undefined} focusRequest={focusRequest} onFocusRequestHandled={onFocusRequestHandled} />,
          host,
          id,
        ) : null;
      })}
    </>
  );
}

function ensureHost(hosts: Map<string, HTMLDivElement>, id: string) {
  let host = hosts.get(id);
  if (!host) {
    host = document.createElement("div");
    host.className = "mindmap-content-host";
    hosts.set(id, host);
  }
  return host;
}

function pruneHosts(hosts: Map<string, HTMLDivElement>, activeIds: string[]) {
  const active = new Set(activeIds);
  for (const id of Array.from(hosts.keys())) if (!active.has(id)) hosts.delete(id);
}

function setShellEditing(container: HTMLElement | null, nodeId: string | undefined, editing: boolean) {
  if (!container || !nodeId) return;
  const shell = Array.from(container.querySelectorAll<HTMLElement>(".mindmap-node-shell[data-node-id]")).find((element) => element.dataset.nodeId === nodeId);
  shell?.classList.toggle("is-editing", editing);
}

function updateMindMapNodesInPlace(mind: MindElixir | null, root: NodeObj, editingNodeId?: string) {
  if (!mind) return false;
  let addedShell = false;
  const visit = (nextNode: NodeObj) => {
    try {
      const topicElement = mind.findEle(nextNode.id);
      const currentNode = topicElement.nodeObj;
      currentNode.topic = nextNode.topic;
      currentNode.note = nextNode.note;
      currentNode.style = nextNode.style;
      currentNode.metadata = nextNode.metadata;
      currentNode.dangerouslySetInnerHTML = nextNode.dangerouslySetInnerHTML;
      Object.entries(nextNode.style ?? {}).forEach(([property, value]) => {
        (topicElement.style as unknown as Record<string, string>)[property] = String(value ?? "");
      });
      addedShell = updateStableShell(topicElement, nextNode.dangerouslySetInnerHTML ?? "", nextNode.id === editingNodeId) || addedShell;
    } catch {
      // Collapsed descendants are not mounted.
    }
    nextNode.children?.forEach(visit);
  };
  visit(root);
  mind.linkDiv();
  return addedShell;
}

function updateStableShell(topicElement: HTMLElement, nextHtml: string, editing: boolean) {
  const currentShell = topicElement.querySelector<HTMLElement>(":scope > .mindmap-node-shell");
  if (!currentShell) {
    topicElement.innerHTML = nextHtml;
    topicElement.querySelector<HTMLElement>(":scope > .mindmap-node-shell")?.classList.toggle("is-editing", editing);
    return true;
  }
  const template = document.createElement("template");
  template.innerHTML = nextHtml;
  const nextShell = template.content.querySelector<HTMLElement>(".mindmap-node-shell");
  const currentDisplay = currentShell.querySelector<HTMLElement>(":scope > .mindmap-node-display");
  const nextDisplay = nextShell?.querySelector<HTMLElement>(":scope > .mindmap-node-display");
  if (!nextShell || !currentDisplay || !nextDisplay) return false;
  currentShell.style.cssText = nextShell.style.cssText;
  if (currentDisplay.innerHTML !== nextDisplay.innerHTML) currentDisplay.innerHTML = nextDisplay.innerHTML;
  return false;
}
