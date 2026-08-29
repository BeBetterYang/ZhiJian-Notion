import "@blocknote/mantine/style.css";
import type { BlockNoteEditor } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  FormattingToolbarController,
  SideMenu,
  SideMenuController,
  useComponentsContext,
  useCreateBlockNote,
  useBlockNoteEditor,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  RiArrowDownSFill,
  RiArrowRightSFill,
  RiBold,
  RiCheckboxLine,
  RiDeleteBinLine,
  RiEditLine,
  RiEmotionLine,
  RiFontColor,
  RiImage2Line,
  RiItalic,
  RiMarkPenLine,
  RiMoreFill,
  RiStrikethrough,
  RiTable2,
  RiUnderline,
} from "react-icons/ri";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { blockNoteToTree, treeToBlockNote } from "./blockNoteAdapter";
import { ZhiJianSlashMenu } from "./ZhiJianSlashMenu";
import { MindMapLinkToolbar } from "./MindMapLinkToolbar";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import type { MindMapTextSelection } from "../mindmap/MindMapEditor";
import { resolveMindMapTextRange } from "./mindMapTextSelection";
import { insertImageBlocks, insertNodeAttachmentBlocks } from "../shared/attachmentInsertion";
import { saveImageAsset } from "../shared/imageAssetStore";
import { zhijianDictionary } from "../shared/zhijianDictionary";
import {
  caretPositionBesideText,
  correctCaretAfterClick,
  extendSelectionFromCaret,
} from "../shared/caretAtPoint";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";
import { handleOutlineNodeKeyDown } from "./outlineNodeKeymap";
import { collapsedOutlineCss } from "./outlineCollapse";
import { zoomedOutlineCss } from "./outlineZoom";
import { outlineRowMenuPosition } from "./outlineRowMenuPosition";
import { LinkDialog } from "../shared/LinkDialog";
import {
  applyBlockShortcut,
  applyLink,
  blockTextRange,
  handleShortcutKeyDown,
  type ShortcutId,
} from "../shared/shortcuts";

interface OutlineEditorProps {
  readOnly?: boolean;
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  mindMapNodeId: string | null;
  mindMapTextSelection: MindMapTextSelection | null;
  mindMapToolbarTarget: HTMLElement | null;
  showMindMapToolbar: boolean;
  onMindMapInsertQuote: (nodeId: string, focusBlockId: string) => void;
  searchQuery?: string;
  visibleNodeIds?: Set<string> | null;
  activeSearchNodeId?: string | null;
  zoomedNodeId?: string | null;
  initialScrollTop?: number;
  onScrollPositionChange?: (scrollTop: number) => void;
  onFocusNode?: (nodeId: string) => void;
}

interface OutlineTextGesture {
  startX: number;
  startY: number;
  anchor: number;
  dragging: boolean;
}

const OUTLINE_TEXT_DRAG_THRESHOLD = 5;

