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

  it("resolves a nested attachment back to its node owner", () => {
    const schema = BlockNoteSchema.create({ blockSpecs: defaultBlockSpecs });
    const editor = BlockNoteEditor.create({ schema, initialContent: [
      { id: "root", type: "paragraph", content: "根", children: [
        { id: "node", type: "paragraph", content: "当前节点" },
      ] },
    ] });
    const [image] = insertNodeAttachmentBlocks(editor, "node", [{ type: "image" }]);
    expect(editor.getBlock("node")?.children.map((child) => child.id)).toContain(image.id);
    expect(editor.getBlock("root")?.children.map((child) => child.id)).toEqual(["node"]);
  });
});
