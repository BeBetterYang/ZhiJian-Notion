// ZhiJianTree only knows text / heading / todo / table nodes plus quote and image
// attachments, so anything else the default slash menu offers cannot survive a round
// trip: a video, audio or file block comes back as an empty node and a code block loses
// its code. The built-in emoji picker remains available through the slash menu.
const removedItems = new Set([
  "heading_4",
  "heading_5",
  "heading_6",
  "toggle_heading",
  "toggle_heading_2",
  "toggle_heading_3",
  "toggle_list",
  "numbered_list",
  "bullet_list",
  "divider",
  "code_block",
  "video",
  "audio",
  "file",
]);

const slashMenuOrder = ["heading", "heading_2", "heading_3", "paragraph"];

export function orderSlashMenuItems<T extends { key?: string }>(items: T[]) {
  const order = new Map(slashMenuOrder.map((key, index) => [key, index]));
  return [...items].sort((a, b) => {
    const aIndex = order.get(a.key ?? "") ?? slashMenuOrder.length;
    const bIndex = order.get(b.key ?? "") ?? slashMenuOrder.length;
    return aIndex - bIndex;
  });
}

export function isSupportedSlashItemKey(key: string) {
  return !removedItems.has(key);
}
