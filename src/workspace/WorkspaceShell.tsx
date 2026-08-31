import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  FiCamera,
  FiChevronDown,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiClock,
  FiCopy,
  FiEdit2,
  FiExternalLink,
  FiFilePlus,
  FiFileText,
  FiFolder,
  FiFolderPlus,
  FiLink,
  FiLogOut,
  FiMenu,
  FiMoreHorizontal,
  FiMove,
  FiPlus,
  FiSearch,
  FiSettings,
  FiSliders,
  FiStar,
  FiTrash2,
  FiRotateCcw,
  FiUpload,
  FiX,
} from "react-icons/fi";
import { FaStar } from "react-icons/fa";
import App, { type FocusBreadcrumbState } from "../App";
import { richTextToPlainText, type ZhiJianMindMapDefaults, type ZhiJianNode, type ZhiJianTree } from "../core/tree";
import { markdownImportTitle, markdownToTree } from "../core/markdown/markdownDocument";
import { TreeStore } from "../core/treeStore";
import type { WorkspaceSession } from "./auth";
import {
  loadWorkspaceState,
  loadDocumentShare,
  deleteWorkspaceDocument,
  saveWorkspaceDocument,
  saveWorkspaceState,
  updateWorkspaceAccount,
  updateDocumentShare,
  uploadWorkspaceImage,
  type WorkspaceDocumentShare,
  type WorkspacePreferences,
  type WorkspaceServerState,
  WorkspaceApiError,
} from "./serverApi";
import { configureImageAssetUpload, hydrateRemoteImageAssets, rehydrateImageAssets } from "../shared/imageAssetStore";
import { compressAvatarFile } from "./avatarImage";
import { workspaceNodeMenuPosition } from "./workspaceNodeMenuPosition";
import { AppErrorBoundary } from "../shared/AppErrorBoundary";
import {
  childNodes,
  applyMindMapDefaults,
  canMoveNode,
  createWorkspaceDocument,
  createWorkspaceNode,
  duplicateWorkspaceNode,
  folderPath,
  isWorkspaceFile,
  markFileOpened,
  mergeMindMapDefaults,
  moveWorkspaceNode,
  placeWorkspaceNode,
  renameWorkspaceNode,
  restoreWorkspaceTrashEntry,
  trashWorkspaceNode,
  type DropMode,
  type WorkspaceFile,
  type WorkspaceFolder,
  type WorkspaceNode,
  type WorkspaceTrashEntry,
} from "./workspaceData";

interface WorkspaceShellProps {
  session: WorkspaceSession;
  onSessionRefresh: (session: WorkspaceSession) => void;
  onLogout: () => void;
}

/** 工作区行里由这个组件负责的三个字段，文档和图片各有自己的存储路径。 */
type WorkspaceStateSnapshot = Pick<WorkspaceServerState, "profile" | "preferences" | "nodes" | "trash">;

type QuickSection = "recent" | "favorites";
type DropTarget = { nodeId: string; mode: DropMode } | null;
type SettingsView = "account" | "preferences";
type SettingsEdit = "email" | "password" | null;
type WorkspaceSearchMatch = { nodeId: string; text: string; path: string };
type WorkspaceSearchResult =
  | { type: "folder"; folder: WorkspaceFolder; path: string }
  | { type: "file"; file: WorkspaceFile; path: string; titleMatch: boolean; matches: WorkspaceSearchMatch[] };

const RECENT_SEARCHES_KEY = "zhijian.workspace.recent-searches.v1";
const LAST_OPEN_FILE_KEY = "zhijian.workspace.last-open-file.v1";

interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
}

