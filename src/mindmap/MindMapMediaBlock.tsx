import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ZhiJianNode, ZhiJianTree } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import { blockNoteToTree, treeToBlockNote } from "../outline/blockNoteAdapter";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import { saveImageAsset } from "../shared/imageAssetStore";
import { zhijianDictionary } from "../shared/zhijianDictionary";

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
  const skipNextProjection = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const editor = useCreateBlockNote(
    {
      initialContent: treeToBlockNote(singleNodeTree(node)),
      dictionary: zhijianDictionary,
      uploadFile: async (file) => (await saveImageAsset(file)).url,
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
    const stopMindMapPointerHandling = (event: Event) => {
      onSelect(node.id);
      event.stopPropagation();
      window.setTimeout(() => {
        container.querySelector<HTMLElement>(".ProseMirror")?.focus({ preventScroll: true });
      }, 0);
    };
    container.addEventListener("pointerdown", stopMindMapPointerHandling);
    container.addEventListener("click", stopMindMapPointerHandling);
    container.addEventListener("dblclick", stopMindMapPointerHandling);
    return () => {
      container.removeEventListener("pointerdown", stopMindMapPointerHandling);
      container.removeEventListener("click", stopMindMapPointerHandling);
      container.removeEventListener("dblclick", stopMindMapPointerHandling);
    };
  }, [node.id, onSelect]);

  useEffect(() => {
    if (skipNextProjection.current) {
      skipNextProjection.current = false;
      return;
    }
    applyingExternalChange.current = true;
    editor.replaceBlocks(editor.document, treeToBlockNote(singleNodeTree(node)));
    queueMicrotask(() => {
      applyingExternalChange.current = false;
    });
  }, [editor, node]);

  return (
    <div
      ref={containerRef}
      className={`mindmap-blocknote-node ${selected ? "is-selected" : ""}`}
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
          const parsed = blockNoteToTree(editor.document, singleNodeTree(node));
          const updated = parsed?.nodes[node.id];
          if (!updated) {
            return;
          }
          skipNextProjection.current = true;
          store.updateProps(node.id, {
            table: updated.props?.table,
            image: updated.props?.image,
          });
        }}
      >
        {selected && toolbarTarget
          ? createPortal(<ZhiJianFormattingToolbar />, toolbarTarget)
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
