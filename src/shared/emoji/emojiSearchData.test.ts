import { describe, expect, it } from "vitest";
import type { EmojiMartData } from "@emoji-mart/data";
import { withChineseEmojiSearch } from "./emojiSearchData";

function createData(): EmojiMartData {
  return {
    categories: [{ id: "people", emojis: ["grinning"] }],
    emojis: {
      grinning: {
        id: "grinning",
        name: "Grinning Face",
        keywords: ["happy"],
        skins: [{ unified: "1f600", native: "😀" }],
        version: 1,
      },
    },
    aliases: {},
    sheet: { cols: 1, rows: 1 },
  };
}

describe("withChineseEmojiSearch", () => {
  it("adds Chinese, pinyin, initials, and syllable keywords", () => {
    const enhanced = withChineseEmojiSearch(createData());
    const keywords = enhanced.emojis.grinning.keywords;

    expect(keywords).toContain("嘿嘿");
    expect(keywords).toContain("heihei");
    expect(keywords).toContain("hh");
    expect(keywords).toContain("hei");
    expect(keywords).toContain("嘿");
  });

  it("does not mutate the original emoji data", () => {
    const original = createData();
    const enhanced = withChineseEmojiSearch(original);

    expect(original.emojis.grinning.keywords).toEqual(["happy"]);
    expect(enhanced.emojis.grinning).not.toBe(original.emojis.grinning);
    expect(enhanced.emojis.grinning.skins[0]).not.toBe(original.emojis.grinning.skins[0]);
    expect(enhanced.categories[0]).not.toBe(original.categories[0]);
  });
});
