import {
  BlockTypeSelect,
  FormattingToolbar,
  blockTypeSelectItems,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
} from "@blocknote/react";
import { useMemo, useRef } from "react";
import { RiDoubleQuotesL, RiImage2Line, RiTable2 } from "react-icons/ri";
import { saveImageAsset } from "./imageAssetStore";
import { insertNodeAttachmentBlocks } from "./attachmentInsertion";

interface ZhiJianFormattingToolbarProps {
  showStructuralControls?: boolean;
  hasExternalBody?: boolean;
  onInsertQuote?: (nodeId: string, focusBlockId: string) => void;
}

export function ZhiJianFormattingToolbar({
  showStructuralControls = true,
  onInsertQuote,
}: ZhiJianFormattingToolbarProps = {}) {
  const editor = useBlockNoteEditor();
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
    (item) => item.key !== "blockTypeSelect",
  );

  // The root block is the fixed document title. It remains editable as text,
  // but cannot be changed into another block type or receive formatting.
  if (activeBlock?.id === editor.document[0]?.id) {
    return null;
  }

  return (
    <FormattingToolbar>
      <BlockTypeSelect items={blockTypes} />
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
          if (files.length === 0) {
            return;
          }
          const assets = await Promise.all(
            files.map(async (file) => ({ file, url: (await saveImageAsset(file)).url })),
          );
          const block = editor.getTextCursorPosition().block;
          const validAssets = assets.filter((asset) => asset.url);
          if (validAssets.length > 0) {
            insertNodeAttachmentBlocks(
              editor,
              block.id,
              validAssets.map(({ file, url }) => ({
                type: "image" as const,
                props: {
                  url,
                  name: file.name,
                  previewWidth: 480,
                  showPreview: true,
                },
              })),
            );
          }
          event.target.value = "";
        }}
      />
    </>
  );
}
