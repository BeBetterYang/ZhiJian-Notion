import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { blockNoteToTree, treeToBlockNote } from "../outline/blockNoteAdapter";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import { zhijianDictionary } from "../shared/zhijianDictionary";
import { handleTreeHistoryKeyDown } from "../shared/handleTreeHistoryKeyDown";

interface MindMapMediaBlockProps {
  node: ZhiJianNode;
  store: TreeStore;
  selected: boolean;
  toolbarTarget: HTMLElement | null;
  onSelect: (nodeId: string) => void;
}

export function MindMapMediaBlock({
  node,
  store,
  selected,
  toolbarTarget,
  onSelect,
}: MindMapMediaBlockProps) {
  const applyingExternalChange = useRef(false);
  const externalProjectionVersion = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const editor = useCreateBlockNote(
    {
      initialContent: treeToBlockNote(singleNodeTree(node)),
      dictionary: zhijianDictionary,
      tables: {
        headers: true,
        cellBackgroundColor: true,
        cellTextColor: true,
      },
    },
    [node.id],
  );

  useEffect(() => {
    editor.isEditable = selected;
  }, [editor, selected]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const selectMediaBlock = (event: Event) => {
      onSelect(node.id);
      event.stopPropagation();
    };
    const beginMediaEdit = (event: Event, forceEdit = false) => {
      if (!selected && !forceEdit) {
        event.preventDefault();
        selectMediaBlock(event);
        return;
      }
      if (forceEdit) {
        editor.isEditable = true;
        onSelect(node.id);
      }
      event.stopPropagation();
      window.queueMicrotask(() => {
        container.querySelector<HTMLElement>(".ProseMirror")?.focus({ preventScroll: true });
      });
    };
    const editOnDoubleClick = (event: Event) => beginMediaEdit(event, true);
    const useUnifiedHistory = (event: KeyboardEvent) => {
      handleTreeHistoryKeyDown(event, store);
    };
    const stopMindMapKeyboardHandling = (event: Event) => event.stopPropagation();
    const stopMindMapWheel = (event: Event) => event.stopPropagation();
    container.addEventListener("pointerdown", beginMediaEdit);
    container.addEventListener("mousedown", selectMediaBlock);
    container.addEventListener("click", selectMediaBlock);
    container.addEventListener("dblclick", editOnDoubleClick);
    container.addEventListener("keydown", useUnifiedHistory, true);
    container.addEventListener("keydown", stopMindMapKeyboardHandling);
    container.addEventListener("wheel", stopMindMapWheel);
    return () => {
      container.removeEventListener("pointerdown", beginMediaEdit);
      container.removeEventListener("mousedown", selectMediaBlock);
      container.removeEventListener("click", selectMediaBlock);
      container.removeEventListener("dblclick", editOnDoubleClick);
      container.removeEventListener("keydown", useUnifiedHistory, true);
      container.removeEventListener("keydown", stopMindMapKeyboardHandling);
      container.removeEventListener("wheel", stopMindMapWheel);
    };
  }, [editor, node.id, onSelect, selected, store]);

  useEffect(() => {
    const projected = treeToBlockNote(singleNodeTree(node));
    const current = blockNoteToTree(editor.document, singleNodeTree(node));
    if (current && mediaProjectionSignature(current) === JSON.stringify(projected)) {
      return;
    }
    applyingExternalChange.current = true;
    const projectionVersion = ++externalProjectionVersion.current;
    editor.replaceBlocks(editor.document, projected);
    window.setTimeout(() => {
      if (externalProjectionVersion.current === projectionVersion) {
        applyingExternalChange.current = false;
      }
    }, 0);
  }, [editor, node]);

  return (
    <div
      ref={containerRef}
      className={`mindmap-blocknote-node mindmap-blocknote-node-${node.type} ${selected ? "is-selected" : ""}`}
    >
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
          if (!editor.getBlock(node.id)) {
            store.deleteNode(node.id);
            return;
          }
          const parsed = blockNoteToTree(editor.document, singleNodeTree(node));
          const updated = parsed?.nodes[node.id];
          if (!updated) {
            return;
          }
          const nextMedia = updated.props?.table;
          const currentMedia = node.props?.table;
          if (JSON.stringify(nextMedia) !== JSON.stringify(currentMedia)) {
            store.updateProps(node.id, { table: updated.props?.table });
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

function singleNodeTree(node: ZhiJianNode): ZhiJianTree {
  return {
    rootId: node.id,
    nodes: {
      [node.id]: { ...node, children: [] },
    },
  };
}

function mediaProjectionSignature(tree: ZhiJianTree) {
  return JSON.stringify(treeToBlockNote(tree));
}
