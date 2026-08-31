import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiChevronDown,
  FiChevronRight,
  FiDownload,
  FiFileText,
  FiGitBranch,
  FiImage,
  FiList,
  FiMoreHorizontal,
  FiSearch,
  FiShare2,
  FiUpload,
} from "react-icons/fi";
import { markdownFileName, markdownImportTitle, markdownToTree, treeToMarkdown } from "./core/markdown/markdownDocument";
import { outlineExportFileName, treeToOutlineHtmlDocument } from "./core/export/outlineDocument";
import { createInitialTree, richTextToPlainText, type ZhiJianMindMapDefaults } from "./core/tree";
import { TreeStore, attachTreePersistence, loadPersistedTree } from "./core/treeStore";
import { useTree } from "./core/treeStore/useTree";
import type { MindMapTextSelection } from "./mindmap/MindMapEditor";
import { zoomPath } from "./outline/outlineZoom";
import type { DocumentViewState, MindMapViewportState } from "./shared/documentViewState";
import { preloadEditorView } from "./shared/editorPreload";
import { captureOutlinePng, downloadBlob, imageBlobToPdf, preloadImageExporter } from "./shared/exportFiles";
import type { CapturedImage } from "./shared/exportFiles";
import { matchingNodeIds, replaceSearchMatch, searchVisibleNodeIds } from "./shared/treeSearch";
import {
  isAppShortcut,
  resolveShortcut,
  zoomInTargetId,
  zoomOutTargetId,
} from "./shared/shortcuts";
import { ShortcutHelpDialog } from "./shared/shortcuts/ShortcutHelpDialog";
import "./styles.css";

// 两个编辑器各自带着很重的依赖（BlockNote 和 MindElixir），静态引入会让工作区首屏
// 必须等两份代码都下载完。改成按 activeView 懒加载：进入工作区只加载壳，打开文档时
// 取大纲那一份，第一次切到导图才去取 MindElixir。
const OutlineEditor = lazy(() => import("./outline/OutlineEditor").then((module) => ({ default: module.OutlineEditor })));
const MindMapEditor = lazy(() => import("./mindmap/MindMapEditor").then((module) => ({ default: module.MindMapEditor })));

interface AppProps {
  embedded?: boolean;
  store?: TreeStore;
  toolbarTarget?: HTMLElement | null;
  onFocusBreadcrumbChange?: (state: FocusBreadcrumbState | null) => void;
  viewStateStorageKey?: string;
  focusNodeRequest?: {
    nodeId: string;
    query: string;
    requestId: number;
  } | null;
  onShare?: () => void;
  /**
   * 由工作区提供：一次选中多个文件时，它们各自成为一篇新文档，而不是挤进当前这一篇。
   * 没有这个回调（分享页、独立预览）时导入只接受单个文件。
   */
  onImportDocuments?: (files: File[]) => void;
  mindMapDefaults?: ZhiJianMindMapDefaults;
  onMindMapDefaultsChange?: (patch: ZhiJianMindMapDefaults) => void;
  readOnly?: boolean;
}

export interface FocusBreadcrumbItem {
  id: string;
  label: string;
  current: boolean;
}

export interface FocusBreadcrumbState {
  items: FocusBreadcrumbItem[];
  navigate: (nodeId: string | null) => void;
}

const DEFAULT_VIEW_STATE_STORAGE_KEY = "zhijian.editor.view-state.v1";

