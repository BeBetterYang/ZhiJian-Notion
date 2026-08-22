import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { blockNoteToTree, treeToBlockNote } from "../outline/blockNoteAdapter";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";
import { saveImageAsset } from "../shared/imageAssetStore";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import { zhijianDictionary } from "../shared/zhijianDictionary";
import { resolveMindMapFocusBlockId } from "./mindMapInteraction";

interface MindMapNodeContentProps {
  node: ZhiJianNode;
  store: TreeStore;
  selected: boolean;
  editing: boolean;
  toolbarTarget: HTMLElement | null;
  onSelect: (nodeId: string) => void;
  onFinishEdit: () => void;
  focusBlockId?: string;
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
  toolbarTarget,
  onSelect,
  focusRequest,
  onFocusRequestHandled,
}: MindMapNodeContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingExternalSignature = useRef<string | null>(null);
  const composing = useRef(false);
  const deferredExternalApply = useRef<(() => void) | null>(null);
  const focusPrimaryAfterBlockDelete = useRef(false);
  const nodeTree = useMemo(() => singleNodeTree(node), [node]);
  const projectedBlocks = useMemo(() => treeToBlockNote(nodeTree), [nodeTree]);
  const editor = useCreateBlockNote(
    { initialContent: projectedBlocks, dictionary: zhijianDictionary, uploadFile: async (file) => (await saveImageAsset(file)).url },
    [node.id],
  );
  const blockIdSignature = [node.id, ...(node.description ? [`${node.id}::description`] : []), ...(node.blocks ?? []).map((block) => block.id)].join("\u0000");
  const blockIds = useMemo(() => blockIdSignature.split("\u0000"), [blockIdSignature]);

  useEffect(() => {
    editor.isEditable = true;
  }, [editor]);

  useEffect(() => {
    const requestedBlockId = resolveMindMapFocusBlockId(
      node.id,
      blockIds,
      focusBlockId ?? (focusRequest?.nodeId === node.id ? focusRequest.focusBlockId : undefined),
    );
    const frame = window.requestAnimationFrame(() => {
      try {
        editor.setTextCursorPosition(requestedBlockId, "start");
        editor.focus();
        if (focusRequest?.nodeId === node.id) onFocusRequestHandled(focusRequest.requestId);
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
  }, [blockIds, editor, focusBlockId, focusRequest, node.id, onFocusRequestHandled]);

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
    return editor.onSelectionChange(() => onSelect(node.id));
  }, [editor, node.id, onSelect]);

  useEffect(() => {
    const current = blockNoteToTree(editor.document, nodeTree);
    const next = current?.nodes[node.id];
    const nextSignature = nodeDocumentSignature(node);
    if (!next || nodeDocumentSignature(next) === nextSignature) return;
    const applyProjection = () => {
      pendingExternalSignature.current = nextSignature;
      editor.replaceBlocks(editor.document, projectedBlocks);
    };
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
      const position = editor._tiptapEditor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (position) editor._tiptapEditor.commands.setTextSelection(position.pos);
      else editor.setTextCursorPosition(blockId, "end");
      editor.focus();
      event.stopPropagation();
    };
    const onDoubleClick = (event: MouseEvent) => {
      placeCursor(event as PointerEvent, true);
      event.preventDefault();
    };
    const stopMindMapPointerHandling = (event: Event) => event.stopPropagation();
    const onCompositionStart = () => {
      composing.current = true;
    };
    const onCompositionEnd = () => {
      composing.current = false;
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
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const selection = editor._tiptapEditor.state.selection;
      if (!selection.empty) return;
      const block = editor.getTextCursorPosition().block;
      if (!blockIds.includes(block.id)) return;
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
    container.addEventListener("mousedown", stopMindMapPointerHandling);
    container.addEventListener("dblclick", onDoubleClick);
    container.addEventListener("keydown", onKeyDown, true);
    container.addEventListener("keydown", stopMindMapPointerHandling);
    container.addEventListener("compositionstart", onCompositionStart, true);
    container.addEventListener("compositionend", onCompositionEnd, true);
    return () => {
      container.removeEventListener("pointerdown", placeCursor);
      container.removeEventListener("mousedown", stopMindMapPointerHandling);
      container.removeEventListener("dblclick", onDoubleClick);
      container.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("keydown", stopMindMapPointerHandling);
      container.removeEventListener("compositionstart", onCompositionStart, true);
      container.removeEventListener("compositionend", onCompositionEnd, true);
    };
  }, [blockIds, editor, node, onFinishEdit, onSelect, selected, store]);

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
          const updatedSignature = nodeDocumentSignature(updated);
          if (pendingExternalSignature.current) {
            if (updatedSignature === pendingExternalSignature.current) pendingExternalSignature.current = null;
            return;
          }
          if (updatedSignature !== nodeDocumentSignature(node)) {
            store.updateNodeDocument(
              node.id,
              updated.content,
              updated.blocks ?? [],
              updated.description,
            );
          }
        }}
      >
        {selected && toolbarTarget ? createPortal(<ZhiJianFormattingToolbar />, toolbarTarget) : null}
      </BlockNoteView>
    </div>
  );
}

function singleNodeTree(node: ZhiJianNode): ZhiJianTree {
  return { rootId: node.id, nodes: { [node.id]: { ...node, children: [] } } };
}

function nodeDocumentSignature(node: ZhiJianNode) {
  return JSON.stringify({
    content: node.content,
    description: node.description ?? null,
    blocks: node.blocks ?? [],
  });
}
