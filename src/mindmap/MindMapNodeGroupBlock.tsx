import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { blockNoteToTree, treeToBlockNote } from "../outline/blockNoteAdapter";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import { zhijianDictionary } from "../shared/zhijianDictionary";
import { MindMapMediaBlock } from "./MindMapMediaBlock";

interface MindMapNodeGroupBlockProps {
  primary: ZhiJianNode;
  quote?: ZhiJianNode;
  images: ZhiJianNode[];
  store: TreeStore;
  selectedNodeId: string | null;
  toolbarTarget: HTMLElement | null;
  onSelect: (nodeId: string) => void;
  focusRequest: { nodeId: string; requestId: number } | null;
  onFocusRequestHandled: (requestId: number) => void;
  onDeleteEmptyQuote: (primaryId: string, quoteId: string, groupRemains: boolean) => void;
}

export function MindMapNodeGroupBlock({
  primary,
  quote,
  images,
  store,
  selectedNodeId,
  toolbarTarget,
  onSelect,
  focusRequest,
  onFocusRequestHandled,
  onDeleteEmptyQuote,
}: MindMapNodeGroupBlockProps) {
  const textNodes = useMemo(
    () => [primary.type === "image" ? null : primary, quote].filter(Boolean) as ZhiJianNode[],
    [primary, quote],
  );

  return (
    <div className="mindmap-node-group">
      {textNodes.length > 0 ? (
        <MindMapTextGroupEditor
          nodes={textNodes}
          store={store}
          selectedNodeId={selectedNodeId}
          toolbarTarget={toolbarTarget}
          onSelect={onSelect}
          focusRequest={focusRequest}
          onFocusRequestHandled={onFocusRequestHandled}
          groupRemainsAfterQuoteDelete={images.length > 0}
          onDeleteEmptyQuote={onDeleteEmptyQuote}
        />
      ) : null}
      {images.length > 0 ? (
        <div
          className="mindmap-image-gallery"
          style={{ gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, 8em)` }}
        >
          {images.map((image) => (
            <MindMapMediaBlock
              key={image.id}
              node={image}
              store={store}
              selected={selectedNodeId === image.id}
              toolbarTarget={toolbarTarget}
              onSelect={onSelect}
              hasGroupBody={textNodes.length > 0}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface MindMapTextGroupEditorProps {
  nodes: ZhiJianNode[];
  store: TreeStore;
  selectedNodeId: string | null;
  toolbarTarget: HTMLElement | null;
  onSelect: (nodeId: string) => void;
  focusRequest: { nodeId: string; requestId: number } | null;
  onFocusRequestHandled: (requestId: number) => void;
  groupRemainsAfterQuoteDelete: boolean;
  onDeleteEmptyQuote: (primaryId: string, quoteId: string, groupRemains: boolean) => void;
}

function MindMapTextGroupEditor({
  nodes,
  store,
  selectedNodeId,
  toolbarTarget,
  onSelect,
  focusRequest,
  onFocusRequestHandled,
  groupRemainsAfterQuoteDelete,
  onDeleteEmptyQuote,
}: MindMapTextGroupEditorProps) {
  const applyingExternalChange = useRef(false);
  const projectionVersion = useRef(0);
  const focusPrimaryAfterQuoteDelete = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const projectedBlocks = useMemo(
    () => nodes.flatMap((node) => treeToBlockNote(singleNodeTree(node))),
    [nodes],
  );
  const projectionSignature = JSON.stringify(projectedBlocks);
  const selected = Boolean(selectedNodeId && nodeIds.includes(selectedNodeId));
  const editor = useCreateBlockNote(
    {
      initialContent: projectedBlocks,
      dictionary: zhijianDictionary,
    },
    [nodeIds.join(":")],
  );

  useEffect(() => {
    editor.isEditable = selected;
  }, [editor, selected]);

  useEffect(() => {
    if (!focusPrimaryAfterQuoteDelete.current || nodes.some((node) => node.type === "quote")) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      try {
        editor.isEditable = true;
        editor.setTextCursorPosition(nodes[0].id, "end");
        containerRef.current
          ?.querySelector<HTMLElement>(".ProseMirror")
          ?.focus({ preventScroll: true });
        focusPrimaryAfterQuoteDelete.current = false;
      } catch {
        // The primary block may still be remounting after the quote was removed.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editor, nodes]);

  useEffect(() => {
    if (!focusRequest || !nodeIds.includes(focusRequest.nodeId)) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      try {
        editor.setTextCursorPosition(focusRequest.nodeId, "start");
        containerRef.current
          ?.querySelector<HTMLElement>(".ProseMirror")
          ?.focus({ preventScroll: true });
        onFocusRequestHandled(focusRequest.requestId);
      } catch {
        // The requested block may have been removed before the group mounted.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editor, focusRequest, nodeIds, onFocusRequestHandled]);

  useEffect(() => {
    return editor.onSelectionChange(() => {
      const block = editor.getSelection()?.blocks[0] ?? editor.getTextCursorPosition().block;
      if (nodeIds.includes(block.id)) {
        onSelect(block.id);
      }
    });
  }, [editor, nodeIds, onSelect]);

  useEffect(() => {
    if (currentProjectionSignature(editor.document, nodes) === projectionSignature) {
      return;
    }
    applyingExternalChange.current = true;
    const version = ++projectionVersion.current;
    editor.replaceBlocks(editor.document, projectedBlocks);
    window.setTimeout(() => {
      if (projectionVersion.current === version) {
        applyingExternalChange.current = false;
      }
    }, 0);
  }, [editor, nodes, projectedBlocks, projectionSignature]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const nodeIdAtEvent = (event: Event) => {
      const blockId = (event.target as Element | null)
        ?.closest<HTMLElement>("[data-id]")
        ?.dataset.id;
      return blockId && nodeIds.includes(blockId) ? blockId : nodes[0].id;
    };
    const selectEditorBlock = (event: Event) => {
      window.queueMicrotask(() => onSelect(nodeIdAtEvent(event)));
      event.stopPropagation();
    };
    const placeTextCursor = (event: PointerEvent, forceEdit = false) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as Element | null;
      if (!target?.closest(".ProseMirror")) {
        return;
      }
      const nodeId = nodeIdAtEvent(event);
      if (!selected && !forceEdit) {
        event.preventDefault();
        onSelect(nodeId);
        event.stopPropagation();
        return;
      }
      if (forceEdit) {
        editor.isEditable = true;
        onSelect(nodeId);
      }
      const position = editor._tiptapEditor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (position) {
        editor._tiptapEditor.commands.setTextSelection(position.pos);
      } else {
        editor.setTextCursorPosition(nodeId, "end");
      }
      editor.focus();
      event.stopPropagation();
    };
    const editOnDoubleClick = (event: MouseEvent) => {
      placeTextCursor(event as PointerEvent, true);
      event.preventDefault();
    };
    const stopMindMapPointerHandling = (event: Event) => event.stopPropagation();
    const preserveGroupBlocks = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      const selection = editor._tiptapEditor.state.selection;
      if (!selection.empty) {
        const selectedBlocks = (editor.getSelection()?.blocks ?? []).filter((block) =>
          nodeIds.includes(block.id),
        );
        if (selectedBlocks.length > 1) {
          event.preventDefault();
          event.stopPropagation();
          editor.transact(() => {
            selectedBlocks.forEach((block) => editor.updateBlock(block.id, { content: [] }));
          });
        }
        return;
      }
      const block = editor.getTextCursorPosition().block;
      if (!nodeIds.includes(block.id)) {
        return;
      }
      const atStart = selection.$from.parentOffset === 0;
      const atEnd = selection.$from.parentOffset === selection.$from.parent.content.size;
      const currentNode = nodes.find((node) => node.id === block.id);
      if (
        event.key === "Backspace" &&
        atStart &&
        atEnd &&
        currentNode?.type === "quote"
      ) {
        event.preventDefault();
        event.stopPropagation();
        focusPrimaryAfterQuoteDelete.current = groupRemainsAfterQuoteDelete;
        onSelect(nodes[0].id);
        onDeleteEmptyQuote(nodes[0].id, currentNode.id, groupRemainsAfterQuoteDelete);
        return;
      }
      if ((event.key === "Backspace" && atStart) || (event.key === "Delete" && atEnd)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    container.addEventListener("pointerdown", placeTextCursor);
    container.addEventListener("mousedown", stopMindMapPointerHandling);
    container.addEventListener("click", selectEditorBlock);
    container.addEventListener("dblclick", editOnDoubleClick);
    container.addEventListener("keydown", preserveGroupBlocks, true);
    container.addEventListener("keydown", stopMindMapPointerHandling);
    return () => {
      container.removeEventListener("pointerdown", placeTextCursor);
      container.removeEventListener("mousedown", stopMindMapPointerHandling);
      container.removeEventListener("click", selectEditorBlock);
      container.removeEventListener("dblclick", editOnDoubleClick);
      container.removeEventListener("keydown", preserveGroupBlocks, true);
      container.removeEventListener("keydown", stopMindMapPointerHandling);
    };
  }, [
    editor,
    groupRemainsAfterQuoteDelete,
    nodeIds,
    nodes,
    onDeleteEmptyQuote,
    onSelect,
    selected,
  ]);

  return (
    <div ref={containerRef} className="mindmap-text-group-editor">
      <BlockNoteView
        editor={editor}
        theme="light"
        sideMenu={false}
        slashMenu={false}
        formattingToolbar={false}
        onChange={() => {
          if (applyingExternalChange.current) {
            return;
          }
          const updates = nodes.flatMap((node) => {
            const block = editor.getBlock(node.id);
            if (!block) {
              return [];
            }
            const parsed = blockNoteToTree([block], singleNodeTree(node));
            const updated = parsed?.nodes[node.id];
            if (!updated) {
              return [];
            }
            const contentChanged = JSON.stringify(updated.content) !== JSON.stringify(node.content);
            const checkedChanged = updated.props?.checked !== node.props?.checked;
            return contentChanged || checkedChanged
              ? [{ id: node.id, content: updated.content, props: { checked: updated.props?.checked } }]
              : [];
          });
          if (updates.length > 0) {
            store.updateNodes(updates);
          }
        }}
      >
        {selected && toolbarTarget
          ? createPortal(
              <ZhiJianFormattingToolbar showStructuralControls={false} />,
              toolbarTarget,
            )
          : null}
      </BlockNoteView>
    </div>
  );
}

function currentProjectionSignature(
  blocks: Parameters<typeof blockNoteToTree>[0],
  nodes: ZhiJianNode[],
) {
  return JSON.stringify(
    nodes.flatMap((node) => {
      const block = blocks.find((candidate) => candidate.id === node.id);
      if (!block) {
        return [];
      }
      const parsed = blockNoteToTree([block], singleNodeTree(node));
      return parsed ? treeToBlockNote(parsed) : [];
    }),
  );
}

function singleNodeTree(node: ZhiJianNode): ZhiJianTree {
  return {
    rootId: node.id,
    nodes: {
      [node.id]: { ...node, children: [] },
    },
  };
}
