import "mind-elixir/style.css";
import MindElixir, { type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { textOffset } from "../outline/mindMapTextSelection";
import { createMindMapStructureSignature, treeToMindElixir } from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";
import { MindMapNodeContent } from "./MindMapNodeGroupBlock";
import { renderMindMapNodeHtml } from "./MindMapNodeRenderer";

type EditingTarget = { nodeId: string; focusBlockId?: string } | null;

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

export function MindMapEditor({
  store,
  onSelectNode,
  onSelectionActiveChange,
  onTextSelectionChange,
  selectedNodeId,
  toolbarTarget,
  focusRequest,
  onFocusRequestHandled,
}: MindMapEditorProps) {
  const tree = useTree(store);
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const suppressOperation = useRef(false);
  const lastSelectedNodeId = useRef<string | null>(null);
  const initialTree = useRef(tree);
  const structureSignature = useRef(createMindMapStructureSignature(tree));
  const storeRef = useRef(store);
  const onSelectRef = useRef(onSelectNode);
  const onActiveRef = useRef(onSelectionActiveChange);
  const onTextSelectionRef = useRef(onTextSelectionChange);
  const selectedNodeRef = useRef(selectedNodeId);
  const contentHosts = useRef(new Map<string, HTMLDivElement>());
  const [contentTargets, setContentTargets] = useState<Array<{ id: string; host: HTMLElement }>>([]);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);
  const editingTargetRef = useRef<EditingTarget>(null);

  const collectTargets = useCallback(() => {
    const container = containerRef.current;
    const content = Array.from(container?.querySelectorAll<HTMLElement>("[data-zhijian-node-content]") ?? []).flatMap((slot) => {
      const id = slot.dataset.zhijianNodeContent;
      if (!id) return [];
      const host = ensureHost(contentHosts.current, id, "mindmap-content-host");
      if (host.parentElement !== slot) slot.appendChild(host);
      return [{ id, host }];
    });
    pruneHosts(contentHosts.current, content.map((target) => target.id));
    setContentTargets(content);
  }, []);

  useEffect(() => {
    if (focusRequest?.nodeId && tree.nodes[focusRequest.nodeId]) {
      setEditingTarget({ nodeId: focusRequest.nodeId, focusBlockId: focusRequest.focusBlockId });
    }
  }, [focusRequest, tree.nodes]);

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
    queueMicrotask(collectTargets);
    mind.bus.addListener("operation", (operation: Operation) => {
      if (suppressOperation.current) return;
      if ("obj" in operation && operation.obj?.id) {
        lastSelectedNodeId.current = operation.obj.id;
        setEditingTarget(null);
        onSelectRef.current(operation.obj.id);
        onActiveRef.current(true);
      }
      applyMindElixirOperation(operation, storeRef.current);
      structureSignature.current = createMindMapStructureSignature(storeRef.current.getSnapshot());
      if (operation.name === "addChild" || operation.name === "insertSibling" || operation.name === "insertBefore") {
        queueMicrotask(() => {
          try { mind.beginEdit(mind.findEle(operation.obj.id)); } catch { /* node may be gone */ }
        });
      }
    });
    mind.bus.addListener("selectNodes", (nodes) => {
      if (!nodes[0]) return;
      lastSelectedNodeId.current = nodes[0].id;
      setEditingTarget(null);
      onSelectRef.current(nodes[0].id);
      onActiveRef.current(true);
    });
    mind.bus.addListener("unselectNodes", () => {
      onActiveRef.current(false);
      onTextSelectionRef.current(null);
    });
    mind.bus.addListener("changeDirection", () => window.requestAnimationFrame(collectTargets));
    mindRef.current = mind;
    return () => {
      mind.destroy();
      mindRef.current = null;
    };
  }, [collectTargets]);

  useEffect(() => {
    const onSelectionChange = () => {
      const container = containerRef.current;
      const selection = document.getSelection();
      const editorElement = container?.querySelector<HTMLElement>("#input-box");
      if (!container || !selection || !editorElement || !selection.anchorNode || !selection.focusNode) return;
      if (!editorElement.contains(selection.anchorNode) || !editorElement.contains(selection.focusNode)) return;
      onActiveRef.current(true);
      if (!selection.isCollapsed && lastSelectedNodeId.current) {
        onTextSelectionRef.current({
          nodeId: lastSelectedNodeId.current,
          from: textOffset(editorElement, selection.anchorNode, selection.anchorOffset),
          to: textOffset(editorElement, selection.focusNode, selection.focusOffset),
        });
      } else {
        onTextSelectionRef.current(null);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const toggleTodo = (event: PointerEvent) => {
      const checkbox = (event.target as Element | null)?.closest<HTMLElement>(".mindmap-todo-checkbox, .mindmap-node-checkbox");
      const nodeId = checkbox?.dataset.nodeId;
      if (!nodeId || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const node = storeRef.current.getNode(nodeId);
      if (node?.type !== "todo") return;
      storeRef.current.updateProps(nodeId, { checked: !(node.props?.checked ?? false) });
      lastSelectedNodeId.current = nodeId;
      onSelectRef.current(nodeId);
      onActiveRef.current(true);
    };
    container.addEventListener("pointerdown", toggleTodo, true);
    return () => container.removeEventListener("pointerdown", toggleTodo, true);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingTargetRef.current || event.key !== "Enter") return;
      const nodeId = lastSelectedNodeId.current ?? selectedNodeRef.current;
      if (!nodeId || !storeRef.current.getNode(nodeId)) return;
      event.preventDefault();
      event.stopPropagation();
      setEditingTarget({ nodeId });
    };
    container.addEventListener("keydown", onKeyDown, true);
    return () => container.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    const mind = mindRef.current;
    if (!mind) return;
    const nextSignature = createMindMapStructureSignature(tree);
    const nextData = treeToMindElixir(tree);
    if (structureSignature.current === nextSignature) {
      const changed = updateMindMapNodesInPlace(mind, nextData.nodeData, editingTargetRef.current?.nodeId);
      if (changed) queueMicrotask(collectTargets);
      return;
    }
    structureSignature.current = nextSignature;
    const editingId = editingTargetRef.current?.nodeId;
    if (editingId) setProjectedNodeHtml(nextData.nodeData, editingId, contentSlotHtml(editingId));
    suppressOperation.current = true;
    mind.refresh(nextData);
    mind.clearHistory?.();
    const restoreId = selectedNodeRef.current ?? lastSelectedNodeId.current;
    const timer = window.setTimeout(() => {
      suppressOperation.current = false;
      collectTargets();
      if (editingTargetRef.current) replaceNodeHtml(mind, editingTargetRef.current.nodeId, contentSlotHtml(editingTargetRef.current.nodeId));
      if (!restoreId) return;
      try { mind.selectNode(mind.findEle(restoreId)); } catch { lastSelectedNodeId.current = null; }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collectTargets, tree]);

  useEffect(() => {
    const mind = mindRef.current;
    const targets = contentTargets.map(({ host }) => host);
    if (!mind || !targets.length) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mind.linkDiv());
    });
    targets.forEach((target) => observer.observe(target));
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [contentTargets]);

  const selectPortalNode = useCallback((nodeId: string) => {
    if (editingTargetRef.current?.nodeId !== nodeId) setEditingTarget(null);
    lastSelectedNodeId.current = nodeId;
    onSelectRef.current(nodeId);
    onActiveRef.current(true);
    try {
      const mind = mindRef.current;
      if (mind) mind.selectNode(mind.findEle(nodeId));
    } catch {
      // The node may not be mounted while MindElixir is refreshing its tree.
    }
  }, []);

  const beginNodeEdit = useCallback((nodeId: string, focusBlockId?: string) => {
    selectPortalNode(nodeId);
    setEditingTarget({ nodeId, focusBlockId });
  }, [selectPortalNode]);

  const finishNodeEdit = useCallback(() => {
    setEditingTarget(null);
    onActiveRef.current(true);
  }, []);

  useEffect(() => {
    const mind = mindRef.current;
    const previous = editingTargetRef.current;
    if (previous?.nodeId && previous.nodeId !== editingTarget?.nodeId) {
      const previousNode = storeRef.current.getNode(previous.nodeId);
      if (mind && previousNode) replaceNodeHtml(mind, previousNode.id, renderMindMapNodeHtml(previousNode));
    }
    if (mind && editingTarget) {
      replaceNodeHtml(mind, editingTarget.nodeId, contentSlotHtml(editingTarget.nodeId));
      collectTargets();
      window.requestAnimationFrame(() => mind.linkDiv());
    } else if (editingTarget === null && previous) {
      collectTargets();
      if (mind) window.requestAnimationFrame(() => mind.linkDiv());
    }
    editingTargetRef.current = editingTarget;
  }, [collectTargets, editingTarget]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onRendererClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const renderer = target?.closest<HTMLElement>(".mindmap-node-renderer[data-node-id]");
      const nodeId = renderer?.dataset.nodeId;
      if (!nodeId) return;
      selectPortalNode(nodeId);
    };
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const renderer = target?.closest<HTMLElement>(".mindmap-node-renderer[data-node-id]");
      const nodeId = renderer?.dataset.nodeId;
      if (!nodeId) return;
      const blockId = target?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
      event.preventDefault();
      event.stopPropagation();
      beginNodeEdit(nodeId, blockId);
    };
    container.addEventListener("click", onRendererClick, true);
    container.addEventListener("dblclick", onDoubleClick, true);
    return () => {
      container.removeEventListener("click", onRendererClick, true);
      container.removeEventListener("dblclick", onDoubleClick, true);
    };
  }, [beginNodeEdit, selectPortalNode]);

  return (
    <>
      <div className="mindmap-canvas" ref={containerRef} />
      {contentTargets.map(({ id, host }) => {
        const node = tree.nodes[id];
        return node ? createPortal(
          <MindMapNodeContent
            node={node}
            store={store}
            selected={selectedNodeId === id}
            editing={editingTarget?.nodeId === id}
            toolbarTarget={toolbarTarget}
            onSelect={selectPortalNode}
            onEdit={beginNodeEdit}
            onFinishEdit={finishNodeEdit}
            focusRequest={focusRequest}
            onFocusRequestHandled={onFocusRequestHandled}
          />,
          host,
          id,
        ) : null;
      })}
    </>
  );
}

