import "mind-elixir/style.css";
import MindElixir, { type MindElixirData, type NodeObj, type Operation, type Topic } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiDroplet, FiGitBranch } from "react-icons/fi";
import { RiEyeLine, RiEyeOffLine } from "react-icons/ri";
import type { ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import type { MindMapViewportState } from "../shared/documentViewState";
import { captureMindMapPng } from "../shared/exportFiles";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";
import { handleShortcutKeyDown } from "../shared/shortcuts";
import { createMindMapStructureSignature, treeToMindElixir } from "./mindElixirAdapter";
import { applyMindElixirOperation } from "./mindElixirCommands";
import {
  correctMindMapSummaryOffsets,
  isMindMapDecorationOperation,
  readMindMapDecorations,
  sameMindMapDecorations,
} from "./mindMapDecorations";
import { MINDMAP_DRAGGING_CLASS, displayClickAction, hiddenDescendantCount, isBlankMindMapSurface, isMindMapAnnotationTarget, mindMapDisplayDragTopic, mindMapMeasuredSizeChanged, mindMapPressTarget, mindMapScaleFromTransform, mindMapUpdateMode, sameEditingTarget, shouldExitEditing, unscaledMindMapSize, updateMindMapPointerSession, type EditingTarget, type MindMapMeasuredSize, type MindMapPointerSession, type MindMapPressTarget } from "./mindMapInteraction";
import { MINDMAP_THEME } from "./mindMapTheme";
import {
  CLOZE_CLASS,
  CLOZE_REVEALED_CLASS,
  CLOZE_REVEAL_ALL_CLASS,
  clozeAtEvent,
  toggleClozeReveal,
} from "./mindMapCloze";
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
  onFocusNode?: (nodeId: string) => void;
  onExitFocus?: () => void;
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
  onExportImageReady?: (exportImage: (() => Promise<Blob | null>) | null) => void;
}

export interface MindMapTextSelection {
  nodeId: string;
  from: number;
  to: number;
}