export function OutlineEditor({
  readOnly = false,
  store,
  onSelectNode,
  mindMapNodeId,
  mindMapTextSelection,
  mindMapToolbarTarget,
  showMindMapToolbar,
  onMindMapInsertQuote,
  searchQuery = "",
  visibleNodeIds = null,
  activeSearchNodeId = null,
  zoomedNodeId = null,
  initialScrollTop,
  onScrollPositionChange,
  onFocusNode,
}: OutlineEditorProps) {
  const tree = useTree(store);
  const panelRef = useRef<HTMLElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const applyingExternalChange = useRef(false);
  const externalProjectionVersion = useRef(0);
  const restoredScroll = useRef(false);
  const userScrolled = useRef(false);
  // Set by a shortcut that rebuilds the document — a move, a copy, a deletion — and
  // read once the new projection is in, which is the first moment the block it names
  // exists to put the caret in.
  const pendingCaretNodeId = useRef<string | null>(null);
  const textGesture = useRef<OutlineTextGesture | null>(null);
  const suppressGestureClick = useRef(false);
  const suppressGestureClickTimer = useRef(0);
  const [linkText, setLinkText] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<OutlineRowMenuState | null>(null);
  const searchVisibilityCss = useMemo(() => outlineSearchVisibilityCss(tree, visibleNodeIds, searchQuery), [searchQuery, tree, visibleNodeIds]);
  const activeSearchCss = useMemo(() => outlineActiveSearchCss(activeSearchNodeId), [activeSearchNodeId]);
  const zoomCss = useMemo(() => zoomedOutlineCss(tree, zoomedNodeId), [tree, zoomedNodeId]);
  const rowMenuHighlightCss = useMemo(() => outlineRowMenuHighlightCss(rowMenu?.nodeId ?? null), [rowMenu?.nodeId]);
  const outlineContextValue = useMemo(() => ({ store, rowMenu, setRowMenu, onFocusNode }), [onFocusNode, rowMenu, store]);
  const editor = useCreateBlockNote(
    {
      initialContent: treeToBlockNote(tree),
      dictionary: zhijianDictionary,
      tabBehavior: "prefer-indent",
      uploadFile: async (file) => (await saveImageAsset(file)).url,
      tables: {
        headers: true,
        cellBackgroundColor: true,
        cellTextColor: true,
      },
    },
    [],
  );

  useEffect(() => {
    return editor.onSelectionChange(() => {
      const selectedBlock = editor.getSelection()?.blocks[0] ?? editor.getTextCursorPosition().block;
      if (selectedBlock?.id) {
        onSelectNode(selectedBlock.id);
      }
    });
  }, [editor, onSelectNode]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const gesture = textGesture.current;
      if (!gesture) return;
      if (!gesture.dragging) {
        const distance = Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY,
        );
        if (distance < OUTLINE_TEXT_DRAG_THRESHOLD) return;
        gesture.dragging = true;
      }
      extendSelectionFromCaret(editor, gesture.anchor, {
        x: event.clientX,
        y: event.clientY,
      });
    };
    const finish = () => {
      if (!textGesture.current) return;
      textGesture.current = null;
      suppressGestureClick.current = true;
      window.clearTimeout(suppressGestureClickTimer.current);
      suppressGestureClickTimer.current = window.setTimeout(() => {
        suppressGestureClick.current = false;
      }, 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      window.clearTimeout(suppressGestureClickTimer.current);
    };
  }, [editor]);

  useEffect(() => {
    const currentTree = blockNoteToTree(editor.document, tree);
    if (currentTree && blockProjectionSignature(currentTree) === blockProjectionSignature(tree)) {
      return;
    }
    applyingExternalChange.current = true;
    const projectionVersion = ++externalProjectionVersion.current;
    editor.replaceBlocks(editor.document, treeToBlockNote(tree));
    restoreCaret(editor, pendingCaretNodeId);
    window.setTimeout(() => {
      if (externalProjectionVersion.current === projectionVersion) {
        applyingExternalChange.current = false;
      }
    }, 0);
  }, [editor, tree]);

  useEffect(() => {
    if (!mindMapNodeId || !editor.getBlock(mindMapNodeId)) {
      return;
    }

    selectBlockContent(editor, mindMapNodeId, mindMapTextSelection);
  }, [editor, mindMapNodeId, mindMapTextSelection, tree]);

  useEffect(() => {
    if (restoredScroll.current || initialScrollTop === undefined || !panelRef.current) return;
    const restore = () => {
      if (restoredScroll.current || userScrolled.current || !panelRef.current) return;
      panelRef.current.scrollTop = initialScrollTop;
      if (panelRef.current.scrollTop === initialScrollTop || initialScrollTop <= 0) {
        restoredScroll.current = true;
      }
    };
    const firstFrame = window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
    const timeout = window.setTimeout(restore, 120);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(timeout);
    };
  }, [initialScrollTop, tree]);

  useEffect(() => {
    const root = panelRef.current;
    const registry = "highlights" in CSS ? CSS.highlights : undefined;
    if (!root || !registry) return;
    const name = "zhijian-outline-search";
    registry.delete(name);
    const query = searchQuery.trim();
    if (!query) return;
    const ranges = textSearchRanges(root, query);
    if (!ranges.length) return;
    registry.set(name, new Highlight(...ranges));
    return () => {
      registry.delete(name);
    };
  }, [searchQuery, tree]);

  const editorView = (
    <BlockNoteView
      editor={editor}
      editable={!readOnly}
      theme="light"
      formattingToolbar={false}
      sideMenu={false}
      slashMenu={false}
      onChange={() => {
        if (applyingExternalChange.current) {
          return;
        }
        const currentTree = store.getSnapshot();
        const nextTree = blockNoteToTree(editor.document, currentTree);
        if (
          nextTree &&
          blockProjectionSignature(nextTree) !== blockProjectionSignature(currentTree)
        ) {
          store.replaceTreeFromView(nextTree);
        }
      }}
    >
      {!readOnly ? <FormattingToolbarController
        formattingToolbar={() => <ZhiJianFormattingToolbar />}
      /> : null}
      {!readOnly ? <SideMenuController sideMenu={RootProtectedSideMenu} /> : null}
      {!readOnly ? <OutlineRowMenuPortal /> : null}
      {!readOnly ? <ZhiJianSlashMenu /> : null}
      {/* The map's links open this same editor's link toolbar, which is why it hangs
          here: BlockNote's components and dictionary come from this view. It shows
          nothing until the map reports a hover, and the map is only mounted in its own
          view — see `MindMapLinkToolbar`. */}
      <MindMapLinkToolbar />
      {showMindMapToolbar && mindMapToolbarTarget
        ? createPortal(
            <ZhiJianFormattingToolbar showClozeControl onInsertQuote={onMindMapInsertQuote} />,
            mindMapToolbarTarget,
          )
        : null}
    </BlockNoteView>
  );

  return (
    <section
      ref={panelRef}
      className="outline-panel"
      onMouseDownCapture={(event) => {
        if (readOnly) return;
        const target = event.target as Element;
        if (zoomedNodeId && target.closest(".bn-trailing-block")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.button !== 0 || event.detail !== 1) return;
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
        const textSurface = target.closest<HTMLElement>(
          ".bn-block-content, .bn-inline-content",
        );
        if (!textSurface || !panelRef.current?.contains(textSurface)) return;
        if (
          target.closest("a, button, input, textarea, select, table, .bn-visual-media-wrapper") ||
          textSurface.closest('[data-content-type="table"], [data-content-type="image"]')
        ) return;
        const anchor = caretPositionBesideText(editor, {
          x: event.clientX,
          y: event.clientY,
        });
        if (anchor === null) return;
        textGesture.current = {
          startX: event.clientX,
          startY: event.clientY,
          anchor,
          dragging: false,
        };
        // Prevent the browser's row-start fallback from flashing. Mouse movement
        // is handled above from this exact line-end anchor, so selection remains
        // available instead of competing with this default action.
        event.preventDefault();
        editor._tiptapEditor.view.focus();
        editor._tiptapEditor.commands.setTextSelection(anchor);
      }}
      onClickCapture={(event) => {
        if (!zoomedNodeId || event.button !== 0) return;
        if (!(event.target as Element).closest(".bn-trailing-block")) return;
        event.preventDefault();
        event.stopPropagation();
        const focused = editor.getBlock(zoomedNodeId);
        if (!focused) return;
        const updated = editor.updateBlock(focused, {
          children: [...focused.children, { type: "paragraph", content: "" }],
        });
        const created = updated.children.at(-1);
        if (created) editor.setTextCursorPosition(created, "start");
        editor.focus();
      }}
      onClick={(event) => {
        if (suppressGestureClick.current) {
          suppressGestureClick.current = false;
          return;
        }
        if (event.button !== 0 || !(event.target as Element).closest(".ProseMirror")) return;
        correctCaretAfterClick(editor, { x: event.clientX, y: event.clientY });
      }}
      onKeyDownCapture={(event) => {
        if (handleTreeHistoryKeyDown(event.nativeEvent, store)) return;
        if (
          handleShortcutKeyDown(event.nativeEvent, {
            store,
            editor,
            // The first block is the document title: it takes no heading level, no
            // colour and no deletion, in the outline as in the map.
            protectedBlockId: editor.document[0]?.id ?? null,
            onFocusNode: (nodeId) => {
              pendingCaretNodeId.current = nodeId;
            },
            onRequestLink: setLinkText,
            onRequestImage: () => imageInputRef.current?.click(),
          })
        ) {
          return;
        }
        handleOutlineNodeKeyDown(event.nativeEvent, editor, zoomedNodeId);
      }}
      // Typing 你 through an IME reaches `onChange` once per pinyin letter, and
      // each of those was an undo step of its own. The composition marks the run
      // of changes that make up one character, so the store folds them into the
      // step that returns to the text as it stood before it.
      onCompositionStart={() => store.beginHistoryCoalescing()}
      onCompositionEnd={() => store.endHistoryCoalescing()}
      onScroll={(event) => {
        if (restoredScroll.current) {
          userScrolled.current = true;
        }
        onScrollPositionChange?.(event.currentTarget.scrollTop);
      }}
    >
      {/* Which rows are collapsed, as CSS keyed by node id — see `outlineCollapse`
          for why the document keeps every row either way. */}
      <style>{collapsedOutlineCss(tree)}</style>
      <style>{searchVisibilityCss}</style>
      <style>{activeSearchCss}</style>
      <style>{zoomCss}</style>
      <style>{rowMenuHighlightCss}</style>
      <OutlineStoreContext.Provider value={outlineContextValue}>{editorView}</OutlineStoreContext.Provider>
      {/* 添加图片 (Alt Enter) has nothing to insert until a file has been chosen, and
          the picker can only be opened from a real click on an input. */}
      <input
        ref={imageInputRef}
        className="toolbar-file-input"
        type="file"
        accept="image/*"
        multiple
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!files.length) return;
          await insertImageBlocks(
            editor,
            editor.getTextCursorPosition().block.id,
            files,
            saveImageAsset,
          );
        }}
      />
      {linkText === null ? null : (
        <LinkDialog
          initialText={linkText}
          onCancel={() => setLinkText(null)}
          onConfirm={(url, text) => {
            setLinkText(null);
            applyLink(editor, url, text);
          }}
        />
      )}
    </section>
  );
}

