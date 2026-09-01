import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { blockNoteToTree, treeToBlockNote } from "../outline/blockNoteAdapter";
import { insertImageBlocks } from "../shared/attachmentInsertion";
import { correctCaretAfterClick, placeCaretAtPoint, placeCaretInTableCell } from "../shared/caretAtPoint";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";
import { saveImageAsset } from "../shared/imageAssetStore";
import { LinkDialog } from "../shared/LinkDialog";
import {
  applyLink,
  blockTextRange,
  handleShortcutKeyDown,
} from "../shared/shortcuts";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import { zhijianDictionary } from "../shared/zhijianDictionary";
import type { MindMapTextSelection } from "./MindMapEditor";
import { bindMindMapImageResize } from "./mindMapImageResize";
import { nodeDocumentSignature, nodeTextSelectionOffsets, resolveMindMapFocusBlockId, suppressMindMapEnter } from "./mindMapInteraction";

interface MindMapNodeContentProps {
  node: ZhiJianNode;
  store: TreeStore;
  selected: boolean;
  editing: boolean;
  toolbarTarget: HTMLElement | null;
  onSelect: (nodeId: string) => void;
  /**
   * Which node a shortcut asks to leave selected — the sibling left behind by a
   * deletion, the copy a duplicate made. Selecting it also ends this edit, because
   * the node it was for is no longer the selected one.
   */
  onFocusNode: (nodeId: string) => void;
  onFinishEdit: () => void;
  /**
   * Whether this node's own editor is showing the toolbar in the shared host, so
   * the outline's bridge can stand down for as long as it is. See `ownsToolbar`.
   */
  onToolbarActiveChange: (active: boolean) => void;
  /**
   * Which run of the node's own text is selected, for the toolbar the outline
   * bridge shows — that toolbar has no sight of this editor's selection and would
   * otherwise format the whole node. See `nodeTextSelectionOffsets`.
   */
  onTextSelectionChange: (selection: MindMapTextSelection | null) => void;
  focusBlockId?: string;
  focusPoint?: { x: number; y: number };
  focusTableCell?: { row: number; column: number };
  onGeometryChange: (nodeId: string) => void;
  focusRequest: { nodeId: string; focusBlockId: string; requestId: number } | null;
  onFocusRequestHandled: (requestId: number) => void;
}

export function MindMapNodeContent(props: MindMapNodeContentProps) {
  return props.editing ? <MindMapNodeEditor {...props} /> : null;
}

/**
 * How many frames a cell-targeted caret waits for the editor to hold the table it
 * was aimed at. A few frames covers the projection and its first layout without
 * ever being long enough to be seen.
 */
const FOCUS_TABLE_ATTEMPTS = 5;