export function MindMapEditor({ store, onSelectNode, onSelectionActiveChange, onTextSelectionChange, onNodeToolbarActiveChange, onFocusNode, onExitFocus, selectedNodeId, toolbarTarget, focusRequest, focusNodeRequest = null, onFocusRequestHandled, searchQuery = "", visibleNodeIds = null, zoomedNodeId = null, initialViewport, onViewportChange, onExportImageReady }: MindMapEditorProps) {
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
  const onFocusNodeRef = useRef(onFocusNode);
  const onExitFocusRef = useRef(onExitFocus);
  const onExportImageReadyRef = useRef(onExportImageReady);
  const selectedNodeRef = useRef(selectedNodeId);
  const lastSelectedNodeId = useRef<string | null>(selectedNodeId);
  const editingTargetRef = useRef<EditingTarget>(null);
  const geometryMeasureFrame = useRef(0);
  const linkFrame = useRef(0);
  const decorationSaveFrame = useRef(0);
  const editingShellRef = useRef<string | null>(null);
  const floatingFrame = useRef<HTMLElement | null>(null);
  const floatingNodeId = useRef<string | null>(null);
  const floatingFrameSize = useRef<MindMapMeasuredSize | null>(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  onFocusNodeRef.current = onFocusNode;
  onExitFocusRef.current = onExitFocus;
  onExportImageReadyRef.current = onExportImageReady;
  projectionOptionsRef.current = { searchQuery, visibleNodeIds, rootNodeId: zoomedNodeId };
  const beginNodeEditRef = useRef<(nodeId: string, focusBlockId?: string, focusPoint?: { x: number; y: number }, focusTableCell?: { row: number; column: number }) => void>(() => undefined);
  const pointerSession = useRef<MindMapPointerSession | null>(null);
  // Kept past the click that consumes the session, because a double click's own
  // event is reported on the topic too and its second press is the only record of
  // which part of the node it aimed at.
  const lastPress = useRef<MindMapPressTarget | null>(null);
  const lastPressAt = useRef(0);
  const pressBehindEditRef = useRef<(nodeId: string) => MindMapPressTarget | null>(() => null);
  const contentHosts = useRef(new Map<string, HTMLDivElement>());
  const [contentTargets, setContentTargets] = useState<Array<{ id: string; host: HTMLElement }>>([]);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);
  const [styleToolbarHost, setStyleToolbarHost] = useState<HTMLElement | null>(null);
  const [styleSubmenu, setStyleSubmenu] = useState<"layout" | "theme" | null>(null);
  const [themeName, setThemeName] = useState<"zhijian" | "classic">("zhijian");

  useEffect(() => {
    if (!styleSubmenu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest(".mindmap-style-menu-wrap")) {
        setStyleSubmenu(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [styleSubmenu]);
  const [revealAllCloze, setRevealAllCloze] = useState(false);

  /**
   * 一键显示/隐藏挖空内容, which also settles the clozes revealed one by one: the two
   * states are read from different places — a class on the canvas and a class per run
   * — and leaving the individual ones on would make the button look like it had done
   * nothing to them.
   */
  const toggleAllCloze = useCallback(() => {
    containerRef.current
      ?.querySelectorAll<HTMLElement>(`.${CLOZE_CLASS}.${CLOZE_REVEALED_CLASS}`)
      .forEach((element) => element.classList.remove(CLOZE_REVEALED_CLASS));
    setRevealAllCloze((revealed) => !revealed);
  }, []);

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
    correctMindMapSummaryOffsets(mind, treeRef.current);
    queueMicrotask(() => {
      suppressOperation.current = false;
      collectTargets();
      const restoreId = selectedNodeRef.current ?? lastSelectedNodeId.current;
      if (!restoreId) return;
      try { mind.selectNode(mind.findEle(restoreId)); } catch { lastSelectedNodeId.current = null; }
    });
  }, [collectTargets]);

  /**
   * Hand the map's current 摘要 and 连接 to the store.
   *
   * Guarded on the set having actually changed, because the live-reshape listener
   * fires while an arrow's control point is dragged, and every commit is an undo
   * step. Only the map reads these back, so this does not touch the outline.
   */
  const saveDecorations = useCallback(() => {
    const mind = mindRef.current;
    if (!mind) return;
    const decorations = readMindMapDecorations(mind);
    if (sameMindMapDecorations(storeRef.current.getSnapshot().mindMap, decorations)) return;
    storeRef.current.setMindMapDecorations(decorations);
  }, []);

  /**
   * The same save, coalesced to one per frame — `updateArrowDelta` fires per
   * pointer move, and the library's own docs ask callers to throttle it.
   */
  const scheduleSaveDecorations = useCallback(() => {
    window.cancelAnimationFrame(decorationSaveFrame.current);
    decorationSaveFrame.current = window.requestAnimationFrame(() => {
      decorationSaveFrame.current = 0;
      saveDecorations();
    });
  }, [saveDecorations]);

  const scheduleLinkDiv = useCallback(() => {
    window.cancelAnimationFrame(linkFrame.current);
    linkFrame.current = window.requestAnimationFrame(() => {
      linkFrame.current = 0;
      mindRef.current?.linkDiv();
    });
  }, []);

  const scheduleGeometryMeasure = useCallback((nodeId: string) => {
    window.cancelAnimationFrame(geometryMeasureFrame.current);
    geometryMeasureFrame.current = window.requestAnimationFrame(() => {
      geometryMeasureFrame.current = 0;
      if (editingTargetRef.current?.nodeId !== nodeId) return;
      if (resizeFloatingFrameToEditor(mindRef.current, nodeId, floatingFrameSize)) scheduleLinkDiv();
    });
  }, [scheduleLinkDiv]);

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
    floatingFrameSize.current = null;
    if (next) {
      const size = measureElementSize(next, mindRef.current);
      next.style.width = `${size.width}px`;
      next.style.height = `${size.height}px`;
      next.classList.add("is-mindmap-floating");
      floatingFrameSize.current = size;
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

  useEffect(() => () => {
    window.cancelAnimationFrame(linkFrame.current);
    window.cancelAnimationFrame(geometryMeasureFrame.current);
    window.cancelAnimationFrame(decorationSaveFrame.current);
  }, []);

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
      contextMenu: {
        locale: zh_CN,
        focus: false,
        extend: [
          {
            name: "专注",
            onclick: (event) => {
              dismissContextMenu(event);
              const nodeId = mindRef.current?.currentNode?.nodeObj.id ?? selectedNodeRef.current;
              if (nodeId && nodeId !== treeRef.current.rootId) onFocusNodeRef.current?.(nodeId);
            },
          },
          {
            name: "取消专注",
            onclick: (event) => {
              dismissContextMenu(event);
              if (projectionOptionsRef.current.rootNodeId) onExitFocusRef.current?.();
            },
          },
        ],
      },
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
    // mind-elixir's own layout switcher, top left. 一键显示/隐藏挖空内容 belongs with it
    // rather than in the app's toolbar: it is a way of looking at the map, like the
    // three layouts next to it, and it only appears while the document has a cloze.
    setStyleToolbarHost(containerRef.current.querySelector<HTMLElement>(".mind-elixir-toolbar.lt"));
    correctMindMapSummaryOffsets(mind, initialTree.current);
    if (initialViewportRef.current && !projectionOptionsRef.current.rootNodeId) {
      restoreMindMapViewport(mind, initialViewportRef.current);
    }
    mind.beginEdit = async (element) => {
      const nodeId = (element ?? mind.currentNode)?.nodeObj.id;
      if (!nodeId) return;
      const press = pressBehindEditRef.current(nodeId);
      beginNodeEditRef.current(nodeId, press?.blockId, press?.point, press?.tableCell);
    };
    // Everything that adds a node — Enter, Tab, the context menu — reaches for
    // mind-elixir's own inline input afterwards, which would lay a plain-text box
    // over the node and hide the node itself behind it (`editTopic` sets the
    // topic's opacity to 0). The node's own editor is the only editor here.
    mind.editTopic = (element) => {
      const nodeId = element?.nodeObj.id;
      if (!nodeId) return;
      const press = pressBehindEditRef.current(nodeId);
      beginNodeEditRef.current(nodeId, press?.blockId, press?.point, press?.tableCell);
    };
    // The summary's own label editor is a clone of the label positioned from it, so
    // the lift has to be in place before it opens. On creation mind-elixir renders
    // the summary and opens the editor before it reports the operation, so the
    // `operation` listener is too late to catch that first box.
    const editSummary = mind.editSummary.bind(mind);
    mind.editSummary = (element) => {
      correctMindMapSummaryOffsets(mind, treeRef.current);
      editSummary(element);
    };
    queueMicrotask(collectTargets);
    mind.bus.addListener("operation", (operation: Operation) => {
      if (suppressOperation.current) return;
      // 摘要 and 连接 report on this same bus, and their `obj.id` is the
      // annotation's own id — treating it as a node id would select a node that
      // does not exist. They are stored whole instead, off the instance.
      if (isMindMapDecorationOperation(operation)) {
        saveDecorations();
        // Creating a summary draws it and reports it without going through
        // `linkDiv`, so the lift has to be applied here too — otherwise a summary
        // sits low until the next layout pass happens to redraw it.
        correctMindMapSummaryOffsets(mind, treeRef.current);
        return;
      }
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
    // Every re-render of the annotations ends here, whichever caused it — a layout
    // pass, a refresh, or creating one — so this is the one place the summary lift
    // has to be applied from.
    mind.bus.addListener("linkDiv", () => correctMindMapSummaryOffsets(mind, treeRef.current));
    // Dragging an arrow's control point moves it without an `operation`; the delta
    // is part of the arrow, so it has to be stored too. `saveDecorations` no-ops
    // when nothing changed, which is what keeps a drag from filling the undo stack.
    mind.bus.addListener("updateArrowDelta", () => scheduleSaveDecorations());
    mindRef.current = mind;
    // Photographed from the live canvas rather than through `mind.exportPng`, which
    // re-draws the map from mind-elixir's own idea of a topic — plain text — and so
    // knows nothing of the quotes, pictures and tables inside our nodes.
    onExportImageReadyRef.current?.(() => captureMindMapPng());
    return () => {
      onExportImageReadyRef.current?.(null);
      mind.destroy();
      mindRef.current = null;
    };
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
    pointerSession.current = null;
    lastSelectedNodeId.current = null;
    selectedNodeRef.current = null;
    mindRef.current?.clearSelection();
    onSelectRef.current(null);
    onActiveRef.current(false);
    onTextSelectionRef.current(null);
  }, [applyEditingTarget]);

  const beginNodeEdit = useCallback((nodeId: string, focusBlockId?: string, focusPoint?: { x: number; y: number }, focusTableCell?: { row: number; column: number }) => {
    selectMindElixirNode(nodeId);
    applyEditingTarget({ nodeId, focusBlockId, focusPoint, focusTableCell });
  }, [applyEditingTarget, selectMindElixirNode]);
  beginNodeEditRef.current = beginNodeEdit;

  /**
   * The press behind an edit mind-elixir is asking for, when there is one.
   *
   * mind-elixir detects double clicks itself, off its own `pointerup` timing, and
   * asks for the edit from that handler — which runs *before* the app's click
   * handler, so the app's own gesture path is skipped as "already editing" and its
   * caret coordinates never arrive. Reading the press back here is what keeps a
   * fast double click into a quote or a table cell landing where it was aimed;
   * without it the editor opens with a node id alone, and a table's fallback caret
   * is its first cell. Edits with no press behind them at all — Enter on a selected
   * node, the context menu — must not borrow an older one, hence the freshness
   * window, which is a little wider than the double-click interval.
   */
  const pressBehindEdit = useCallback((nodeId: string) => {
    const press = lastPress.current;
    if (!press || press.nodeId !== nodeId || Date.now() - lastPressAt.current > 600) return null;
    return press;
  }, []);
  pressBehindEditRef.current = pressBehindEdit;

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
      const editingNodeId = editingTargetRef.current?.nodeId;
      const result = updateMindMapNodesInPlace(mindRef.current, nextData.nodeData, editingNodeId);
      if (result.addedShell) queueMicrotask(collectTargets);
      if (result.changedNodeIds.some((id) => id !== editingNodeId)) {
        scheduleLinkDiv();
      }
      return;
    }
    if (mode === "defer-structure") {
      pendingStructure.current = true;
      return;
    }
    refreshStructure(nextData, nextSignature);
  }, [collectTargets, refreshStructure, scheduleLinkDiv, searchQuery, tree, visibleNodeIds, zoomedNodeId]);

  const previousZoomedNodeId = useRef(zoomedNodeId);
  useEffect(() => {
    if (previousZoomedNodeId.current === zoomedNodeId) return;
    previousZoomedNodeId.current = zoomedNodeId;
    const frame = window.requestAnimationFrame(() => mindRef.current?.toCenter());
    return () => window.cancelAnimationFrame(frame);
  }, [zoomedNodeId]);

  useEffect(() => {
    const previousNodeId = editingShellRef.current;
    editingShellRef.current = editingTarget?.nodeId ?? null;
    // The display layer is deliberately left stale while the editor covers it,
    // so restore it for the node that just stopped editing before it shows again.
    if (previousNodeId && previousNodeId !== editingTarget?.nodeId) {
      refreshNodeDisplay(mindRef.current, treeRef.current, previousNodeId, searchQuery);
    }
    let shellChanged = false;
    let frameChanged = false;
    let floatChanged = false;
    if (editingTarget) {
      // Pin the frame before revealing the editor. The topic itself stays absolute
      // for the full edit lifecycle, so typing never re-enters mind-elixir's flow.
      floatChanged = setEditingFloat(editingTarget.nodeId);
      shellChanged = syncEditingShells(containerRef.current, editingTarget.nodeId);
      if (previousNodeId && previousNodeId !== editingTarget.nodeId && (floatChanged || shellChanged)) scheduleLinkDiv();
    } else {
      // Show the final display while the topic is still floating, then resize the
      // placeholder once to the display size before putting the topic back in flow.
      shellChanged = syncEditingShells(containerRef.current, undefined);
      if (previousNodeId) frameChanged = resizeFloatingFrameToDisplay(mindRef.current, previousNodeId, floatingFrameSize);
      floatChanged = setEditingFloat(null);
      if ((previousNodeId || floatChanged) && (frameChanged || floatChanged || shellChanged)) scheduleLinkDiv();
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
  }, [editingTarget, refreshStructure, scheduleLinkDiv, searchQuery, setEditingFloat, visibleNodeIds, zoomedNodeId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // 挖空: the one press on a node that is neither a selection nor an edit. It is
      // answered here, ahead of everything else, because the reader may not have the
      // node selected — and must not end up selecting it by uncovering a blank.
      const cloze = event.button === 0 ? clozeAtEvent(target) : null;
      if (cloze) {
        event.preventDefault();
        event.stopPropagation();
        toggleClozeReveal(cloze);
        return;
      }
      const shell = target?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      if (shell?.dataset.nodeId) {
        const selectedAtPointerDown = shell.closest("me-tpc")?.classList.contains("selected")
          ? shell.dataset.nodeId
          : selectedNodeRef.current;
        const press = mindMapPressTarget(target, { x: event.clientX, y: event.clientY });
        lastPress.current = press;
        lastPressAt.current = Date.now();
        pointerSession.current = {
          pointerId: event.pointerId,
          nodeId: shell.dataset.nodeId,
          selectedNodeId: selectedAtPointerDown,
          startX: event.clientX,
          startY: event.clientY,
          dragged: false,
          press: press ?? undefined,
        };
      } else if (event.button === 0 && isBlankMindMapSurface(target)) {
        // Pointerdown, not click: this is the moment mind-elixir reads a gesture
        // on the blank surface as a box select and releases its own selection, so
        // matching it here keeps the two sides from disagreeing mid-drag.
        clearTreeSelection();
      }
      const checkbox = target?.closest<HTMLElement>(".mindmap-node-checkbox");
      const nodeId = checkbox?.dataset.nodeId;
      if (nodeId && event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        const node = storeRef.current.getNode(nodeId);
        if (node?.type !== "todo") return;
        storeRef.current.updateProps(nodeId, { checked: !(node.props?.checked ?? false) });
        selectTreeNode(nodeId);
        return;
      }

      const dragTopic = mindMapDisplayDragTopic(target);
      if (!dragTopic || event.button !== 0 || target === dragTopic) return;
      // Preserve the active pointer id: MindElixir captures it on the topic and
      // receives the real move/up events, so an unselected node can drag from the
      // first press on its display content.
      event.preventDefault();
      event.stopImmediatePropagation();
      dragTopic.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerSession.current = updateMindMapPointerSession(pointerSession.current, event.pointerId, event.clientX, event.clientY);
      // MindElixir looks for the drop target with `elementFromPoint` a little above and
      // below the pointer, and accepts the hit only if it is a topic element itself. The
      // display layer fills the topic with its own spans, which are hittable so that a
      // click can reach a checkbox, a link or a table cell — so the probe kept answering
      // a span and the drop was refused. Standing the display down for the length of the
      // drag is what makes the whole band above and below a node accept the node being
      // dragged; see `.is-node-dragging` in `styles.css`.
      if (pointerSession.current?.dragged) container.classList.add(MINDMAP_DRAGGING_CLASS);
    };
    const endPointerDrag = () => container.classList.remove(MINDMAP_DRAGGING_CLASS);
    const onPointerCancel = (event: PointerEvent) => {
      endPointerDrag();
      if (pointerSession.current?.pointerId === event.pointerId) pointerSession.current = null;
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      // The cloze was uncovered on pointerdown; the click that follows it must not
      // also select the node or open its editor.
      if (clozeAtEvent(target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // The state already changed on pointerdown. Suppress the native checkbox's
      // own click toggle so it cannot briefly paint the opposite state while the
      // store projection is replacing the display HTML.
      if (target?.closest(".mindmap-node-checkbox")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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
      const session = pointerSession.current;
      pointerSession.current = null;
      const releasedOn = target?.closest<HTMLElement>(".mindmap-node-shell[data-node-id]")?.dataset.nodeId;
      // The press decides which node and which part of it the gesture is about; the
      // release only decides what to do about it. MindElixir holds the pointer
      // capture for the drag it might be starting, so the release is reported on the
      // topic rather than on the display the press landed in.
      const press =
        session?.press && (!releasedOn || releasedOn === session.nodeId)
          ? session.press
          : mindMapPressTarget(target, { x: event.clientX, y: event.clientY });
      if (!press) return;
      if (session?.dragged) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const selectedBefore = session ? session.selectedNodeId : selectedNodeRef.current;
      const action = displayClickAction(selectedBefore, editingTargetRef.current, press.nodeId, press.interactive, event.detail);
      if (action === "select") selectMindElixirNode(press.nodeId);
      if (action === "edit") beginNodeEdit(press.nodeId, press.blockId, press.point, press.tableCell);
    };
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      // A summary or a connector label is mind-elixir's to edit, and it belongs to no
      // node — so the fallback below must not borrow the last node press for it.
      if (isMindMapAnnotationTarget(target)) return;
      // Retargeted to the topic by the same pointer capture the click is, so the
      // second press is what says which cell or quote was double clicked.
      const press =
        mindMapPressTarget(target, { x: event.clientX, y: event.clientY }) ?? lastPress.current;
      if (!press || press.interactive) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      beginNodeEdit(press.nodeId, press.blockId, press.point, press.tableCell);
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
    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointerup", endPointerDrag, true);
    container.addEventListener("pointercancel", onPointerCancel, true);
    container.addEventListener("click", onClick, true);
    container.addEventListener("dblclick", onDoubleClick, true);
    container.addEventListener("keydown", onKeyDown, true);
    container.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointerup", endPointerDrag, true);
      container.removeEventListener("pointercancel", onPointerCancel, true);
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("dblclick", onDoubleClick, true);
      container.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("contextmenu", onContextMenu, true);
      endPointerDrag();
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
      const floatingNode = floatingNodeId.current;
      if (floatingNode && entries.every((entry) => nodeIdByHost.get(entry.target) === floatingNode)) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(scheduleLinkDiv);
    });
    contentTargets.forEach(({ host }) => observer.observe(host));
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [contentTargets, scheduleLinkDiv]);

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
      const shell = event.target.closest<HTMLElement>(".mindmap-node-shell[data-node-id]");
      if (shell?.dataset.nodeId === floatingNodeId.current) {
        // The edit projection is already floating over a fixed frame. Its initial
        // image load is not a user geometry change and must not move the branch.
        return;
      }
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(scheduleLinkDiv);
    };
    container.addEventListener("load", onImageLoad, true);
    return () => {
      container.removeEventListener("load", onImageLoad, true);
      window.cancelAnimationFrame(frame);
    };
  }, [scheduleLinkDiv]);

  return (
    <>
      {/* `bn-root` is here for BlockNote's colour palette, which the display layer
          borrows so a coloured run of text or table cell looks the same at rest as
          it does in the editor — see `.mindmap-canvas.bn-root` in `styles.css`. */}
      <div className={`mindmap-canvas bn-root ${zoomedNodeId ? "is-focus-mode" : ""} ${revealAllCloze ? CLOZE_REVEAL_ALL_CLASS : ""}`} ref={containerRef} />
      {styleToolbarHost
        ? createPortal(
          <div className="mindmap-style-menu-wrap">
            <div className="mindmap-style-menu-buttons">
              <button type="button" className="mindmap-style-menu-trigger" title="导图样式" aria-label="导图样式" aria-expanded={styleSubmenu === "layout"} onClick={() => setStyleSubmenu(styleSubmenu === "layout" ? null : "layout")}><FiGitBranch /></button>
              <button type="button" className="mindmap-style-menu-trigger" title="主题" aria-label="主题" aria-expanded={styleSubmenu === "theme"} onClick={() => setStyleSubmenu(styleSubmenu === "theme" ? null : "theme")}><FiDroplet /></button>
              <button type="button" className={`mindmap-style-menu-trigger ${revealAllCloze ? "is-active" : ""}`} title={revealAllCloze ? "隐藏挖空内容" : "显示挖空内容"} aria-label={revealAllCloze ? "隐藏挖空内容" : "显示挖空内容"} aria-pressed={revealAllCloze} onClick={toggleAllCloze}>{revealAllCloze ? <RiEyeLine /> : <RiEyeOffLine />}</button>
            </div>
            {styleSubmenu === "layout" ? (
              <div className="mindmap-style-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { styleToolbarHost.querySelector<HTMLElement>("#tbltl")?.click(); setStyleSubmenu(null); }}>向左布局</button>
                <button type="button" role="menuitem" onClick={() => { styleToolbarHost.querySelector<HTMLElement>("#tbltr")?.click(); setStyleSubmenu(null); }}>向右布局</button>
                <button type="button" role="menuitem" onClick={() => { styleToolbarHost.querySelector<HTMLElement>("#tblts")?.click(); setStyleSubmenu(null); }}>双向布局</button>
              </div>
            ) : null}
            {styleSubmenu === "theme" ? (
              <div className="mindmap-style-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { mindRef.current?.changeTheme(MINDMAP_THEME); setThemeName("zhijian"); setStyleSubmenu(null); }}><span>枝间主题</span>{themeName === "zhijian" ? <FiCheck /> : null}</button>
                <button type="button" role="menuitem" onClick={() => { mindRef.current?.changeTheme(MindElixir.THEME); setThemeName("classic"); setStyleSubmenu(null); }}><span>经典主题</span>{themeName === "classic" ? <FiCheck /> : null}</button>
              </div>
            ) : null}
          </div>,
          styleToolbarHost,
        )
        : null}
      {/* Hovering a link anywhere in the map — a node's own text, a quote or a table
          cell — opens the outline's link toolbar over it. The popup itself is rendered
          by `MindMapLinkToolbar`, inside the outline editor whose component it is. */}
      <MindMapLinkHoverTracker canvasRef={containerRef} />
      {contentTargets.map(({ id, host }) => {
        const node = tree.nodes[id];
        return node ? createPortal(
          <MindMapNodeContent node={node} store={store} selected={selectedNodeId === id} editing={editingTarget?.nodeId === id} toolbarTarget={toolbarTarget} onSelect={selectTreeNode} onFocusNode={selectMindElixirNode} onFinishEdit={finishNodeEdit} onToolbarActiveChange={reportNodeToolbar} onTextSelectionChange={reportTextSelection} focusBlockId={editingTarget?.nodeId === id ? editingTarget.focusBlockId : undefined} focusPoint={editingTarget?.nodeId === id ? editingTarget.focusPoint : undefined} focusTableCell={editingTarget?.nodeId === id ? editingTarget.focusTableCell : undefined} onGeometryChange={scheduleGeometryMeasure} focusRequest={focusRequest} onFocusRequestHandled={onFocusRequestHandled} />,
          host,
          id,
        ) : null;
      })}
    </>
  );
}

