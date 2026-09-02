import {
  blockHasType,
  type BlockSchema,
  type InlineContentSchema,
  type StyleSchema,
} from "@blocknote/core";
import {
  BlockTypeSelect,
  FormattingToolbar,
  blockTypeSelectItems,
  getFormattingToolbarItems,
  useActiveStyles,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from "@blocknote/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiBold, RiCheckboxLine, RiDoubleQuotesL, RiEyeLine, RiEyeOffLine, RiImage2Line, RiItalic, RiStrikethrough, RiTable2, RiUnderline } from "react-icons/ri";
import { everySpanHasMark } from "../core/tree";
import type { TreeStore } from "../core/treeStore";
import {
  applyMindMapBatchColor,
  editableMindMapBatchNodeIds,
  toggleMindMapBatchTextStyle,
  toggleMindMapBatchTodo,
  type MindMapBatchTextStyle,
} from "../mindmap/mindMapBatchFormatting";
import { saveImageAsset } from "./imageAssetStore";
import { insertImageBlocks, insertNodeAttachmentBlocks } from "./attachmentInsertion";

interface MindMapBatchSelection {
  store: TreeStore;
  nodeIds: string[];
}

interface ZhiJianFormattingToolbarProps {
  showStructuralControls?: boolean;
  hasExternalBody?: boolean;
  /** 挖空 is a map-only study aid, so the outline's own toolbar leaves it out. */
  showClozeControl?: boolean;
  onInsertQuote?: (nodeId: string, focusBlockId: string) => void;
  /**
   * 导图里表格是一整个节点，落点由导图决定（空节点就地变表格，否则另开一个），所以那边
   * 接过这个回调、不走 BlockNote 自己的插块。大纲里没有这回事。
   */
  onInsertTable?: (nodeId: string) => void;
  mindMapBatchSelection?: MindMapBatchSelection;
}

const hiddenFormattingToolbarItems = new Set([
  "fileCaptionButton",
  "replaceFileButton",
  "textAlignLeftButton",
  "textAlignCenterButton",
  "textAlignRightButton",
]);

export function ZhiJianFormattingToolbar({
  showStructuralControls = true,
  showClozeControl = false,
  onInsertQuote,
  onInsertTable,
  mindMapBatchSelection,
}: ZhiJianFormattingToolbarProps = {}) {
  if (mindMapBatchSelection) {
    return <MindMapBatchFormattingToolbar selection={mindMapBatchSelection} />;
  }
  return (
    <EditorFormattingToolbar
      showStructuralControls={showStructuralControls}
      showClozeControl={showClozeControl}
      onInsertQuote={onInsertQuote}
      onInsertTable={onInsertTable}
    />
  );
}

function EditorFormattingToolbar({
  showStructuralControls,
  showClozeControl,
  onInsertQuote,
  onInsertTable,
}: Required<Pick<ZhiJianFormattingToolbarProps, "showStructuralControls" | "showClozeControl">>
  & Pick<ZhiJianFormattingToolbarProps, "onInsertQuote" | "onInsertTable">) {
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
          item.type === "paragraph"
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
  const isImageBlock = activeBlock?.type === "image";
  if (activeBlock?.id === editor.document[0]?.id && !isTableBlock) {
    return null;
  }

  return (
    <FormattingToolbar>
      {/* Every type on offer is a kind of text row, and a table is none of them:
          picking one would replace the table with an empty paragraph. */}
      {isTableBlock ? null : <BlockTypeSelect items={blockTypes} />}
      {showStructuralControls ? <ChecklistButton /> : null}
      {showStructuralControls && !isImageBlock ? (
        <InsertQuoteButton
          onInsertQuote={onInsertQuote}
        />
      ) : null}
      {showStructuralControls && !isImageBlock ? <InsertTableButton onInsertTable={onInsertTable} /> : null}
      {showStructuralControls ? (
        <InsertImageButton />
      ) : null}
      {showClozeControl && !isImageBlock ? <ClozeButton /> : null}
      <ViewImageButton />
      {defaultItems}
    </FormattingToolbar>
  );
}

const batchColors = [
  ["default", "默认"],
  ["gray", "灰色"],
  ["brown", "棕色"],
  ["red", "红色"],
  ["orange", "橙色"],
  ["yellow", "黄色"],
  ["green", "绿色"],
  ["blue", "蓝色"],
  ["purple", "紫色"],
  ["pink", "粉色"],
] as const;

const batchTextStyles: Array<{
  style: MindMapBatchTextStyle;
  label: string;
  icon: ReactNode;
}> = [
  { style: "bold", label: "加粗", icon: <RiBold /> },
  { style: "italic", label: "斜体", icon: <RiItalic /> },
  { style: "underline", label: "下划线", icon: <RiUnderline /> },
  { style: "strike", label: "删除线", icon: <RiStrikethrough /> },
];

function MindMapBatchFormattingToolbar({ selection }: { selection: MindMapBatchSelection }) {
  const Components = useComponentsContext()!;
  const tree = selection.store.getSnapshot();
  const nodeIds = editableMindMapBatchNodeIds(tree, selection.nodeIds);
  const textColor = batchColors.find(([color]) =>
    nodeIds.every((id) => everySpanHasMark(tree.nodes[id]!.content, "textColor", color === "default" ? undefined : color)),
  )?.[0] ?? "default";
  const backgroundColor = batchColors.find(([color]) =>
    nodeIds.every((id) => everySpanHasMark(tree.nodes[id]!.content, "backgroundColor", color === "default" ? undefined : color)),
  )?.[0] ?? "default";

  if (!nodeIds.length) return null;

  return (
    <FormattingToolbar>
      <Components.FormattingToolbar.Button
        label="检查清单"
        mainTooltip="检查清单"
        icon={<RiCheckboxLine />}
        isSelected={nodeIds.every((id) => tree.nodes[id]!.type === "todo")}
        onClick={() => toggleMindMapBatchTodo(selection.store, nodeIds)}
      />
      {batchTextStyles.map(({ style, label, icon }) => (
        <Components.FormattingToolbar.Button
          key={style}
          label={label}
          mainTooltip={label}
          icon={icon}
          isSelected={nodeIds.every((id) => everySpanHasMark(tree.nodes[id]!.content, style, true))}
          onClick={() => toggleMindMapBatchTextStyle(selection.store, nodeIds, style)}
        />
      ))}
      <Components.Generic.Menu.Root>
        <Components.Generic.Menu.Trigger>
          <Components.FormattingToolbar.Button
            className="bn-button"
            label="颜色"
            mainTooltip="颜色"
            icon={<BatchColorIcon textColor={textColor} backgroundColor={backgroundColor} />}
          />
        </Components.Generic.Menu.Trigger>
        <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-color-picker-dropdown">
          <Components.Generic.Menu.Label>字体颜色</Components.Generic.Menu.Label>
          {batchColors.map(([color, label]) => (
            <Components.Generic.Menu.Item
              key={`text-${color}`}
              checked={textColor === color}
              data-test={`text-color-${color}`}
              icon={<BatchColorIcon textColor={color} />}
              onClick={() => applyMindMapBatchColor(selection.store, nodeIds, "textColor", color === "default" ? null : color)}
            >
              {label}
            </Components.Generic.Menu.Item>
          ))}
          <Components.Generic.Menu.Label>背景颜色</Components.Generic.Menu.Label>
          {batchColors.map(([color, label]) => (
            <Components.Generic.Menu.Item
              key={`background-${color}`}
              checked={backgroundColor === color}
              data-test={`background-color-${color}`}
              icon={<BatchColorIcon backgroundColor={color} />}
              onClick={() => applyMindMapBatchColor(selection.store, nodeIds, "backgroundColor", color === "default" ? null : color)}
            >
              {label}
            </Components.Generic.Menu.Item>
          ))}
        </Components.Generic.Menu.Dropdown>
      </Components.Generic.Menu.Root>
    </FormattingToolbar>
  );
}

function BatchColorIcon({ textColor = "default", backgroundColor = "default" }: { textColor?: string; backgroundColor?: string }) {
  return (
    <span
      className="bn-color-icon"
      data-background-color={backgroundColor}
      data-text-color={textColor}
      style={{ pointerEvents: "none", fontSize: "15px", height: "20px", lineHeight: "20px", textAlign: "center", width: "20px" }}
    >
      A
    </span>
  );
}

function ChecklistButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const block = editor.getSelection()?.blocks[0] ?? editor.getTextCursorPosition().block;
  const isChecklist = block?.type === "checkListItem";
  const disabled = !block || block.type === "table" || block.type === "image";

  return (
    <Components.FormattingToolbar.Button
      label="检查清单"
      mainTooltip="检查清单"
      icon={<RiCheckboxLine />}
      isSelected={isChecklist}
      isDisabled={disabled}
      onClick={() => {
        if (!block || disabled) return;
        editor.updateBlock(block, { type: isChecklist ? "paragraph" : "checkListItem" });
        editor.focus();
      }}
    />
  );
}

