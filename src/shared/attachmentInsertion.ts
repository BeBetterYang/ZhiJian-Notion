import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";

type Editor<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema> =
  BlockNoteEditor<BS, IS, SS>;

export function nodeInsertionReference<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>, selectedBlockId: string,
) {
  type BlockValue = NonNullable<ReturnType<Editor<BS, IS, SS>["getBlock"]>>;
  const visit = (blocks: BlockValue[], parent: BlockValue | undefined): BlockValue | undefined => {
    for (const block of blocks) {
      if (block.id === selectedBlockId) {
        return isAttachmentBlock(block.type) || block.id.endsWith("::description")
          ? parent ?? block
          : block;
      }
      const nested = visit(block.children, block);
      if (nested) return nested;
    }
    return undefined;
  };
  return visit(editor.document, undefined);
}

export function insertNodeAttachmentBlocks<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(
  editor: Editor<BS, IS, SS>,
  selectedBlockId: string,
  blocks: Parameters<Editor<BS, IS, SS>["insertBlocks"]>[0],
) {
  const reference = nodeInsertionReference(editor, selectedBlockId);
  if (!reference) return [];

  const owner = reference.type === "table"
    ? editor.insertBlocks(
      [{ type: "paragraph", content: "" }] as unknown as Parameters<Editor<BS, IS, SS>["insertBlocks"]>[0],
      reference,
      "after",
    )[0]
    : reference;

  if (!owner) return [];
  const next = editor.updateBlock(owner, {
    children: [...blocks, ...owner.children] as unknown as Parameters<Editor<BS, IS, SS>["updateBlock"]>[1]["children"],
  });
  return next.children.slice(0, blocks.length);
}

// Compatibility wrappers for callers that only need the owning node id.
export function imageInsertionReference<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(editor: Editor<BS, IS, SS>, selectedBlockId: string) {
  return nodeInsertionReference(editor, selectedBlockId)?.id ?? selectedBlockId;
}

export function quoteInsertionReference<BS extends BlockSchema, IS extends InlineContentSchema, SS extends StyleSchema>(editor: Editor<BS, IS, SS>, selectedBlockId: string) {
  return nodeInsertionReference(editor, selectedBlockId)?.id ?? selectedBlockId;
}

export function isAttachmentBlock(type: string | undefined) {
  return type === "image" || type === "quote";
}
