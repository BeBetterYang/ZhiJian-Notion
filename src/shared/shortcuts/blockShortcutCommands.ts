import { getBlockInfo, getNodeById } from "@blocknote/core";
import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";
import {
  SHORTCUT_BACKGROUND_COLORS,
  SHORTCUT_HEADING_LEVELS,
  SHORTCUT_TEXT_COLORS,
  type ShortcutId,
} from "./shortcutRegistry";

/**
 * The shortcuts that act on the text inside a node: headings, 正文, todo, colours,
 * links, tables and images. They run against a BlockNote editor, so both hosts use
 * them — the outline's document editor and a map node's own editor — and a colour
 * lands on the same run of text either way.
 *
 * Everything a shortcut needs to decide is read from the editor here;
 * `treeShortcutCommands.ts` is the other half, for the shortcuts that move nodes
 * around instead.
 */

type Editor<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema> =
  BlockNoteEditor<BS, IS, SS>;

type Block<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema> =
  NonNullable<ReturnType<Editor<BS, IS, SS>["getBlock"]>>;

/** The block a shortcut acts on: the selection's first block, else the caret's. */
export function shortcutTargetBlock<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
): Block<BS, IS, SS> | undefined {
  return editor.getSelection()?.blocks[0] ?? editor.getTextCursorPosition().block;
}

/**
 * The document positions a block's own text spans, so a colour pressed with no
 * selection can paint the whole node the way mubu does. Returns null for a block
 * that holds no inline content of its own — a table, an image.
 */
export function blockTextRange<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  blockId: string,
) {
  const doc = editor.prosemirrorState.doc;
  const node = getNodeById(blockId, doc);
  if (!node) return null;
  const info = getBlockInfo(node);
  if (!info.isBlockContainer) return null;
  // `beforePos` sits on the content node itself, so the first text position is one
  // past it and the last is one short of `afterPos`.
  return { from: info.blockContent.beforePos + 1, to: info.blockContent.afterPos - 1 };
}

export interface BlockShortcutContext<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema> {
  editor: Editor<BS, IS, SS>;
  /**
   * A block that must stay as it is — the outline's document title, which is the
   * tree's root and carries no formatting of its own. The shortcut is still counted
   * as handled, so nothing else answers it either.
   */
  protectedBlockId?: string | null;
  /** A URL is needed: the host asks for one and calls `applyLink` with the answer. */
  onRequestLink?: (selectedText: string) => void;
  /** A file is needed: the host opens the picker and inserts the image itself. */
  onRequestImage?: () => void;
}

/** Returns true when the shortcut was one of these and has been carried out. */
export function applyBlockShortcut<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  id: ShortcutId,
  { editor, protectedBlockId, onRequestLink, onRequestImage }: BlockShortcutContext<BS, IS, SS>,
) {
  if (!isBlockShortcut(id)) return false;

  const block = shortcutTargetBlock(editor);
  if (!block) return true;
  if (protectedBlockId && block.id === protectedBlockId) return true;

  const headingLevel = SHORTCUT_HEADING_LEVELS.get(id);
  if (headingLevel) {
    updateBlock(editor, block, { type: "heading", props: { level: headingLevel } });
    return true;
  }

  if (id === "set-paragraph") {
    updateBlock(editor, block, { type: "paragraph" });
    return true;
  }

  if (id === "toggle-todo") {
    updateBlock(editor, block, {
      type: block.type === "checkListItem" ? "paragraph" : "checkListItem",
    });
    return true;
  }

  if (id === "toggle-todo-done") {
    if (block.type !== "checkListItem") return true;
    const checked = (block.props as { checked?: boolean }).checked ?? false;
    updateBlock(editor, block, { props: { checked: !checked } });
    return true;
  }

  if (SHORTCUT_TEXT_COLORS.has(id)) {
    const color = SHORTCUT_TEXT_COLORS.get(id) ?? null;
    paint(editor, block, () => {
      if (color === null) {
        removeStyles(editor, { textColor: "" });
      } else {
        addStyles(editor, { textColor: color });
      }
    });
    return true;
  }

  const background = SHORTCUT_BACKGROUND_COLORS.get(id);
  if (background) {
    // Toggled rather than set: the user's list gives 文字颜色 an explicit 默认 to
    // clear with (Alt D) but no such key for backgrounds, so pressing the same
    // colour again is the way back to no background at all.
    paint(editor, block, () => toggleStyles(editor, { backgroundColor: background }));
    return true;
  }

  if (id === "insert-table") {
    editor.insertBlocks(
      [
        {
          type: "table",
          content: {
            type: "tableContent",
            rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }],
          },
        },
      ] as unknown as Parameters<Editor<BS, IS, SS>["insertBlocks"]>[0],
      block,
      "after",
    );
    return true;
  }

  if (id === "insert-image") {
    onRequestImage?.();
    return true;
  }

  if (id === "insert-link") {
    onRequestLink?.(editor.getSelectedText());
    return true;
  }

  return true;
}

