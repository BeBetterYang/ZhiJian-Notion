import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { zh } from "@blocknote/core/locales";
import type { BlockNoteEditor } from "@blocknote/core";
import { FormattingToolbar, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { blockNoteToTree, treeToBlockNote } from "./blockNoteAdapter";

interface OutlineEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  mindMapNodeId: string | null;
  mindMapToolbarTarget: HTMLElement | null;
  showMindMapToolbar: boolean;
}

export function OutlineEditor({
  store,
  onSelectNode,
  mindMapNodeId,
  mindMapToolbarTarget,
  showMindMapToolbar,
}: OutlineEditorProps) {
  const tree = useTree(store);
  const applyingExternalChange = useRef(false);
  const editor = useCreateBlockNote(
    {
      initialContent: treeToBlockNote(tree),
      dictionary: zh,
      tabBehavior: "prefer-indent",
      uploadFile: fileToDataUrl,
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
    applyingExternalChange.current = true;
    editor.replaceBlocks(editor.document, treeToBlockNote(tree));
    queueMicrotask(() => {
      applyingExternalChange.current = false;
    });
  }, [editor, tree]);

  useEffect(() => {
    if (!mindMapNodeId || !editor.getBlock(mindMapNodeId)) {
      return;
    }

    selectBlockContent(editor, mindMapNodeId);
  }, [editor, mindMapNodeId, tree]);

  return (
    <section
      className="outline-panel"
      onKeyDownCapture={(event) => {
        const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z";
        if (!isUndo) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
      }}
    >
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          if (applyingExternalChange.current) {
            return;
          }
          const nextTree = blockNoteToTree(editor.document, tree);
          if (nextTree) {
            store.replaceTreeFromView(nextTree);
          }
        }}
      >
        {showMindMapToolbar && mindMapToolbarTarget
          ? createPortal(<FormattingToolbar />, mindMapToolbarTarget)
          : null}
      </BlockNoteView>
    </section>
  );
}

function selectBlockContent(editor: BlockNoteEditor, blockId: string) {
  try {
    editor.setTextCursorPosition(blockId, "start");
    const from = editor.prosemirrorState.selection.from;
    editor.setTextCursorPosition(blockId, "end");
    const to = editor.prosemirrorState.selection.from;

    if (from !== to) {
      editor._tiptapEditor.commands.setTextSelection({ from, to });
    }
  } catch {
    // File and table blocks do not expose inline text selections.
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
