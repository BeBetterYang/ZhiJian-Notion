import { describe, expect, it } from "vitest";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { BlockNoteEditor } from "@blocknote/core";
import { insertNodeAttachmentBlocks } from "./attachmentInsertion";

describe("attachmentInsertion", () => {
  it("inserts attachments as children of the owning node", () => {
    const schema = BlockNoteSchema.create({ blockSpecs: defaultBlockSpecs });
    const editor = BlockNoteEditor.create({ schema, initialContent: [{ id: "body", type: "paragraph", content: "正文" }] });
    const [quote] = insertNodeAttachmentBlocks(editor, "body", [{ type: "quote", content: "引用" }]);
    expect(editor.getBlock("body")?.children.map((child) => child.id)).toContain(quote.id);
    expect(editor.document).toHaveLength(1);
  });
});
