import "mind-elixir/style.css";
import MindElixir, { type MindElixirData, type NodeObj, type Operation, type Topic } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import type { MindMapViewportState } from "../shared/documentViewState";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";
import { handleShortcutKeyDown } from "../shared/shortcuts";
import { createMindMapStructureSignature, treeToMindElixir } from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";
import { displayClickAction, hiddenDescendantCount, isBlankMindMapSurface, mindMapEditingLayout, mindMapUpdateMode, sameEditingTarget, shouldExitEditing, type EditingTarget } from "./mindMapInteraction";
import { MINDMAP_THEME } from "./mindMapTheme";
import { MindMapLinkHoverTracker } from "./MindMapLinkHoverTracker";
import { renderMindMapNodeDisplayHtml } from "./MindMapNodeRenderer";
import { MindMapNodeContent } from "./MindMapNodeGroupBlock";

interface MindMapEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string | null) => void;
  onSelectionActiveChange: (active: boolean) => void;
  onTextSelectionChange: (selection: MindMapTextSelection | null) => void;
  /**
   * Whether the node being edited is showing its own toolbar in the shared host.
   * A node holding a quote or a picture formats those blocks itself, and while it
   * does the outline's toolbar bridge has to stand down — see `ownsToolbar` in
   * `MindMapNodeGroupBlock`.
   */
  onNodeToolbarActiveChange: (active: boolean) => void;
  selectedNodeId: string | null;
  toolbarTarget: HTMLElement | null;
  focusRequest: { nodeId: string; focusBlockId: string; requestId: number } | null;
  focusNodeRequest?: { nodeId: string; requestId: number } | null;
  onFocusRequestHandled: (requestId: number) => void;
  searchQuery?: string;
  visibleNodeIds?: Set<string> | null;
  /** 进入当前主题: the node the map is drawn from, standing in as its root. */
  zoomedNodeId?: string | null;
  initialViewport?: MindMapViewportState;
  onViewportChange?: (viewport: MindMapViewportState) => void;
}

export interface MindMapTextSelection {
  nodeId: string;
  from: number;
  to: number;
}

