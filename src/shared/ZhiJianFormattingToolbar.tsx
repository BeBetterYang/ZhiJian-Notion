import type { BlockNoteEditor } from "@blocknote/core";
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

interface ZhiJianFormattingToolbarProps {
  showStructuralControls?: boolean;
  hasExternalBody?: boolean;
  onInsertQuote?: (nodeId: string) => void;
}

export function ZhiJianFormattingToolbar({
  showStructuralControls = true,
  hasExternalBody = false,
  onInsertQuote,
}: ZhiJianFormattingToolbarProps = {}) {
  const editor = useBlockNoteEditor();
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

  return (
    <FormattingToolbar>
      <BlockTypeSelect items={blockTypes} />
      {showStructuralControls ? (
        <InsertQuoteButton
          hasExternalBody={hasExternalBody}
          onInsertQuote={onInsertQuote}
        />
      ) : null}
      {showStructuralControls ? <InsertTableButton /> : null}
      {showStructuralControls ? (
        <InsertImageButton hasExternalBody={hasExternalBody} />
      ) : null}
      {defaultItems}
    </FormattingToolbar>
  );
}

function InsertQuoteButton({
  hasExternalBody,
  onInsertQuote,
}: {
  hasExternalBody: boolean;
  onInsertQuote?: (nodeId: string) => void;
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
        const referenceId = quoteInsertionReference(
          editor,
          block.id,
          hasExternalBody,
        );
        const [quote] = editor.insertBlocks(
          [{ type: "quote", content: "" }],
          referenceId,
          "after",
        );
        if (quote) {
          editor.setTextCursorPosition(quote, "start");
          onInsertQuote?.(quote.id);
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

function InsertImageButton({ hasExternalBody }: { hasExternalBody: boolean }) {
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
            const referenceId = imageInsertionReference(
              editor,
              block.id,
              hasExternalBody,
            );
            editor.insertBlocks(
              validAssets.map(({ file, url }) => ({
                type: "image" as const,
                props: {
                  url,
                  name: file.name,
                  previewWidth: 480,
                  showPreview: true,
                },
              })),
              referenceId,
              "after",
            );
          }
          event.target.value = "";
        }}
      />
    </>
  );
}

function imageInsertionReference(
  editor: BlockNoteEditor,
  selectedBlockId: string,
  hasExternalBody: boolean,
) {
  const selectedIndex = editor.document.findIndex((block) => block.id === selectedBlockId);
  const selectedBlock = editor.document[selectedIndex];
  if (!selectedBlock) {
    return selectedBlockId;
  }

  if (selectedBlock.type === "table") {
    const [body] = editor.insertBlocks(
      [{ type: "paragraph", content: "" }],
      selectedBlock,
      "after",
    );
    return body?.id ?? selectedBlockId;
  }

  if (!isAttachmentBlock(selectedBlock.type)) {
    return selectedBlockId;
  }

  let firstAttachmentIndex = selectedIndex;
  while (
    firstAttachmentIndex > 0 &&
    isAttachmentBlock(editor.document[firstAttachmentIndex - 1]?.type)
  ) {
    firstAttachmentIndex -= 1;
  }
  let lastAttachmentIndex = selectedIndex;
  while (
    lastAttachmentIndex + 1 < editor.document.length &&
    isAttachmentBlock(editor.document[lastAttachmentIndex + 1]?.type)
  ) {
    lastAttachmentIndex += 1;
  }
  const lastAttachmentId = editor.document[lastAttachmentIndex].id;
  if (hasExternalBody) {
    return lastAttachmentId;
  }

  const precedingBlock = editor.document[firstAttachmentIndex - 1];
  if (!precedingBlock || precedingBlock.type === "table") {
    editor.insertBlocks(
      [{ type: "paragraph", content: "" }],
      editor.document[firstAttachmentIndex],
      "before",
    );
  }
  return lastAttachmentId;
}

function quoteInsertionReference(
  editor: BlockNoteEditor,
  selectedBlockId: string,
  hasExternalBody: boolean,
) {
  const selectedIndex = editor.document.findIndex((block) => block.id === selectedBlockId);
  const selectedBlock = editor.document[selectedIndex];
  if (!selectedBlock) {
    return selectedBlockId;
  }

  if (selectedBlock.type === "table") {
    const [body] = editor.insertBlocks(
      [{ type: "paragraph", content: "" }],
      selectedBlock,
      "after",
    );
    return body?.id ?? selectedBlockId;
  }

  if (!isAttachmentBlock(selectedBlock.type)) {
    return selectedBlockId;
  }

  if (hasExternalBody) {
    return selectedBlockId;
  }

  let firstAttachmentIndex = selectedIndex;
  while (
    firstAttachmentIndex > 0 &&
    isAttachmentBlock(editor.document[firstAttachmentIndex - 1]?.type)
  ) {
    firstAttachmentIndex -= 1;
  }
  const precedingBlock = editor.document[firstAttachmentIndex - 1];
  if (precedingBlock && precedingBlock.type !== "table") {
    return precedingBlock.id;
  }

  const [body] = editor.insertBlocks(
    [{ type: "paragraph", content: "" }],
    editor.document[firstAttachmentIndex],
    "before",
  );
  return body?.id ?? selectedBlockId;
}

function isAttachmentBlock(type: string | undefined) {
  return type === "image" || type === "quote";
}