function textSearchRanges(root: HTMLElement, query: string) {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent?.closest(".ProseMirror")) return NodeFilter.FILTER_REJECT;
      if (parent.closest(".bn-slash-menu, .bn-formatting-toolbar")) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const needle = query.toLocaleLowerCase("zh-CN");
  let current = walker.nextNode();
  while (current) {
    const text = current.textContent ?? "";
    const haystack = text.toLocaleLowerCase("zh-CN");
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const range = document.createRange();
      range.setStart(current, index);
      range.setEnd(current, index + query.length);
      ranges.push(range);
      index = haystack.indexOf(needle, index + needle.length);
    }
    current = walker.nextNode();
  }
  return ranges;
}

function outlineSearchVisibilityCss(
  tree: ReturnType<TreeStore["getSnapshot"]>,
  visibleNodeIds: Set<string> | null,
  query: string,
) {
  if (!visibleNodeIds || !query.trim()) return "";
  const hiddenIds = Object.keys(tree.nodes).filter((id) => !visibleNodeIds.has(id));
  return hiddenIds.length
    ? `.outline-panel :is(${blockSelectors(hiddenIds)}) { display: none !important; }`
    : "";
}

function outlineActiveSearchCss(nodeId: string | null) {
  if (!nodeId) return "";
  return `.outline-panel .bn-block-outer[data-id="${escapeCssString(nodeId)}"] > .bn-block > .bn-block-content { background: rgba(55, 53, 47, 0.08); border-radius: 4px; }`;
}

