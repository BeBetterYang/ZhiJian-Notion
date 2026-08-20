import "mind-elixir/style.css";
import MindElixir, { type Operation } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useEffect, useRef, useState } from "react";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { mindElixirToTree, treeToMindElixir } from "./mindElixirAdapter";
import { NodeContentEditor } from "../shared/NodeContentEditor";

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
  const initialTree = useRef(tree);
  const storeRef = useRef(store);
  const onSelectNodeRef = useRef(onSelectNode);
  const onSelectionActiveChangeRef = useRef(onSelectionActiveChange);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editorRect, setEditorRect] = useState<{ left: number; top: number; width: number } | null>(null);

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
      toolBar: false,
      keypress: true,
      allowUndo: false,
      newTopicName: "新节点",
    });
    mind.init(treeToMindElixir(initialTree.current));
    mind.bus.addListener("operation", (operation: Operation) => {
      if (suppressOperation.current) {
        return;
      }
      if ("obj" in operation && operation.obj?.id) {
        onSelectNodeRef.current(operation.obj.id);
        onSelectionActiveChangeRef.current(true);
      }
      const nextTree = mindElixirToTree(mind.getData());
      storeRef.current.replaceTreeFromView(nextTree);
    });
    mind.bus.addListener("selectNodes", (nodes) => {
      if (nodes[0]) {
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
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const onDoubleClick = (event: MouseEvent) => {
      const topic = (event.target as HTMLElement).closest("me-tpc, .topic") as HTMLElement | null;
      const id = topic?.dataset.nodeid ?? topic?.dataset.id ?? topic?.getAttribute("data-nodeid");
      const fallbackId = mindRef.current?.currentNode?.dataset.nodeid;
      const nodeId = id ?? fallbackId;
      if (!nodeId || !tree.nodes[nodeId]) {
        return;
      }
      const rect = (topic ?? mindRef.current?.findEle(nodeId))?.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setEditingNodeId(nodeId);
      setEditorRect({
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        width: Math.max(rect.width, 120),
      });
    };
    container.addEventListener("dblclick", onDoubleClick);
    return () => container.removeEventListener("dblclick", onDoubleClick);
  }, [tree.nodes]);

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
    window.setTimeout(() => {
      suppressOperation.current = false;
      mind.scaleFit();
    }, 0);
  }, [tree]);

  const editingNode = editingNodeId ? tree.nodes[editingNodeId] : null;

  return (
    <div className="mindmap-canvas" ref={containerRef}>
      {editingNode && editorRect ? (
        <div className="mindmap-node-editor-layer" style={editorRect}>
          <NodeContentEditor
            node={editingNode}
            store={store}
            mode="mindmap"
            onCommit={() => setEditingNodeId(null)}
            onCancel={() => setEditingNodeId(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
