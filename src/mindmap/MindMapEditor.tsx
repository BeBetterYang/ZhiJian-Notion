import "mind-elixir/style.css";
import MindElixir, { type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { textOffset } from "../outline/mindMapTextSelection";
import { createMindMapStructureSignature, renderMindMapNode, treeToMindElixir } from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";
import { MindMapMediaBlock } from "./MindMapMediaBlock";
import { MindMapNodeContentBlock } from "./MindMapNodeGroupBlock";

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
  const mediaHosts = useRef(new Map<string, HTMLDivElement>());
  const contentHosts = useRef(new Map<string, HTMLDivElement>());
  const [mediaTargets, setMediaTargets] = useState<Array<{ id: string; host: HTMLElement }>>([]);
  const [contentTargets, setContentTargets] = useState<Array<{ id: string; host: HTMLElement }>>([]);

  const collectTargets = useCallback(() => {
    const container = containerRef.current;
    const media = Array.from(container?.querySelectorAll<HTMLElement>("[data-zhijian-media-node]") ?? []).flatMap((slot) => {
      const id = slot.dataset.zhijianMediaNode;
      if (!id) return [];
      const host = ensureHost(mediaHosts.current, id, "mindmap-media-host");
      if (host.parentElement !== slot) slot.appendChild(host);
      return [{ id, host }];
    });
    const content = Array.from(container?.querySelectorAll<HTMLElement>("[data-zhijian-node-content]") ?? []).flatMap((slot) => {
      const id = slot.dataset.zhijianNodeContent;
      if (!id) return [];
      const host = ensureHost(contentHosts.current, id, "mindmap-content-host");
      if (host.parentElement !== slot) slot.appendChild(host);
      return [{ id, host }];
    });
    pruneHosts(mediaHosts.current, media.map((target) => target.id));
    pruneHosts(contentHosts.current, content.map((target) => target.id));
    setMediaTargets(media);
    setContentTargets(content);
  }, []);

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
      markdown: (topic, obj) => renderMindMapNode(topic, obj as Parameters<typeof renderMindMapNode>[1]),
    });
    mind.init(treeToMindElixir(initialTree.current));
    queueMicrotask(collectTargets);
    mind.bus.addListener("operation", (operation: Operation) => {
      if (suppressOperation.current) return;
      if ("obj" in operation && operation.obj?.id) {
        lastSelectedNodeId.current = operation.obj.id;
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
      const checkbox = (event.target as Element | null)?.closest<HTMLElement>(".mindmap-todo-checkbox");
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
    const mind = mindRef.current;
    if (!mind) return;
    const nextSignature = createMindMapStructureSignature(tree);
    const nextData = treeToMindElixir(tree);
    if (structureSignature.current === nextSignature) {
      const changed = updateMindMapNodesInPlace(mind, nextData.nodeData);
      if (changed) queueMicrotask(collectTargets);
      return;
    }
    structureSignature.current = nextSignature;
    suppressOperation.current = true;
    mind.refresh(nextData);
    mind.clearHistory?.();
    const restoreId = selectedNodeRef.current ?? lastSelectedNodeId.current;
    const timer = window.setTimeout(() => {
      suppressOperation.current = false;
      collectTargets();
      if (!restoreId) return;
      try { mind.selectNode(mind.findEle(restoreId)); } catch { lastSelectedNodeId.current = null; }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collectTargets, tree]);

  useEffect(() => {
    const mind = mindRef.current;
    const targets = [...mediaTargets, ...contentTargets].map(({ host }) => host);
    if (!mind || !targets.length) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mind.linkDiv());
    });
    targets.forEach((target) => observer.observe(target));
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [contentTargets, mediaTargets]);

  const selectPortalNode = (nodeId: string) => {
    lastSelectedNodeId.current = nodeId;
    onSelectRef.current(nodeId);
    onActiveRef.current(true);
  };

  return (
    <>
      <div className="mindmap-canvas" ref={containerRef} />
      {mediaTargets.map(({ id, host }) => {
        const node = tree.nodes[id];
        return node ? createPortal(
          <MindMapMediaBlock node={node} store={store} selected={selectedNodeId === id} toolbarTarget={toolbarTarget} onSelect={selectPortalNode} />,
          host,
          id,
        ) : null;
      })}
      {contentTargets.map(({ id, host }) => {
        const node = tree.nodes[id];
        return node ? createPortal(
          <MindMapNodeContentBlock node={node} store={store} selected={selectedNodeId === id} toolbarTarget={toolbarTarget} onSelect={selectPortalNode} focusRequest={focusRequest} onFocusRequestHandled={onFocusRequestHandled} />,
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

function updateMindMapNodesInPlace(mind: MindElixir, root: import("mind-elixir").NodeObj) {
  let slotsChanged = false;
  const visit = (nextNode: typeof root) => {
    try {
      const topicElement = mind.findEle(nextNode.id);
      const currentNode = topicElement.nodeObj;
      const currentHtml = currentNode.dangerouslySetInnerHTML;
      currentNode.topic = nextNode.topic;
      currentNode.note = nextNode.note;
      currentNode.style = nextNode.style;
      currentNode.metadata = nextNode.metadata;
      currentNode.dangerouslySetInnerHTML = nextNode.dangerouslySetInnerHTML;
      Object.entries(nextNode.style ?? {}).forEach(([property, value]) => {
        (topicElement.style as unknown as Record<string, string>)[property] = String(value ?? "");
      });
      if (currentHtml !== nextNode.dangerouslySetInnerHTML) {
        slotsChanged = true;
        if (nextNode.dangerouslySetInnerHTML) topicElement.innerHTML = nextNode.dangerouslySetInnerHTML;
        else {
          topicElement.innerHTML = `<span class="text">${renderMindMapNode(nextNode.topic, nextNode)}</span>`;
          const text = topicElement.querySelector<HTMLElement>(".text");
          if (text) topicElement.text = text;
        }
      } else if (!nextNode.dangerouslySetInnerHTML) {
        const text = topicElement.querySelector<HTMLElement>(".text");
        if (text) text.innerHTML = renderMindMapNode(nextNode.topic, nextNode);
      }
    } catch { /* collapsed descendants are not mounted */ }
    nextNode.children?.forEach(visit);
  };
  visit(root);
  mind.linkDiv();
  return slotsChanged;
}
