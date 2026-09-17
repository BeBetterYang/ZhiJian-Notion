import type { EmojiMartData } from "@emoji-mart/data";
import { emojiZhSearchKeywords } from "./emojiZhSearchKeywords";

/**
 * Keep the original data immutable because emoji-mart adds runtime indexes and
 * skin shortcodes to the data object during picker initialization.
 */
export function withChineseEmojiSearch(data: EmojiMartData): EmojiMartData {
  return {
    ...data,
    categories: data.categories.map((category) => ({
      ...category,
      emojis: [...category.emojis],
    })),
    emojis: Object.fromEntries(
      Object.entries(data.emojis).map(([id, emoji]) => [
        id,
        {
          ...emoji,
          keywords: [
            ...new Set([
              ...emoji.keywords,
              ...(emojiZhSearchKeywords[id] ?? []),
            ]),
          ],
          skins: emoji.skins.map((skin) => ({ ...skin })),
        },
      ]),
    ),
    aliases: { ...data.aliases },
    sheet: { ...data.sheet },
  };
}
