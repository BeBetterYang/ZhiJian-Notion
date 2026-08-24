import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { blockNoteToTree, treeToBlockNote } from "../outline/blockNoteAdapter";
import { insertImageBlocks } from "../shared/attachmentInsertion";
import { correctCaretAfterClick, placeCaretAtPoint } from "../shared/caretAtPoint";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";
import { saveImageAsset } from "../shared/imageAssetStore";
import { LinkDialog } from "../shared/LinkDialog";
import { applyLink, handleShortcutKeyDown } from "../shared/shortcuts";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import { zhijianDictionary } from "../shared/zhijianDictionary";
import { nodeDocumentSignature, resolveMindMapFocusBlockId, suppressMindMapEnter } from "./mindMapInteraction";

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
  focusBlockId?: string;
  focusPoint?: { x: number; y: number };
  focusRequest: { nodeId: string; focusBlockId: string; requestId: number } | null;
  onFocusRequestHandled: (requestId: number) => void;
}

export function MindMapNodeContent(props: MindMapNodeContentProps) {
  return props.editing ? <MindMapNodeEditor {...props} /> : null;
}

function MindMapNodeEditor({
  node,
  store,
  selected,
  onFinishEdit,
  focusBlockId,
  focusPoint,
  toolbarTarget,
  onSelect,
  onFocusNode,
  onToolbarActiveChange,
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
   * the host over for as long as the caret sits in one. A table node is left out
   * entirely: its cell colours come from BlockNote's own table handles.
   */
  const ownsToolbar =
    selected &&
    Boolean(toolbarTarget) &&
    node.type !== "table" &&
    activeBlockId !== null &&
    activeBlockId !== node.id;

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
    const intent = [activeRequest?.requestId ?? "", focusBlockId ?? "", focusPoint ? `${focusPoint.x},${focusPoint.y}` : ""].join("|");
    if (appliedFocusIntent.current === intent) return;
    const requestedBlockId = resolveMindMapFocusBlockId(
      node.id,
      blockIds,
      focusBlockId ?? activeRequest?.focusBlockId,
    );
    const frame = window.requestAnimationFrame(() => {
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
        if (!placeCaretAtPoint(editor, focusPoint)) {
          editor.setTextCursorPosition(requestedBlockId, "end");
        }
        editor.focus();
        if (activeRequest) onFocusRequestHandled(activeRequest.requestId);
      } catch {
        try {
          editor.setTextCursorPosition(node.id, "end");
          editor.focus();
        } catch {
          // The requested block can disappear during the same edit transaction.
        }
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [blockIds, editor, focusBlockId, focusPoint, focusRequest, node.id, onFocusRequestHandled]);

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
    return editor.onSelectionChange(() => {
      onSelect(node.id);
      let block: string | null = null;
      try {
        block = editor.getSelection()?.blocks[0]?.id ?? editor.getTextCursorPosition().block.id;
      } catch {
        // A block selection — a picture, say — exposes no text cursor.
      }
      setActiveBlockId(block);
    });
  }, [editor, node.id, onSelect]);

  useEffect(() => {
    const current = blockNoteToTree(editor.document, nodeTree);
    const next = current?.nodes[node.id];
    if (!next || nodeDocumentSignature(next) === nodeDocumentSignature(node)) return;
    const applyProjection = () => editor.replaceBlocks(editor.document, projectedBlocks);
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
    const onDoubleClick = (event: MouseEvent) => {
      placeCursor(event as PointerEvent, true);
      event.preventDefault();
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
    container.addEventListener("dblclick", onDoubleClick);
    container.addEventListener("keydown", onKeyDown, true);
    container.addEventListener("keydown", stopMindMapPointerHandling);
    container.addEventListener("compositionstart", onCompositionStart, true);
    container.addEventListener("compositionend", onCompositionEnd, true);
    return () => {
      container.removeEventListener("pointerdown", placeCursor);
      container.removeEventListener("click", correctCursor);
      container.removeEventListener("mousedown", stopMindMapPointerHandling);
      container.removeEventListener("dblclick", onDoubleClick);
      container.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("keydown", stopMindMapPointerHandling);
      container.removeEventListener("compositionstart", onCompositionStart, true);
      container.removeEventListener("compositionend", onCompositionEnd, true);
    };
  }, [blockIds, editor, node, onFinishEdit, onFocusNode, onSelect, selected, store]);

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
        }}
      >
        {ownsToolbar && toolbarTarget ? createPortal(<ZhiJianFormattingToolbar />, toolbarTarget) : null}
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
