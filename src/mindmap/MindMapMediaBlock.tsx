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
  hasGroupBody?: boolean;
}

export function MindMapMediaBlock({
  node,
  store,
  selected,
  toolbarTarget,
  onSelect,
  hasGroupBody = false,
}: MindMapMediaBlockProps) {
  const applyingExternalChange = useRef(false);
  const externalProjectionVersion = useRef(0);
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
    const stopMindMapWheel = (event: Event) => event.stopPropagation();
    container.addEventListener("pointerdown", stopMindMapPointerHandling);
    container.addEventListener("mousedown", stopMindMapPointerHandling);
    container.addEventListener("click", stopMindMapPointerHandling);
    container.addEventListener("dblclick", stopMindMapPointerHandling);
    container.addEventListener("keydown", stopMindMapPointerHandling);
    container.addEventListener("wheel", stopMindMapWheel);
    return () => {
      container.removeEventListener("pointerdown", stopMindMapPointerHandling);
      container.removeEventListener("mousedown", stopMindMapPointerHandling);
      container.removeEventListener("click", stopMindMapPointerHandling);
      container.removeEventListener("dblclick", stopMindMapPointerHandling);
      container.removeEventListener("keydown", stopMindMapPointerHandling);
      container.removeEventListener("wheel", stopMindMapWheel);
    };
  }, [node.id, onSelect]);

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
          const parsed = blockNoteToTree(editor.document, singleNodeTree(node));
          const updated = parsed?.nodes[node.id];
          if (!updated) {
            return;
          }
          const nextMedia = node.type === "table" ? updated.props?.table : updated.props?.image;
          const currentMedia = node.type === "table" ? node.props?.table : node.props?.image;
          if (JSON.stringify(nextMedia) !== JSON.stringify(currentMedia)) {
            store.updateProps(
              node.id,
              node.type === "table" ? { table: updated.props?.table } : { image: updated.props?.image },
            );
          }
          if (node.parentId) {
            const parent = store.getNode(node.parentId);
            const baseIndex = parent?.children.indexOf(node.id) ?? -1;
            const primaryIndex = editor.document.findIndex((block) => block.id === node.id);
            const orderedBlocks = [
              ...editor.document.slice(0, primaryIndex),
              ...editor.document.slice(primaryIndex + 1),
            ];
            const parsedInsertedEntries = orderedBlocks
              .map((block, orderedIndex) => ({
                node: parsed?.nodes[block.id],
                beforePrimary: orderedIndex < primaryIndex,
              }))
              .filter(
                (entry): entry is { node: ZhiJianNode; beforePrimary: boolean } =>
                  Boolean(entry.node && !store.getNode(entry.node.id)),
              );
            const insertedEntries =
              node.type === "table"
                ? [...parsedInsertedEntries].sort(
                    (left, right) =>
                      mediaSiblingPriority(left.node) - mediaSiblingPriority(right.node),
                  )
                : parsedInsertedEntries;
            if (insertedEntries.length > 0) {
              const beforeEntries = insertedEntries.filter((entry) => entry.beforePrimary);
              const afterEntries = insertedEntries.filter((entry) => !entry.beforePrimary);
              const existingEditorSiblingIndexes = orderedBlocks
                .map((block) => parent?.children.indexOf(block.id) ?? -1)
                .filter((index) => index >= 0);
              const afterAnchorIndex = Math.max(baseIndex, ...existingEditorSiblingIndexes);
              store.createNodes(
                [
                  ...beforeEntries.map((entry, offset) => ({
                    entry,
                    index: baseIndex + offset,
                  })),
                  ...afterEntries.map((entry, offset) => ({
                    entry,
                    index: afterAnchorIndex + beforeEntries.length + 1 + offset,
                  })),
                ].map(({ entry, index }) => ({
                  id: entry.node.id,
                  parentId: node.parentId!,
                  index,
                  type: entry.node.type,
                  content: entry.node.content,
                  description: entry.node.description,
                  props: entry.node.props,
                })),
              );
            }
          }
        }}
      >
        {selected && toolbarTarget
          ? createPortal(
              <ZhiJianFormattingToolbar hasExternalBody={hasGroupBody} />,
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

function mediaSiblingPriority(node: ZhiJianNode) {
  if (node.type === "quote") {
    return 1;
  }
  if (node.type === "image") {
    return 2;
  }
  if (node.type === "table") {
    return 3;
  }
  return 0;
}