function ViewImageButton() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const Components = useComponentsContext()!;
  const block = useEditorState({
    editor,
    selector: ({ editor }) => {
      const selectedBlocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
      if (selectedBlocks.length !== 1) return undefined;
      const selected = selectedBlocks[0];
      return selected.type === "image" && blockHasType(selected, editor, "image", { url: "string" })
        ? selected
        : undefined;
    },
  });

  if (!block) return null;

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label="查看图片"
      mainTooltip="查看图片"
      icon={<RiEyeLine />}
      onClick={() => {
        const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
        if (editor.resolveFileUrl) {
          void editor.resolveFileUrl(block.props.url).then(open);
        } else {
          open(block.props.url);
        }
      }}
    />
  );
}

/**
 * 挖空: hides the selected run on the map until it is clicked.
 *
 * The mark rides on BlockNote's `code` style, which is the one boolean style in its
 * default schema that 枝间 offers nowhere else — see `CLOZE_STYLE` in
 * `outline/blockNoteAdapter.ts` for why a mark of our own would not survive the next
 * keystroke. Nothing about the text moves: the map paints the run transparent under a
 * blue underline, and the editors leave it readable.
 */
function ClozeButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const active = useActiveStyles(editor);

  return (
    <Components.FormattingToolbar.Button
      label="挖空"
      mainTooltip="挖空所选文字"
      icon={<RiEyeOffLine />}
      isSelected={active.code === true}
      onClick={() => {
        editor.toggleStyles({ code: true });
        editor.focus();
      }}
    />
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

function InsertTableButton({ onInsertTable }: { onInsertTable?: (nodeId: string) => void }) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;

  return (
    <Components.FormattingToolbar.Button
      label="插入表格"
      mainTooltip="插入表格"
      icon={<RiTable2 />}
      onClick={() => {
        const block = editor.getTextCursorPosition().block;
        // 导图接手时不能走下面这条：一块表格在大纲里就是一个新节点，而导图要按当前节点空不空
        // 决定是就地变表格还是另开一个，这里的编辑器还是那个隐藏的大纲编辑器（见
        // `MindMapNodeGroupBlock` 的 `ownsToolbar`）。
        if (onInsertTable) {
          onInsertTable(block.id);
          return;
        }
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
