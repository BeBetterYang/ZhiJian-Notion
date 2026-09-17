import { describe, expect, it } from "vitest";
import { isSupportedSlashItemKey, orderSlashMenuItems } from "./slashMenuItems";

describe("slash menu items", () => {
  it("keeps the block types ZhiJianTree can store", () => {
    for (const key of ["paragraph", "heading", "heading_2", "heading_3", "quote", "check_list", "table", "image", "emoji"]) {
      expect(isSupportedSlashItemKey(key), key).toBe(true);
    }
  });

  // A video, audio or file block round-trips into an empty node and a code block loses its code.
  it("drops the block types the tree cannot represent", () => {
    for (const key of ["video", "audio", "file", "code_block", "divider", "bullet_list", "numbered_list", "toggle_list", "heading_4"]) {
      expect(isSupportedSlashItemKey(key), key).toBe(false);
    }
  });

  it("places paragraph directly below the third-level heading", () => {
    const items = orderSlashMenuItems([
      { key: "quote" },
      { key: "paragraph" },
      { key: "heading_3" },
      { key: "heading" },
      { key: "heading_2" },
      { key: "emoji" },
    ]);

    expect(items.map((item) => item.key)).toEqual([
      "heading",
      "heading_2",
      "heading_3",
      "paragraph",
      "quote",
      "emoji",
    ]);
  });
});
