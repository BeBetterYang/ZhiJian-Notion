import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { BlockNoteEditor } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  FormattingToolbarController,
  AddBlockButton,
  DragHandleButton,
  SideMenu,
  SideMenuController,
  useComponentsContext,
  useCreateBlockNote,
  useBlockNoteEditor,
  useExtensionState,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiArrowDownSFill, RiArrowRightSFill } from "react-icons/ri";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { blockNoteToTree, treeToBlockNote } from "./blockNoteAdapter";
import { ZhiJianSlashMenu } from "./ZhiJianSlashMenu";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import type { MindMapTextSelection } from "../mindmap/MindMapEditor";
import { resolveMindMapTextRange } from "./mindMapTextSelection";
import { insertImageBlocks } from "../shared/attachmentInsertion";
import { saveImageAsset } from "../shared/imageAssetStore";
import { zhijianDictionary } from "../shared/zhijianDictionary";
import { claimCaretBesideText, correctCaretAfterClick } from "../shared/caretAtPoint";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";
import { handleOutlineNodeKeyDown } from "./outlineNodeKeymap";
import { collapsedOutlineCss } from "./outlineCollapse";
import { zoomedOutlineCss } from "./outlineZoom";
import { LinkDialog } from "../shared/LinkDialog";
import { applyLink, handleShortcutKeyDown } from "../shared/shortcuts";

interface OutlineEditorProps {
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
}

export function OutlineEditor({
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
  const [linkText, setLinkText] = useState<string | null>(null);
  const searchVisibilityCss = useMemo(() => outlineSearchVisibilityCss(tree, visibleNodeIds, searchQuery), [searchQuery, tree, visibleNodeIds]);
  const activeSearchCss = useMemo(() => outlineActiveSearchCss(activeSearchNodeId), [activeSearchNodeId]);
  const zoomCss = useMemo(() => zoomedOutlineCss(tree, zoomedNodeId), [tree, zoomedNodeId]);
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
      <FormattingToolbarController formattingToolbar={() => <ZhiJianFormattingToolbar />} />
      <SideMenuController sideMenu={RootProtectedSideMenu} />
      <ZhiJianSlashMenu />
      {showMindMapToolbar && mindMapToolbarTarget
        ? createPortal(
            <ZhiJianFormattingToolbar onInsertQuote={onMindMapInsertQuote} />,
            mindMapToolbarTarget,
          )
        : null}
    </BlockNoteView>
  );

  return (
    <section
      ref={panelRef}
      className="outline-panel"
      // A node's row is as wide as the outline while its text is only as wide as
      // itself, so clicking the empty part of a row is a click on the row and on no
      // character — which the browser answers with the start of the line. Pressed
      // level with the text, past its end, the caret belongs at the end.
      //
      // Claimed on the press, so the caret is never drawn at the start first: the
      // browser's placement is the default action of this event, and preventing it
      // is the only way to keep it from flashing there. Only a plain single press
      // straight on a row's own text box is taken — a modified or repeated press
      // means selection, and a press on a checkbox or a picture means that widget.
      onMouseDownCapture={(event) => {
        if (event.button !== 0 || event.detail > 1) return;
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
        const target = event.target as Element;
        if (!target.matches(".bn-block-content, .bn-inline-content")) return;
        if (claimCaretBesideText(editor, { x: event.clientX, y: event.clientY })) {
          event.preventDefault();
        }
      }}
      // Anything the press could not claim — a drag that ended where it started, a
      // widget's own row — still gets the position it meant once the browser is done.
      onClick={(event) => {
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
        handleOutlineNodeKeyDown(event.nativeEvent, editor);
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
      <OutlineStoreContext.Provider value={store}>{editorView}</OutlineStoreContext.Provider>
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
const OutlineStoreContext = createContext<TreeStore | null>(null);

function RootProtectedSideMenu() {
  const editor = useBlockNoteEditor();
  const store = useContext(OutlineStoreContext);
  const state = useExtensionState(SideMenuExtension, {
    selector: (extensionState) => extensionState?.block,
  });

  // The root is a fixed document title. Child blocks keep the standard
  // BlockNote add/drag controls.
  if (state?.id && state.id === editor.document[0]?.id) {
    return null;
  }

  return (
    <SideMenu>
      <AddBlockButton />
      {store && state?.id ? <CollapseButton store={store} nodeId={state.id} /> : null}
      <DragHandleButton />
    </SideMenu>
  );
}

/**
 * The row's collapse toggle, shown between the add button and the marker for as long
 * as the pointer is on the row — a row with nothing under it has nothing to collapse
 * and shows no button at all, which is what tells the two apart at a glance.
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
