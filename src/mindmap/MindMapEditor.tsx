import "mind-elixir/style.css";
import MindElixir, { type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useEffect, useRef } from "react";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { renderMindMapRichText, treeToMindElixir } from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";

interface MindMapEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  onSelectionActiveChange: (active: boolean) => void;
}

export function MindMapEditor({
  store,
  onSelectNode,
  onSelectionActiveChange,
}: MindMapEditorProps) {
  const tree = useTree(store);
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const suppressOperation = useRef(false);
  const lastSelectedNodeId = useRef<string | null>(null);
  const initialTree = useRef(tree);
  const storeRef = useRef(store);
  const onSelectNodeRef = useRef(onSelectNode);
  const onSelectionActiveChangeRef = useRef(onSelectionActiveChange);

  useEffect(() => {
    storeRef.current = store;
    onSelectNodeRef.current = onSelectNode;
    onSelectionActiveChangeRef.current = onSelectionActiveChange;
  }, [onSelectNode, onSelectionActiveChange, store]);

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
    });
    mindRef.current = mind;

    return () => {
      mind.destroy();
      mindRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      const container = containerRef.current;
      const selection = document.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }
      const anchorNode = selection.anchorNode;
      if (anchorNode && container.contains(anchorNode)) {
        onSelectionActiveChangeRef.current(true);
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
      if (nodeIdToRestore) {
        try {
          mind.selectNode(mind.findEle(nodeIdToRestore));
        } catch {
          lastSelectedNodeId.current = null;
        }
      }
    }, 0);

    return () => window.clearTimeout(refreshTimer);
  }, [tree]);

  return <div className="mindmap-canvas" ref={containerRef} />;
}
