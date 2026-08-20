import { useCallback, useMemo, useState } from "react";
import { createInitialTree } from "./core/tree";
import { TreeStore } from "./core/treeStore";
import { useTree } from "./core/treeStore/useTree";
import { MindMapEditor } from "./mindmap/MindMapEditor";
import type { MindMapTextSelection } from "./mindmap/MindMapEditor";
import { OutlineEditor } from "./outline/OutlineEditor";
import "./styles.css";

export default function App() {
  const store = useMemo(() => new TreeStore(createInitialTree()), []);
  const tree = useTree(store);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectionActive, setSelectionActive] = useState(false);
  const [activeView, setActiveView] = useState<"outline" | "mindmap">("outline");
  const [mindMapToolbarTarget, setMindMapToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [mindMapTextSelection, setMindMapTextSelection] =
    useState<MindMapTextSelection | null>(null);
  const [mindMapFocusRequest, setMindMapFocusRequest] = useState<{
    nodeId: string;
    requestId: number;
  } | null>(null);
  const selectedNode = selectedNodeId ? store.getNode(selectedNodeId) : null;
  const isMindMapMediaSelected =
    selectedNode?.type === "table" || selectedNode?.type === "image";
  const isMindMapGroupSelected = selectedNode
    ? belongsToMindMapGroup(tree, selectedNode.id)
    : false;

  const handleOutlineSelect = useCallback(
    (nodeId: string) => {
      if (activeView === "outline") {
        setSelectedNodeId(nodeId);
        setSelectionActive(true);
      }
    },
    [activeView],
  );

  const createSibling = (nodeId: string) => {
    const node = store.getNode(nodeId);
    if (!node?.parentId) {
      return;
    }
    const parent = store.getNode(node.parentId);
    const index = parent ? parent.children.indexOf(nodeId) + 1 : undefined;
    const newId = store.createNode({
      parentId: node.parentId,
      index,
      content: "",
    });
    setSelectedNodeId(newId);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>枝间 V2</h1>
          <p>ZhiJianTree 驱动的大纲与思维导图编辑器</p>
        </div>
        <div className="toolbar">
          <div className="view-switch" role="tablist" aria-label="视图切换">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "outline"}
              className={activeView === "outline" ? "active" : ""}
              onClick={() => {
                setActiveView("outline");
                setSelectionActive(false);
                setMindMapTextSelection(null);
              }}
            >
              大纲
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "mindmap"}
              className={activeView === "mindmap" ? "active" : ""}
              onClick={() => {
                setActiveView("mindmap");
                setSelectionActive(false);
                setMindMapTextSelection(null);
              }}
            >
              思维导图
            </button>
          </div>
          <button type="button" onClick={() => store.undo()}>
            撤销
          </button>
          <button type="button" onClick={() => store.redo()}>
            重做
          </button>
          <button type="button" onClick={() => createSibling(selectedNode?.id ?? tree.rootId)}>
            新建
          </button>
          <button
            type="button"
            onClick={() => selectedNode && store.deleteNode(selectedNode.id)}
            disabled={!selectedNode || selectedNode.id === tree.rootId}
          >
            删除
          </button>
        </div>
      </header>
      <div className="workspace">
        <section
          className={`pane editor-view ${activeView === "outline" ? "is-active" : "is-inactive"}`}
          aria-hidden={activeView !== "outline"}
        >
          <div className="pane-title">大纲</div>
          <OutlineEditor
            store={store}
            onSelectNode={handleOutlineSelect}
            mindMapNodeId={activeView === "mindmap" ? selectedNodeId : null}
            mindMapTextSelection={mindMapTextSelection}
            mindMapToolbarTarget={mindMapToolbarTarget}
            showMindMapToolbar={
              activeView === "mindmap" &&
              selectionActive &&
              Boolean(selectedNode) &&
              !isMindMapMediaSelected &&
              !isMindMapGroupSelected
            }
            onMindMapInsertQuote={(nodeId) => {
              setSelectedNodeId(nodeId);
              setSelectionActive(true);
              setMindMapFocusRequest((current) => ({
                nodeId,
                requestId: (current?.requestId ?? 0) + 1,
              }));
            }}
          />
        </section>
        <section
          className={`pane editor-view ${activeView === "mindmap" ? "is-active" : "is-inactive"}`}
          aria-hidden={activeView !== "mindmap"}
        >
          <div className="pane-title">思维导图</div>
          <div className="mindmap-pane-body">
            {activeView === "mindmap" ? (
              <MindMapEditor
                store={store}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setMindMapTextSelection(null);
                }}
                onSelectionActiveChange={setSelectionActive}
                onTextSelectionChange={setMindMapTextSelection}
                selectedNodeId={selectedNodeId}
                toolbarTarget={mindMapToolbarTarget}
                focusRequest={mindMapFocusRequest}
                onFocusRequestHandled={(requestId) => {
                  setMindMapFocusRequest((current) =>
                    current?.requestId === requestId ? null : current,
                  );
                }}
              />
            ) : null}
            <div
              ref={setMindMapToolbarTarget}
              className="mindmap-toolbar-host bn-root bn-mantine light"
              data-color-scheme="light"
              data-mantine-color-scheme="light"
              aria-hidden={!selectionActive || !selectedNode}
              onPointerDownCapture={() => {
                window.setTimeout(() => setSelectionActive(true), 0);
              }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function belongsToMindMapGroup(tree: ReturnType<TreeStore["getSnapshot"]>, nodeId: string) {
  const node = tree.nodes[nodeId];
  if (!node) {
    return false;
  }
  if (node.type === "quote" || node.type === "image") {
    return true;
  }
  if (!node.parentId) {
    return false;
  }
  const siblings = tree.nodes[node.parentId]?.children ?? [];
  const index = siblings.indexOf(nodeId);
  const nextType = tree.nodes[siblings[index + 1]]?.type;
  return nextType === "quote" || nextType === "image";
}