export function MindMapEditor({ store, onSelectNode, onSelectionActiveChange, onTextSelectionChange, onNodeToolbarActiveChange, selectedNodeId, toolbarTarget, focusRequest, focusNodeRequest = null, onFocusRequestHandled, searchQuery = "", visibleNodeIds = null, zoomedNodeId = null, initialViewport, onViewportChange }: MindMapEditorProps) {
  const tree = useTree(store);
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const suppressOperation = useRef(false);
  const initialTree = useRef(tree);
  const structureSignature = useRef(createMindMapStructureSignature(tree, visibleNodeIds, zoomedNodeId));
  const projectionOptionsRef = useRef({ searchQuery, visibleNodeIds, rootNodeId: zoomedNodeId });
  const initialViewportRef = useRef(initialViewport);
  // A flag rather than the deferred map itself: whatever the map looked like when
  // the structural change arrived, it is out of date by the time the edit ends —
  // the node has been typed into since, and Enter may have inserted a node through
  // mind-elixir in the meantime. Only the fact that a rebuild is owed survives.
  const pendingStructure = useRef(false);
  const storeRef = useRef(store);
  const onSelectRef = useRef(onSelectNode);
  const onActiveRef = useRef(onSelectionActiveChange);
  const onTextSelectionRef = useRef(onTextSelectionChange);
  const onNodeToolbarRef = useRef(onNodeToolbarActiveChange);
  const selectedNodeRef = useRef(selectedNodeId);
  const lastSelectedNodeId = useRef<string | null>(selectedNodeId);
  const editingTargetRef = useRef<EditingTarget>(null);
  const editingShellRef = useRef<string | null>(null);
  const floatingFrame = useRef<HTMLElement | null>(null);
  const floatingNodeId = useRef<string | null>(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  projectionOptionsRef.current = { searchQuery, visibleNodeIds, rootNodeId: zoomedNodeId };
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

  // `editingTargetRef` has to lead the state, not trail it. The tree-sync effect
  // below is declared before the editing effect, so an effect that only wrote the
  // ref would still report "not editing" during the very commit that starts an
  // edit — and the sync effect would answer a structural change with a full
  // `mind.refresh()`, tearing down the editor that was just mounted.
  const applyEditingTarget = useCallback((next: EditingTarget) => {
    editingTargetRef.current = next;
    setEditingTarget((previous) => (sameEditingTarget(previous, next) ? previous : next));
  }, []);

  /**
   * Lifts the node being edited out of the map's flow, or puts it back.
   *
   * The frame is pinned to the size it measures right now — before the editor is
   * revealed — so the map keeps the geometry it had when the edit started. See the
   * `.is-mindmap-floating` rules in `styles.css` for the other half. Returns
   * whether anything moved, so the caller can relink once instead of per keystroke.
   */
  const setEditingFloat = useCallback((nodeId: string | null) => {
    const previous = floatingFrame.current;
    const next = nodeId ? nodeFrame(mindRef.current, nodeId) : null;
    if (previous === next) return false;
    if (previous) {
      previous.classList.remove("is-mindmap-floating");
      previous.style.removeProperty("width");
      previous.style.removeProperty("height");
    }
    floatingFrame.current = next;
    floatingNodeId.current = next ? nodeId : null;
    if (next) {
      // Layout pixels, not `getBoundingClientRect`: the canvas carries a zoom
      // transform, and the frame has to be pinned in the map's own units.
      next.style.width = `${next.offsetWidth}px`;
      next.style.height = `${next.offsetHeight}px`;
      next.classList.add("is-mindmap-floating");
    }
    return true;
  }, []);

  useEffect(() => {
    storeRef.current = store;
    onSelectRef.current = onSelectNode;
    onActiveRef.current = onSelectionActiveChange;
    onTextSelectionRef.current = onTextSelectionChange;
    onNodeToolbarRef.current = onNodeToolbarActiveChange;
    selectedNodeRef.current = selectedNodeId;
  }, [onNodeToolbarActiveChange, onSelectNode, onSelectionActiveChange, onTextSelectionChange, selectedNodeId, store]);

  // Switching to the outline unmounts the map, editor and all, and a host nobody is
  // filling any more must not keep the outline's toolbar bridge stood down.
  useEffect(() => () => onNodeToolbarRef.current(false), []);

  const reportNodeToolbar = useCallback((active: boolean) => onNodeToolbarRef.current(active), []);

  // The run of a node's own text the user has selected, on its way to the hidden
  // outline editor the plain-node toolbar is bound to.
  const reportTextSelection = useCallback(
    (selection: MindMapTextSelection | null) => onTextSelectionRef.current(selection),
    [],
  );

  useEffect(() => {
    if (!containerRef.current || mindRef.current) return;
    const mind = new MindElixir({
      el: containerRef.current,
      // One direction, like an outline read left to right. `SIDE` would split the
      // root's children between the two sides, which reads as two maps.
      direction: MindElixir.RIGHT,
      editable: true,
      contextMenu: { locale: zh_CN },
      toolBar: true,
      keypress: true,
      allowUndo: false,
      newTopicName: " ",
      markdown: (topic) => topic,
      // Has to be the theme rather than the two `generate*Branch` options next to
      // it: `init` re-reads the branch generators off the theme, which would drop
      // anything passed alongside.
      theme: MINDMAP_THEME,
    });
    mind.init(treeToMindElixir(initialTree.current, projectionOptionsRef.current));
    if (initialViewportRef.current) {
      restoreMindMapViewport(mind, initialViewportRef.current);
    }
    mind.beginEdit = async (element) => {
      const nodeId = (element ?? mind.currentNode)?.nodeObj.id;
      if (nodeId) beginNodeEditRef.current(nodeId);
    };
    // Everything that adds a node — Enter, Tab, the context menu — reaches for
    // mind-elixir's own inline input afterwards, which would lay a plain-text box
    // over the node and hide the node itself behind it (`editTopic` sets the
    // topic's opacity to 0). The node's own editor is the only editor here.
    mind.editTopic = (element) => {
      const nodeId = element?.nodeObj.id;
      if (nodeId) beginNodeEditRef.current(nodeId);
    };
    queueMicrotask(collectTargets);
    mind.bus.addListener("operation", (operation: Operation) => {
      if (suppressOperation.current) return;
      if ("obj" in operation && operation.obj?.id) {
        const nodeId = operation.obj.id;
        lastSelectedNodeId.current = nodeId;
        selectedNodeRef.current = nodeId;
        if (shouldExitEditing(editingTargetRef.current, nodeId)) applyEditingTarget(null);
        onSelectRef.current(nodeId);
        onActiveRef.current(true);
      }
      applyMindElixirOperation(operation, storeRef.current);
      structureSignature.current = createMindMapStructureSignature(storeRef.current.getSnapshot(), projectionOptionsRef.current.visibleNodeIds, projectionOptionsRef.current.rootNodeId);
      if (operation.name === "addChild" || operation.name === "insertSibling" || operation.name === "insertBefore") beginNodeEditRef.current(operation.obj.id);
    });
    mind.bus.addListener("selectNodes", (nodes) => {
      const nodeId = nodes[0]?.id;
      if (!nodeId) return;
      lastSelectedNodeId.current = nodeId;
      selectedNodeRef.current = nodeId;
      if (shouldExitEditing(editingTargetRef.current, nodeId)) applyEditingTarget(null);
      onSelectRef.current(nodeId);
      onActiveRef.current(true);
    });
    mind.bus.addListener("unselectNodes", () => {
      if (editingTargetRef.current) return;
      onActiveRef.current(false);
      onTextSelectionRef.current(null);
    });
    // Collapsing is the one node operation mind-elixir does not report as an
    // `operation`, so it needs its own listener — without it the store never
    // learns a node is collapsed, and the next structural rebuild expands it
    // again. Resyncing the signature keeps this from becoming that rebuild:
    // mind-elixir has already mounted or removed the children itself.
    mind.bus.addListener("expandNode", (node: NodeObj) => {
      if (suppressOperation.current) return;
      storeRef.current.updateProps(node.id, { collapsed: node.expanded === false });
      structureSignature.current = createMindMapStructureSignature(storeRef.current.getSnapshot(), projectionOptionsRef.current.visibleNodeIds, projectionOptionsRef.current.rootNodeId);
      // Expanding rebuilds every descendant's box from its stored HTML, which
      // leaves the editor hosts inside them detached — and a node whose host is
      // detached shows nothing at all when it is next edited. Re-collecting
      // re-attaches the hosts React already has, exactly as a direction change does.
      collectTargets();
    });
    mind.bus.addListener("move", () => {
      const viewport = readMindMapViewport(mind);
      if (viewport) onViewportChange?.(viewport);
    });
    mind.bus.addListener("scale", () => {
      const viewport = readMindMapViewport(mind);
      if (viewport) onViewportChange?.(viewport);
    });
    mind.bus.addListener("changeDirection", () => window.requestAnimationFrame(collectTargets));
    mindRef.current = mind;
    return () => { mind.destroy(); mindRef.current = null; };
  }, [applyEditingTarget, collectTargets, onViewportChange]);

  const selectTreeNode = useCallback((nodeId: string) => {
    if (shouldExitEditing(editingTargetRef.current, nodeId)) applyEditingTarget(null);
    lastSelectedNodeId.current = nodeId;
    selectedNodeRef.current = nodeId;
    onSelectRef.current(nodeId);
    onActiveRef.current(true);
  }, [applyEditingTarget]);

  const selectMindElixirNode = useCallback((nodeId: string) => {
    selectTreeNode(nodeId);
    try {
      const mind = mindRef.current;
      if (mind) mind.selectNode(mind.findEle(nodeId));
    } catch {
      // Collapsed descendants may not be mounted.
    }
  }, [selectTreeNode]);

  // Dropping the selection has to clear both sides. mind-elixir keeps its own
  // `currentNodes`, and it never reports a blank-surface click back to the app,
  // so the app would otherwise keep a node selected that the canvas has released.
  const clearTreeSelection = useCallback(() => {
    if (!selectedNodeRef.current && !lastSelectedNodeId.current && !editingTargetRef.current) return;
    applyEditingTarget(null);
    pointerSelectionBefore.current = null;
    lastSelectedNodeId.current = null;
    selectedNodeRef.current = null;
    mindRef.current?.clearSelection();
    onSelectRef.current(null);
    onActiveRef.current(false);
    onTextSelectionRef.current(null);
  }, [applyEditingTarget]);

  const beginNodeEdit = useCallback((nodeId: string, focusBlockId?: string, focusPoint?: { x: number; y: number }) => {
    selectMindElixirNode(nodeId);
    applyEditingTarget({ nodeId, focusBlockId, focusPoint });
  }, [applyEditingTarget, selectMindElixirNode]);
  beginNodeEditRef.current = beginNodeEdit;

  const finishNodeEdit = useCallback(() => {
    applyEditingTarget(null);
    onActiveRef.current(true);
    // The node stays selected, and on the canvas "selected" is a keyboard state:
    // mind-elixir reads Enter and Tab off its own container. Editing left the focus
    // inside the node's editor, which is about to be unmounted, so handing it back
    // is what makes the next Enter add the following node rather than nothing.
    mindRef.current?.container.focus();
  }, [applyEditingTarget]);

  /**
   * Enter's job on a selected node: add a node after this one and hand the edit
   * over to it. A node being edited answers Enter differently — there it ends the
   * edit and leaves the node selected, which is the state this reads.
   *
   * The insert goes through mind-elixir rather than the store because a structural
   * change made while a node is being edited is deferred (see `mindMapUpdateMode`)
   * — a store-side insert would not appear until the edit ended, which is exactly
   * when it is needed. mind-elixir mounts the node itself and reports it back on
   * the `operation` bus, which is what writes it to the store and starts editing
   * it. A node with no parent has no sibling to follow, and mind-elixir answers
   * that case by adding a child instead.
   */
  const insertSiblingNode = useCallback((nodeId: string) => {
    const mind = mindRef.current;
    if (!mind || !storeRef.current.getNode(nodeId)) return;
    let topic: Topic;
    try {
      topic = mind.findEle(nodeId);
    } catch {
      return;
    }
    applyEditingTarget(null);
    void mind.insertSibling("after", topic);
  }, [applyEditingTarget]);

  useEffect(() => {
    if (!focusRequest?.nodeId || !tree.nodes[focusRequest.nodeId]) return;
    // This effect also re-runs on every keystroke, because `tree.nodes` changes.
    // Re-entering the edit would rebuild the editing target without the caret
    // coordinates the click supplied, so let the already-mounted editor consume
    // the request itself — it receives `focusRequest` as a prop.
    if (editingTargetRef.current?.nodeId === focusRequest.nodeId) return;
    beginNodeEdit(focusRequest.nodeId, focusRequest.focusBlockId);
  }, [beginNodeEdit, focusRequest, tree.nodes]);

  useEffect(() => {
    if (!focusNodeRequest?.nodeId || !tree.nodes[focusNodeRequest.nodeId]) return;
    const mind = mindRef.current;
    if (!mind) return;
    const frame = window.requestAnimationFrame(() => {
      selectAndCenterMindMapNode(mind, focusNodeRequest.nodeId);
      selectTreeNode(focusNodeRequest.nodeId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusNodeRequest, selectTreeNode, tree.nodes]);

  useEffect(() => {
    const nextSignature = createMindMapStructureSignature(tree, visibleNodeIds, zoomedNodeId);
    const nextData = treeToMindElixir(tree, { searchQuery, visibleNodeIds, rootNodeId: zoomedNodeId });
    const mode = mindMapUpdateMode(structureSignature.current !== nextSignature, editingTargetRef.current !== null);
    if (mode === "content") {
      const addedShell = updateMindMapNodesInPlace(mindRef.current, nextData.nodeData, editingTargetRef.current?.nodeId);
      if (addedShell) queueMicrotask(collectTargets);
      return;
    }
    if (mode === "defer-structure") {
      pendingStructure.current = true;
      return;
    }
    refreshStructure(nextData, nextSignature);
  }, [collectTargets, refreshStructure, searchQuery, tree, visibleNodeIds, zoomedNodeId]);

  const editingLayout = mindMapEditingLayout(editingTarget ? tree.nodes[editingTarget.nodeId] : undefined);

  useEffect(() => {
    const previousNodeId = editingShellRef.current;
    editingShellRef.current = editingTarget?.nodeId ?? null;
    // The display layer is deliberately left stale while the editor covers it,
    // so restore it for the node that just stopped editing before it shows again.
    if (previousNodeId && previousNodeId !== editingTarget?.nodeId) {
      refreshNodeDisplay(mindRef.current, treeRef.current, previousNodeId, searchQuery);
    }
    // Before `syncEditingShells`, so the frame is pinned to the display layer's
    // size rather than to whatever the editor has already grown to.
    const floatingNode = editingLayout === "float" ? editingTarget?.nodeId ?? null : null;
    const floatChanged = setEditingFloat(floatingNode);
    const shellChanged = syncEditingShells(containerRef.current, editingTarget?.nodeId);
    // Starting a float moves nothing — the frame keeps the size it already had — so
    // every line mind-elixir has drawn still belongs where it is, and relinking
    // would actively harm: it reads a first-level node's connector off `me-tpc`,
    // which is now out of flow, and would drop the line to the middle of the
    // grown box. Every other transition (a float ending, a display layer restored
    // for the node that just left, a table or image editing live) does change the
    // flow, and relinking is a full-canvas measure pass worth spending there.
    const flowChanged = floatingNode === null || (previousNodeId !== null && previousNodeId !== floatingNode);
    if (flowChanged && (floatChanged || shellChanged)) {
      window.requestAnimationFrame(() => mindRef.current?.linkDiv());
    }
    if (editingTarget === null && pendingStructure.current) {
      pendingStructure.current = false;
      // Recomputed here, from the tree as it stands now. mind-elixir may well have
      // caught up on its own while the edit lasted — every operation it reports
      // resyncs `structureSignature` — in which case there is nothing owed.
      const current = treeRef.current;
      const signature = createMindMapStructureSignature(current, visibleNodeIds, zoomedNodeId);
      if (signature !== structureSignature.current) refreshStructure(treeToMindElixir(current, { searchQuery, visibleNodeIds, rootNodeId: zoomedNodeId }), signature);
    }
  }, [editingLayout, editingTarget, refreshStructure, searchQuery, setEditingFloat, visibleNodeIds, zoomedNodeId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const shell = target?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      if (shell?.dataset.nodeId) {
        pointerSelectionBefore.current = { nodeId: shell.dataset.nodeId, selectedNodeId: selectedNodeRef.current };
      } else if (event.button === 0 && isBlankMindMapSurface(target)) {
        // Pointerdown, not click: this is the moment mind-elixir reads a gesture
        // on the blank surface as a box select and releases its own selection, so
        // matching it here keeps the two sides from disagreeing mid-drag.
        clearTreeSelection();
      }
      const checkbox = target?.closest<HTMLElement>(".mindmap-node-checkbox");
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
      // mind-elixir reads a modifier-click on the collapse handle as "collapse the
      // whole subtree" — a second collapse mechanism, and one that rebuilds the map
      // from its own data and reports nothing, so the store never hears about it.
      // One handle, one meaning: the modifier is dropped and the click toggles just
      // this node, through the same path a plain click takes.
      const expander = target?.closest("me-epd");
      if (expander && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        const topic = expander.previousElementSibling;
        if (topic) mindRef.current?.expandNode(topic as Topic);
        return;
      }
      const shell = target?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      const nodeId = shell?.dataset.nodeId;
      if (!nodeId) return;
      const interactive = Boolean(target?.closest("a,button,input,select,textarea,[role=checkbox]"));
      const selectedBefore = pointerSelectionBefore.current?.nodeId === nodeId ? pointerSelectionBefore.current.selectedNodeId : selectedNodeRef.current;
      const action = displayClickAction(selectedBefore, editingTargetRef.current, nodeId, interactive, event.detail);
      pointerSelectionBefore.current = null;
      if (action === "select") selectMindElixirNode(nodeId);
      if (action === "edit") beginNodeEdit(nodeId, target?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId, { x: event.clientX, y: event.clientY });
    };
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const shell = target?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      const nodeId = shell?.dataset.nodeId;
      if (!nodeId || target?.closest("a,button,input,select,textarea,[role=checkbox]")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      beginNodeEdit(nodeId, target?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId, { x: event.clientX, y: event.clientY });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Undo has to be answered on the canvas too. mind-elixir's own history is
      // off — the tree is the single source of truth — and its keymap swallows
      // every key it does not use, so nothing else here would see the shortcut.
      if (handleTreeHistoryKeyDown(event, storeRef.current)) return;
      // The same table the outline reads, minus an editor: a node is selected as a
      // whole here, so a heading or a colour is written straight to the tree.
      if (!editingTargetRef.current && handleShortcutKeyDown(event, {
        store: storeRef.current,
        nodeId: lastSelectedNodeId.current ?? selectedNodeRef.current,
        onFocusNode: (nodeId) => selectMindElixirNode(nodeId),
      })) return;
      if (editingTargetRef.current || event.key !== "Enter") return;
      const nodeId = lastSelectedNodeId.current ?? selectedNodeRef.current;
      if (!nodeId) return;
      // Ahead of mind-elixir's own Enter, which would insert a second node.
      event.preventDefault();
      event.stopPropagation();
      insertSiblingNode(nodeId);
    };
    // mind-elixir opens its node menu only for a right-click whose target is the
    // `me-tpc` itself, and every node's box is filled here by our own display layer
    // or editor — so the target is a div inside the topic and no menu ever appeared.
    // Aiming the event at the topic is the whole fix; mind-elixir also wants
    // `button === 2`, which a `contextmenu` event does not carry on every browser.
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const topic = target?.closest<HTMLElement>("me-tpc");
      // The topic itself, or the blank surface: mind-elixir already handles both.
      // Re-dispatched events land here too, and this is what stops them recursing.
      if (!topic || target === topic) return;
      // mind-elixir answers every right-click on the canvas with `preventDefault`,
      // so keeping the event away from it is what leaves a node being edited with
      // the browser's own copy/paste menu.
      event.stopPropagation();
      if (target?.closest(".mindmap-node-editor")) return;
      event.preventDefault();
      topic.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: event.clientX,
        clientY: event.clientY,
        view: window,
      }));
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("click", onClick, true);
    container.addEventListener("dblclick", onDoubleClick, true);
    container.addEventListener("keydown", onKeyDown, true);
    container.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("dblclick", onDoubleClick, true);
      container.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [beginNodeEdit, clearTreeSelection, insertSiblingNode, selectMindElixirNode, selectTreeNode]);

  // The collapse handle doubles as the count of what it hides, so the number is
  // written onto the handle itself rather than shown by a second control — see the
  // `me-epd` rules in `styles.css`, which reveal `data-count` only once the node is
  // collapsed. Every handle carries it, collapsed or not, so a collapse needs no
  // pass of its own: the number cannot have changed.
  useEffect(() => {
    containerRef.current?.querySelectorAll<Topic>("me-tpc").forEach((topic) => {
      const expander = topic.nextElementSibling;
      if (!(expander instanceof HTMLElement) || expander.tagName !== "ME-EPD") return;
      expander.dataset.count = String(hiddenDescendantCount(tree, topic.nodeObj.id));
    });
  }, [contentTargets, tree]);

  useEffect(() => {
    if (!contentTargets.length) return;
    const nodeIdByHost = new Map(contentTargets.map(({ id, host }) => [host as Element, id]));
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      // A floating node grows over the map rather than through it, so its own
      // resize moves nothing and the connector layer needs no measure pass. This
      // is what keeps typing off the critical path however many nodes there are.
      if (entries.every((entry) => nodeIdByHost.get(entry.target) === floatingNodeId.current)) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mindRef.current?.linkDiv());
    });
    contentTargets.forEach(({ host }) => observer.observe(host));
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [contentTargets]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    // An image now sizes its own box, so its height is unknown until it decodes —
    // and the display layer is injected as raw HTML, which gives mind-elixir an
    // empty box to link the node around. `load` does not bubble, hence the capture
    // phase on the canvas instead of a listener per picture.
    const onImageLoad = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mindRef.current?.linkDiv());
    };
    container.addEventListener("load", onImageLoad, true);
    return () => {
      container.removeEventListener("load", onImageLoad, true);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {/* `bn-root` is here for BlockNote's colour palette, which the display layer
          borrows so a coloured run of text or table cell looks the same at rest as
          it does in the editor — see `.mindmap-canvas.bn-root` in `styles.css`. */}
      <div className="mindmap-canvas bn-root" ref={containerRef} />
      {/* Hovering a link anywhere in the map — a node's own text, a quote or a table
          cell — opens the outline's link toolbar over it. The popup itself is rendered
          by `MindMapLinkToolbar`, inside the outline editor whose component it is. */}
      <MindMapLinkHoverTracker canvasRef={containerRef} />
      {contentTargets.map(({ id, host }) => {
        const node = tree.nodes[id];
        return node ? createPortal(
          <MindMapNodeContent node={node} store={store} selected={selectedNodeId === id} editing={editingTarget?.nodeId === id} toolbarTarget={toolbarTarget} onSelect={selectTreeNode} onFocusNode={selectMindElixirNode} onFinishEdit={finishNodeEdit} onToolbarActiveChange={reportNodeToolbar} onTextSelectionChange={reportTextSelection} focusBlockId={editingTarget?.nodeId === id ? editingTarget.focusBlockId : undefined} focusPoint={editingTarget?.nodeId === id ? editingTarget.focusPoint : undefined} focusRequest={focusRequest} onFocusRequestHandled={onFocusRequestHandled} />,
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

/** The box that holds a node's place in mind-elixir's flow. */
function nodeFrame(mind: MindElixir | null, nodeId: string) {
  try {
    return mind?.findEle(nodeId).closest<HTMLElement>("me-parent, me-root") ?? null;
  } catch {
    // Collapsed descendants are not mounted.
    return null;
  }
}

function refreshNodeDisplay(mind: MindElixir | null, tree: ZhiJianTree, nodeId: string, searchQuery = "") {
  const node = tree.nodes[nodeId];
  if (!mind || !node) return;
  try {
    const display = mind.findEle(nodeId).querySelector<HTMLElement>(":scope > .mindmap-node-shell > .mindmap-node-display");
    if (!display) return;
    const next = renderMindMapNodeDisplayHtml(node, searchQuery);
    if (display.innerHTML !== next) display.innerHTML = next;
  } catch {
    // The node can already be unmounted.
  }
}

function readMindMapViewport(mind: MindElixir): MindMapViewportState | null {
  const transform = mind.map.style.transform;
  const match = /translate3d?\(([-\d.]+)px,\s*([-\d.]+)px(?:,\s*0px?)?\)\s*scale\(([-\d.]+)\)/.exec(transform);
  if (!match) return { x: 0, y: 0, scale: mind.scaleVal ?? 1 };
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

function restoreMindMapViewport(mind: MindElixir, viewport: MindMapViewportState) {
  mind.scaleVal = viewport.scale;
  mind.map.style.transform = `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`;
}

function selectAndCenterMindMapNode(mind: MindElixir, nodeId: string) {
  try {
    const topic = mind.findEle(nodeId);
    mind.selectNode(topic);
    const nodeRect = topic.getBoundingClientRect();
    const containerRect = mind.container.getBoundingClientRect();
    const nodeCenterX = nodeRect.left + nodeRect.width / 2;
    const nodeCenterY = nodeRect.top + nodeRect.height / 2;
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;
    mind.move(containerCenterX - nodeCenterX, containerCenterY - nodeCenterY, true);
  } catch {
    // Hidden or collapsed search matches are not mounted in the current projection.
  }
}

function syncEditingShells(container: HTMLElement | null, editingNodeId: string | undefined) {
  if (!container) return false;
  let changed = false;
  container.querySelectorAll<HTMLElement>(".mindmap-node-shell[data-node-id]").forEach((shell) => {
    const editing = shell.dataset.nodeId === editingNodeId;
    if (shell.classList.contains("is-editing") === editing) return;
    shell.classList.toggle("is-editing", editing);
    changed = true;
  });
  return changed;
}

function updateMindMapNodesInPlace(mind: MindElixir | null, root: NodeObj, editingNodeId?: string) {
  if (!mind) return false;
  let addedShell = false;
  let changed = false;
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
      const result = updateStableShell(topicElement, nextNode.dangerouslySetInnerHTML ?? "", nextNode.id === editingNodeId);
      addedShell = addedShell || result === "added";
      changed = changed || result !== "unchanged";
    } catch {
      // Collapsed descendants are not mounted.
    }
    nextNode.children?.forEach(visit);
  };
  visit(root);
  if (changed) mind.linkDiv();
  return addedShell;
}

function updateStableShell(topicElement: HTMLElement, nextHtml: string, editing: boolean) {
  const currentShell = topicElement.querySelector<HTMLElement>(":scope > .mindmap-node-shell");
  if (!currentShell) {
    // The shell arrives showing its display layer even for the node being edited —
    // a node added by Enter is mounted here and edited immediately. `syncEditingShells`
    // swaps the layers over later in the same commit, after `setEditingFloat` has
    // measured the display layer to pin the node's place in the flow; hiding it here
    // pinned an empty box instead, and the new node reserved no room for itself.
    topicElement.innerHTML = nextHtml;
    return "added" as const;
  }
  const template = document.createElement("template");
  template.innerHTML = nextHtml;
  const nextShell = template.content.querySelector<HTMLElement>(".mindmap-node-shell");
  const currentDisplay = currentShell.querySelector<HTMLElement>(":scope > .mindmap-node-display");
  const nextDisplay = nextShell?.querySelector<HTMLElement>(":scope > .mindmap-node-display");
  if (!nextShell || !currentDisplay || !nextDisplay) return "unchanged" as const;
  let changed = false;
  if (currentShell.style.cssText !== nextShell.style.cssText) {
    currentShell.style.cssText = nextShell.style.cssText;
    changed = true;
  }
  // While a node is being edited its display layer is hidden behind the editor.
  // Rewriting it anyway would rebuild every `<img>` on each keystroke, which the
  // browser answers with a decode and a reflow — the source of sibling-node
  // flicker. Leave it stale; the editing effect refreshes it on the way out.
  if (!editing && currentDisplay.innerHTML !== nextDisplay.innerHTML) {
    currentDisplay.innerHTML = nextDisplay.innerHTML;
    changed = true;
  }
  return changed ? ("updated" as const) : ("unchanged" as const);
}
