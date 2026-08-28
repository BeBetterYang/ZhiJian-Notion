import {
  BlockTypeSelect,
  FormattingToolbar,
  blockTypeSelectItems,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
} from "@blocknote/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RiDoubleQuotesL, RiImage2Line, RiTable2 } from "react-icons/ri";
import { saveImageAsset } from "./imageAssetStore";
import { insertImageBlocks, insertNodeAttachmentBlocks } from "./attachmentInsertion";

interface ZhiJianFormattingToolbarProps {
  showStructuralControls?: boolean;
  hasExternalBody?: boolean;
  onInsertQuote?: (nodeId: string, focusBlockId: string) => void;
}

const hiddenFormattingToolbarItems = new Set([
  "textAlignLeftButton",
  "textAlignCenterButton",
  "textAlignRightButton",
]);

export function ZhiJianFormattingToolbar({
  showStructuralControls = true,
  onInsertQuote,
}: ZhiJianFormattingToolbarProps = {}) {
  const editor = useBlockNoteEditor();
  // What the toolbar offers depends on the block the caret is in, so it has to
  // follow the caret. BlockNote's own controller re-renders this on every selection
  // change; the map's two hosts render it directly instead — they are a fixed bar
  // rather than a bubble that follows the text — and there the caret often lands
  // after the first render: the outline bridge moves it in an effect, and a node's
  // own editor places it a frame after mounting. Without this the bar read a stale
  // block and, when that block was the document title, showed nothing at all.
  const [, setCaretVersion] = useState(0);
  useEffect(
    () => editor.onSelectionChange(() => setCaretVersion((version) => version + 1)),
    [editor],
  );
  const activeBlock = editor.getSelection()?.blocks[0] ?? editor.getTextCursorPosition().block;

  const blockTypes = useMemo(
    () =>
      blockTypeSelectItems(editor.dictionary).filter((item) => {
        if (
          item.type === "paragraph" ||
          item.type === "checkListItem"
        ) {
          return true;
        }
        return (
          item.type === "heading" &&
          item.props?.isToggleable !== true &&
          typeof item.props?.level === "number" &&
          item.props.level <= 3
        );
      }),
    [editor],
  );
  const defaultItems = getFormattingToolbarItems(blockTypes).filter(
    (item) => item.key !== "blockTypeSelect" && !hiddenFormattingToolbarItems.has(String(item.key)),
  );

  // The root block is the fixed document title. It remains editable as text,
  // but cannot be changed into another block type or receive formatting.
  //
  // A table is the exception, because it can be the whole of a block: a table node
  // in the map is edited in a document of its own, where the table *is* the first
  // block, and the text being styled belongs to one of its cells rather than to any
  // title. Nothing else can stand in for it — the outline bridge cannot select a
  // cell — so without this a run inside a cell had no way to be coloured at all.
  const isTableBlock = activeBlock?.type === "table";
  if (activeBlock?.id === editor.document[0]?.id && !isTableBlock) {
    return null;
  }

  return (
    <FormattingToolbar>
      {/* Every type on offer is a kind of text row, and a table is none of them:
          picking one would replace the table with an empty paragraph. */}
      {isTableBlock ? null : <BlockTypeSelect items={blockTypes} />}
      {showStructuralControls ? (
        <InsertQuoteButton
          onInsertQuote={onInsertQuote}
        />
      ) : null}
      {showStructuralControls ? <InsertTableButton /> : null}
      {showStructuralControls ? (
        <InsertImageButton />
      ) : null}
      {defaultItems}
    </FormattingToolbar>
  );
}

function InsertQuoteButton({
  onInsertQuote,
}: {
  onInsertQuote?: (nodeId: string, focusBlockId: string) => void;
}) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;

  return (
    <Components.FormattingToolbar.Button
      label="引用"
      mainTooltip="在正文后插入引用"
      icon={<RiDoubleQuotesL />}
      onClick={() => {
        const block = editor.getTextCursorPosition().block;
        const [quote] = insertNodeAttachmentBlocks(editor, block.id, [
          { type: "quote" as const, content: "" },
        ]);
        if (quote) {
          editor.setTextCursorPosition(quote, "start");
          onInsertQuote?.(block.id, quote.id);
        }
      }}
    />
  );
}

function InsertTableButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;

  return (
    <Components.FormattingToolbar.Button
      label="插入表格"
      mainTooltip="插入表格"
      icon={<RiTable2 />}
      onClick={() => {
        const block = editor.getTextCursorPosition().block;
        editor.insertBlocks(
          [
            {
              type: "table",
              content: {
                type: "tableContent",
                rows: [
                  { cells: ["", "", ""] },
                  { cells: ["", "", ""] },
                ],
              },
            },
          ],
          block,
          "after",
        );
      }}
    />
  );
}

function InsertImageButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Components.FormattingToolbar.Button
        label="上传图片"
        mainTooltip="上传图片"
        icon={<RiImage2Line />}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        className="toolbar-file-input"
        type="file"
        accept="image/*"
        multiple
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length === 0) {
            return;
          }
          await insertImageBlocks(
            editor,
            editor.getTextCursorPosition().block.id,
            files,
            saveImageAsset,
          );
        }}
      />
    </>
  );
}
