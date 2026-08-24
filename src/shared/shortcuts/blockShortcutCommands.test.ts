import { describe, expect, it } from "vitest";
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { applyBlockShortcut, blockTextRange, isBlockShortcut } from "./blockShortcutCommands";

function createEditor(content?: Parameters<typeof BlockNoteEditor.create>[0]) {
  const schema = BlockNoteSchema.create({ blockSpecs: defaultBlockSpecs });
  return BlockNoteEditor.create({
    schema,
    initialContent: [
      { id: "title", type: "heading", props: { level: 1 }, content: "文档标题" },
      { id: "body", type: "paragraph", content: "正文内容" },
    ],
    ...content,
  });
}

function styles(editor: ReturnType<typeof createEditor>, blockId: string) {
  const content = editor.getBlock(blockId)?.content;
  return Array.isArray(content)
    ? content.map((item) => ("styles" in item ? item.styles : {}))
    : [];
}

describe("isBlockShortcut", () => {
  it("claims the text shortcuts and leaves the structural ones", () => {
    expect(isBlockShortcut("heading-2")).toBe(true);
    expect(isBlockShortcut("text-color-red")).toBe(true);
    expect(isBlockShortcut("toggle-collapse")).toBe(false);
    expect(isBlockShortcut("move-node-up")).toBe(false);
  });
});

describe("applyBlockShortcut", () => {
  it("sets a heading level and comes back to 正文", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");

    applyBlockShortcut("heading-3", { editor });
    expect(editor.getBlock("body")?.type).toBe("heading");
    expect(editor.getBlock("body")?.props).toMatchObject({ level: 3 });

    applyBlockShortcut("set-paragraph", { editor });
    expect(editor.getBlock("body")?.type).toBe("paragraph");
  });

  it("keeps a node's children when its type changes", () => {
    const editor = createEditor({
      initialContent: [
        {
          id: "body",
          type: "paragraph",
          content: "父节点",
          children: [{ id: "child", type: "paragraph", content: "子节点" }],
        },
      ],
    } as Parameters<typeof BlockNoteEditor.create>[0]);
    editor.setTextCursorPosition("body", "end");

    applyBlockShortcut("heading-1", { editor });

    expect(editor.getBlock("body")?.children.map((child) => child.id)).toEqual(["child"]);
  });

  it("turns a row into a todo and back, and only ticks a todo", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");

    applyBlockShortcut("toggle-todo-done", { editor });
    expect(editor.getBlock("body")?.props).not.toMatchObject({ checked: true });

    applyBlockShortcut("toggle-todo", { editor });
    expect(editor.getBlock("body")?.type).toBe("checkListItem");

    applyBlockShortcut("toggle-todo-done", { editor });
    expect(editor.getBlock("body")?.props).toMatchObject({ checked: true });

    applyBlockShortcut("toggle-todo", { editor });
    expect(editor.getBlock("body")?.type).toBe("paragraph");
  });

  it("paints the whole node when nothing is selected, and puts the caret back", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");
    const caret = editor.prosemirrorState.selection.from;

    applyBlockShortcut("text-color-blue", { editor });

    expect(styles(editor, "body")).toEqual([{ textColor: "blue" }]);
    expect(editor.prosemirrorState.selection.from).toBe(caret);
    expect(editor.prosemirrorState.selection.empty).toBe(true);
  });

  it("clears the colour again with 默认", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");

    applyBlockShortcut("text-color-red", { editor });
    applyBlockShortcut("text-color-default", { editor });

    expect(styles(editor, "body")).toEqual([{}]);
  });

  it("toggles a background colour off when it is pressed again", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");

    applyBlockShortcut("background-color-gray", { editor });
    expect(styles(editor, "body")).toEqual([{ backgroundColor: "gray" }]);

    applyBlockShortcut("background-color-gray", { editor });
    expect(styles(editor, "body")).toEqual([{}]);
  });

  it("paints only the selection when there is one", () => {
    const editor = createEditor();
    const range = blockTextRange(editor, "body")!;
    editor._tiptapEditor.commands.setTextSelection({ from: range.from, to: range.from + 2 });

    applyBlockShortcut("text-color-green", { editor });

    expect(styles(editor, "body")).toEqual([{ textColor: "green" }, {}]);
  });

  it("leaves the document title alone but still answers the key", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("title", "end");

    expect(applyBlockShortcut("heading-3", { editor, protectedBlockId: "title" })).toBe(true);
    expect(editor.getBlock("title")?.props).toMatchObject({ level: 1 });
    expect(styles(editor, "title")).toEqual([{}]);
  });

  it("adds a table after the row", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");

    applyBlockShortcut("insert-table", { editor });

    expect(editor.document.map((block) => block.type)).toEqual(["heading", "paragraph", "table"]);
  });

  it("hands the link and image shortcuts back to the host", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");
    const asked: string[] = [];

    applyBlockShortcut("insert-link", { editor, onRequestLink: (text) => asked.push(`link:${text}`) });
    applyBlockShortcut("insert-image", { editor, onRequestImage: () => asked.push("image") });

    expect(asked).toEqual(["link:", "image"]);
  });

  it("leaves the structural shortcuts to the tree", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("body", "end");

    expect(applyBlockShortcut("toggle-collapse", { editor })).toBe(false);
    expect(applyBlockShortcut("delete-node", { editor })).toBe(false);
  });
});