function outlineRowMenuHighlightCss(nodeId: string | null) {
  if (!nodeId) return "";
  return `.outline-panel .bn-block-outer[data-id="${escapeCssString(nodeId)}"] > .bn-block > .bn-block-content { background: rgba(55, 53, 47, 0.08); border-radius: 4px; }`;
}

function blockSelectors(ids: string[]) {
  return ids.map((id) => `.bn-block-outer[data-id="${escapeCssString(id)}"]`).join(", ");
}

function escapeCssString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * The side menu is rendered by BlockNote's own controller, several components below
 * this one, and its collapse button needs the store the outline is bound to. A
 * context rather than a closure over `store`: the menu holds the drag handle, and a
 * component identity that changed on every tree change would remount it — mid-drag,
 * for a drag that ends in a change.
 */
interface OutlineRowMenuState {
  nodeId: string;
  rootId: string | null;
  anchor: HTMLElement;
  anchorRect: DOMRect;
}

interface OutlineStoreContextValue {
  store: TreeStore;
  rowMenu: OutlineRowMenuState | null;
  setRowMenu: (menu: OutlineRowMenuState | null) => void;
  onFocusNode?: (nodeId: string) => void;
}

const OutlineStoreContext = createContext<OutlineStoreContextValue | null>(null);

function RootProtectedSideMenu() {
  const editor = useBlockNoteEditor();
  const context = useContext(OutlineStoreContext);
  const state = useExtensionState(SideMenuExtension, {
    selector: (extensionState) => extensionState?.block,
  });

  // The root is a fixed document title. Child blocks keep the row menu and the
  // standard BlockNote drag handle.
  if (state?.id && state.id === editor.document[0]?.id) {
    return null;
  }
  if (!state?.id) {
    return null;
  }

  return (
    <SideMenu>
      {context ? (
        <OutlineRowMenuButton nodeId={state.id} rootId={editor.document[0]?.id ?? null} />
      ) : null}
      {context ? <CollapseButton store={context.store} nodeId={state.id} /> : null}
      <FocusDragHandleButton nodeId={state.id} />
    </SideMenu>
  );
}

