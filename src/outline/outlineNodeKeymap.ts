import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  PartialBlock,
  StyleSchema,
} from "@blocknote/core";
import { isAttachmentBlock } from "../shared/attachmentInsertion";

type Editor<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema> =
  BlockNoteEditor<BS, IS, SS>;

/** The shape the decisions below need from a projected outline block. */
export interface OutlineBlockLike {
  id: string;
  type: string;
  content?: unknown;
  children: OutlineBlockLike[];
}

export type OutlineNodeKeyAction = "default" | "protect-attachments" | "delete-empty-node";

/**
 * A node's images and quotes are projected as children of the block that owns
 * them, so anything that removes or merges that block strands them. Splitting
 * the children in two is the basis for every decision here.
 */
export function partitionNodeChildren<T extends { type: string }>(block: { children: T[] }) {
  return {
    attachments: block.children.filter((child) => isAttachmentBlock(child.type)),
    childNodes: block.children.filter((child) => !isAttachmentBlock(child.type)),
  };
}

export function hasNodeAttachments(block: { children: { type: string }[] }) {
  return block.children.some((child) => isAttachmentBlock(child.type));
}

export function isOutlineBlockContentEmpty(block: { content?: unknown }) {
  const content = block.content;
  if (content === undefined || content === null) return true;
  if (typeof content === "string") return content.length === 0;
  if (Array.isArray(content)) {
    return content.every((item) => {
      if (typeof item === "string") return item.length === 0;
      if (!item || typeof item !== "object") return false;
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? text.length === 0 : false;
    });
  }
  return false;
}

export function outlineNodeKeyAction(params: {
  key: string;
  block: OutlineBlockLike;
  isRoot: boolean;
  isEmpty: boolean;
  atStart: boolean;
  atEnd: boolean;
  selectionEmpty: boolean;
}): OutlineNodeKeyAction {
  const { key, block, isRoot, isEmpty, atStart, atEnd, selectionEmpty } = params;
  if (!selectionEmpty || (key !== "Backspace" && key !== "Delete")) return "default";
  // Emptying a quote and pressing Backspace once more is how a note is taken away
  // again. BlockNote answers that press by turning the quote into a paragraph — in
  // this outline a node of its own — so the quote is removed in one press instead,
  // and the caret goes back to the end of the 正文 it hung under: the block before
  // it in reading order, which is what `previousFocusableBlockId` resolves.
  if (key === "Backspace" && isEmpty && block.type === "quote") return "delete-empty-node";
  // An attachment deletes on its own terms — the caret is inside the quote or on
  // the image, and the user is aiming at it rather than at the node. A table's
  // caret lives in a cell, where neither rule applies.
  if (isAttachmentBlock(block.type) || block.type === "table") return "default";
  // Backspace at the start merges this block away; Delete at the end pulls the
  // next one in. Both destroy whichever block owns the attachments.
  if (!(key === "Backspace" ? atStart : atEnd)) return "default";
  if (hasNodeAttachments(block)) return "protect-attachments";
  // BlockNote un-nests a nested block on the first Backspace and only removes it
  // on the second. For a line with no text that reads as a dead key press, so
  // take it out in one.
  if (key === "Backspace" && isEmpty && !isRoot) return "delete-empty-node";
  return "default";
}

export function outlineEnterAction(params: {
  block: OutlineBlockLike;
  atEnd: boolean;
  selectionEmpty: boolean;
  focusedNodeId?: string | null;
}): "default" | "insert-child" | "insert-past-attachments" {
  const { block, atEnd, selectionEmpty, focusedNodeId } = params;
  if (!selectionEmpty || !atEnd) return "default";
  if (isAttachmentBlock(block.type) || block.type === "table") return "default";
  if (focusedNodeId === block.id) return "insert-child";
  return hasNodeAttachments(block) ? "insert-past-attachments" : "default";
}

/**
 * The block a caret would land in when leaving `targetId` upwards, in the order
 * the outline is read. Images hold no caret and a table's is a cell rather than
 * a line end, so both are stepped over.
 */
export function previousFocusableBlockId(blocks: OutlineBlockLike[], targetId: string) {
  const flat: OutlineBlockLike[] = [];
  const walk = (list: OutlineBlockLike[]) => {
    for (const block of list) {
      flat.push(block);
      walk(block.children);
    }
  };
  walk(blocks);
  const index = flat.findIndex((block) => block.id === targetId);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (flat[cursor].type !== "image" && flat[cursor].type !== "table") return flat[cursor].id;
  }
  return undefined;
}

/** Returns true when the key was handled and BlockNote must not see it. */
export function handleOutlineNodeKeyDown<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  event: KeyboardEvent,
  editor: Editor<BS, IS, SS>,
  focusedNodeId?: string | null,
) {
  if (event.key !== "Backspace" && event.key !== "Delete" && event.key !== "Enter") return false;
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key === "Enter" && event.shiftKey) return false;

  type Insert = Parameters<Editor<BS, IS, SS>["insertBlocks"]>[0];
  let block: ReturnType<Editor<BS, IS, SS>["getTextCursorPosition"]>["block"];
  try {
    block = editor.getTextCursorPosition().block;
  } catch {
    // Block selections and file blocks expose no text cursor.
    return false;
  }
  const selection = editor.prosemirrorState.selection;
  const parent = selection.$from.parent;
  const atStart = selection.$from.parentOffset === 0;
  const atEnd = selection.$from.parentOffset === parent.content.size;

  if (event.key === "Enter") {
    const enterAction = outlineEnterAction({ block, atEnd, selectionEmpty: selection.empty, focusedNodeId });
    if (enterAction === "default") return false;
    event.preventDefault();
    event.stopPropagation();
    if (enterAction === "insert-child") {
      const updated = editor.updateBlock(block, {
        children: [...block.children, { type: "paragraph", content: "" }],
      } as unknown as PartialBlock<BS, IS, SS>);
      const created = updated.children.at(-1);
      if (created) editor.setTextCursorPosition(created, "start");
      return true;
    }
    const { attachments, childNodes } = partitionNodeChildren(block);
    // One transaction: the node keeps its attachments, the new node takes the
    // child nodes BlockNote's own Enter would have moved, and it lands after the
    // attachments instead of in front of them.
    const { insertedBlocks } = editor.replaceBlocks(
      [block],
      [
        { ...block, children: attachments },
        { type: "paragraph", content: "", children: childNodes },
      ] as unknown as Insert,
    );
    const created = insertedBlocks[1];
    if (created) editor.setTextCursorPosition(created, "start");
    return true;
  }

  const action = outlineNodeKeyAction({
    key: event.key,
    block,
    isRoot: editor.document[0]?.id === block.id,
    isEmpty: isOutlineBlockContentEmpty(block),
    atStart,
    atEnd,
    selectionEmpty: selection.empty,
  });
  if (action === "default") return false;
  event.preventDefault();
  event.stopPropagation();
  if (action === "protect-attachments") return true;

  // Resolved before the removal, while the block is still in the document.
  const previousId = previousFocusableBlockId(editor.document, block.id);
  const { childNodes } = partitionNodeChildren(block);
  // Child nodes outlive their parent line, the way they do on BlockNote's own
  // second Backspace: they take its place at its level rather than going with it.
  if (childNodes.length) editor.replaceBlocks([block], childNodes as unknown as Insert);
  else editor.removeBlocks([block]);
  if (previousId) {
    try {
      editor.setTextCursorPosition(previousId, "end");
      editor.focus();
    } catch {
      // The previous block can be a shape with no inline caret.
    }
  }
  return true;
}
