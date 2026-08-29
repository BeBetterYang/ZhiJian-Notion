// ZhiJianTree only knows text / heading / todo / table nodes plus quote and image
// attachments, so anything else the default slash menu offers cannot survive a round
// trip: a video, audio or file block comes back as an empty node, a code block loses
// its code, and 表情符号 opens a ":" picker this editor never mounts.
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
  "emoji",
]);

export function isSupportedSlashItemKey(key: string) {
  return !removedItems.has(key);
}
