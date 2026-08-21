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

interface MindMapNodeContentBlockProps {
  node: ZhiJianNode;
  store: TreeStore;
  selected: boolean;
  toolbarTarget: HTMLElement | null;
  onSelect: (nodeId: string) => void;
  focusRequest: { nodeId: string; requestId: number } | null;
  onFocusRequestHandled: (requestId: number) => void;
}

export function MindMapNodeContentBlock({
  node,
  store,
  selected,
  toolbarTarget,
  onSelect,
  focusRequest,
  onFocusRequestHandled,
}: MindMapNodeContentBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const applyingExternalChange = useRef(false);
  const focusPrimaryAfterBlockDelete = useRef(false);
  const nodeTree = useMemo(() => singleNodeTree(node), [node]);
  const projectedBlocks = useMemo(() => treeToBlockNote(nodeTree), [nodeTree]);
  const editor = useCreateBlockNote(
    { initialContent: projectedBlocks, dictionary: zhijianDictionary, uploadFile: async (file) => (await saveImageAsset(file)).url },
    [node.id],
  );
  const blockIds = useMemo(() => [node.id, ...(node.blocks ?? []).map((block) => block.id)], [node]);

  useEffect(() => {
    editor.isEditable = selected;
  }, [editor, selected]);

  useEffect(() => {
    if (!focusRequest || !blockIds.includes(focusRequest.nodeId)) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        editor.setTextCursorPosition(focusRequest.nodeId, "start");
        editor.focus();
        onFocusRequestHandled(focusRequest.requestId);
      } catch {
        // The requested block can disappear during the same edit transaction.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [blockIds, editor, focusRequest, onFocusRequestHandled]);

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
    if (!next || JSON.stringify(next.content) === JSON.stringify(node.content) && JSON.stringify(next.blocks ?? []) === JSON.stringify(node.blocks ?? [])) return;
    applyingExternalChange.current = true;
    editor.replaceBlocks(editor.document, projectedBlocks);
    window.setTimeout(() => {
      applyingExternalChange.current = false;
    }, 0);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (handleTreeHistoryKeyDown(event, store)) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const selection = editor._tiptapEditor.state.selection;
      if (!selection.empty) return;
      const block = editor.getTextCursorPosition().block;
      if (!blockIds.includes(block.id)) return;
      const atStart = selection.$from.parentOffset === 0;
      const atEnd = selection.$from.parentOffset === selection.$from.parent.content.size;
      const blockType = node.blocks?.find((item) => item.id === block.id)?.type;
      if (event.key === "Backspace" && atStart && atEnd && blockType === "quote") {
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
    return () => {
      container.removeEventListener("pointerdown", placeCursor);
      container.removeEventListener("mousedown", stopMindMapPointerHandling);
      container.removeEventListener("dblclick", onDoubleClick);
      container.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("keydown", stopMindMapPointerHandling);
    };
  }, [blockIds, editor, node, onSelect, selected, store]);

  return (
    <div ref={containerRef} className="mindmap-node-content-editor">
      <BlockNoteView
        editor={editor}
        theme="light"
        sideMenu={false}
        slashMenu={false}
        formattingToolbar={false}
        onChange={() => {
          if (applyingExternalChange.current) return;
          const parsed = blockNoteToTree(editor.document, nodeTree);
          const updated = parsed?.nodes[node.id];
          if (!updated) return;
          if (JSON.stringify(updated.content) !== JSON.stringify(node.content) || JSON.stringify(updated.blocks ?? []) !== JSON.stringify(node.blocks ?? [])) {
            store.updateNodeDocument(node.id, updated.content, updated.blocks ?? []);
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
