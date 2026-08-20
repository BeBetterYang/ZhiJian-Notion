import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { zh } from "@blocknote/core/locales";
import type { BlockNoteEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef } from "react";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { blockNoteToTree, treeToBlockNote } from "./blockNoteAdapter";

interface OutlineEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  onEditorReady: (editor: BlockNoteEditor) => void;
}

export function OutlineEditor({ store, onSelectNode, onEditorReady }: OutlineEditorProps) {
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
    onEditorReady(editor);
    return editor.onSelectionChange(() => {
      const selectedBlock = editor.getSelection()?.blocks[0] ?? editor.getTextCursorPosition().block;
      if (selectedBlock?.id) {
        onSelectNode(selectedBlock.id);
      }
    });
  }, [editor, onEditorReady, onSelectNode]);

  useEffect(() => {
    applyingExternalChange.current = true;
    editor.replaceBlocks(editor.document, treeToBlockNote(tree));
    queueMicrotask(() => {
      applyingExternalChange.current = false;
    });
  }, [editor, tree]);

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
      />
    </section>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