export default function App({
  embedded = false,
  store: providedStore,
  toolbarTarget = null,
  onFocusBreadcrumbChange,
  viewStateStorageKey,
  focusNodeRequest = null,
  onShare,
  onImportDocuments,
  mindMapDefaults,
  onMindMapDefaultsChange,
  readOnly = false,
}: AppProps) {
  const viewStateKey = viewStateStorageKey ?? DEFAULT_VIEW_STATE_STORAGE_KEY;
  const [initialViewState] = useState(() => loadDocumentViewState(viewStateKey));
  const internalStore = useMemo(
    () => new TreeStore(loadPersistedTree() ?? createInitialTree()),
    [],
  );
  const store = providedStore ?? internalStore;
  useEffect(
    () => providedStore ? undefined : attachTreePersistence(internalStore),
    [internalStore, providedStore],
  );
  const tree = useTree(store);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectionActive, setSelectionActive] = useState(false);
  const [activeView, setActiveView] = useState<"outline" | "mindmap">(initialViewState?.activeView ?? "outline");
  // Set while the node being edited in the map is formatting one of its own quote or
  // picture blocks, which it does through its own toolbar in the shared host.
  const [mindMapNodeToolbarActive, setMindMapNodeToolbarActive] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const mindMapExportImageRef = useRef<(() => Promise<CapturedImage | null>) | null>(null);
  const handledFocusRequestIdRef = useRef<number | null>(null);
  const searchResultHighlightTimerRef = useRef<number | null>(null);
  const toolbarMoreRef = useRef<HTMLDivElement>(null);
  const collapseMenuRef = useRef<HTMLDivElement>(null);
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const mindMapViewportRef = useRef(initialViewState?.mindMapViewport);
  const [collapseMenuOpen, setCollapseMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [activeSearchNodeId, setActiveSearchNodeId] = useState<string | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  // 进入当前主题: which node the views are showing as though it were the document.
  const [zoomedNodeId, setZoomedNodeId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    fallbackTitle: string;
    fileName: string;
    markdown: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [mindMapToolbarTarget, setMindMapToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [mindMapTextSelection, setMindMapTextSelection] =
    useState<MindMapTextSelection | null>(null);
  const [mindMapFocusRequest, setMindMapFocusRequest] = useState<{
    nodeId: string;
    focusBlockId: string;
    requestId: number;
  } | null>(null);
  const [mindMapFocusNodeRequest, setMindMapFocusNodeRequest] = useState<{
    nodeId: string;
    requestId: number;
  } | null>(null);
  const selectedNode = selectedNodeId ? store.getNode(selectedNodeId) : null;
  const visibleSearchNodeIds = useMemo(() => searchVisibleNodeIds(tree, searchQuery), [searchQuery, tree]);
  const matchedNodeIds = useMemo(() => matchingNodeIds(tree, searchQuery), [searchQuery, tree]);
  // A table's cell colours come from BlockNote's own table handles, and the bridge
  // below cannot select a table block's text to act on in the first place.
  const isMindMapMediaSelected = selectedNode?.type === "table";

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  const handleOutlineSelect = useCallback(
    (nodeId: string) => {
      if (activeView === "outline") {
        setSelectedNodeId(nodeId);
        setSelectionActive(true);
      }
    },
    [activeView],
  );

  const persistViewStatePatch = useCallback((patch: DocumentViewState) => {
    saveDocumentViewState(viewStateKey, patch);
  }, [viewStateKey]);

  const changeView = useCallback((view: "outline" | "mindmap") => {
    setActiveView(view);
    setSelectionActive(false);
    setMindMapTextSelection(null);
    persistViewStatePatch({ activeView: view });
  }, [persistViewStatePatch]);

  /**
   * The shortcuts that belong to the app rather than to a node — 搜索, 缩放, 切换视图,
   * 帮助 — claimed on the window in the capture phase, before either view sees the
   * press. They work with the focus anywhere, including inside a node being edited,
   * which is where the hands already are.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const id = resolveShortcut(event);
      if (!id || !isAppShortcut(id)) return;

      if (id === "find-in-document") {
        setSearchOpen(true);
        setSearchFocusSignal((signal) => signal + 1);
      } else if (id === "zoom-in") {
        const target = zoomInTargetId(store.getSnapshot(), selectedNodeId);
        if (!target) return;
        setZoomedNodeId(target);
      } else if (id === "zoom-out") {
        // Already at the top: the press has nothing to do, so it stays the
        // browser's own — nothing is swallowed that was not answered.
        if (!zoomedNodeId) return;
        setZoomedNodeId(zoomOutTargetId(store.getSnapshot(), zoomedNodeId));
      } else if (id === "toggle-view") {
        changeView(activeView === "outline" ? "mindmap" : "outline");
      } else if (id === "shortcut-help") {
        setShortcutHelpOpen((open) => !open);
      }

      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeView, changeView, selectedNodeId, store, zoomedNodeId]);

  // A zoomed node that has since been deleted would leave both views showing
  // nothing, with no row left to press 返回上一级主题 on.
  useEffect(() => {
    if (zoomedNodeId && !tree.nodes[zoomedNodeId]) {
      setZoomedNodeId(null);
    }
  }, [tree, zoomedNodeId]);

  const focusBreadcrumbItems = useMemo<FocusBreadcrumbItem[]>(() => {
    if (!zoomedNodeId) return [];
    return zoomPath(tree, zoomedNodeId).slice(1).map((nodeId, index, path) => ({
      id: nodeId,
      label: richTextToPlainText(tree.nodes[nodeId]?.content ?? { text: "" }) || "未命名",
      current: index === path.length - 1,
    }));
  }, [tree, zoomedNodeId]);

  const navigateFocusBreadcrumb = useCallback(
    (nodeId: string | null) => {
      setZoomedNodeId(nodeId);
    },
    [],
  );

  useEffect(() => {
    if (!onFocusBreadcrumbChange) return undefined;
    onFocusBreadcrumbChange(
      zoomedNodeId
        ? { items: focusBreadcrumbItems, navigate: navigateFocusBreadcrumb }
        : null,
    );
    return () => onFocusBreadcrumbChange(null);
  }, [focusBreadcrumbItems, navigateFocusBreadcrumb, onFocusBreadcrumbChange, zoomedNodeId]);

  useEffect(() => {
    if (!toolbarMoreOpen && !collapseMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!toolbarMoreRef.current?.contains(target)) {
        setToolbarMoreOpen(false);
        setExportMenuOpen(false);
      }
      if (!collapseMenuRef.current?.contains(target)) setCollapseMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setToolbarMoreOpen(false);
        setCollapseMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [collapseMenuOpen, toolbarMoreOpen]);

  const updateMindMapViewport = useCallback((viewport: MindMapViewportState) => {
    mindMapViewportRef.current = viewport;
    persistViewStatePatch({ mindMapViewport: viewport });
  }, [persistViewStatePatch]);

  const updateOutlineScroll = useCallback((scrollTop: number) => {
    persistViewStatePatch({ outlineScrollTop: scrollTop });
  }, [persistViewStatePatch]);

  const toggleCollapse = (level: number | "all") => {
    const targets = Object.values(tree.nodes).filter((node) => {
      if (node.id === tree.rootId || node.children.length === 0) return false;
      return level === "all" || nodeDepth(tree, node.id) === level;
    });
    if (!targets.length) return;
    const collapsed = targets.some((node) => node.props?.collapsed !== true);
    store.updateNodes(targets.map((node) => ({ id: node.id, props: { collapsed } })));
    setCollapseMenuOpen(false);
  };

  const replaceCurrent = () => {
    if (!searchQuery.trim()) return;
    store.replaceTreeFromView(replaceSearchMatch(store.getSnapshot(), searchQuery, replaceText, "first"));
  };

  const replaceAll = () => {
    if (!searchQuery.trim()) return;
    store.replaceTreeFromView(replaceSearchMatch(store.getSnapshot(), searchQuery, replaceText, "all"));
  };

  const goToSearchMatch = (direction: -1 | 1) => {
    if (!matchedNodeIds.length) return;
    const nextIndex = (activeMatchIndex + direction + matchedNodeIds.length) % matchedNodeIds.length;
    const nodeId = matchedNodeIds[nextIndex]!;
    setActiveMatchIndex(nextIndex);
    setActiveSearchNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setSelectionActive(true);
    window.requestAnimationFrame(() => {
      const selector = activeView === "outline"
        ? `.outline-panel .bn-block-outer[data-id="${cssEscape(nodeId)}"]`
        : `.mindmap-canvas [data-node-id="${cssEscape(nodeId)}"]`;
      document.querySelector(selector)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    });
  };

  useEffect(() => {
    if (!focusNodeRequest || !tree.nodes[focusNodeRequest.nodeId]) return;
    if (handledFocusRequestIdRef.current === focusNodeRequest.requestId) return;
    handledFocusRequestIdRef.current = focusNodeRequest.requestId;
    const nodeId = focusNodeRequest.nodeId;
    setSearchOpen(false);
    setReplaceText("");
    setSearchQuery("");
    setSelectedNodeId(nodeId);
    setSelectionActive(true);
    if (searchResultHighlightTimerRef.current !== null) {
      window.clearTimeout(searchResultHighlightTimerRef.current);
      searchResultHighlightTimerRef.current = null;
    }
    if (activeView === "mindmap") {
      setActiveSearchNodeId(null);
      setMindMapFocusNodeRequest({ nodeId, requestId: focusNodeRequest.requestId });
      return;
    }
    setActiveSearchNodeId(nodeId);
    searchResultHighlightTimerRef.current = window.setTimeout(() => {
      setActiveSearchNodeId((current) => current === nodeId ? null : current);
      searchResultHighlightTimerRef.current = null;
    }, 1500);
    window.requestAnimationFrame(() => {
      document
        .querySelector(`.outline-panel .bn-block-outer[data-id="${cssEscape(nodeId)}"]`)
        ?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });
  }, [activeView, focusNodeRequest, tree.nodes]);

  useEffect(() => () => {
    if (searchResultHighlightTimerRef.current !== null) {
      window.clearTimeout(searchResultHighlightTimerRef.current);
    }
  }, []);

  const exportMarkdown = () => {
    downloadBlob(new Blob([treeToMarkdown(tree)], { type: "text/markdown;charset=utf-8" }), markdownFileName(tree));
  };

  const withExportView = async <T,>(view: "outline" | "mindmap", task: () => Promise<T>) => {
    const previous = activeView;
    if (previous !== view) {
      await preloadEditorView(view);
      setActiveView(view);
      await waitForExportView(view, mindMapExportImageRef);
    }
    try {
      return await task();
    } finally {
      if (previous !== view) setActiveView(previous);
    }
  };

  const exportOutlineImage = async (pdf = false) => {
    const image = await withExportView("outline", captureOutlinePng);
    downloadBlob(pdf ? await imageBlobToPdf(image, "outline") : image.blob, outlineExportFileName(tree, pdf ? "大纲.pdf" : "大纲.png"));
  };

  const exportMindMapImage = async (pdf = false) => {
    const image = await withExportView("mindmap", async () => {
      const exporter = mindMapExportImageRef.current;
      if (!exporter) throw new Error("思维导图尚未准备好。");
      const captured = await exporter();
      if (!captured) throw new Error("思维导图图片生成失败。");
      return captured;
    });
    downloadBlob(pdf ? await imageBlobToPdf(image, "mindmap") : image.blob, outlineExportFileName(tree, pdf ? "思维导图.pdf" : "思维导图.png"));
  };

  const exportOutlineDocument = async (word: boolean) => {
    const html = await treeToOutlineHtmlDocument(tree, word);
    downloadBlob(
      new Blob(["\ufeff", html], { type: word ? "application/msword;charset=utf-8" : "text/html;charset=utf-8" }),
      outlineExportFileName(tree, word ? "大纲.doc" : "大纲.html"),
    );
  };

  const runExport = (task: () => Promise<void>) => {
    setToolbarMoreOpen(false);
    setExportMenuOpen(false);
    void task().catch((error) => setExportError(error instanceof Error ? error.message : "导出失败，请重试。"));
  };

  const importMarkdown = async (file: File) => {
    const markdown = await file.text();
    // The file name stands in for the title when the document has no `# ` line.
    setPendingImport({ fallbackTitle: markdownImportTitle(file.name), fileName: file.name, markdown });
  };

  const confirmImportMarkdown = () => {
    if (!pendingImport) return;
    store.replaceTreeFromView(markdownToTree(pendingImport.markdown, {
      fallbackTitle: pendingImport.fallbackTitle,
    }));
    setSelectedNodeId(null);
    setSelectionActive(false);
    setMindMapTextSelection(null);
    setPendingImport(null);
  };

  const editorToolbar = (
    <div className="toolbar editor-navigation-toolbar">
      <button
        className="view-toggle-button"
        type="button"
        aria-label={activeView === "outline" ? "切换到思维导图" : "切换到大纲笔记"}
        title={activeView === "outline" ? "切换到思维导图" : "切换到大纲笔记"}
          onClick={() => {
            changeView(activeView === "outline" ? "mindmap" : "outline");
            setToolbarMoreOpen(false);
            setExportMenuOpen(false);
        }}
      >
        {activeView === "outline" ? <FiGitBranch /> : <FiList />}
        <span>{activeView === "outline" ? "思维导图" : "大纲笔记"}</span>
      </button>
      <div className="toolbar-more-wrap" ref={collapseMenuRef}>
        <button
          className="toolbar-icon-button toolbar-more-button"
          type="button"
          aria-label="展开/折叠主题"
          title="展开/折叠主题"
          aria-expanded={collapseMenuOpen}
          onClick={() => {
            setCollapseMenuOpen((open) => !open);
            setToolbarMoreOpen(false);
          }}
        >
          <ExpandCollapseIcon />
        </button>
        {collapseMenuOpen ? (
          <div className="toolbar-more-menu collapse-menu" role="menu">
            <div className="toolbar-menu-title">展开/折叠主题</div>
            <button type="button" role="menuitem" onClick={() => toggleCollapse("all")}>
              <span>全部主题</span>
              <kbd>Ctrl+Alt+Shift+.</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => toggleCollapse(1)}>
              <span>1 级主题</span>
              <kbd>Ctrl+Alt+1</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => toggleCollapse(2)}>
              <span>2 级主题</span>
              <kbd>Ctrl+Alt+2</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => toggleCollapse(3)}>
              <span>3 级主题</span>
              <kbd>Ctrl+Alt+3</kbd>
            </button>
          </div>
        ) : null}
      </div>
      <button
        className="toolbar-icon-button toolbar-more-button"
        type="button"
        aria-label="查找替换"
        title="查找替换"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen((open) => !open)}
      >
        <FiSearch />
      </button>
      {onShare ? <button className="toolbar-icon-button toolbar-more-button" type="button" aria-label="分享" title="分享" onClick={onShare}><FiShare2 /></button> : null}
      <div className="toolbar-more-wrap" ref={toolbarMoreRef}>
        <button
          className="toolbar-icon-button toolbar-more-button"
          type="button"
          aria-label="更多"
          title="更多"
          aria-expanded={toolbarMoreOpen}
          onClick={() => {
            setToolbarMoreOpen((open) => !open);
            setExportMenuOpen(false);
          }}
        >
          <FiMoreHorizontal />
        </button>
        {toolbarMoreOpen ? (
          <div className="toolbar-more-menu" role="menu">
            {!readOnly ? <button type="button" role="menuitem" onClick={() => {
              setToolbarMoreOpen(false);
              setExportMenuOpen(false);
              importInputRef.current?.click();
            }}>
              <FiUpload />
              <span>导入</span>
            </button> : null}
            <div className="toolbar-submenu-wrap">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                onClick={() => {
                  // 打开导出子菜单就是最早的明确意图：这时候把编码器要过来，等真的点了
                  // "大纲图片"，模块通常已经在手里。
                  if (!exportMenuOpen) preloadImageExporter();
                  setExportMenuOpen((open) => !open);
                }}
              >
                <FiDownload />
                <span>导出</span>
                <FiChevronRight className="toolbar-submenu-chevron" />
              </button>
              {exportMenuOpen ? (
                <div className="toolbar-more-menu toolbar-submenu" role="menu">
                  <button type="button" role="menuitem" onClick={() => {
                    setToolbarMoreOpen(false);
                    setExportMenuOpen(false);
                    exportMarkdown();
                  }}>
                    <FiDownload /><span>导出 Markdown</span>
                  </button>
                  {activeView === "outline" ? <>
                    <button type="button" role="menuitem" onClick={() => runExport(() => exportOutlineImage())}>
                      <FiImage /><span>大纲图片</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => runExport(() => exportOutlineImage(true))}>
                      <FiFileText /><span>大纲 PDF</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => runExport(() => exportOutlineDocument(true))}>
                      <FiFileText /><span>大纲 Word</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => runExport(() => exportOutlineDocument(false))}>
                      <FiFileText /><span>大纲 HTML</span>
                    </button>
                  </> : <>
                    <button type="button" role="menuitem" onClick={() => runExport(() => exportMindMapImage())}>
                      <FiImage /><span>思维导图图片</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => runExport(() => exportMindMapImage(true))}>
                      <FiFileText /><span>思维导图 PDF</span>
                    </button>
                  </>}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown"
        multiple={Boolean(onImportDocuments)}
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!files.length) return;
          // 单个文件仍然是"导入到当前文档"，多选则整批变成新文档，免得后面的内容互相覆盖。
          if (files.length > 1 && onImportDocuments) onImportDocuments(files);
          else void importMarkdown(files[0]);
        }}
      />
    </div>
  );
  return (
    <main className={`app-shell ${embedded ? "is-embedded" : ""}`}>
      {!embedded ? <header className="topbar">
        <div className="product-heading">
          <h1>枝间 V2</h1>
          <p>ZhiJianTree 驱动的大纲与思维导图编辑器</p>
        </div>
        {editorToolbar}
      </header> : toolbarTarget ? createPortal(editorToolbar, toolbarTarget) : null}
      <div className="workspace">
        <section
          className={`pane editor-view ${activeView === "outline" ? "is-active" : "is-inactive"}`}
          aria-hidden={activeView !== "outline"}
        >
          <div className="pane-title">大纲</div>
          <Suspense fallback={null}>
            <OutlineEditor
              readOnly={readOnly}
              store={store}
              onSelectNode={handleOutlineSelect}
              mindMapNodeId={activeView === "mindmap" ? selectedNodeId : null}
              mindMapTextSelection={mindMapTextSelection}
              mindMapToolbarTarget={mindMapToolbarTarget}
              showMindMapToolbar={
                !readOnly &&
                activeView === "mindmap" &&
                selectionActive &&
                Boolean(selectedNode) &&
                !isMindMapMediaSelected &&
                !mindMapNodeToolbarActive
              }
              searchQuery={searchQuery}
              visibleNodeIds={visibleSearchNodeIds}
              activeSearchNodeId={activeSearchNodeId}
              zoomedNodeId={zoomedNodeId}
              initialScrollTop={initialViewState?.outlineScrollTop}
              onScrollPositionChange={updateOutlineScroll}
              onFocusNode={(nodeId) => {
                if (nodeId !== tree.rootId) {
                  setZoomedNodeId(nodeId);
                }
              }}
              onMindMapInsertQuote={(nodeId, focusBlockId) => {
                setSelectedNodeId(nodeId);
                setSelectionActive(true);
                setMindMapFocusRequest((current) => ({
                  nodeId,
                  focusBlockId,
                  requestId: (current?.requestId ?? 0) + 1,
                }));
              }}
            />
          </Suspense>
        </section>
        <section
          className={`pane editor-view ${activeView === "mindmap" ? "is-active" : "is-inactive"}`}
          aria-hidden={activeView !== "mindmap"}
        >
          <div className="pane-title">思维导图</div>
          <div className="mindmap-pane-body">
            {activeView === "mindmap" ? (
              <Suspense fallback={null}>
                <MindMapEditor
                  readOnly={readOnly}
                  store={store}
                  onSelectNode={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    setMindMapTextSelection(null);
                  }}
                  onSelectionActiveChange={setSelectionActive}
                  onTextSelectionChange={setMindMapTextSelection}
                  onNodeToolbarActiveChange={setMindMapNodeToolbarActive}
                  onFocusNode={(nodeId) => {
                    if (nodeId !== tree.rootId) {
                      setZoomedNodeId(nodeId);
                    }
                  }}
                  onExitFocus={() => setZoomedNodeId(null)}
                  selectedNodeId={selectedNodeId}
                  toolbarTarget={mindMapToolbarTarget}
                  focusRequest={mindMapFocusRequest}
                  focusNodeRequest={mindMapFocusNodeRequest}
                  searchQuery={searchQuery}
                  visibleNodeIds={visibleSearchNodeIds}
                  zoomedNodeId={zoomedNodeId}
                  initialViewport={mindMapViewportRef.current}
                  onViewportChange={updateMindMapViewport}
                  initialDirection={initialViewState?.mindMapDirection}
                  onDirectionChange={(mindMapDirection) => persistViewStatePatch({ mindMapDirection })}
                  onExportImageReady={(exportImage) => {
                    mindMapExportImageRef.current = exportImage;
                  }}
                  mindMapDefaults={mindMapDefaults}
                  onMindMapDefaultsChange={onMindMapDefaultsChange}
                  onFocusRequestHandled={(requestId) => {
                    setMindMapFocusRequest((current) =>
                      current?.requestId === requestId ? null : current,
                    );
                  }}
                />
              </Suspense>
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
      {searchOpen ? (
        <SearchPanel
          allowReplace={!readOnly}
          query={searchQuery}
          replacement={replaceText}
          focusSignal={searchFocusSignal}
          onQueryChange={(query) => {
            setSearchQuery(query);
            setActiveSearchNodeId(null);
          }}
          onReplacementChange={setReplaceText}
          onClose={() => {
            setSearchQuery("");
            setReplaceText("");
            setActiveSearchNodeId(null);
            setSearchOpen(false);
          }}
          onPrevious={() => goToSearchMatch(-1)}
          onNext={() => goToSearchMatch(1)}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
        />
      ) : null}
      {shortcutHelpOpen ? <ShortcutHelpDialog onClose={() => setShortcutHelpOpen(false)} /> : null}
      {pendingImport ? (
        <div
          className="zhijian-dialog-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setPendingImport(null)}
        >
          <section className="zhijian-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="import-confirm-title">
            <h2 id="import-confirm-title">导入</h2>
            <p>导入「{pendingImport.fileName}」会替换当前文档的全部内容，可用撤销恢复。</p>
            <footer>
              <button type="button" onClick={() => setPendingImport(null)}>取消</button>
              <button type="button" className="primary" onClick={confirmImportMarkdown}>确认导入</button>
            </footer>
          </section>
        </div>
      ) : null}
      {exportError ? (
        <div className="zhijian-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setExportError(null)}>
          <section className="zhijian-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="export-error-title">
            <h2 id="export-error-title">导出失败</h2>
            <p>{exportError}</p>
            <footer><button type="button" className="primary" onClick={() => setExportError(null)}>知道了</button></footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

async function waitForExportView(
  view: "outline" | "mindmap",
  mindMapExportImageRef: { current: (() => Promise<CapturedImage | null>) | null },
) {
  for (let frame = 0; frame < 120; frame += 1) {
    const ready = view === "outline"
      ? Boolean(document.querySelector(".editor-view.is-active .outline-panel .bn-container"))
      : Boolean(mindMapExportImageRef.current);
    if (ready) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      return;
    }
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  throw new Error(view === "outline" ? "大纲视图尚未准备好。" : "思维导图尚未准备好。");
}

function nodeDepth(tree: ReturnType<TreeStore["getSnapshot"]>, nodeId: string) {
  let depth = 0;
  let current = tree.nodes[nodeId];
  while (current?.parentId) {
    depth += 1;
    current = tree.nodes[current.parentId];
  }
  return depth;
}

function cssEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function loadDocumentViewState(key: string): DocumentViewState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const value = parsed as DocumentViewState;
    return {
      activeView: value.activeView === "outline" || value.activeView === "mindmap" ? value.activeView : undefined,
      outlineScrollTop: typeof value.outlineScrollTop === "number" ? value.outlineScrollTop : undefined,
      mindMapViewport: isMindMapViewportState(value.mindMapViewport) ? value.mindMapViewport : undefined,
      mindMapDirection: value.mindMapDirection === 0 || value.mindMapDirection === 1 || value.mindMapDirection === 2 ? value.mindMapDirection : undefined,
    };
  } catch {
    return {};
  }
}

function saveDocumentViewState(key: string, patch: DocumentViewState) {
  if (typeof window === "undefined") return;
  const current = loadDocumentViewState(key);
  window.localStorage.setItem(key, JSON.stringify({ ...current, ...patch }));
}

function isMindMapViewportState(value: unknown): value is MindMapViewportState {
  if (!value || typeof value !== "object") return false;
  const viewport = value as Record<string, unknown>;
  return typeof viewport.x === "number" &&
    typeof viewport.y === "number" &&
    typeof viewport.scale === "number";
}

function ExpandCollapseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L12 10L14 12" stroke="#535353" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 4L12 6L14 4" stroke="#535353" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 8H7.33333" stroke="#535353" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12H7.33333" stroke="#535353" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 4H7.33333" stroke="#535353" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchPanel({ query, replacement, focusSignal, onQueryChange, onReplacementChange, onClose, onPrevious, onNext, onReplace, onReplaceAll, allowReplace = true }: {
  query: string;
  replacement: string;
  /** Bumped by every 文档内搜索 (Ctrl F), including one pressed while this is open. */
  focusSignal: number;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  allowReplace?: boolean;
}) {
  const [replaceOpen, setReplaceOpen] = useState(false);
  const queryRef = useRef<HTMLInputElement>(null);

  // Pressing the keys again means "search for something else", so the term that is
  // there is selected rather than appended to.
  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, [focusSignal]);

  return (
    <section className={`search-replace-panel ${replaceOpen ? "is-replace-open" : ""}`} role="dialog" aria-label="查找替换">
      <div className="search-row">
        {allowReplace ? <button
          type="button"
          className="search-mode-button"
          aria-expanded={replaceOpen}
          onClick={() => setReplaceOpen((open) => !open)}
        >
          查找 <FiChevronDown />
        </button> : <span className="search-mode-button">查找</span>}
        <input ref={queryRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索关键词" />
        {/* A shared document has no replace row to hang these off, and stepping through the
            matches is most of what searching is for, so they sit in the row itself. */}
        {allowReplace ? null : <>
          <button type="button" className="search-step icon-button" aria-label="上一处" title="上一处" onClick={onPrevious}>‹</button>
          <button type="button" className="search-step icon-button" aria-label="下一处" title="下一处" onClick={onNext}>›</button>
        </>}
        <button type="button" className="search-close icon-button" aria-label="关闭查找" onClick={onClose}>×</button>
      </div>
      {allowReplace && replaceOpen ? (
        <>
          <div className="search-row">
            <button type="button" className="search-mode-button">替换为</button>
            <input value={replacement} onChange={(event) => onReplacementChange(event.target.value)} placeholder="替换文字" />
          </div>
          <div className="search-actions">
            <button type="button" onClick={onPrevious}>上一处</button>
            <button type="button" onClick={onNext}>下一处</button>
            <button type="button" className="primary" onClick={onReplace}>替换</button>
            <button type="button" className="primary" onClick={onReplaceAll}>全部替换</button>
          </div>
        </>
      ) : null}
    </section>
  );
}
