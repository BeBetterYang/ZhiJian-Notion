import {
  BlockTypeSelect,
  FormattingToolbar,
  blockTypeSelectItems,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
} from "@blocknote/react";
import { useMemo, useRef } from "react";
import { RiImage2Line, RiTable2 } from "react-icons/ri";
import { saveImageAsset } from "./imageAssetStore";

export function ZhiJianFormattingToolbar() {
  const editor = useBlockNoteEditor();
  const blockTypes = useMemo(
    () =>
      blockTypeSelectItems(editor.dictionary).filter((item) => {
        if (item.type === "paragraph" || item.type === "checkListItem") {
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
      <InsertTableButton />
      <InsertImageButton />
      {defaultItems}
    </FormattingToolbar>
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
        editor.updateBlock(block, {
          type: "table",
          content: {
            type: "tableContent",
            rows: [
              { cells: ["", "", ""] },
              { cells: ["", "", ""] },
            ],
          },
        });
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
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          const { url } = await saveImageAsset(file);
          if (url) {
            const block = editor.getTextCursorPosition().block;
            editor.updateBlock(block, {
              type: "image",
              props: {
                url,
                name: file.name,
                showPreview: true,
              },
            });
          }
          event.target.value = "";
        }}
      />
    </>
  );
}
