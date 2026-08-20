import "mind-elixir/style.css";
import MindElixir, { type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { renderMindMapRichText, treeToMindElixir } from "./mindElixirAdapter";
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
  const mindProjectionSignature = useRef(createMindProjectionSignature(tree));
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
      newTopicName: "新节点",
      markdown: (topic, obj) => renderMindMapRichText(topic, obj as Parameters<typeof renderMindMapRichText>[1]),
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
    const mind = mindRef.current;
    if (!mind) {
      return;
    }
    const nextSignature = createMindProjectionSignature(tree);
    if (mindProjectionSignature.current === nextSignature) {
      return;
    }
    mindProjectionSignature.current = nextSignature;
    suppressOperation.current = true;
    mind.refresh(treeToMindElixir(tree));
    mind.clearHistory?.();
    const nodeIdToRestore = lastSelectedNodeId.current;
    const refreshTimer = window.setTimeout(() => {
      if (mindRef.current !== mind || !mind.nodes?.isConnected) {
        return;
      }
      suppressOperation.current = false;
      mind.scaleFit();
      collectMediaTargets();
      if (nodeIdToRestore) {
        try {
          mind.selectNode(mind.findEle(nodeIdToRestore));
        } catch {
          lastSelectedNodeId.current = null;
        }
      }
    }, 0);

    return () => window.clearTimeout(refreshTimer);
  }, [collectMediaTargets, tree]);

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

function createMindProjectionSignature(tree: ReturnType<TreeStore["getSnapshot"]>) {
  return JSON.stringify(
    Object.values(tree.nodes).map((node) => ({
      id: node.id,
      parentId: node.parentId,
      children: node.children,
      type: node.type,
      content: node.type === "table" || node.type === "image" ? undefined : node.content,
      collapsed: node.props?.collapsed,
      tableShape:
        node.type === "table" ? node.props?.table?.rows.map((row) => row.length) : undefined,
    })),
  );
}

function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}