/**
 * Turns the selection into a link once the host has a URL. With nothing selected
 * the URL doubles as the link text, which is what a bare Ctrl K on an empty caret
 * can reasonably mean.
 */
export function applyLink<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  url: string,
  text?: string,
) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const label = text?.trim() || editor.getSelectedText();
  editor.createLink(trimmed, label || trimmed);
}

const BLOCK_SHORTCUT_IDS = new Set<ShortcutId>([
  "insert-link",
  "heading-1",
  "heading-2",
  "heading-3",
  "set-paragraph",
  "text-color-default",
  "text-color-red",
  "text-color-yellow",
  "text-color-green",
  "text-color-blue",
  "text-color-purple",
  "background-color-yellow",
  "background-color-red",
  "background-color-gray",
  "background-color-green",
  "background-color-blue",
  "background-color-pink",
  "toggle-todo",
  "toggle-todo-done",
  "insert-table",
  "insert-image",
]);

export function isBlockShortcut(id: ShortcutId) {
  return BLOCK_SHORTCUT_IDS.has(id);
}

/**
 * Runs a styling change over the whole node when nothing is selected, and over the
 * selection when something is. Mubu colours the node you are standing in, and a
 * caret-only `setMark` would instead colour the next character typed — which looks
 * like the shortcut did nothing.
 *
 * The text itself is untouched, so the document keeps its length and the caret can
 * go back exactly where it was.
 */
function paint<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  block: Block<BS, IS, SS>,
  change: () => void,
) {
  const selection = editor.prosemirrorState.selection;
  if (!selection.empty) {
    change();
    return;
  }

  const range = blockTextRange(editor, block.id);
  if (!range || range.from >= range.to) {
    // An empty node has nothing to paint: leave BlockNote's own behaviour, where
    // the style waits for the next character.
    change();
    return;
  }

  const caret = { from: selection.from, to: selection.to };
  editor._tiptapEditor.commands.setTextSelection(range);
  change();
  editor._tiptapEditor.commands.setTextSelection(caret);
}

function updateBlock<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  block: Block<BS, IS, SS>,
  update: Record<string, unknown>,
) {
  editor.updateBlock(block, update as unknown as Parameters<Editor<BS, IS, SS>["updateBlock"]>[1]);
}

function addStyles<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  styles: Record<string, string>,
) {
  editor.addStyles(styles as unknown as Parameters<Editor<BS, IS, SS>["addStyles"]>[0]);
}

function removeStyles<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  styles: Record<string, string>,
) {
  editor.removeStyles(styles as unknown as Parameters<Editor<BS, IS, SS>["removeStyles"]>[0]);
}

function toggleStyles<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  styles: Record<string, string>,
) {
  editor.toggleStyles(styles as unknown as Parameters<Editor<BS, IS, SS>["toggleStyles"]>[0]);
}
