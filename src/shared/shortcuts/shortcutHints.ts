/**
 * 菜单里那一小块快捷键提示，取自 shortcutRegistry.ts。
 *
 * 存在的理由只有一个：菜单不许自己写第二份快捷键。手写的那份不会跟着绑定一起改，
 * 迟早显示的和实际按下去的不是同一个键。所以菜单只问这里，这里只问 registry。
 */
import {
  NATIVE_SHORTCUTS,
  SHORTCUTS,
  formatShortcutHint,
  type ShortcutId,
} from "./shortcutRegistry";

/** registry 绑定的那些快捷键。找不到就返回 undefined——宁可不显示，也不显示错的。 */
export function shortcutHint(id: ShortcutId): string | undefined {
  const definition = SHORTCUTS.find((shortcut) => shortcut.id === id);
  return definition ? formatShortcutHint(definition) : undefined;
}

/**
 * 浏览器和编辑器自带的那些（NATIVE_SHORTCUTS）。
 *
 * 那张表把成对的功能并在一行写——「撤销 / 重做」配「Ctrl Z / Ctrl Shift Z」，因为帮助面板是
 * 一行显示一对。菜单里是一项一条，所以按 " / " 拆开、按同一个位置对上，取自己那一半。
 * 拆出来两边数量对不上就当没找到：显示半个不相干的键比不显示更糟。
 */
export function nativeShortcutHint(label: string): string | undefined {
  for (const native of NATIVE_SHORTCUTS) {
    if (native.label === label) return native.hint;
    const labels = native.label.split(" / ");
    const hints = native.hint.split(" / ");
    if (labels.length !== hints.length) continue;
    const index = labels.indexOf(label);
    if (index >= 0) return hints[index];
  }
  return undefined;
}
