import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";
import type { TreeStore } from "../../core/treeStore";
import { nodeInsertionReference } from "../attachmentInsertion";
import { applyBlockShortcut } from "./blockShortcutCommands";
import { isAppShortcut, resolveShortcut } from "./shortcutRegistry";
import { applyNodeTextShortcut, applyTreeShortcut } from "./treeShortcutCommands";

/**
 * One entry point for a key press in either view.
 *
 * The order is always text first, tree second: `applyBlockShortcut` and
 * `applyNodeTextShortcut` answer what belongs to a node's own content and hand back
 * everything else, which `applyTreeShortcut` then reads as a change to the tree. The
 * app-wide shortcuts (搜索, 缩放, 切换视图, 帮助) are not answered here at all —
 * `App` claims those from a window listener before the views see them, so they work
 * with the focus anywhere.
 */

type Editor<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema> =
  BlockNoteEditor<BS, IS, SS>;

export interface ShortcutHostContext<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema> {
  store: TreeStore;
  /**
   * The editor the caret is in, when there is one. Left out on the map canvas, where
   * a node is selected as a whole and the text shortcuts go through the tree.
   */
  editor?: Editor<BS, IS, SS>;
  /** The map's selected node. In the outline the caret says which node it is. */
  nodeId?: string | null;
  /** The outline's document title, which takes no formatting. */
  protectedBlockId?: string | null;
  onFocusNode?: (nodeId: string) => void;
  onRequestLink?: (selectedText: string) => void;
  onRequestImage?: () => void;
}

/** Returns true when the press was a shortcut this host carried out. */
export function handleShortcutKeyDown<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  event: KeyboardEvent,
  context: ShortcutHostContext<BS, IS, SS>,
) {
  if (event.isComposing) return false;
  const id = resolveShortcut(event);
  if (!id || isAppShortcut(id)) return false;

  const { store, editor, protectedBlockId, onFocusNode, onRequestLink, onRequestImage } = context;
  const nodeId = shortcutNodeId(context);

  const handled = editor
    ? applyBlockShortcut(id, { editor, protectedBlockId, onRequestLink, onRequestImage })
    : applyNodeTextShortcut(id, { store, nodeId, onFocusNode });

  if (handled || applyTreeShortcut(id, { store, nodeId, onFocusNode })) {
    event.preventDefault();
    // BlockNote binds Mod-Alt-1/2/3 and Mod-Alt-q of its own, on the contenteditable
    // below this handler; stopping here is what lets the table above override them.
    event.stopPropagation();
    return true;
  }
  return false;
}

/**
 * Which node a structural shortcut acts on. In the outline the caret may be sitting
 * in one of a node's attachments — a quote, a picture, the description — and none of
 * those is a row that can be collapsed or moved, so the owning node stands in.
 */
function shortcutNodeId<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>({
  store,
  editor,
  nodeId,
}: ShortcutHostContext<BS, IS, SS>) {
  if (!editor) return nodeId ?? null;
  const blockId = editor.getTextCursorPosition().block?.id;
  if (!blockId) return nodeId ?? null;
  if (store.getNode(blockId)) return blockId;
  return nodeInsertionReference(editor, blockId)?.id ?? null;
}