type PaletteKind = "text" | "background" | "emoji";
type BasicStyle = "bold" | "italic" | "underline" | "strike";

const COLOR_ITEMS: Array<{ label: string; value: string | null }> = [
  { label: "默认", value: null },
  { label: "灰色", value: "gray" },
  { label: "棕色", value: "brown" },
  { label: "红色", value: "red" },
  { label: "橙色", value: "orange" },
  { label: "黄色", value: "yellow" },
  { label: "绿色", value: "green" },
  { label: "蓝色", value: "blue" },
  { label: "紫色", value: "purple" },
  { label: "粉色", value: "pink" },
];

const EMOJI_ITEMS = [
  "😀", "😄", "😂", "😊", "😍", "🤔", "😎", "😭", "😡", "👍", "👏", "🙏",
  "💡", "⭐", "✅", "🔥", "📌", "📷", "📊", "📝", "🚩", "❗", "🎯", "🔗",
  "📁", "📄", "📚", "💻", "📱", "🚀", "⚠️", "❤️", "💬", "🔍", "🧠", "🏷️",
];

function OutlineRowMenuButton({ nodeId, rootId }: { nodeId: string; rootId: string | null }) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const context = useContext(OutlineStoreContext);
  const block = editor.getBlock(nodeId);
  const headingLevel = block?.type === "heading"
    ? (block.props as { level?: number }).level
    : undefined;

  return (
    <Components.SideMenu.Button
      className={`bn-button outline-row-more-button${headingLevel ? ` outline-heading-level-${headingLevel}` : ""}`}
      label="更多"
      icon={<RiMoreFill />}
      onClick={(event) => {
        if (block) {
          editor.setTextCursorPosition(block, "end");
        }
        const anchor = event.currentTarget as HTMLElement;
        context?.setRowMenu(
          context.rowMenu?.nodeId === nodeId
            ? null
            : {
                nodeId,
                rootId,
                anchor,
                anchorRect: anchor.getBoundingClientRect(),
              },
        );
      }}
    />
  );
}

