import { FilePanelExtension, FormattingToolbarExtension } from "@blocknote/core";
import type { BlockNoteEditor, BlockSchema, InlineContentSchema, StyleSchema } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useBlockNoteEditor,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  Smile,
  SquareCheck,
  Table2,
  Text,
  TextQuote,
  type LucideIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { insertNodeAttachmentBlocks } from "../shared/attachmentInsertion";
import { EmojiPickerPopover } from "../shared/emoji/EmojiPickerPopover";
import { isSupportedSlashItemKey, orderSlashMenuItems } from "./slashMenuItems";

const EMOJI_PICKER_WIDTH = 352;
const EMOJI_PICKER_HEIGHT = 435;
const EMOJI_PICKER_GAP = 8;

export function ZhiJianSlashMenu() {
  const editor = useBlockNoteEditor();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState({ top: 8, left: 8 });
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const updateEmojiPickerPosition = useCallback(() => {
    if (!emojiPickerOpen) return;
    const rect = editor._tiptapEditor.view.coordsAtPos(editor._tiptapEditor.state.selection.from);
    const pickerWidth = Math.min(EMOJI_PICKER_WIDTH, window.innerWidth - 32);
    const pickerHeight = Math.min(EMOJI_PICKER_HEIGHT, window.innerHeight - 16);
    setEmojiPickerPosition({
      top: Math.max(8, Math.min(rect.bottom + EMOJI_PICKER_GAP, window.innerHeight - pickerHeight - 8)),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - pickerWidth - 8)),
    });
  }, [editor, emojiPickerOpen]);

  useLayoutEffect(() => {
    if (!emojiPickerOpen) return undefined;
    updateEmojiPickerPosition();
    const reposition = () => updateEmojiPickerPosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [emojiPickerOpen, updateEmojiPickerPosition]);

  useEffect(() => {
    if (!emojiPickerOpen) return undefined;
    const close = (event: PointerEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) setEmojiPickerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmojiPickerOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [emojiPickerOpen]);

  const insertSelectedEmoji = (emoji: string) => {
    editor.insertInlineContent(`${emoji} `);
    editor.focus();
    setEmojiPickerOpen(false);
  };

  return (
    <>
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            orderSlashMenuItems(
              (getDefaultReactSlashMenuItems(editor) as Array<DefaultReactSuggestionItem & { key?: string }>)
                .filter((item) => isSupportedSlashItemKey(item.key ?? "")),
            )
              .map((item) => withZhiJianMenuPresentation(
                withAttachmentBodyGuard(editor, item),
                () => setEmojiPickerOpen(true),
              )),
            query,
          )
        }
      />
      {emojiPickerOpen ? createPortal(
        <div className="slash-emoji-picker emoji-picker-anchor" ref={emojiPickerRef} style={{ top: emojiPickerPosition.top, left: emojiPickerPosition.left }}>
          <EmojiPickerPopover onEmojiSelect={insertSelectedEmoji} />
        </div>,
        document.body,
      ) : null}
    </>
  );
}

const slashMenuIcons: Record<string, LucideIcon> = {
  paragraph: Text,
  heading: Heading1,
  heading_2: Heading2,
  heading_3: Heading3,
  quote: TextQuote,
  check_list: SquareCheck,
  numbered_list: ListOrdered,
  bullet_list: List,
  table: Table2,
  image: Image,
  emoji: Smile,
};

function withZhiJianMenuPresentation(item: DefaultReactSuggestionItem, onEmojiClick: () => void): DefaultReactSuggestionItem {
  const key = (item as typeof item & { key?: string }).key;
  const Icon = key ? slashMenuIcons[key] : undefined;

  return {
    ...item,
    onItemClick: key === "emoji" ? onEmojiClick : item.onItemClick,
    group: undefined,
    size: "small",
    icon: Icon ? <Icon aria-hidden="true" /> : <FileText aria-hidden="true" />,
  };
}

// The built-in image/quote slash items call insertOrUpdateBlock, which *replaces*
// an empty node with the attachment — producing a mindmap node with no 正文. We
// swap their onItemClick to reuse the same insertion helpers as the formatting
// toolbar, so inserting an attachment at a node's start keeps an empty paragraph
// as the 正文 and inserting it after body text uses the current node as the 正文.
// The rest of each item (title, icon, subtext, dictionary strings) is untouched.
function withAttachmentBodyGuard<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: BlockNoteEditor<BS, IS, SS>,
  item: DefaultReactSuggestionItem,
): DefaultReactSuggestionItem {
  const key = (item as typeof item & { key?: string }).key;

  if (key === "image") {
    return {
      ...item,
      onItemClick: () => {
        const selected = editor.getTextCursorPosition().block;
        const [image] = insertNodeAttachmentBlocks(editor, selected.id, [
          { type: "image" as const },
        ]);
        if (image) {
          // Mirror the default item: open the upload panel and hide the toolbar.
          editor.getExtension(FilePanelExtension)?.showMenu(image.id);
          editor.getExtension(FormattingToolbarExtension)?.store.setState(false);
        }
      },
    };
  }

  if (key === "quote") {
    return {
      ...item,
      onItemClick: () => {
        const selected = editor.getTextCursorPosition().block;
        const [quote] = insertNodeAttachmentBlocks(editor, selected.id, [
          { type: "quote" as const, content: "" } as never,
        ]);
        if (quote) {
          editor.setTextCursorPosition(quote, "end");
        }
      },
    };
  }

  return item;
}
