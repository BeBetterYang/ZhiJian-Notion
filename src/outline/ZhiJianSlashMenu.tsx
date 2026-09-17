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
import { insertNodeAttachmentBlocks } from "../shared/attachmentInsertion";
import { isSupportedSlashItemKey } from "./slashMenuItems";

export function ZhiJianSlashMenu() {
  const editor = useBlockNoteEditor();

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) =>
        filterSuggestionItems(
          getDefaultReactSlashMenuItems(editor)
            .filter((item) => isSupportedSlashItemKey((item as typeof item & { key: string }).key))
            .map((item) => withZhiJianMenuPresentation(withAttachmentBodyGuard(editor, item))),
          query,
        )
      }
    />
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

function withZhiJianMenuPresentation(item: DefaultReactSuggestionItem): DefaultReactSuggestionItem {
  const key = (item as typeof item & { key?: string }).key;
  const Icon = key ? slashMenuIcons[key] : undefined;

  return {
    ...item,
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