function ensureHost(hosts: Map<string, HTMLDivElement>, id: string, className: string) {
  let host = hosts.get(id);
  if (!host) {
    host = document.createElement("div");
    host.className = className;
    hosts.set(id, host);
  }
  return host;
}

function pruneHosts(hosts: Map<string, HTMLDivElement>, activeIds: string[]) {
  const active = new Set(activeIds);
  for (const id of Array.from(hosts.keys())) if (!active.has(id)) hosts.delete(id);
}

function contentSlotHtml(id: string) {
  return `<div class="mindmap-node-content-slot" data-zhijian-node-content="${escapeHtml(id)}"></div>`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function replaceNodeHtml(mind: MindElixir, nodeId: string, html: string) {
  try {
    const element = mind.findEle(nodeId);
    element.nodeObj.dangerouslySetInnerHTML = html;
    element.innerHTML = html;
  } catch {
    // A collapsed node may not have a mounted element yet.
  }
}

function setProjectedNodeHtml(node: import("mind-elixir").NodeObj, nodeId: string, html: string): boolean {
  if (node.id === nodeId) {
    node.dangerouslySetInnerHTML = html;
    return true;
  }
  return node.children?.some((child) => setProjectedNodeHtml(child, nodeId, html)) ?? false;
}

function updateMindMapNodesInPlace(mind: MindElixir, root: import("mind-elixir").NodeObj, editingNodeId?: string) {
  let slotsChanged = false;
  const visit = (nextNode: typeof root) => {
    try {
      const topicElement = mind.findEle(nextNode.id);
      const currentNode = topicElement.nodeObj;
      const currentHtml = currentNode.dangerouslySetInnerHTML;
      const nextHtml = nextNode.id === editingNodeId ? contentSlotHtml(nextNode.id) : nextNode.dangerouslySetInnerHTML ?? "";
      currentNode.topic = nextNode.topic;
      currentNode.note = nextNode.note;
      currentNode.style = nextNode.style;
      currentNode.metadata = nextNode.metadata;
      currentNode.dangerouslySetInnerHTML = nextHtml;
      Object.entries(nextNode.style ?? {}).forEach(([property, value]) => {
        (topicElement.style as unknown as Record<string, string>)[property] = String(value ?? "");
      });
      if (currentHtml !== nextHtml) {
        slotsChanged = true;
        topicElement.innerHTML = nextHtml;
      }
    } catch { /* collapsed descendants are not mounted */ }
    nextNode.children?.forEach(visit);
  };
  visit(root);
  mind.linkDiv();
  return slotsChanged;
}