function MindMapNodeEditor({
  node,
  store,
  selected,
  onFinishEdit,
  focusBlockId,
  focusPoint,
  focusTableCell,
  onGeometryChange,
  toolbarTarget,
  onSelect,
  onFocusNode,
  onToolbarActiveChange,
  onTextSelectionChange,
  focusRequest,
  onFocusRequestHandled,
}: MindMapNodeContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const deferredExternalApply = useRef<(() => void) | null>(null);
  const focusPrimaryAfterBlockDelete = useRef(false);
  const appliedFocusIntent = useRef<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [linkText, setLinkText] = useState<string | null>(null);
  const nodeTree = useMemo(() => singleNodeTree(node), [node]);
  const projectedBlocks = useMemo(() => treeToBlockNote(nodeTree), [nodeTree]);
  const editor = useCreateBlockNote(
    {
      initialContent: projectedBlocks,
      dictionary: zhijianDictionary,
      uploadFile: async (file) => (await saveImageAsset(file)).url,
      // Same table features the outline enables — a table edited here is the same
      // table, and its cell colour controls come from this config rather than from
      // our own toolbar.
      tables: { headers: true, cellBackgroundColor: true, cellTextColor: true },
    },
    [node.id],
  );
  const blockIdSignature = [node.id, ...(node.description ? [`${node.id}::description`] : []), ...(node.blocks ?? []).map((block) => block.id)].join("\u0000");
  const blockIds = useMemo(() => blockIdSignature.split("\u0000"), [blockIdSignature]);

  useEffect(() => {
    editor.isEditable = true;
  }, [editor]);

  /**
   * Who fills the shared toolbar host while this node is edited.
   *
   * A node's own text is the first block of its little document, and formatting it
   * stays the outline bridge's job: only the outline can also change what the block
   * *is* — a heading, a todo — because a node's type is not part of what this editor
   * writes back (see `updateNodeDocument`). A quote or a picture hanging off the node
   * exists nowhere else, so those blocks are this editor's to format, and it takes
   * the host over for as long as the caret sits in one.
   *
   * A table is this editor's too, even though the table is the node's first block:
   * the run being styled is inside one cell, and the bridge has no way to select a
   * cell — it counts characters in the node's own text, of which a table has none.
   * BlockNote's table handles stay alongside for whole-cell colours.
   */
  const ownsToolbar =
    selected &&
    Boolean(toolbarTarget) &&
    activeBlockId !== null &&
    (node.type === "table" || activeBlockId !== node.id);

  useEffect(() => {
    onToolbarActiveChange(ownsToolbar);
    // Ending the edit unmounts this editor, and a host it was filling has to be
    // handed back rather than left looking occupied.
    return () => onToolbarActiveChange(false);
  }, [onToolbarActiveChange, ownsToolbar]);

  useEffect(() => {
    const activeRequest = focusRequest?.nodeId === node.id ? focusRequest : null;
    // Focusing is driven by intent, not by every render. This effect also re-runs
    // when the block list changes — deleting a quote, say — and refocusing then
    // would yank the caret away from wherever the user is actually typing, back
    // to the coordinates of the click that opened the editor in the first place.
    const intent = [activeRequest?.requestId ?? "", focusBlockId ?? "", focusPoint ? `${focusPoint.x},${focusPoint.y}` : "", focusTableCell ? `${focusTableCell.row},${focusTableCell.column}` : ""].join("|");
    if (appliedFocusIntent.current === intent) return;
    const requestedBlockId = resolveMindMapFocusBlockId(
      node.id,
      blockIds,
      focusBlockId ?? activeRequest?.focusBlockId,
    );
    let frame = 0;
    const place = (attempt: number) => {
      // Latched here rather than above, because the cleanup below can cancel this
      // frame before it ever runs. Selecting the node re-renders the app, which
      // hands this component a fresh `onFocusRequestHandled` and re-runs the
      // effect — latching early left the intent marked as done and the caret
      // never placed at all.
      appliedFocusIntent.current = intent;
      try {
        // A click or a double click already told us where the caret belongs — in
        // the body text or inside a quote — and the editor did not exist yet when
        // that event fired, so the coordinates are resolved here rather than at the
        // event. Every other entry arrives without coordinates: Enter on a selected
        // node, and an external request that names a block but no position within
        // it. Those land at the end of the target block, which is also where a
        // click falls back to when its coordinates resolve to nothing — appending
        // is what the user is about to do in all three cases.
        const placedInTable = placeCaretInTableCell(editor, focusTableCell);
        // A table the editor has not projected yet is worth waiting a frame for: the
        // block's own "end" is its *last cell*, so giving up here would put the caret
        // in the one place the click cannot have meant.
        if (!placedInTable && focusTableCell && attempt < FOCUS_TABLE_ATTEMPTS) {
          frame = window.requestAnimationFrame(() => place(attempt + 1));
          return;
        }
        if (!placedInTable && !placeCaretAtPoint(editor, focusPoint)) {
          // A table's own "end" is its *last* cell — the one place a click on it
          // cannot have meant — so a table falls back to its first cell instead.
          const table = editor.getBlock(requestedBlockId)?.type === "table";
          editor.setTextCursorPosition(requestedBlockId, table ? "start" : "end");
        }
        // A cell-targeted placement has already focused the editor, and focusing it
        // again through BlockNote would ask it to derive a second caret position over
        // the exact one just set — over a table that lands in its last cell.
        if (!placedInTable) editor.focus();
        if (activeRequest) onFocusRequestHandled(activeRequest.requestId);
      } catch {
        try {
          editor.setTextCursorPosition(node.id, "end");
          editor.focus();
        } catch {
          // The requested block can disappear during the same edit transaction.
        }
      }
    };
    frame = window.requestAnimationFrame(() => place(0));
    return () => window.cancelAnimationFrame(frame);
  }, [blockIds, editor, focusBlockId, focusPoint, focusRequest, focusTableCell, node.id, onFocusRequestHandled]);

  useEffect(() => {
    if (!focusPrimaryAfterBlockDelete.current) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        editor.isEditable = true;
        editor.setTextCursorPosition(node.id, "end");
        editor.focus();
        focusPrimaryAfterBlockDelete.current = false;
      } catch {
        // The editor may still be applying the block projection.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editor, node, node.blocks]);

  useEffect(() => {
    const report = () => {
      let block: string | null = null;
      try {
        block = editor.getSelection()?.blocks[0]?.id ?? editor.getTextCursorPosition().block.id;
      } catch {
        // A block selection — a picture, say — exposes no text cursor.
      }
      setActiveBlockId(block);
      const offsets = nodeTextSelectionOffsets(
        editor.prosemirrorState.selection,
        blockTextRange(editor, node.id),
      );
      // After `onSelect`, which clears the range for the node it selects: the two
      // land in one React commit, so the range has to be the later of the two.
      onTextSelectionChange(offsets ? { nodeId: node.id, ...offsets } : null);
    };
    const unsubscribe = editor.onSelectionChange(() => {
      onSelect(node.id);
      report();
    });
    return () => {
      unsubscribe();
      // The edit is over and the node is selected as a whole again, which is what a
      // toolbar press should act on — a range nobody can see any more is not.
      onTextSelectionChange(null);
    };
  }, [editor, node.id, onSelect, onTextSelectionChange]);

  useEffect(() => {
    const current = blockNoteToTree(editor.document, nodeTree);
    const next = current?.nodes[node.id];
    if (!next || nodeDocumentSignature(next) === nodeDocumentSignature(node)) return;
    const applyProjection = () => reprojectKeepingSelection(editor, projectedBlocks);
    if (composing.current) deferredExternalApply.current = applyProjection;
    else applyProjection();
  }, [editor, node, nodeTree, projectedBlocks]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const blockIdAtEvent = (event: Event) => {
      const id = (event.target as Element | null)?.closest<HTMLElement>("[data-id]")?.dataset.id;
      return id && blockIds.includes(id) ? id : node.id;
    };
    const placeCursor = (event: PointerEvent, forceEdit = false) => {
      if (event.button !== 0 || !(event.target as Element | null)?.closest(".ProseMirror")) return;
      if (!selected && !forceEdit) {
        event.preventDefault();
        onSelect(node.id);
        event.stopPropagation();
        return;
      }
      const blockId = blockIdAtEvent(event);
      if (forceEdit) {
        editor.isEditable = true;
        onSelect(node.id);
      }
      if (!placeCaretAtPoint(editor, { x: event.clientX, y: event.clientY })) {
        try {
          editor.setTextCursorPosition(blockId, "end");
        } catch {
          // An image block exposes no text cursor. Its own selection stands, and
          // the point is to still reach the `stopPropagation` below: letting the
          // event escape hands it to mind-elixir, which would end the edit.
        }
      }
      editor.focus();
      event.stopPropagation();
    };
    // The caret the click asked for, once the browser has stopped moving it — see
    // `correctCaretAfterClick`. `placeCursor` above still runs first, because it is
    // the pointerdown that owns entering the edit and keeping the event away from
    // mind-elixir; this only has the last word on where the caret ends up.
    const correctCursor = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target as Element | null)?.closest(".ProseMirror")) return;
      correctCaretAfterClick(editor, { x: event.clientX, y: event.clientY });
    };
    const stopMindMapPointerHandling = (event: Event) => event.stopPropagation();
    const onCompositionStart = () => {
      composing.current = true;
      // One character typed through an IME arrives as a change per pinyin letter,
      // and undo stepped back through each of them. The composition delimits the
      // changes that make up the character, so the store keeps them as one step.
      store.beginHistoryCoalescing();
    };
    const onCompositionEnd = () => {
      composing.current = false;
      store.endHistoryCoalescing();
      const apply = deferredExternalApply.current;
      deferredExternalApply.current = null;
      apply?.();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onFinishEdit();
        return;
      }
      if (handleTreeHistoryKeyDown(event, store)) return;
      // The same shortcut table the outline reads. This editor holds one node, so a
      // structural shortcut acts on that node and a text one on the block the caret
      // is in — including a quote or a picture, which exist only here.
      if (handleShortcutKeyDown(event, {
        store,
        editor,
        // The root node is the document title: no heading level, no colour, no deletion.
        protectedBlockId: node.parentId === null ? node.id : null,
        onFocusNode,
        onRequestLink: setLinkText,
        onRequestImage: () => imageInputRef.current?.click(),
      })) return;
      if (event.key !== "Backspace" && event.key !== "Delete" && event.key !== "Enter") return;
      const selection = editor._tiptapEditor.state.selection;
      let block: ReturnType<typeof editor.getTextCursorPosition>["block"];
      try {
        block = editor.getTextCursorPosition().block;
      } catch {
        // A selected image is a block selection, which exposes no text cursor.
        return;
      }
      if (!blockIds.includes(block.id)) return;
      if (event.key === "Enter") {
        if (suppressMindMapEnter({ nodeId: node.id, blockId: block.id, blockType: block.type, shiftKey: event.shiftKey })) {
          event.preventDefault();
          event.stopPropagation();
          // Enter ends the edit and leaves the node selected. The next Enter is
          // then the one that adds the following node, and Tab the one that adds a
          // child — both answered on the canvas, where a selected node lives.
          onFinishEdit();
        }
        return;
      }
      if (!selection.empty) return;
      const atStart = selection.$from.parentOffset === 0;
      const atEnd = selection.$from.parentOffset === selection.$from.parent.content.size;
      const blockType = node.blocks?.find((item) => item.id === block.id)?.type;
      const isDescription = block.id === `${node.id}::description`;
      if (event.key === "Backspace" && atStart && atEnd && (blockType === "quote" || isDescription)) {
        event.preventDefault();
        event.stopPropagation();
        focusPrimaryAfterBlockDelete.current = true;
        editor.removeBlocks([block.id]);
        return;
      }
      if ((event.key === "Backspace" && atStart) || (event.key === "Delete" && atEnd)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    container.addEventListener("pointerdown", placeCursor);
    container.addEventListener("click", correctCursor);
    container.addEventListener("mousedown", stopMindMapPointerHandling);
    container.addEventListener("dblclick", stopMindMapPointerHandling);
    container.addEventListener("keydown", onKeyDown, true);
    container.addEventListener("keydown", stopMindMapPointerHandling);
    container.addEventListener("compositionstart", onCompositionStart, true);
    container.addEventListener("compositionend", onCompositionEnd, true);
    return () => {
      container.removeEventListener("pointerdown", placeCursor);
      container.removeEventListener("click", correctCursor);
      container.removeEventListener("mousedown", stopMindMapPointerHandling);
      container.removeEventListener("dblclick", stopMindMapPointerHandling);
      container.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("keydown", stopMindMapPointerHandling);
      container.removeEventListener("compositionstart", onCompositionStart, true);
      container.removeEventListener("compositionend", onCompositionEnd, true);
    };
  }, [blockIds, editor, node, onFinishEdit, onFocusNode, onSelect, selected, store]);

  // 图片的缩放手柄在收缩到内容的编辑器里会失效，节点框也不会跟着图片走。
  // 见 `bindMindMapImageResize`。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return bindMindMapImageResize(container, () => onGeometryChange(node.id));
  }, [node.id, onGeometryChange]);

  return (
    <div ref={containerRef} className={`mindmap-node-editor ${node.parentId === null ? "is-root" : ""}`}>
      <BlockNoteView
        editor={editor}
        theme="light"
        sideMenu={false}
        slashMenu={false}
        formattingToolbar={false}
        onChange={() => {
          const parsed = blockNoteToTree(editor.document, nodeTree);
          const updated = parsed?.nodes[node.id];
          if (!updated) return;
          // The signature is projection-stable, so a programmatic reprojection
          // compares equal to the store node and needs no separate latch. An
          // "ignore the next change" flag was the previous guard here, and a
          // single asymmetric round trip could wedge it and silently swallow
          // every later edit.
          if (nodeDocumentSignature(updated) === nodeDocumentSignature(node)) return;
          store.updateNodeDocument(
            node.id,
            updated.content,
            updated.blocks ?? [],
            updated.description,
            // `blockNoteToTree` only fills `props.table` for table nodes, and it
            // is the only place a table's cells come back from the editor.
            updated.props?.table,
          );
          if (node.type === "table" || node.blocks?.some((block) => block.type === "image")) {
            onGeometryChange(node.id);
          }
        }}
      >
        {ownsToolbar && toolbarTarget
          ? createPortal(
            // A table node has no text row of its own to hang a quote or a picture
            // off, and the caret is inside a cell: the insert buttons would act on
            // the table block from within it. The styling controls are the point.
            <ZhiJianFormattingToolbar showStructuralControls={node.type !== "table"} showClozeControl />,
            toolbarTarget,
          )
          : null}
      </BlockNoteView>
      {/* 添加图片 (Alt Enter): the picker only opens from a real click on an input. */}
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
          await insertImageBlocks(editor, node.id, files, saveImageAsset);
        }}
      />
      {/* To the body, not into the node: the map draws itself inside a transformed
          container, and a fixed overlay within one is positioned against that
          container rather than the window — it would land wherever the node is. */}
      {linkText === null
        ? null
        : createPortal(
          <LinkDialog
            initialText={linkText}
            onCancel={() => setLinkText(null)}
            onConfirm={(url, text) => {
              setLinkText(null);
              applyLink(editor, url, text);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

function singleNodeTree(node: ZhiJianNode): ZhiJianTree {
  return { rootId: node.id, nodes: { [node.id]: { ...node, children: [] } } };
}

/**
 * Reprojects the node's document without dropping the range the user is working on.
 *
 * Every block is replaced, which collapses the selection — and the change that most
 * often arrives from outside is the bridged toolbar painting this node's text, where
 * the next press is usually a second style over the same run. Styling moves no text,
 * so the positions still name the same characters; a projection that did change the
 * length fails the bounds check and leaves BlockNote's own placement alone.
 */
function reprojectKeepingSelection(editor: BlockNoteEditor, blocks: PartialBlock[]) {
  const { from, to } = editor.prosemirrorState.selection;
  editor.replaceBlocks(editor.document, blocks);
  if (to < editor.prosemirrorState.doc.content.size) {
    editor._tiptapEditor.commands.setTextSelection({ from, to });
  }
}
