import "mind-elixir/style.css";
import MindElixir, { type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import {
  createMindMapStructureSignature,
  renderMindMapNode,
  treeToMindElixir,
} from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";
import { MindMapMediaBlock } from "./MindMapMediaBlock";
import { MindMapNodeGroupBlock } from "./MindMapNodeGroupBlock";
import { textOffset } from "../outline/mindMapTextSelection";

interface MindMapEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  onSelectionActiveChange: (active: boolean) => void;
  onTextSelectionChange: (selection: MindMapTextSelection | null) => void;
  selectedNodeId: string | null;
  toolbarTarget: HTMLElement | null;
  focusRequest: { nodeId: string; requestId: number } | null;
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
  const pendingNativeEndFocus = useRef<string | null>(null);
  const initialTree = useRef(tree);
  const mindStructureSignature = useRef(createMindMapStructureSignature(tree));
  const storeRef = useRef(store);
  const onSelectNodeRef = useRef(onSelectNode);
  const onSelectionActiveChangeRef = useRef(onSelectionActiveChange);
  const onTextSelectionChangeRef = useRef(onTextSelectionChange);
  const selectedNodeIdRef = useRef(selectedNodeId);
  // Portals mount into these persistent per-node host elements rather than into
  // mind-elixir's slot DOM directly. mind.refresh() rebuilds the slots on every
  // structural change; re-parenting a stable host into the new slot keeps the
  // portal's container identity constant, so the BlockNote editors are NOT
  // remounted and keep their focus, caret, and in-flight edit state.
  const mediaHosts = useRef(new Map<string, HTMLDivElement>());
  const groupHosts = useRef(new Map<string, HTMLDivElement>());
  const [mediaTargets, setMediaTargets] = useState<Array<{ id: string; host: HTMLElement }>>(
    [],
  );
  const [groupTargets, setGroupTargets] = useState<
    Array<{
      primaryId: string;
      quoteId?: string;
      imageIds: string[];
      host: HTMLElement;
    }>
  >([]);

  const collectMediaTargets = useCallback(() => {
    const container = containerRef.current;
    const mediaSlots = Array.from(
      container?.querySelectorAll<HTMLElement>("[data-zhijian-media-node]") ?? [],
    );
    const nextMedia = mediaSlots.flatMap((slot) => {
      const id = slot.dataset.zhijianMediaNode;
      if (!id) {
        return [];
      }
      const host = ensureHost(mediaHosts.current, id, "mindmap-media-host");
      if (host.parentElement !== slot) {
        slot.appendChild(host);
      }
      return [{ id, host }];
    });
    pruneHosts(
      mediaHosts.current,
      nextMedia.map((target) => target.id),
    );
    setMediaTargets(nextMedia);

    const groupSlots = Array.from(
      container?.querySelectorAll<HTMLElement>("[data-zhijian-group-primary]") ?? [],
    );
    const nextGroups = groupSlots.flatMap((slot) => {
      const primaryId = slot.dataset.zhijianGroupPrimary;
      if (!primaryId) {
        return [];
      }
      const host = ensureHost(groupHosts.current, primaryId, "mindmap-group-host");
      if (host.parentElement !== slot) {
        slot.appendChild(host);
      }
      return [
        {
          primaryId,
          quoteId: slot.dataset.zhijianGroupQuote || undefined,
          imageIds: (slot.dataset.zhijianGroupImages ?? "").split(",").filter(Boolean),
          host,
        },
      ];
    });
    pruneHosts(
      groupHosts.current,
      nextGroups.map((target) => target.primaryId),
    );
    setGroupTargets(nextGroups);
  }, []);

  useEffect(() => {
    storeRef.current = store;
    onSelectNodeRef.current = onSelectNode;
    onSelectionActiveChangeRef.current = onSelectionActiveChange;
    onTextSelectionChangeRef.current = onTextSelectionChange;
    selectedNodeIdRef.current = selectedNodeId;
  }, [onSelectNode, onSelectionActiveChange, onTextSelectionChange, selectedNodeId, store]);

  useEffect(() => {
    if (!containerRef.current || mindRef.current) {
      return;
    }
    const mind = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.SIDE,
      editable: true,
      contextMenu: { locale: zh_CN },
      toolBar: true,
      keypress: true,
      allowUndo: false,
      newTopicName: " ",
      markdown: (topic, obj) =>
        renderMindMapNode(topic, obj as Parameters<typeof renderMindMapNode>[1]),
    });
    mind.init(treeToMindElixir(initialTree.current));
    queueMicrotask(collectMediaTargets);
    mind.bus.addListener("operation", (operation: Operation) => {
      if (suppressOperation.current) {
        return;
      }
      if ("obj" in operation && operation.obj?.id) {
        lastSelectedNodeId.current = operation.obj.id;
        onSelectNodeRef.current(operation.obj.id);
        onSelectionActiveChangeRef.current(true);
      }
      applyMindElixirOperation(operation, storeRef.current);
      mindStructureSignature.current = createMindMapStructureSignature(
        storeRef.current.getSnapshot(),
      );
      if (
        operation.name === "addChild" ||
        operation.name === "insertSibling" ||
        operation.name === "insertBefore"
      ) {
        queueMicrotask(() => {
          try {
            mind.beginEdit(mind.findEle(operation.obj.id));
          } catch {
            // The node may have been removed before the edit lifecycle starts.
          }
        });
      }
    });
    mind.bus.addListener("selectNodes", (nodes) => {
      if (nodes[0]) {
        lastSelectedNodeId.current = nodes[0].id;
        onSelectNodeRef.current(nodes[0].id);
        onSelectionActiveChangeRef.current(true);
      }
    });
    mind.bus.addListener("unselectNodes", () => {
      onSelectionActiveChangeRef.current(false);
      onTextSelectionChangeRef.current(null);
    });
    mind.bus.addListener("changeDirection", () => {
      window.requestAnimationFrame(collectMediaTargets);
    });
    mindRef.current = mind;

    return () => {
      mind.destroy();
      mindRef.current = null;
    };
  }, [collectMediaTargets]);

  useEffect(() => {
    const onSelectionChange = () => {
      const container = containerRef.current;
      const selection = document.getSelection();
      if (!container || !selection || selection.rangeCount === 0) {
        return;
      }
      const editorElement = container.querySelector<HTMLElement>("#input-box");
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (
        editorElement &&
        anchorNode &&
        focusNode &&
        editorElement.contains(anchorNode) &&
        editorElement.contains(focusNode)
      ) {
        onSelectionActiveChangeRef.current(true);
        const nodeId = lastSelectedNodeId.current;
        if (nodeId && !selection.isCollapsed) {
          onTextSelectionChangeRef.current({
            nodeId,
            from: textOffset(editorElement, anchorNode, selection.anchorOffset),
            to: textOffset(editorElement, focusNode, selection.focusOffset),
          });
        } else {
          onTextSelectionChangeRef.current(null);
        }
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const toggleTodo = (event: PointerEvent) => {
      const checkbox = (event.target as Element | null)?.closest<HTMLElement>(
        ".mindmap-todo-checkbox",
      );
      const nodeId = checkbox?.dataset.nodeId;
      if (!nodeId || event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const node = storeRef.current.getNode(nodeId);
      if (node?.type === "todo") {
        storeRef.current.updateProps(nodeId, { checked: !(node.props?.checked ?? false) });
        lastSelectedNodeId.current = nodeId;
        onSelectNodeRef.current(nodeId);
        onSelectionActiveChangeRef.current(true);
      }
    };
    container.addEventListener("pointerdown", toggleTodo, true);
    return () => {
      container.removeEventListener("pointerdown", toggleTodo, true);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const commitEmptyNativeEdit = (event: FocusEvent) => {
      const editorElement = event.target as HTMLElement | null;
      if (editorElement?.id !== "input-box" || editorElement.innerText.trim()) {
        return;
      }
      const nodeId = lastSelectedNodeId.current;
      const node = nodeId ? storeRef.current.getNode(nodeId) : null;
      if (node && node.type !== "table" && node.type !== "image") {
        storeRef.current.updateContent(node.id, "");
      }
    };
    container.addEventListener("blur", commitEmptyNativeEdit, true);
    return () => container.removeEventListener("blur", commitEmptyNativeEdit, true);
  }, []);

  useEffect(() => {
    const mind = mindRef.current;
    if (!mind) {
      return;
    }
    const nextSignature = createMindMapStructureSignature(tree);
    const nextData = treeToMindElixir(tree);
    if (mindStructureSignature.current === nextSignature) {
      const mountTargetsChanged = updateMindMapNodesInPlace(mind, nextData.nodeData);
      if (mountTargetsChanged) {
        queueMicrotask(collectMediaTargets);
      }
      return;
    }
    mindStructureSignature.current = nextSignature;
    suppressOperation.current = true;
    mind.refresh(nextData);
    mind.clearHistory?.();
    const nodeIdToRestore = selectedNodeIdRef.current ?? lastSelectedNodeId.current;
    const refreshTimer = window.setTimeout(() => {
      if (mindRef.current !== mind || !mind.nodes?.isConnected) {
        return;
      }
      suppressOperation.current = false;
      collectMediaTargets();
      if (nodeIdToRestore) {
        try {
          const element = mind.findEle(nodeIdToRestore);
          mind.selectNode(element);
          const node = tree.nodes[nodeIdToRestore];
          if (node?.type === "text" && node.content.text.length === 0) {
            mind.beginEdit(element);
          }
        } catch {
          lastSelectedNodeId.current = null;
        }
      }
    }, 0);

    return () => window.clearTimeout(refreshTimer);
  }, [collectMediaTargets, tree]);

  useEffect(() => {
    const mind = mindRef.current;
    const nodeId = pendingNativeEndFocus.current;
    if (!mind || !nodeId) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      try {
        const element = mind.findEle(nodeId);
        mind.selectNode(element);
        mind.beginEdit(element);
        window.queueMicrotask(() => {
          const input = containerRef.current?.querySelector<HTMLElement>("#input-box");
          if (!input) {
            return;
          }
          const range = document.createRange();
          range.selectNodeContents(input);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          input.focus({ preventScroll: true });
          pendingNativeEndFocus.current = null;
        });
      } catch {
        // The projected node may still be remounting after its quote was removed.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tree]);

  useEffect(() => {
    const mind = mindRef.current;
    const observedTargets = [
      ...mediaTargets.map(({ host }) => host),
      ...groupTargets.map(({ host }) => host),
    ];
    if (!mind || observedTargets.length === 0) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mind.linkDiv());
    });
    observedTargets.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [groupTargets, mediaTargets]);

  const handlePortalSelect = (nodeId: string) => {
    lastSelectedNodeId.current = nodeId;
    onSelectNodeRef.current(nodeId);
    onSelectionActiveChangeRef.current(true);
  };

  const handleDeleteEmptyQuote = useCallback(
    (primaryId: string, quoteId: string, groupRemains: boolean) => {
      if (!groupRemains) {
        pendingNativeEndFocus.current = primaryId;
      }
      lastSelectedNodeId.current = primaryId;
      onSelectNodeRef.current(primaryId);
      storeRef.current.deleteNode(quoteId);
    },
    [],
  );

  return (
    <>
      <div className="mindmap-canvas" ref={containerRef} />
      {mediaTargets.map(({ id, host }) => {
        const node = tree.nodes[id];
        return node
          ? createPortal(
              <MindMapMediaBlock
                key={id}
                node={node}
                store={store}
                selected={selectedNodeId === id}
                toolbarTarget={toolbarTarget}
                onSelect={handlePortalSelect}
              />,
              host,
              id,
            )
          : null;
      })}
      {groupTargets.map(({ primaryId, quoteId, imageIds, host }) => {
        const primary = tree.nodes[primaryId];
        if (!primary) {
          return null;
        }
        return createPortal(
          <MindMapNodeGroupBlock
            primary={primary}
            quote={quoteId && quoteId !== primaryId ? tree.nodes[quoteId] : undefined}
            images={imageIds.flatMap((id) => (tree.nodes[id] ? [tree.nodes[id]] : []))}
            store={store}
            selectedNodeId={selectedNodeId}
            toolbarTarget={toolbarTarget}
            onSelect={handlePortalSelect}
            focusRequest={focusRequest}
            onFocusRequestHandled={onFocusRequestHandled}
            onDeleteEmptyQuote={handleDeleteEmptyQuote}
          />,
          host,
          `group-${primaryId}`,
        );
      })}
    </>
  );
}

function ensureHost(
  hosts: Map<string, HTMLDivElement>,
  id: string,
  className: string,
) {
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
  for (const id of Array.from(hosts.keys())) {
    if (!active.has(id)) {
      hosts.delete(id);
    }
  }
}

function updateMindMapNodesInPlace(mind: MindElixir, root: import("mind-elixir").NodeObj) {
  let mountTargetsChanged = false;
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
        mountTargetsChanged = true;
        if (nextNode.dangerouslySetInnerHTML) {
          topicElement.innerHTML = nextNode.dangerouslySetInnerHTML;
        } else {
          topicElement.innerHTML = "";
          const textElement = document.createElement("span");
          textElement.className = "text";
          textElement.innerHTML = renderMindMapNode(nextNode.topic, nextNode);
          topicElement.appendChild(textElement);
          topicElement.text = textElement;
        }
      } else if (!nextNode.dangerouslySetInnerHTML) {
        const textElement = topicElement.querySelector<HTMLElement>(".text");
        if (textElement) {
          textElement.innerHTML = renderMindMapNode(nextNode.topic, nextNode);
        }
      }
    } catch {
      // Collapsed descendants do not have mounted topic elements.
    }
    nextNode.children?.forEach(visit);
  };
  visit(root);
  mind.linkDiv();
  return mountTargetsChanged;
}