function OutlineRowMenuPortal() {
  const editor = useBlockNoteEditor();
  const context = useContext(OutlineStoreContext);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [palette, setPalette] = useState<PaletteKind | null>(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const menu = context?.rowMenu ?? null;
  const nodeId = menu?.nodeId ?? "";
  const rootId = menu?.rootId ?? null;
  const activeBlock = nodeId ? editor.getBlock(nodeId) : undefined;
  const activeStyles = editor.getActiveStyles() as Record<string, unknown>;
  const activeTextColor = typeof activeStyles.textColor === "string" ? activeStyles.textColor : null;
  const activeBackgroundColor = typeof activeStyles.backgroundColor === "string" ? activeStyles.backgroundColor : null;

  const updatePosition = useCallback(() => {
    if (!menu || !menuRef.current) return;
    const anchorRect = menu.anchor.isConnected
      ? menu.anchor.getBoundingClientRect()
      : menu.anchorRect;
    const menuRect = menuRef.current.getBoundingClientRect();
    setPosition(outlineRowMenuPosition(
      anchorRect,
      menuRect,
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) return undefined;
    updatePosition();
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menu, palette, updatePosition]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      context?.setRowMenu(null);
      setPalette(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [context, menu]);

  const withTargetBlock = (action: () => void, keepOpen = false) => {
    const block = editor.getBlock(nodeId);
    if (!block || nodeId === rootId) return;
    editor.setTextCursorPosition(block, "end");
    action();
    editor.focus();
    if (!keepOpen) {
      context?.setRowMenu(null);
      setPalette(null);
    }
  };

  const applyShortcut = (id: ShortcutId) => {
    withTargetBlock(() => {
      applyBlockShortcut(id, {
        editor,
        protectedBlockId: rootId,
        onRequestImage: () => imageInputRef.current?.click(),
      });
    });
  };

  const applyColor = (kind: PaletteKind, color: string | null) => {
    if (kind === "emoji") return;
    withTargetBlock(() => {
      toggleWholeBlockColor(editor, nodeId, kind, color);
    });
  };

  const addDescription = () => {
    withTargetBlock(() => {
      const block = editor.getBlock(nodeId);
      const existingQuote = block?.children.find((child) => child.type === "quote");
      if (existingQuote) {
        editor.setTextCursorPosition(existingQuote, "end");
        return;
      }
      const [quote] = insertNodeAttachmentBlocks(editor, nodeId, [
        { type: "quote" as const, content: "" },
      ]);
      if (quote) {
        editor.setTextCursorPosition(quote, "start");
      }
    });
  };

  const deleteNode = () => {
    if (nodeId === rootId) return;
    context?.store.deleteNode(nodeId);
    context?.setRowMenu(null);
    setPalette(null);
  };

  const insertEmoji = (emoji: string) => {
    withTargetBlock(() => editor.insertInlineContent(`${emoji} `));
  };

  if (!menu) return null;

  return createPortal(
    <div
      className="outline-row-menu-layer"
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <input
        ref={imageInputRef}
        className="toolbar-file-input"
        type="file"
        accept="image/*"
        multiple
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!files.length) return;
          await insertImageBlocks(editor, nodeId, files, saveImageAsset);
          context?.setRowMenu(null);
          setPalette(null);
        }}
      />
      <div className="outline-row-menu">
          <div className="outline-row-menu-grid" aria-label="段落类型">
            <RowMenuIconButton label="H1" active={isHeadingBlock(activeBlock, 1)} onClick={() => applyShortcut("heading-1")} />
            <RowMenuIconButton label="H2" active={isHeadingBlock(activeBlock, 2)} onClick={() => applyShortcut("heading-2")} />
            <RowMenuIconButton label="H3" active={isHeadingBlock(activeBlock, 3)} onClick={() => applyShortcut("heading-3")} />
            <RowMenuIconButton label="T" active={activeBlock?.type === "paragraph"} onClick={() => applyShortcut("set-paragraph")} />
          </div>
          <div className="outline-row-menu-grid" aria-label="文字样式">
            <RowMenuIconButton label="加粗" icon={<RiBold />} active={Boolean(activeStyles.bold)} onClick={() => withTargetBlock(() => toggleWholeBlockStyle(editor, nodeId, "bold"))} />
            <RowMenuIconButton label="斜体" icon={<RiItalic />} active={Boolean(activeStyles.italic)} onClick={() => withTargetBlock(() => toggleWholeBlockStyle(editor, nodeId, "italic"))} />
            <RowMenuIconButton label="下划线" icon={<RiUnderline />} active={Boolean(activeStyles.underline)} onClick={() => withTargetBlock(() => toggleWholeBlockStyle(editor, nodeId, "underline"))} />
            <RowMenuIconButton label="删除线" icon={<RiStrikethrough />} active={Boolean(activeStyles.strike)} onClick={() => withTargetBlock(() => toggleWholeBlockStyle(editor, nodeId, "strike"))} />
          </div>
          <button className="outline-row-menu-action" type="button" onClick={() => setPalette(palette === "text" ? null : "text")}>
            <RiFontColor />
            <span>字体颜色</span>
            <RiArrowRightSFill className="outline-row-menu-arrow" />
          </button>
          <button className="outline-row-menu-action" type="button" onClick={() => setPalette(palette === "background" ? null : "background")}>
            <RiMarkPenLine />
            <span>荧光笔</span>
            <RiArrowRightSFill className="outline-row-menu-arrow" />
          </button>
          <button className="outline-row-menu-action" type="button" onClick={addDescription}>
            <RiEditLine />
            <span>编辑引用</span>
          </button>
          <button className="outline-row-menu-action" type="button" onClick={() => imageInputRef.current?.click()}>
            <RiImage2Line />
            <span>添加图片</span>
          </button>
          <button className="outline-row-menu-action" type="button" onClick={() => applyShortcut("toggle-todo")}>
            <RiCheckboxLine />
            <span>添加待办</span>
          </button>
          <button className="outline-row-menu-action" type="button" onClick={() => setPalette(palette === "emoji" ? null : "emoji")}>
            <RiEmotionLine />
            <span>表情符号</span>
            <RiArrowRightSFill className="outline-row-menu-arrow" />
          </button>
          <button className="outline-row-menu-action" type="button" onClick={() => applyShortcut("insert-table")}>
            <RiTable2 />
            <span>添加表格</span>
          </button>
          <button className="outline-row-menu-action is-danger" type="button" onClick={deleteNode}>
            <RiDeleteBinLine />
            <span>删除</span>
          </button>
          {palette && palette !== "emoji" ? (
            <div className="outline-row-palette">
              {COLOR_ITEMS.map((item) => (
                <button
                  className={`outline-row-palette-item ${isActiveColor(palette, item.value, activeTextColor, activeBackgroundColor) ? "is-active" : ""}`}
                  key={item.value ?? "default"}
                  type="button"
                  onClick={() => applyColor(palette, item.value)}
                >
                  <span
                    className="outline-row-color-swatch"
                    data-color={item.value ?? "default"}
                    data-kind={palette}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          {palette === "emoji" ? (
            <div className="outline-row-palette outline-row-emoji-palette">
              {EMOJI_ITEMS.map((emoji) => (
                <button className="outline-row-emoji-item" key={emoji} type="button" onClick={() => insertEmoji(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
      </div>
    </div>
    ,
    document.body,
  );
}

function RowMenuIconButton({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button className={`outline-row-menu-icon ${active ? "is-active" : ""}`} type="button" aria-label={label} title={label} onClick={onClick}>
      {icon ?? label}
    </button>
  );
}

function FocusDragHandleButton({ nodeId }: { nodeId: string }) {
  const Components = useComponentsContext()!;
  const context = useContext(OutlineStoreContext);
  const sideMenu = useExtension(SideMenuExtension) as unknown as {
    blockDragStart: (event: DragEvent, block: unknown) => void;
    blockDragEnd: (event: DragEvent) => void;
  };
  const block = useExtensionState(SideMenuExtension, {
    selector: (extensionState) => extensionState?.block,
  });

  if (!block) return null;

  return (
    <Components.SideMenu.Button
      className="bn-button outline-focus-drag-handle"
      label="进入专注"
      draggable
      icon={<span className="outline-focus-dot" aria-hidden="true" />}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        context?.onFocusNode?.(nodeId);
      }}
      onDragStart={(event) => sideMenu.blockDragStart(event, block)}
      onDragEnd={(event) => sideMenu.blockDragEnd(event)}
    />
  );
}

function toggleWholeBlockStyle(editor: BlockNoteEditor, blockId: string, style: BasicStyle) {
  const block = editor.getBlock(blockId);
  if (!block) return;
  const selection = editor.prosemirrorState.selection;
  const range = blockTextRange(editor, blockId);
  if (range && range.from < range.to) {
    editor._tiptapEditor.commands.setTextSelection(range);
  } else {
    editor.setTextCursorPosition(block, "end");
  }
  editor.toggleStyles({ [style]: true } as Parameters<BlockNoteEditor["toggleStyles"]>[0]);
  if (range && range.from < range.to) {
    editor._tiptapEditor.commands.setTextSelection({ from: selection.from, to: selection.to });
  }
}

function toggleWholeBlockColor(editor: BlockNoteEditor, blockId: string, kind: Exclude<PaletteKind, "emoji">, color: string | null) {
  const block = editor.getBlock(blockId);
  if (!block) return;
  const selection = editor.prosemirrorState.selection;
  const range = blockTextRange(editor, blockId);
  if (range && range.from < range.to) {
    editor._tiptapEditor.commands.setTextSelection(range);
  } else {
    editor.setTextCursorPosition(block, "end");
  }
  if (kind === "text") {
    if (color === null) {
      editor.removeStyles({ textColor: "" } as Parameters<BlockNoteEditor["removeStyles"]>[0]);
    } else {
      editor.addStyles({ textColor: color } as Parameters<BlockNoteEditor["addStyles"]>[0]);
    }
  } else if (color === null) {
    editor.removeStyles({ backgroundColor: "" } as Parameters<BlockNoteEditor["removeStyles"]>[0]);
  } else {
    editor.addStyles({ backgroundColor: color } as Parameters<BlockNoteEditor["addStyles"]>[0]);
  }
  if (range && range.from < range.to) {
    editor._tiptapEditor.commands.setTextSelection({ from: selection.from, to: selection.to });
  }
}

function isHeadingBlock(block: ReturnType<BlockNoteEditor["getBlock"]> | undefined, level: 1 | 2 | 3) {
  return block?.type === "heading" && (block.props as { level?: number } | undefined)?.level === level;
}

function isActiveColor(
  kind: PaletteKind,
  color: string | null,
  activeTextColor: string | null,
  activeBackgroundColor: string | null,
) {
  if (kind === "emoji") return false;
  const active = kind === "text" ? activeTextColor : activeBackgroundColor;
  return color === null ? active === null || active === "default" : active === color;
}

/**
 * The row's collapse toggle, shown between the more button and the marker for as
 * long as the pointer is on the row — a row with nothing under it has nothing to
 * collapse and shows no button at all, which is what tells the two apart at a glance.
 */
function CollapseButton({ store, nodeId }: { store: TreeStore; nodeId: string }) {
  const Components = useComponentsContext()!;
  const tree = useTree(store);
  const node = tree.nodes[nodeId];

  if (!node || node.children.length === 0 || nodeId === tree.rootId) {
    return null;
  }
  const collapsed = node.props?.collapsed === true;

  return (
    <Components.SideMenu.Button
      className="bn-button outline-collapse-button"
      label={collapsed ? "展开" : "收起"}
      icon={collapsed ? <RiArrowRightSFill /> : <RiArrowDownSFill />}
      onClick={() => store.updateProps(nodeId, { collapsed: !collapsed })}
    />
  );
}

function blockProjectionSignature(tree: ReturnType<TreeStore["getSnapshot"]>) {
  return JSON.stringify(treeToBlockNote(tree));
}

/**
 * A shortcut that moved, copied or deleted a row leaves the caret nowhere: the whole
 * document has just been replaced. The row the change asked to keep the caret on is
 * given it back, at the end of its text, so the next keystroke carries on from there.
 */
function restoreCaret(editor: BlockNoteEditor, pending: { current: string | null }) {
  const nodeId = pending.current;
  pending.current = null;
  if (!nodeId || !editor.getBlock(nodeId)) return;
  try {
    editor.setTextCursorPosition(nodeId, "end");
    editor.focus();
  } catch {
    // Tables and pictures hold no caret of their own.
  }
}

function selectBlockContent(
  editor: BlockNoteEditor,
  blockId: string,
  textSelection: MindMapTextSelection | null,
) {
  try {
    editor.setTextCursorPosition(blockId, "start");
    const from = editor.prosemirrorState.selection.from;
    editor.setTextCursorPosition(blockId, "end");
    const to = editor.prosemirrorState.selection.from;

    if (from === to) {
      return;
    }
    const range = resolveMindMapTextRange(blockId, { from, to }, textSelection);
    editor._tiptapEditor.commands.setTextSelection({
      from: range.from,
      to: range.to,
    });
  } catch {
    // File and table blocks do not expose inline text selections.
  }
}
