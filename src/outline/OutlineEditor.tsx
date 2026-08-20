import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { BlockNoteEditor } from "@blocknote/core";
import { FormattingToolbarController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TreeStore } from "../core/treeStore";
import { useTree } from "../core/treeStore/useTree";
import { blockNoteToTree, treeToBlockNote } from "./blockNoteAdapter";
import { ZhiJianSlashMenu } from "./ZhiJianSlashMenu";
import { ZhiJianFormattingToolbar } from "../shared/ZhiJianFormattingToolbar";
import type { MindMapTextSelection } from "../mindmap/MindMapEditor";
import { resolveMindMapTextRange } from "./mindMapTextSelection";
import { saveImageAsset } from "../shared/imageAssetStore";
import { zhijianDictionary } from "../shared/zhijianDictionary";

interface OutlineEditorProps {
  store: TreeStore;
  onSelectNode: (nodeId: string) => void;
  mindMapNodeId: string | null;
  mindMapTextSelection: MindMapTextSelection | null;
  mindMapToolbarTarget: HTMLElement | null;
  showMindMapToolbar: boolean;
}

export function OutlineEditor({
  store,
  onSelectNode,
  mindMapNodeId,
  mindMapTextSelection,
  mindMapToolbarTarget,
  showMindMapToolbar,
}: OutlineEditorProps) {
  const tree = useTree(store);
  const applyingExternalChange = useRef(false);
  const externalProjectionVersion = useRef(0);
  const editor = useCreateBlockNote(
    {
      initialContent: treeToBlockNote(tree),
      dictionary: zhijianDictionary,
      tabBehavior: "prefer-indent",
      uploadFile: async (file) => (await saveImageAsset(file)).url,
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
    const currentTree = blockNoteToTree(editor.document, tree);
    if (currentTree && blockProjectionSignature(currentTree) === blockProjectionSignature(tree)) {
      return;
    }
    applyingExternalChange.current = true;
    const projectionVersion = ++externalProjectionVersion.current;
    editor.replaceBlocks(editor.document, treeToBlockNote(tree));
    window.setTimeout(() => {
      if (externalProjectionVersion.current === projectionVersion) {
        applyingExternalChange.current = false;
      }
    }, 0);
  }, [editor, tree]);

  useEffect(() => {
    if (!mindMapNodeId || !editor.getBlock(mindMapNodeId)) {
      return;
    }

    selectBlockContent(editor, mindMapNodeId, mindMapTextSelection);
  }, [editor, mindMapNodeId, mindMapTextSelection, tree]);

  const editorView = (
    <BlockNoteView
      editor={editor}
      theme="light"
      formattingToolbar={false}
      slashMenu={false}
      onChange={() => {
        if (applyingExternalChange.current) {
          return;
        }
        const currentTree = store.getSnapshot();
        const nextTree = blockNoteToTree(editor.document, currentTree);
        if (
          nextTree &&
          blockProjectionSignature(nextTree) !== blockProjectionSignature(currentTree)
        ) {
          store.replaceTreeFromView(nextTree);
        }
      }}
    >
      <FormattingToolbarController formattingToolbar={() => <ZhiJianFormattingToolbar />} />
      <ZhiJianSlashMenu />
      {showMindMapToolbar && mindMapToolbarTarget
        ? createPortal(<ZhiJianFormattingToolbar />, mindMapToolbarTarget)
        : null}
    </BlockNoteView>
  );

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
      {editorView}
    </section>
  );
}

function blockProjectionSignature(tree: ReturnType<TreeStore["getSnapshot"]>) {
  return JSON.stringify(treeToBlockNote(tree));
}

function selectBlockContent(
  editor: BlockNoteEditor,
  blockId: string,
  textSelection: MindMapTextSelection | null,
) {
  try {
    editor.setTextCursorPosition(blockId, "start");
    const from = editor.prosemirrorState.selection.from;
    editor.setTextCursorPosition(blockId, "end");
    const to = editor.prosemirrorState.selection.from;

    if (from === to) {
      return;
    }
    const range = resolveMindMapTextRange(blockId, { from, to }, textSelection);
    editor._tiptapEditor.commands.setTextSelection({
      from: range.from,
      to: range.to,
    });
  } catch {
    // File and table blocks do not expose inline text selections.
  }
}