function dismissContextMenu(event: MouseEvent) {
  const menu = (event.currentTarget as Element | null)?.closest<HTMLElement>(".context-menu");
  if (menu) menu.hidden = true;
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

function mindMapCanvasScale(mind: MindElixir | null) {
  if (!mind?.map) return 1;
  const fallback = Number.isFinite(mind.scaleVal) && mind.scaleVal > 0 ? mind.scaleVal : 1;
  const transform = window.getComputedStyle(mind.map).transform;
  return mindMapScaleFromTransform(transform, fallback);
}

function measureElementSize(element: HTMLElement, mind: MindElixir | null): MindMapMeasuredSize {
  // Client rects preserve fractional CSS pixels but include the canvas transform;
  // divide by its exact scale before writing the size back into map layout units.
  const rect = element.getBoundingClientRect();
  return unscaledMindMapSize({ width: rect.width, height: rect.height }, mindMapCanvasScale(mind));
}

function visibleTopicContent(topic: HTMLElement) {
  return topic.querySelector<HTMLElement>(
    ":scope > .mindmap-node-shell.is-editing .mindmap-node-editor, :scope > .mindmap-node-shell:not(.is-editing) .mindmap-node-display, :scope > .mindmap-node-shell",
  );
}

function resizeFloatingFrameToElement(
  mind: MindElixir | null,
  nodeId: string,
  sizeRef: MutableRefObject<MindMapMeasuredSize | null>,
  element: HTMLElement | null,
) {
  const frame = nodeFrame(mind, nodeId);
  if (!frame || !element) return false;
  const nextSize = measureElementSize(element, mind);
  if (!nextSize.width || !nextSize.height || !mindMapMeasuredSizeChanged(sizeRef.current, nextSize)) return false;
  frame.style.width = `${nextSize.width}px`;
  frame.style.height = `${nextSize.height}px`;
  sizeRef.current = nextSize;
  return true;
}

function resizeFloatingFrameToEditor(
  mind: MindElixir | null,
  nodeId: string,
  sizeRef: MutableRefObject<MindMapMeasuredSize | null>,
) {
  try {
    const editor = mind?.findEle(nodeId).querySelector<HTMLElement>(":scope > .mindmap-node-shell .mindmap-node-editor") ?? null;
    return resizeFloatingFrameToElement(mind, nodeId, sizeRef, editor);
  } catch {
    return false;
  }
}

function resizeFloatingFrameToDisplay(
  mind: MindElixir | null,
  nodeId: string,
  sizeRef: MutableRefObject<MindMapMeasuredSize | null>,
) {
  try {
    const topic = mind?.findEle(nodeId);
    return topic ? resizeFloatingFrameToElement(mind, nodeId, sizeRef, visibleTopicContent(topic)) : false;
  } catch {
    return false;
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
  if (!mind) return { addedShell: false, changedNodeIds: [] as string[] };
  let addedShell = false;
  const changedNodeIds: string[] = [];
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
      if (result !== "unchanged") changedNodeIds.push(nextNode.id);
    } catch {
      // Collapsed descendants are not mounted.
    }
    nextNode.children?.forEach(visit);
  };
  visit(root);
  return { addedShell, changedNodeIds };
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
