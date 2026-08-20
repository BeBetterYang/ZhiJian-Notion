import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useBlockNoteEditor,
} from "@blocknote/react";

const removedItems = new Set([
  "heading_4",
  "heading_5",
  "heading_6",
  "toggle_heading",
  "toggle_heading_2",
  "toggle_heading_3",
  "toggle_list",
  "numbered_list",
  "bullet_list",
  "divider",
]);

export function ZhiJianSlashMenu() {
  const editor = useBlockNoteEditor();

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) =>
        filterSuggestionItems(
          getDefaultReactSlashMenuItems(editor).filter(
            (item) => !removedItems.has((item as typeof item & { key: string }).key),
          ),
          query,
        )
      }
    />
  );
}
