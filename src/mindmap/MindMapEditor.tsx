import "mind-elixir/style.css";
import MindElixir, { type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { renderMindMapNode, treeToMindElixir } from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";
import { MindMapMediaBlock } from "./MindMapMediaBlock";

interface MindMapEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  onSelectionActiveChange: (active: boolean) => void;
  onTextSelectionChange: (selection: MindMapTextSelection | null) => void;
  selectedNodeId: string | null;
  toolbarTarget: HTMLElement | null;
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
}: MindMapEditorProps) {
  const tree = useTree(store);
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const suppressOperation = useRef(false);
  const lastSelectedNodeId = useRef<string | null>(null);
  const initialTree = useRef(tree);
  const mindStructureSignature = useRef(createMindStructureSignature(tree));
  const storeRef = useRef(store);
  const onSelectNodeRef = useRef(onSelectNode);
  const onSelectionActiveChangeRef = useRef(onSelectionActiveChange);
  const onTextSelectionChangeRef = useRef(onTextSelectionChange);
  const [mediaTargets, setMediaTargets] = useState<Array<{ id: string; element: HTMLElement }>>(
    [],
  );

  const collectMediaTargets = useCallback(() => {
    const elements = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>("[data-zhijian-media-node]") ?? [],
    );
    setMediaTargets(
      elements.flatMap((element) => {
        const id = element.dataset.zhijianMediaNode;
        return id ? [{ id, element }] : [];
      }),
    );
  }, []);

  useEffect(() => {
    storeRef.current = store;
    onSelectNodeRef.current = onSelectNode;
    onSelectionActiveChangeRef.current = onSelectionActiveChange;
    onTextSelectionChangeRef.current = onTextSelectionChange;
  }, [onSelectNode, onSelectionActiveChange, onTextSelectionChange, store]);

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
      mindStructureSignature.current = createMindStructureSignature(
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
    const mind = mindRef.current;
    if (!mind) {
      return;
    }
    const nextSignature = createMindStructureSignature(tree);
    const nextData = treeToMindElixir(tree);
    if (mindStructureSignature.current === nextSignature) {
      updateMindMapNodesInPlace(mind, nextData.nodeData);
      return;
    }
    mindStructureSignature.current = nextSignature;
    suppressOperation.current = true;
    mind.refresh(nextData);
    mind.clearHistory?.();
    const nodeIdToRestore = selectedNodeId ?? lastSelectedNodeId.current;
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
  }, [collectMediaTargets, selectedNodeId, tree]);

  useEffect(() => {
    const mind = mindRef.current;
    if (!mind || mediaTargets.length === 0) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mind.linkDiv());
    });
    mediaTargets.forEach(({ element }) => observer.observe(element));
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [mediaTargets]);

  return (
    <>
      <div className="mindmap-canvas" ref={containerRef} />
      {mediaTargets.map(({ id, element }) => {
        const node = tree.nodes[id];
        return node
          ? createPortal(
              <MindMapMediaBlock
                key={id}
                node={node}
                store={store}
                selected={selectedNodeId === id}
                toolbarTarget={toolbarTarget}
                onSelect={(nodeId) => {
                  lastSelectedNodeId.current = nodeId;
                  onSelectNodeRef.current(nodeId);
                  onSelectionActiveChangeRef.current(true);
                }}
              />,
              element,
              id,
            )
          : null;
      })}
    </>
  );
}

function createMindStructureSignature(tree: ReturnType<TreeStore["getSnapshot"]>) {
  return JSON.stringify(
    Object.values(tree.nodes).map((node) => ({
      id: node.id,
      parentId: node.parentId,
      children: node.children,
      type: node.type,
      collapsed: node.props?.collapsed,
    })),
  );
}

function updateMindMapNodesInPlace(mind: MindElixir, root: import("mind-elixir").NodeObj) {
  const visit = (nextNode: typeof root) => {
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
      if (!nextNode.dangerouslySetInnerHTML) {
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
}

function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}