export function WorkspaceShell({ session, onSessionRefresh, onLogout }: WorkspaceShellProps) {
  const [userProfile, setUserProfile] = useState<UserProfile>(() => profileFromSession(session));
  const [profileDraft, setProfileDraft] = useState<UserProfile>(() => profileFromSession(session));
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>({});
  const [newPassword, setNewPassword] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareState, setShareState] = useState<WorkspaceDocumentShare>({ enabled: false });
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareQrCode, setShareQrCode] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>("account");
  const [settingsEdit, setSettingsEdit] = useState<SettingsEdit>(null);
  const [headerToolbarTarget, setHeaderToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [focusBreadcrumbState, setFocusBreadcrumbState] = useState<FocusBreadcrumbState | null>(null);
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [trash, setTrash] = useState<WorkspaceTrashEntry[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState(() => new Set<string>());
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [activeFileId, setActiveFileId] = useState("");
  const [selectedMenuKey, setSelectedMenuKey] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set<string>());
  const [search, setSearch] = useState("");
  const [searchFilterOpen, setSearchFilterOpen] = useState(false);
  const [searchFolderQuery, setSearchFolderQuery] = useState("");
  const [selectedSearchFolderIds, setSelectedSearchFolderIds] = useState(() => new Set<string>());
  const [expandedSearchFileIds, setExpandedSearchFileIds] = useState(() => new Set<string>());
  const [searchMode, setSearchMode] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => loadRecentSearches());
  const [documentFocusRequest, setDocumentFocusRequest] = useState<{
    fileId: string;
    nodeId: string;
    query: string;
    requestId: number;
  } | null>(null);
  const [expandedQuickSections, setExpandedQuickSections] = useState(() => new Set<QuickSection>());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(252);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceNode | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const selectCreatedNameOnFocus = useRef(false);
  const peekCloseTimer = useRef<number | null>(null);
  const documentStores = useRef(new Map<string, TreeStore>());
  const documentRevisions = useRef(new Map<string, number>());
  const documentSaveQueues = useRef(new Map<string, Promise<void>>());
  const workspaceSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingWorkspaceState = useRef<WorkspaceStateSnapshot | null>(null);
  const sessionRef = useRef(session);
  const [serverReady, setServerReady] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [serverStatus, setServerStatus] = useState("");

  sessionRef.current = session;
  const handleSessionRefresh = useCallback((nextSession: WorkspaceSession) => {
    const currentSession = sessionRef.current;
    if (
      currentSession.accessToken === nextSession.accessToken &&
      currentSession.refreshToken === nextSession.refreshToken &&
      currentSession.expiresAt === nextSession.expiresAt
    ) return;
    sessionRef.current = nextSession;
    onSessionRefresh(nextSession);
  }, [onSessionRefresh]);

  const persistDocument = useCallback((fileId: string, tree: ZhiJianTree) => {
    const previous = documentSaveQueues.current.get(fileId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(async () => {
      const revision = documentRevisions.current.get(fileId) ?? 0;
      const result = await saveWorkspaceDocument(sessionRef.current, fileId, tree, revision, { onSessionRefresh: handleSessionRefresh });
      if (Number.isInteger(result.revision)) documentRevisions.current.set(fileId, result.revision);
    }).catch((error) => {
      setServerStatus(`文档保存到服务器失败：${errorMessage(error)}`);
    }).finally(() => {
      if (documentSaveQueues.current.get(fileId) === queued) documentSaveQueues.current.delete(fileId);
    });
    documentSaveQueues.current.set(fileId, queued);
    return queued;
  }, [handleSessionRefresh]);

  /**
   * 资料、导航树和回收站共用一行，所以两个并发的 PUT 会互相覆盖，而且返回顺序无法保证——
   * 慢的那个后到就会把新状态写回旧值。这里排成单队列，并且只保留最后一次快照：中途积压的
   * 中间状态没有意义，最终写入的一定是最新的那份。
   */
  const persistWorkspaceState = useCallback((snapshot: WorkspaceStateSnapshot) => {
    pendingWorkspaceState.current = snapshot;
    const queued = workspaceSaveQueue.current.catch(() => undefined).then(async () => {
      const pending = pendingWorkspaceState.current;
      if (!pending) return;
      pendingWorkspaceState.current = null;
      await saveWorkspaceState(sessionRef.current, pending, { onSessionRefresh: handleSessionRefresh });
    }).catch((error) => {
      setServerStatus(`工作区保存到服务器失败：${errorMessage(error)}`);
    });
    workspaceSaveQueue.current = queued;
    return queued;
  }, [handleSessionRefresh]);

  useEffect(() => {
    configureImageAssetUpload((file) => uploadWorkspaceImage(sessionRef.current, file, { onSessionRefresh: handleSessionRefresh }));
    return () => configureImageAssetUpload(null);
  }, [handleSessionRefresh]);

  const files = useMemo(() => nodes.filter(isWorkspaceFile), [nodes]);
  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0];
  const breadcrumbs = activeFile ? folderPath(nodes, activeFile.id) : [];
  const focusBreadcrumbItems = focusBreadcrumbState?.items ?? [];
  const focusedTitle = focusBreadcrumbItems.at(-1)?.label ?? null;
  const focusAncestorItems = focusedTitle ? focusBreadcrumbItems.slice(0, -1) : [];
  const activeDocumentStore = activeFile
    ? getDocumentStore(documentStores.current, activeFile, workspacePreferences.mindMapDefaults)
    : null;
  const sidebarDisplayWidth = searchMode ? Math.max(sidebarWidth, 448) : sidebarWidth;

  useEffect(() => {
    document.title = `${activeFile?.title || "无标题"}-枝间`;
  }, [activeFile?.title]);

  const enterSearchMode = useCallback(() => {
    setSearchMode(true);
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      setSidebarPeeking(false);
    }
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [sidebarCollapsed]);

  const closeSearchMode = useCallback(() => {
    rememberSearch(search, setRecentSearches);
    setSearch("");
    setSearchFilterOpen(false);
    setSearchMode(false);
  }, [search]);

  useEffect(() => {
    let canceled = false;
    const loadingSession = sessionRef.current;
    setServerReady(false);
    setServerAvailable(false);
    setServerStatus("");
    void loadWorkspaceState(loadingSession, { onSessionRefresh: handleSessionRefresh })
      .then((state) => {
        if (canceled) return;
        const nextProfile = normalizeUserProfile(state?.profile, sessionRef.current);
        const nextNodes = state?.nodes ?? [];
        documentStores.current = new Map(
          Object.entries(state?.documents ?? {}).map(([fileId, tree]) => [fileId, new TreeStore(tree)]),
        );
        documentRevisions.current = new Map(Object.entries(state?.documentRevisions ?? {}));
        hydrateRemoteImageAssets(state?.assets);
        void rehydrateImageAssets();
        setUserProfile(nextProfile);
        setProfileDraft(nextProfile);
        setWorkspacePreferences(state?.preferences ?? {});
        setNodes(nextNodes);
        setTrash(state?.trash ?? []);
        const firstFile = nextNodes.find(isWorkspaceFile);
        const rememberedFileId = loadLastOpenFileId(sessionRef.current.userId);
        const restoredFile = nextNodes.find((node) => node.id === rememberedFileId && node.type === "file");
        const nextActiveFileId = restoredFile?.id ?? firstFile?.id ?? "";
        setActiveFileId(nextActiveFileId);
        setSelectedMenuKey(nextActiveFileId ? `tree:${nextActiveFileId}` : "");
        setExpandedFolders(new Set(nextNodes.filter((node) => node.type === "folder").map((node) => node.id)));
        setServerStatus("");
        setServerAvailable(true);
        setServerReady(true);
      })
      .catch((error) => {
        if (canceled) return;
        if (error instanceof WorkspaceApiError && error.status === 401) {
          onLogout();
          return;
        }
        setNodes([]);
        setTrash([]);
        setActiveFileId("");
        setSelectedMenuKey("");
        documentStores.current = new Map();
        setServerAvailable(false);
        setServerStatus(`服务器数据读取失败：${errorMessage(error)}`);
        setServerReady(true);
      });
    return () => {
      canceled = true;
    };
  }, [handleSessionRefresh, onLogout, session.userId]);

  useEffect(() => {
    if (!serverReady || !activeFileId) return;
    saveLastOpenFileId(session.userId, activeFileId);
  }, [activeFileId, serverReady, session.userId]);

  useEffect(() => {
    if (!serverReady || !serverAvailable || !activeFile || !activeDocumentStore) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = activeDocumentStore.subscribe((tree) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void persistDocument(activeFile.id, tree);
      }, 400);
    });
    return () => {
      if (timer) {
        clearTimeout(timer);
        void persistDocument(activeFile.id, activeDocumentStore.getSnapshot());
      }
      unsubscribe();
    };
  }, [activeDocumentStore, activeFile, persistDocument, serverAvailable, serverReady]);

  useEffect(() => {
    if (!serverReady || !serverAvailable) return;
    const timer = setTimeout(() => {
      void persistWorkspaceState({ profile: userProfile, preferences: workspacePreferences, nodes, trash });
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, persistWorkspaceState, serverAvailable, serverReady, trash, userProfile, workspacePreferences]);

  const updateMindMapDefaults = useCallback((patch: ZhiJianMindMapDefaults) => {
    setWorkspacePreferences((current) => ({
      ...current,
      mindMapDefaults: mergeMindMapDefaults(current.mindMapDefaults, patch),
    }));
  }, []);

  useEffect(() => {
    if (!activeFile || !activeDocumentStore) return;
    const syncTitle = (tree: ZhiJianTree) => {
      const title = tree.nodes[tree.rootId]?.content.text ?? "";
      setNodes((current) => current.map((node) =>
        node.id === activeFile.id && node.type === "file" && node.title !== title
          ? { ...node, title }
          : node,
      ));
    };
    syncTitle(activeDocumentStore.getSnapshot());
    const unsubscribe = activeDocumentStore.subscribe(syncTitle);
    return () => {
      unsubscribe();
    };
  }, [activeDocumentStore, activeFile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 全局搜索. Ctrl+Shift+F rather than Ctrl+K, which belongs to 嵌入链接 inside a
      // document; plain Ctrl+F is the search within the open document.
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "KeyF") {
        event.preventDefault();
        enterSearchMode();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setCreateMenuOpen(true);
      }
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setAccountOpen(false);
        setCreateMenuOpen(false);
        setMenuNodeId(null);
        setMoveMenuOpen(false);
        setSidebarOpen(false);
        setRenamingId(null);
        setSearchFilterOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterSearchMode]);

  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".account-wrap")) setAccountOpen(false);
      if (!target.closest(".create-wrap")) setCreateMenuOpen(false);
      if (!target.closest(".sidebar-search-wrap")) setSearchFilterOpen(false);
      if (
        searchMode
        && !target.closest(".sidebar-search-wrap")
        && !target.closest(".global-search-results")
        && !target.closest(".recent-search-panel")
        && !target.closest(".workspace-search-filter-popover")
      ) {
        closeSearchMode();
      }
      if (!target.closest(".node-menu") && !target.closest(".move-popover") && !target.closest(".tree-row-actions")) {
        setMenuNodeId(null);
        setMoveMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [closeSearchMode, searchMode]);

  const openSettings = (view: SettingsView = "account") => {
    setProfileDraft(userProfile);
    setNewPassword("");
    setSettingsEdit(null);
    setSettingsView(view);
    setSettingsOpen(true);
    setAccountOpen(false);
  };

  const shareUrl = shareState.enabled && shareState.token
    ? `${window.location.origin}/share.html?token=${encodeURIComponent(shareState.token)}`
    : "";

  const openShare = async () => {
    if (!activeFile) return;
    setShareOpen(true);
    setShareLoading(true);
    setShareError("");
    setShareCopied(false);
    try {
      setShareState(await loadDocumentShare(sessionRef.current, activeFile.id, { onSessionRefresh: handleSessionRefresh }));
    } catch (error) {
      setShareError(errorMessage(error));
    } finally {
      setShareLoading(false);
    }
  };

  useEffect(() => {
    if (!shareUrl) {
      setShareQrCode("");
      return;
    }
    let canceled = false;
    // qrcode 只在打开分享面板时用得上，静态引入会把它算进工作区首屏的包里。
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(shareUrl, { width: 196, margin: 1, color: { dark: "#37352f", light: "#ffffff" } }))
      .then((dataUrl) => { if (!canceled) setShareQrCode(dataUrl); })
      .catch(() => { if (!canceled) setShareQrCode(""); });
    return () => { canceled = true; };
  }, [shareUrl]);

  const toggleShare = async (enabled: boolean) => {
    if (!activeFile) return;
    setShareLoading(true);
    setShareError("");
    setShareCopied(false);
    try {
      setShareState(await updateDocumentShare(sessionRef.current, activeFile.id, enabled, { onSessionRefresh: handleSessionRefresh }));
    } catch (error) {
      setShareError(errorMessage(error));
    } finally {
      setShareLoading(false);
    }
  };

  useEffect(() => {
    if (!shareCopied) return;
    const timer = window.setTimeout(() => setShareCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setShareError("");
    } catch {
      setShareCopied(false);
      setShareError("复制失败，请手动复制链接。");
    }
  };

  const updateAvatar = (file?: File) => {
    if (!file) return;
    void compressAvatarFile(file)
      .then((avatarUrl) => setProfileDraft((current) => ({ ...current, avatarUrl })))
      .catch((error) => setServerStatus(errorMessage(error)));
  };

  const saveAccountSettings = async () => {
    try {
      const nextName = profileDraft.name.trim();
      const nextEmail = profileDraft.email.trim().toLowerCase();
      const authUpdate = {
        ...(nextName !== sessionRef.current.name ? { name: nextName } : {}),
        ...(nextEmail !== sessionRef.current.email ? { email: nextEmail } : {}),
        ...(newPassword ? { password: newPassword } : {}),
      };
      if (Object.keys(authUpdate).length) {
        const result = await updateWorkspaceAccount(sessionRef.current, authUpdate, { onSessionRefresh: handleSessionRefresh });
        const nextSession = {
          ...sessionRef.current,
          name: result.user.user_metadata?.name?.trim() || nextName || sessionRef.current.name,
          email: result.user.email?.trim().toLowerCase() || sessionRef.current.email,
        };
        sessionRef.current = nextSession;
        onSessionRefresh(nextSession);
        setProfileDraft((current) => ({ ...current, name: nextSession.name, email: nextSession.email }));
      }
      setUserProfile((current) => ({ ...current, ...profileDraft, name: nextName, email: sessionRef.current.email }));
      setNewPassword("");
      setSettingsEdit(null);
      setSettingsOpen(false);
      setServerStatus("");
    } catch (error) {
      setServerStatus(`账号修改失败：${errorMessage(error)}`);
    }
  };

  const recentFiles = useMemo(() => [...files].sort((a, b) => b.openedAt - a.openedAt).slice(0, 6), [files]);
  const favoriteFiles = useMemo(() => files.filter((file) => file.favorite), [files]);
  const workspaceSearchResults = useMemo(
    () => searchWorkspace(nodes, documentStores.current, search, selectedSearchFolderIds),
    [nodes, search, selectedSearchFolderIds],
  );
  const filteredSearchFolders = useMemo(() => {
    const query = normalizeSearchText(searchFolderQuery);
    return nodes
      .filter((node): node is WorkspaceFolder => node.type === "folder")
      .filter((folder) => !query || folder.title.toLocaleLowerCase("zh-CN").includes(query))
      .sort((a, b) => folderPath(nodes, a.id).length - folderPath(nodes, b.id).length || a.order - b.order);
  }, [nodes, searchFolderQuery]);

  const selectFile = (file: WorkspaceFile, source = "tree") => {
    setActiveFileId(file.id);
    setSelectedMenuKey(`${source}:${file.id}`);
    setSelectedFolderId(null);
    setNodes((current) => markFileOpened(current, file.id));
    setSidebarOpen(false);
    setMenuNodeId(null);
  };

  const selectSearchMatch = (file: WorkspaceFile, nodeId: string) => {
    rememberSearch(search, setRecentSearches);
    selectFile(file, "search");
    setDocumentFocusRequest({
      fileId: file.id,
      nodeId,
      query: "",
      requestId: Date.now(),
    });
    closeSearchMode();
  };

  const createNode = (type: WorkspaceNode["type"], parentId?: string | null) => {
    const targetParent = parentId === undefined ? null : parentId;
    setNodes((current) => {
      const result = createWorkspaceNode(current, type, targetParent);
      if (!result.node) return current;
      if (result.node.parentId) {
        setExpandedFolders((expanded) => new Set(expanded).add(result.node!.parentId!));
      }
      if (result.node.type === "file") {
        documentStores.current.set(result.node.id, new TreeStore(createWorkspaceDocument(result.node.title, workspacePreferences.mindMapDefaults)));
        setActiveFileId(result.node.id);
        setSelectedMenuKey(`tree:${result.node.id}`);
        setSelectedFolderId(null);
      } else {
        setSelectedMenuKey(`tree:${result.node.id}`);
        setSelectedFolderId(result.node.id);
      }
      setRenamingId(result.node.id);
      setRenameValue(result.node.title);
      selectCreatedNameOnFocus.current = true;
      return result.nodes;
    });
    setCreateMenuOpen(false);
  };

  /**
   * 批量导入：每个文件各自成为一篇文档，放在当前文档所在的层级里。逐个 createWorkspaceNode
   * 会把新节点插到最前面，所以倒着建，最终顺序仍是用户在选择框里看到的顺序。
   * 新文档必须马上写一次服务器——自动保存只盯着打开着的那一篇，不然没点开过的导入内容
   * 刷新后就没了。
   */
  const importDocuments = async (files: File[]) => {
    setCreateMenuOpen(false);
    const parsed: Array<{ title: string; tree: ZhiJianTree }> = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        const fallbackTitle = markdownImportTitle(file.name);
        const tree = markdownToTree(await file.text(), { fallbackTitle });
        const root = tree.nodes[tree.rootId];
        const title = root ? richTextToPlainText(root.content).trim() : "";
        parsed.push({ title: title || fallbackTitle || "无标题", tree });
      } catch {
        failed.push(file.name);
      }
    }
    setServerStatus(failed.length ? `${failed.length} 个文件导入失败：${failed.join("、")}` : "");
    if (!parsed.length) return;

    const targetParent = activeFile?.parentId ?? null;
    let nextNodes = nodes;
    const created: Array<{ fileId: string; tree: ZhiJianTree }> = [];
    for (const document of [...parsed].reverse()) {
      const result = createWorkspaceNode(nextNodes, "file", targetParent);
      if (!result.node) continue;
      const fileId = result.node.id;
      nextNodes = result.nodes.map((node) => node.id === fileId ? { ...node, title: document.title } : node);
      created.unshift({ fileId, tree: applyMindMapDefaults(document.tree, workspacePreferences.mindMapDefaults) });
    }
    if (!created.length) return;

    created.forEach(({ fileId, tree }) => {
      documentStores.current.set(fileId, new TreeStore(tree));
      if (serverAvailable) void persistDocument(fileId, tree);
    });
    setNodes(nextNodes);
    if (targetParent) setExpandedFolders((expanded) => new Set(expanded).add(targetParent));
    setActiveFileId(created[0].fileId);
    setSelectedMenuKey(`tree:${created[0].fileId}`);
    setSelectedFolderId(null);
  };

  const toggleQuickSection = (section: QuickSection) => {
    setExpandedQuickSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  };

  const toggleFavorite = (fileId: string) => {
    setNodes((current) => current.map((node) => node.id === fileId && node.type === "file" ? { ...node, favorite: !node.favorite } : node));
    setMenuNodeId(null);
  };

  const beginRename = (node: WorkspaceNode) => {
    selectCreatedNameOnFocus.current = false;
    setRenamingId(node.id);
    setRenameValue(node.title);
    setMenuNodeId(null);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const renamedNode = nodes.find((node) => node.id === renamingId);
    if (renamedNode?.type === "file" && renameValue.trim()) {
      const documentStore = getDocumentStore(documentStores.current, renamedNode);
      documentStore.updateContent(documentStore.getSnapshot().rootId, renameValue.trim());
    }
    setNodes((current) => renameWorkspaceNode(current, renamingId, renameValue));
    setRenamingId(null);
    selectCreatedNameOnFocus.current = false;
  };

  const requestDeleteNode = (node: WorkspaceNode) => {
    setDeleteTarget(node);
    setMenuNodeId(null);
  };

  const confirmDeleteNode = () => {
    const node = deleteTarget;
    if (!node) return;
    const result = trashWorkspaceNode(nodes, node.id);
    const next = result.nodes;
    setNodes(next);
    if (result.entry) setTrash((current) => [result.entry!, ...current]);
    if (node.id === selectedFolderId) {
      setSelectedFolderId(null);
      setSelectedMenuKey(`tree:${activeFileId}`);
    }
    if (node.id === activeFileId || (node.type === "folder" && folderPath(nodes, activeFileId).some((folder) => folder.id === node.id))) {
      const nextFileId = next.find(isWorkspaceFile)?.id ?? "";
      setActiveFileId(nextFileId);
      setSelectedMenuKey(`tree:${nextFileId}`);
    }
    setMenuNodeId(null);
    setDeleteTarget(null);
  };

  const restoreTrashEntries = (entryIds: Set<string>) => {
    const entries = trash.filter((entry) => entryIds.has(entry.id));
    setNodes((current) => entries.reduce(restoreWorkspaceTrashEntry, current));
    setTrash((current) => current.filter((entry) => !entryIds.has(entry.id)));
    setSelectedTrashIds(new Set());
  };

  const permanentlyDeleteTrashEntries = async (entryIds: Set<string>) => {
    const files = trash
      .filter((entry) => entryIds.has(entry.id))
      .flatMap((entry) => entry.nodes)
      .filter(isWorkspaceFile);
    // Documents are their own rows now, so a purge has to reach the server; leaving them
    // behind would keep the text and its images stored after the user asked to be rid of them.
    // 服务端没删成功就什么都不动：回收站条目留着，用户可以看到错误并重试，否则文档会变成
    // 界面上找不到、服务器上却还在的孤儿。
    if (serverAvailable) {
      try {
        await Promise.all(files.map((file) => deleteWorkspaceDocument(sessionRef.current, file.id, { onSessionRefresh: handleSessionRefresh })));
      } catch (error) {
        setServerStatus(`服务器删除文档失败：${errorMessage(error)}`);
        return;
      }
    }
    files.forEach((file) => {
      documentStores.current.delete(file.id);
      documentRevisions.current.delete(file.id);
    });
    setServerStatus("");
    setTrash((current) => current.filter((entry) => !entryIds.has(entry.id)));
    setSelectedTrashIds(new Set());
  };

  const duplicateNode = (node: WorkspaceNode) => {
    const result = duplicateWorkspaceNode(nodes, node.id);
    setNodes(result.nodes);
    if (result.node?.type === "file") {
      if (node.type === "file") {
        const sourceStore = getDocumentStore(documentStores.current, node);
        documentStores.current.set(result.node.id, new TreeStore(sourceStore.getSnapshot()));
      }
      setActiveFileId(result.node.id);
      setSelectedMenuKey(`tree:${result.node.id}`);
    }
    setMenuNodeId(null);
  };

  const nodeUrl = (node: WorkspaceNode) => `${window.location.origin}/workspace.html?${node.type}=${encodeURIComponent(node.id)}`;

  const copyNodeLink = async (node: WorkspaceNode) => {
    await navigator.clipboard.writeText(nodeUrl(node));
    setMenuNodeId(null);
  };

  const resizeSidebar = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const onMove = (moveEvent: globalThis.PointerEvent) => setSidebarWidth(Math.min(420, Math.max(220, startWidth + moveEvent.clientX - startX)));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const showSidebarPeek = () => {
    if (peekCloseTimer.current !== null) window.clearTimeout(peekCloseTimer.current);
    setSidebarPeeking(true);
  };

  const scheduleSidebarPeekClose = () => {
    if (peekCloseTimer.current !== null) window.clearTimeout(peekCloseTimer.current);
    peekCloseTimer.current = window.setTimeout(() => setSidebarPeeking(false), 140);
  };

  const finishDrop = (event: DragEvent, target: DropTarget) => {
    event.preventDefault();
    if (draggedNodeId && target) {
      setNodes((current) => placeWorkspaceNode(current, draggedNodeId, target.nodeId, target.mode));
      if (target.mode === "inside") setExpandedFolders((expanded) => new Set(expanded).add(target.nodeId));
    }
    setDraggedNodeId(null);
    setDropTarget(null);
  };

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => childNodes(nodes, parentId).map((node) => {
    const expanded = node.type === "folder" && expandedFolders.has(node.id);
    const menuOpen = menuNodeId === node.id;
    const nodeDrop = dropTarget?.nodeId === node.id ? dropTarget.mode : null;
    const nodeLabel = node.title || "无标题";
    return (
      <div className="tree-branch" key={node.id}>
        <div
          className={`tree-node-row ${node.type} ${selectedMenuKey === `tree:${node.id}` ? "is-active" : ""} ${nodeDrop ? `drop-${nodeDrop}` : ""}`}
          style={{ "--tree-depth": depth } as CSSProperties}
          draggable={renamingId !== node.id}
          onDragStart={(event) => {
            setDraggedNodeId(node.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", node.id);
            const preview = document.createElement("div");
            preview.className = "tree-drag-preview";
            preview.textContent = nodeLabel;
            document.body.appendChild(preview);
            event.dataTransfer.setDragImage(preview, 0, 14);
            requestAnimationFrame(() => preview.remove());
          }}
          onDragEnd={() => { setDraggedNodeId(null); setDropTarget(null); }}
          onDragOver={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientY - rect.top) / rect.height;
            const mode: DropMode = node.type === "folder" && ratio >= 0.25 && ratio <= 0.75 ? "inside" : ratio < 0.5 ? "before" : "after";
            setDropTarget({ nodeId: node.id, mode });
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => finishDrop(event, { nodeId: node.id, mode: nodeDrop ?? "after" })}
        >
          {node.type === "folder" ? (
            <button className="tree-leading icon-button" type="button" onClick={() => { setSelectedFolderId(node.id); setSelectedMenuKey(`tree:${node.id}`); setExpandedFolders((current) => {
              const next = new Set(current);
              if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
              return next;
            }); }} aria-label={expanded ? `收起${nodeLabel}` : `展开${nodeLabel}`}>
              <FiFolder className="leading-default-icon" />
              {expanded ? <FiChevronDown className="leading-state-icon" /> : <FiChevronRight className="leading-state-icon" />}
            </button>
          ) : <span className="tree-leading"><FiFileText /></span>}
          {renamingId === node.id ? (
            <input
              className="tree-rename-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onFocus={(event) => {
                if (!selectCreatedNameOnFocus.current) return;
                selectCreatedNameOnFocus.current = false;
                event.currentTarget.select();
              }}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") {
                  selectCreatedNameOnFocus.current = false;
                  setRenamingId(null);
                }
              }}
              autoFocus
            />
          ) : (
            <button className="tree-node-title" type="button" onClick={() => node.type === "file" ? selectFile(node) : (setSelectedFolderId(node.id), setSelectedMenuKey(`tree:${node.id}`), setExpandedFolders((current) => {
              const next = new Set(current);
              if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
              return next;
            }))}>{nodeLabel}</button>
          )}
          <span className="tree-row-actions">
            {node.type === "folder" ? <button className="tree-action icon-button" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => createNode("file", node.id)} aria-label={`在${nodeLabel}中新建文档`} title="新增文档"><FiPlus /></button> : null}
            <button className="tree-action icon-button" type="button" onClick={(event) => { setMenuNodeId(menuOpen ? null : node.id); setMenuAnchor(menuOpen ? null : event.currentTarget); setMoveMenuOpen(false); }} aria-label={`${nodeLabel}的更多操作`} title="更多"><FiMoreHorizontal /></button>
          </span>
          {menuOpen ? (
            <NodeMenu
              node={node}
              nodes={nodes}
              anchor={menuAnchor}
              moveOpen={moveMenuOpen}
              onRename={() => beginRename(node)}
              onMoveToggle={() => setMoveMenuOpen((open) => !open)}
              onMove={(folderId) => { setNodes((current) => moveWorkspaceNode(current, node.id, folderId)); setMenuNodeId(null); }}
              onFavorite={() => node.type === "file" && toggleFavorite(node.id)}
              onCopyLink={() => void copyNodeLink(node)}
              onDuplicate={() => duplicateNode(node)}
              onDelete={() => requestDeleteNode(node)}
              onOpen={() => window.open(nodeUrl(node), "_blank", "noopener,noreferrer")}
            />
          ) : null}
        </div>
        {node.type === "folder" && expanded ? renderTree(node.id, depth + 1) : null}
      </div>
    );
  });

  return (
    <main className={`workspace-shell-ui ${sidebarCollapsed ? "is-collapsed" : ""} ${searchMode ? "is-search-mode" : ""}`} style={{ "--sidebar-width": `${sidebarDisplayWidth}px` } as CSSProperties}>
      <button type="button" className="mobile-menu-button icon-button" onClick={() => setSidebarOpen(true)} aria-label="打开侧栏" title="打开侧栏"><FiMenu /></button>
      {sidebarCollapsed ? <button type="button" className="desktop-sidebar-open icon-button" onMouseEnter={showSidebarPeek} onMouseLeave={scheduleSidebarPeekClose} onClick={() => { setSidebarCollapsed(false); setSidebarPeeking(false); }} aria-label="展开侧栏" title="展开侧栏"><FiChevronsRight /></button> : null}
      {sidebarOpen ? <button className="sidebar-backdrop" aria-label="关闭侧栏" onClick={() => setSidebarOpen(false)} /> : null}
      <aside className={`workspace-sidebar ${sidebarOpen ? "is-open" : ""} ${sidebarPeeking ? "is-peeking" : ""}`} onMouseEnter={() => sidebarCollapsed && showSidebarPeek()} onMouseLeave={scheduleSidebarPeekClose}>
        <header className="sidebar-header">
          <div className="account-wrap">
            <button className="workspace-switcher" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}>
              <span className="workspace-avatar">{userProfile.avatarUrl ? <img src={userProfile.avatarUrl} alt="" /> : userProfile.name.slice(0, 1).toUpperCase()}</span>
              <span className="workspace-name">{userProfile.name}</span>
              <FiChevronDown className="account-chevron" />
            </button>
            {accountOpen ? (
              <div className="account-menu">
                <div className="account-summary"><strong>{userProfile.name}</strong><span>{userProfile.email}</span></div>
                <button type="button" onClick={() => { setAccountOpen(false); importInputRef.current?.click(); }}><FiUpload />导入文档</button>
                <button type="button" onClick={() => openSettings()}><FiSettings />设置</button>
                <button type="button" onClick={() => { setTrashOpen(true); setSelectedTrashIds(new Set()); setAccountOpen(false); }}><FiTrash2 />回收站</button>
                <button type="button" onClick={onLogout}><FiLogOut />退出登录</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="sidebar-collapse icon-button" onClick={() => setSidebarCollapsed(true)} aria-label="收起侧栏" title="收起侧栏"><FiChevronsLeft /></button>
          <button type="button" className="mobile-close icon-button" onClick={() => setSidebarOpen(false)} aria-label="关闭侧栏" title="关闭侧栏"><FiX /></button>
        </header>
        {serverStatus ? <div className="server-status">{serverStatus}</div> : null}

        <nav className="sidebar-actions" aria-label="工作区操作">
          <div className="sidebar-search-wrap">
            <label className="sidebar-search">
              <FiSearch />
              <input
                ref={searchRef}
                value={search}
                onFocus={enterSearchMode}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") rememberSearch(search, setRecentSearches);
                }}
                placeholder="搜索"
              />
              {search ? (
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    rememberSearch(search, setRecentSearches);
                    setSearch("");
                  }}
                  aria-label="清除搜索"
                >
                  <FiX />
                </button>
              ) : searchMode ? <button className="icon-button" type="button" onClick={closeSearchMode} aria-label="关闭搜索"><FiX /></button> : null}
              {searchMode ? (
                <button className="icon-button search-filter-button" type="button" aria-label="筛选搜索范围" aria-expanded={searchFilterOpen} onClick={(event) => { event.preventDefault(); setSearchFilterOpen((open) => !open); }}><FiSliders /></button>
              ) : null}
            </label>
            {searchMode && searchFilterOpen ? (
              <SearchFilterPopover
                folders={filteredSearchFolders}
                nodes={nodes}
                query={searchFolderQuery}
                selectedFolderIds={selectedSearchFolderIds}
                onQueryChange={setSearchFolderQuery}
                onToggleFolder={(folderId) => setSelectedSearchFolderIds((current) => {
                  const next = new Set(current);
                  if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
                  return next;
                })}
                onReset={() => setSelectedSearchFolderIds(new Set())}
                onConfirm={() => setSearchFilterOpen(false)}
              />
            ) : null}
          </div>
          {searchMode ? null : (
            <>
              <QuickFileSection title="最近打开" source="recent" icon={<FiClock />} expanded={expandedQuickSections.has("recent")} files={recentFiles} selectedMenuKey={selectedMenuKey} onToggle={() => toggleQuickSection("recent")} onSelect={selectFile} />
              <QuickFileSection title="星标文件" source="favorites" icon={<FiStar />} expanded={expandedQuickSections.has("favorites")} files={favoriteFiles} selectedMenuKey={selectedMenuKey} onToggle={() => toggleQuickSection("favorites")} onSelect={selectFile} />
            </>
          )}
        </nav>

        <div className="sidebar-scroll">
          {search.trim() ? (
            <GlobalSearchResults
              query={search}
              results={workspaceSearchResults}
              expandedFileIds={expandedSearchFileIds}
              onToggleFile={(fileId) => setExpandedSearchFileIds((current) => {
                const next = new Set(current);
                if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
                return next;
              })}
              onSelectFolder={(folder) => {
                rememberSearch(search, setRecentSearches);
                setSelectedFolderId(folder.id);
                setSelectedMenuKey(`search:${folder.id}`);
                setExpandedFolders((current) => new Set(current).add(folder.id));
              }}
              onSelectFile={(file) => {
                rememberSearch(search, setRecentSearches);
                selectFile(file, "search");
              }}
              onSelectMatch={selectSearchMatch}
            />
          ) : searchMode ? (
            <RecentSearchPanel
              searches={recentSearches}
              onClear={() => {
                setRecentSearches([]);
                saveRecentSearches([]);
              }}
              onDelete={(value) => {
                const next = recentSearches.filter((item) => item !== value);
                setRecentSearches(next);
                saveRecentSearches(next);
              }}
              onSelect={(value) => setSearch(value)}
            />
          ) : (
            <section className="workspace-files" aria-labelledby="workspace-files-title">
              <div className="section-label" id="workspace-files-title">我的文档</div>
              {serverReady ? renderTree(null) : <WorkspaceLoading label="正在加载工作区" compact />}
            </section>
          )}
        </div>
        <div className="sidebar-bottom-action">
          <div className="create-wrap">
            <button type="button" className="sidebar-new-button" aria-expanded={createMenuOpen} onClick={() => setCreateMenuOpen((open) => !open)}><FiPlus /><span>新增</span></button>
            {createMenuOpen ? <div className="create-menu"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => createNode("file")}><FiFilePlus />新增文档</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => createNode("folder")}><FiFolderPlus />新增文件夹</button></div> : null}
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void importDocuments(files);
            }}
          />
        </div>
        <div className="sidebar-resizer" role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" onPointerDown={resizeSidebar} />
      </aside>

      <section className="workspace-main">
        <header className="document-header">
          <div className="document-path">
            {breadcrumbs.map((folder) => <span className="breadcrumb-part" key={folder.id}><span>{folder.title}</span><FiChevronRight /></span>)}
            {focusedTitle && focusBreadcrumbState ? (
              <>
                <button type="button" className="document-path-current" onClick={() => focusBreadcrumbState.navigate(null)}>
                  {activeFile?.title || "无标题"}
                </button>
                {focusAncestorItems.map((item) => (
                  <span className="breadcrumb-part document-focus-part" key={item.id}>
                    <FiChevronRight />
                    <button type="button" onClick={() => focusBreadcrumbState.navigate(item.id)}>
                      {item.label}
                    </button>
                  </span>
                ))}
                <span className="breadcrumb-part document-focus-part is-current">
                  <FiChevronRight />
                  <span className="document-focus-current">{focusedTitle}</span>
                </span>
              </>
            ) : (
              <strong>{activeFile?.title || "无标题"}</strong>
            )}
          </div>
          <div className="document-header-actions" ref={setHeaderToolbarTarget} />
        </header>
        <div className="document-stage">
          {!serverReady ? (
            <WorkspaceLoading label="正在加载服务器数据" />
          ) : activeDocumentStore && activeFile ? (
            <AppErrorBoundary scope="文档"><App
              key={activeFile.id}
              embedded
              store={activeDocumentStore}
              toolbarTarget={headerToolbarTarget}
              onFocusBreadcrumbChange={setFocusBreadcrumbState}
              viewStateStorageKey={documentViewStorageKey(activeFile.id)}
              onShare={() => void openShare()}
              onImportDocuments={(files) => void importDocuments(files)}
              mindMapDefaults={workspacePreferences.mindMapDefaults}
              onMindMapDefaultsChange={updateMindMapDefaults}
              focusNodeRequest={
                documentFocusRequest?.fileId === activeFile.id
                  ? documentFocusRequest
                  : null
              }
            /></AppErrorBoundary>
          ) : (
            <div className="document-empty-state">暂无可打开的文档</div>
          )}
        </div>
      </section>
      {settingsOpen ? (
        <div className="settings-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="设置">
            <aside className="settings-sidebar" aria-label="设置导航">
              <div className="settings-sidebar-group">
                <div className="settings-sidebar-title">账号</div>
                <button type="button" className={`settings-tab account-tab ${settingsView === "account" ? "is-active" : ""}`} onClick={() => setSettingsView("account")}>
                  <span className="settings-tab-avatar">{profileDraft.avatarUrl ? <img src={profileDraft.avatarUrl} alt="" /> : profileDraft.name.slice(0, 1).toUpperCase()}</span>
                  <span>{profileDraft.name}</span>
                </button>
                <button type="button" className={`settings-tab ${settingsView === "preferences" ? "is-active" : ""}`} onClick={() => setSettingsView("preferences")}><FiSliders /><span>偏好</span></button>
              </div>
            </aside>
            <button type="button" className="settings-close icon-button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><FiX /></button>
            <div className="settings-content">
              {settingsView === "account" ? (
                <div className="account-settings">
                  <header className="settings-content-header"><h2>账号</h2><p>管理你的档案、登录信息和安全设置</p></header>
                  <section className="settings-section">
                    <h3>档案</h3>
                    <div className="profile-row">
                      <label className="settings-avatar editable-avatar" title="更换头像">
                        {profileDraft.avatarUrl ? <img src={profileDraft.avatarUrl} alt="头像预览" /> : profileDraft.name.slice(0, 1).toUpperCase()}
                        <span><FiCamera /></span>
                        <input type="file" accept="image/*" onChange={(event) => updateAvatar(event.target.files?.[0])} />
                      </label>
                      <label className="settings-field profile-name-field"><span>偏好名称</span><input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                    </div>
                    <p className="notion-faces-link">使用 Notion 脸谱<a href="https://faces.notion.com/" target="_blank" rel="noreferrer">创建自定义头像</a></p>
                  </section>
                  <section className="settings-section">
                    <h3>账号安全</h3>
                    <div className="settings-rule"><span><strong>邮箱地址</strong><small>{profileDraft.email}</small></span><button type="button" onClick={() => setSettingsEdit((current) => current === "email" ? null : "email")}>修改邮箱</button></div>
                    {settingsEdit === "email" ? <label className="settings-inline-editor"><span>新邮箱地址</span><input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} autoFocus /></label> : null}
                    <div className="settings-rule"><span><strong>密码</strong><small>更改用于登录的密码</small></span><button type="button" onClick={() => setSettingsEdit((current) => current === "password" ? null : "password")}>修改密码</button></div>
                    {settingsEdit === "password" ? <label className="settings-inline-editor"><span>新密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="输入新密码" autoFocus /></label> : null}
                  </section>
                  <footer className="settings-actions"><button type="button" onClick={() => setSettingsOpen(false)}>取消</button><button type="button" className="settings-save" onClick={() => void saveAccountSettings()}>保存修改</button></footer>
                </div>
              ) : (
                <div className="preferences-settings">
                  <header className="settings-content-header"><h2>偏好</h2><p>自定义工作区使用体验</p></header>
                  <div className="preferences-empty">内容待定</div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
      {shareOpen ? (
        <div className="workspace-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShareOpen(false)}>
          <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <header><h2 id="share-title">分享文档</h2><button type="button" className="icon-button" onClick={() => setShareOpen(false)} aria-label="关闭分享"><FiX /></button></header>
            <label className="share-toggle-row">
              <span><strong>文档开启分享</strong><small>使用链接或扫描二维码即可访问</small></span>
              <input type="checkbox" checked={shareState.enabled} disabled={shareLoading} onChange={(event) => void toggleShare(event.target.checked)} />
            </label>
            {shareError ? <p className="share-error" role="alert">{shareError}</p> : null}
            {shareLoading ? <div className="share-loading">正在更新分享设置…</div> : shareUrl ? <>
              <div className="share-link-row"><input value={shareUrl} readOnly aria-label="文档分享链接" /><button type="button" onClick={() => void copyShareUrl()}>复制链接</button></div>
              {shareCopied ? <div className="share-copy-success" role="status">复制成功</div> : null}
              <div className="share-qr">{shareQrCode ? <img src={shareQrCode} alt="文档分享二维码" /> : null}<span>扫描二维码查看文档</span></div>
            </> : null}
          </section>
        </div>
      ) : null}
      {deleteTarget ? (
        <div
          className="workspace-dialog-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setDeleteTarget(null)}
        >
          <section className="workspace-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <button type="button" className="workspace-dialog-close icon-button" onClick={() => setDeleteTarget(null)} aria-label="关闭确认"><FiX /></button>
            <h2 id="delete-confirm-title">移到回收站？</h2>
            <p>
              确定要删除「{deleteTarget.title || "无标题"}」吗？
              {deleteTarget.type === "folder" ? " 文件夹内的文档和子文件夹也会一起移入回收站。" : " 可稍后在回收站中恢复。"}
            </p>
            <footer>
              <button type="button" onClick={() => setDeleteTarget(null)}>取消</button>
              <button type="button" className="danger" onClick={confirmDeleteNode}>移到回收站</button>
            </footer>
          </section>
        </div>
      ) : null}
      {trashOpen ? (
        <div className="workspace-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTrashOpen(false)}>
          <section className="trash-dialog" role="dialog" aria-modal="true" aria-labelledby="trash-title">
            <header>
              <div><h2 id="trash-title">回收站</h2><p>{trash.length ? `${trash.length} 个项目` : "回收站为空"}</p></div>
              <button type="button" className="icon-button" onClick={() => setTrashOpen(false)} aria-label="关闭回收站"><FiX /></button>
            </header>
            <div className="trash-toolbar">
              <label><input type="checkbox" checked={trash.length > 0 && selectedTrashIds.size === trash.length} onChange={(event) => setSelectedTrashIds(event.target.checked ? new Set(trash.map((entry) => entry.id)) : new Set())} />全选</label>
              <span />
              <button type="button" disabled={!selectedTrashIds.size} onClick={() => restoreTrashEntries(selectedTrashIds)}><FiRotateCcw />恢复</button>
              <button type="button" className="danger" disabled={!selectedTrashIds.size} onClick={() => void permanentlyDeleteTrashEntries(selectedTrashIds)}><FiTrash2 />彻底删除</button>
              <button type="button" className="danger" disabled={!trash.length} onClick={() => void permanentlyDeleteTrashEntries(new Set(trash.map((entry) => entry.id)))}>清空回收站</button>
            </div>
            <div className="trash-list">
              {trash.map((entry) => {
                const root = entry.nodes.find((node) => node.id === entry.id);
                if (!root) return null;
                return <label className="trash-item" key={entry.id}>
                  <input type="checkbox" checked={selectedTrashIds.has(entry.id)} onChange={() => setSelectedTrashIds((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} />
                  {root.type === "folder" ? <FiFolder /> : <FiFileText />}
                  <span><strong>{root.title || "无标题"}</strong><small>{new Date(entry.deletedAt).toLocaleString("zh-CN")}</small></span>
                  <button type="button" title="恢复" aria-label={`恢复${root.title}`} onClick={(event) => { event.preventDefault(); restoreTrashEntries(new Set([entry.id])); }}><FiRotateCcw /></button>
                  <button type="button" className="danger" title="彻底删除" aria-label={`彻底删除${root.title}`} onClick={(event) => { event.preventDefault(); void permanentlyDeleteTrashEntries(new Set([entry.id])); }}><FiTrash2 /></button>
                </label>;
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function getDocumentStore(stores: Map<string, TreeStore>, file: WorkspaceFile, defaults?: ZhiJianMindMapDefaults) {
  const existing = stores.get(file.id);
  if (existing) return existing;
  const store = new TreeStore(createWorkspaceDocument(file.title, defaults));
  stores.set(file.id, store);
  return store;
}

function documentViewStorageKey(fileId: string) {
  return `zhijian.workspace.document.${fileId}.view-state.v1`;
}

function searchWorkspace(nodes: WorkspaceNode[], stores: Map<string, TreeStore>, query: string, folderFilterIds: Set<string>): WorkspaceSearchResult[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const results: WorkspaceSearchResult[] = [];
  const folders = nodes.filter((node): node is WorkspaceFolder => node.type === "folder");
  const files = nodes.filter(isWorkspaceFile);

  for (const folder of folders) {
    if (!nodePassesFolderFilter(nodes, folder, folderFilterIds)) continue;
    if (!folder.title.toLocaleLowerCase("zh-CN").includes(normalized)) continue;
    results.push({
      type: "folder",
      folder,
      path: workspaceNodePathLabel(nodes, folder),
    });
  }

  for (const file of files) {
    if (!nodePassesFolderFilter(nodes, file, folderFilterIds)) continue;
    const tree = getDocumentStore(stores, file).getSnapshot();
    const titleMatch = file.title.toLocaleLowerCase("zh-CN").includes(normalized);
    const matches = orderedDocumentNodes(tree)
      .map((node) => ({ node, text: nodeSearchText(node) }))
      .filter((match) => match.text.toLocaleLowerCase("zh-CN").includes(normalized))
      .map((match) => ({
        nodeId: match.node.id,
        text: compactSearchText(match.text),
        path: workspaceNodePathLabel(nodes, file),
      }));
    if (titleMatch || matches.length) {
      results.push({
        type: "file",
        file,
        titleMatch,
        matches,
        path: workspaceNodePathLabel(nodes, file),
      });
    }
  }

  return results;
}

function nodePassesFolderFilter(nodes: WorkspaceNode[], node: WorkspaceNode, folderFilterIds: Set<string>) {
  if (!folderFilterIds.size) return true;
  if (node.type === "folder" && folderFilterIds.has(node.id)) return true;
  return folderPath(nodes, node.id).some((folder) => folderFilterIds.has(folder.id));
}

function workspaceNodePathLabel(nodes: WorkspaceNode[], node: WorkspaceNode) {
  const path = folderPath(nodes, node.id).map((folder) => folder.title);
  return path.length ? `我的文档 > ${path.join(" > ")}` : "我的文档";
}

function orderedDocumentNodes(tree: ZhiJianTree) {
  const nodes: ZhiJianNode[] = [];
  const visit = (id: string) => {
    const node = tree.nodes[id];
    if (!node) return;
    nodes.push(node);
    node.children.forEach(visit);
  };
  visit(tree.rootId);
  return nodes;
}

function nodeSearchText(node: ZhiJianNode) {
  const parts = [
    richTextToPlainText(node.content),
    node.description ? richTextToPlainText(node.description) : "",
  ];
  for (const block of node.blocks ?? []) {
    if (block.type === "quote") parts.push(richTextToPlainText(block.content));
  }
  if (node.type === "table") {
    for (const row of node.props?.table?.rows ?? []) {
      for (const cell of row) parts.push(richTextToPlainText(cell.content));
    }
  }
  return parts.filter(Boolean).join(" ");
}

function compactSearchText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function searchFilterVisibleFolderIds(nodes: WorkspaceNode[], folders: WorkspaceFolder[], query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return new Set(folders.map((folder) => folder.id));
  const visible = new Set<string>();
  for (const folder of folders) {
    if (!folder.title.toLocaleLowerCase("zh-CN").includes(normalized)) continue;
    visible.add(folder.id);
    for (const parent of folderPath(nodes, folder.id)) visible.add(parent.id);
  }
  return visible;
}

function loadRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, 8)));
}

function rememberSearch(value: string, setRecentSearches: React.Dispatch<React.SetStateAction<string[]>>) {
  const search = value.trim();
  if (!search) return;
  setRecentSearches((current) => {
    const next = [search, ...current.filter((item) => item !== search)].slice(0, 8);
    saveRecentSearches(next);
    return next;
  });
}

function highlightText(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const lower = text.toLocaleLowerCase("zh-CN");
  const normalized = needle.toLocaleLowerCase("zh-CN");
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let index = lower.indexOf(normalized);
  while (index >= 0) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(<mark key={`${index}-${parts.length}`}>{text.slice(index, index + needle.length)}</mark>);
    cursor = index + needle.length;
    index = lower.indexOf(normalized, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}

function SimpleFileRow({ file, active, onSelect }: { file: WorkspaceFile; active: boolean; onSelect: (file: WorkspaceFile) => void }) {
  return <button type="button" className={`simple-file-row ${active ? "is-active" : ""}`} onClick={() => onSelect(file)}><FiFileText /><span>{file.title || "无标题"}</span></button>;
}

function GlobalSearchResults({ query, results, expandedFileIds, onToggleFile, onSelectFolder, onSelectFile, onSelectMatch }: {
  query: string;
  results: WorkspaceSearchResult[];
  expandedFileIds: Set<string>;
  onToggleFile: (fileId: string) => void;
  onSelectFolder: (folder: WorkspaceFolder) => void;
  onSelectFile: (file: WorkspaceFile) => void;
  onSelectMatch: (file: WorkspaceFile, nodeId: string) => void;
}) {
  return (
    <section className="global-search-results" aria-label="全局搜索结果">
      <div className="global-search-count">共{results.length}条搜索结果</div>
      {results.map((result) => {
        if (result.type === "folder") {
          return (
            <button type="button" className="global-search-item folder-result" key={`folder:${result.folder.id}`} onClick={() => onSelectFolder(result.folder)}>
              <FiFolder className="global-result-icon" />
              <span className="global-result-body">
                <strong>{highlightText(result.folder.title, query)}</strong>
                <small>{result.path}</small>
              </span>
            </button>
          );
        }
        const expanded = expandedFileIds.has(result.file.id);
        const visibleMatches = expanded ? result.matches : result.matches.slice(0, 5);
        return (
          <article className="global-search-item document-result" key={`file:${result.file.id}`}>
            <button type="button" className="global-result-heading" onClick={() => onSelectFile(result.file)}>
              <FiFileText className="global-result-icon" />
              <span className="global-result-body">
                <strong>{highlightText(result.file.title || "无标题", query)}</strong>
                <small>{result.path}</small>
              </span>
            </button>
            {visibleMatches.length ? (
              <ul className="global-result-matches">
                {visibleMatches.map((match) => (
                  <li key={match.nodeId}>
                    <button type="button" onClick={() => onSelectMatch(result.file, match.nodeId)}>
                      {highlightText(match.text, query)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.matches.length > 5 ? (
              <button type="button" className="global-search-more" onClick={() => onToggleFile(result.file.id)}>
                {expanded ? "收起" : "展开更多"} <FiChevronDown />
              </button>
            ) : null}
          </article>
        );
      })}
      {!results.length ? <div className="empty-section">暂无搜索结果</div> : null}
    </section>
  );
}

function RecentSearchPanel({ searches, onClear, onDelete, onSelect }: {
  searches: string[];
  onClear: () => void;
  onDelete: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  return (
    <section className="recent-search-panel" aria-label="最近搜索">
      <header>
        <span>最近搜索</span>
        {searches.length ? <button type="button" onClick={onClear}>清除搜索记录</button> : null}
      </header>
      {searches.length ? (
        <div className="recent-search-tags">
          {searches.map((item) => (
            <span className="recent-search-tag" key={item}>
              <button type="button" className="recent-search-value" onClick={() => onSelect(item)}>{item}</button>
              <button type="button" className="recent-search-delete icon-button" onClick={() => onDelete(item)} aria-label={`删除搜索记录 ${item}`}><FiX /></button>
            </span>
          ))}
        </div>
      ) : <div className="empty-section">暂无最近搜索</div>}
    </section>
  );
}

function WorkspaceLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={`workspace-loading ${compact ? "is-compact" : ""}`} role="status" aria-live="polite">
      <span className="workspace-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function SearchFilterPopover({ folders, nodes, query, selectedFolderIds, onQueryChange, onToggleFolder, onReset, onConfirm }: {
  folders: WorkspaceFolder[];
  nodes: WorkspaceNode[];
  query: string;
  selectedFolderIds: Set<string>;
  onQueryChange: (value: string) => void;
  onToggleFolder: (folderId: string) => void;
  onReset: () => void;
  onConfirm: () => void;
}) {
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set<string>());
  const visibleFolderIds = useMemo(() => searchFilterVisibleFolderIds(nodes, folders, query), [folders, nodes, query]);
  const isFilteringFolders = Boolean(query.trim());
  const renderFolders = (parentId: string | null, depth = 0): React.ReactNode => childNodes(nodes, parentId)
    .filter((node): node is WorkspaceFolder => node.type === "folder" && visibleFolderIds.has(node.id))
    .map((folder) => {
      const children = childNodes(nodes, folder.id).filter((node): node is WorkspaceFolder => node.type === "folder" && visibleFolderIds.has(node.id));
      const expanded = isFilteringFolders || expandedFolderIds.has(folder.id);
      return (
        <div className="workspace-filter-folder" key={folder.id}>
          <button type="button" className="workspace-filter-option" style={{ "--filter-depth": depth } as CSSProperties} onClick={() => onToggleFolder(folder.id)}>
            {children.length ? (
              <span
                className="workspace-filter-expand"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedFolderIds((current) => {
                    const next = new Set(current);
                    if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
                    return next;
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setExpandedFolderIds((current) => {
                      const next = new Set(current);
                      if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
                      return next;
                    });
                  }
                }}
              >
                {expanded ? <FiChevronDown /> : <FiChevronRight />}
              </span>
            ) : <span className="workspace-filter-expand" />}
            <span>{folder.title}</span>
            <span className={`workspace-filter-check ${selectedFolderIds.has(folder.id) ? "is-selected" : ""}`} aria-hidden="true" />
          </button>
          {children.length && expanded ? renderFolders(folder.id, depth + 1) : null}
        </div>
      );
    });

  return (
    <div className="workspace-search-filter-popover">
      <label className="workspace-filter-search"><FiSearch /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索文件夹" autoFocus /></label>
      <div className="workspace-filter-options">
        {renderFolders(null)}
        {!folders.length ? <div className="move-empty">没有匹配的文件夹</div> : null}
      </div>
      <footer className="workspace-filter-actions">
        <button type="button" onClick={onReset}>重置</button>
        <button type="button" className="primary" onClick={onConfirm}>确定</button>
      </footer>
    </div>
  );
}

function QuickFileSection({ title, source, icon, expanded, files, selectedMenuKey, onToggle, onSelect }: {
  title: string;
  source: QuickSection;
  icon: React.ReactNode;
  expanded: boolean;
  files: WorkspaceFile[];
  selectedMenuKey: string;
  onToggle: () => void;
  onSelect: (file: WorkspaceFile, source: string) => void;
}) {
  return (
    <section className="quick-file-section">
      <button type="button" className="sidebar-action expandable-action" aria-expanded={expanded} onClick={onToggle}>
        <span className="expandable-leading"><span className="leading-default-icon">{icon}</span>{expanded ? <FiChevronDown className="leading-state-icon" /> : <FiChevronRight className="leading-state-icon" />}</span>
        <span>{title}</span>
      </button>
      {expanded ? <div className="quick-file-list">{files.map((file) => <SimpleFileRow key={file.id} file={file} active={selectedMenuKey === `${source}:${file.id}`} onSelect={(selected) => onSelect(selected, source)} />)}{!files.length ? <div className="empty-section">暂无文件</div> : null}</div> : null}
    </section>
  );
}

function NodeMenu({ node, nodes, anchor, moveOpen, onRename, onMoveToggle, onMove, onFavorite, onCopyLink, onDuplicate, onDelete, onOpen }: {
  node: WorkspaceNode;
  nodes: WorkspaceNode[];
  anchor: HTMLElement | null;
  moveOpen: boolean;
  onRename: () => void;
  onMoveToggle: () => void;
  onMove: (folderId: string | null) => void;
  onFavorite: () => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [moveSearch, setMoveSearch] = useState("");
  const [movePosition, setMovePosition] = useState({ top: 0, left: 0, maxHeight: 0 });
  const folders = nodes.filter((item) => item.type === "folder" && item.id !== node.id && canMoveNode(nodes, node.id, item.id) && item.title.toLocaleLowerCase("zh-CN").includes(moveSearch.trim().toLocaleLowerCase("zh-CN")));
  const toggleMovePopover = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 220;
    const left = window.innerWidth - rect.right >= width + 12 ? rect.right + 6 : Math.max(8, rect.left - width - 6);
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 160));
    setMovePosition({ top, left, maxHeight: Math.max(120, window.innerHeight - top - 8) });
    onMoveToggle();
  };
  useLayoutEffect(() => {
    const reposition = () => {
      const menu = menuRef.current;
      if (!anchor?.isConnected || !menu) return;
      setPosition(workspaceNodeMenuPosition(
        anchor.getBoundingClientRect(),
        menu.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };
    reposition();
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={menuRef}
      className="node-menu"
      style={{ position: "fixed", top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
    >
      <button type="button" onClick={onRename}><FiEdit2 />重命名</button>
      <button type="button" onClick={toggleMovePopover}><FiMove />移动<FiChevronRight className="menu-chevron" /></button>
      {moveOpen ? createPortal(<div className="move-popover" style={{ top: movePosition.top, left: movePosition.left, maxHeight: movePosition.maxHeight }}><label className="move-search"><FiSearch /><input value={moveSearch} onChange={(event) => setMoveSearch(event.target.value)} placeholder="搜索文件夹" autoFocus /></label><div className="move-options"><button type="button" onClick={() => onMove(null)}>工作空间顶层</button>{folders.map((folder) => <button type="button" key={folder.id} onClick={() => onMove(folder.id)}><FiFolder />{folder.title}</button>)}{!folders.length ? <div className="move-empty">没有匹配的文件夹</div> : null}</div></div>, document.body) : null}
      {node.type === "file" ? <button type="button" onClick={onFavorite}>{node.favorite ? <FaStar className="favorite-filled" /> : <FiStar />}{node.favorite ? "取消星标" : "添加星标"}</button> : null}
      <button type="button" onClick={onCopyLink}><FiLink />拷贝链接</button>
      <button type="button" onClick={onDuplicate}><FiCopy />创建副本</button>
      <button type="button" onClick={onOpen}><FiExternalLink />在新选项卡中打开</button>
      <div className="menu-divider" />
      <button type="button" className="danger" onClick={onDelete}><FiTrash2 />删除</button>
    </div>,
    document.body,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "未知错误";
}

function lastOpenFileStorageKey(userId: string) {
  return `${LAST_OPEN_FILE_KEY}:${userId}`;
}

function loadLastOpenFileId(userId: string) {
  try {
    return window.localStorage.getItem(lastOpenFileStorageKey(userId));
  } catch {
    return null;
  }
}

function saveLastOpenFileId(userId: string, fileId: string) {
  try {
    window.localStorage.setItem(lastOpenFileStorageKey(userId), fileId);
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function profileFromSession(session: WorkspaceSession): UserProfile {
  return normalizeUserProfile(null, session);
}

function normalizeUserProfile(profile: UserProfile | null | undefined, session: WorkspaceSession): UserProfile {
  const email = session.email;
  const sessionName = displayName(session.name, email);
  const profileName = profile?.name?.trim() ?? "";
  return {
    name: profileName && profileName.toLowerCase() !== email.toLowerCase() ? profileName : sessionName,
    // Auth 是 email 的唯一来源，profile 里那一份只是过去写下的副本，改过邮箱之后就是旧值。
    email,
    avatarUrl: profile?.avatarUrl ?? "",
  };
}

function displayName(value: string | undefined, email: string) {
  const name = value?.trim() ?? "";
  if (!name || name.toLowerCase() === email.toLowerCase()) return displayNameFromEmail(email);
  return name;
}

function displayNameFromEmail(email: string) {
  const source = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "用户";
  return source.replace(/\b\w/g, (character) => character.toUpperCase());
}
