/**
 * Every keyboard shortcut the document editors answer, in one table.
 *
 * The table is the only place a key combination is written down: the resolver
 * below matches against it, and the help dialog (Ctrl /) renders it, so a
 * shortcut cannot be bound to one thing and documented as another.
 *
 * Combos are matched on `KeyboardEvent.code` rather than `key`. Almost half of
 * these shortcuts hold Alt, and on macOS Alt rewrites the character: Alt+1
 * arrives as `key: "¡"` and Alt+D as `key: "∂"`, so a `key`-based table would
 * simply not fire there.
 */

export type ShortcutId =
  | "find-in-document"
  | "insert-link"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "set-paragraph"
  | "text-color-default"
  | "text-color-red"
  | "text-color-yellow"
  | "text-color-green"
  | "text-color-blue"
  | "text-color-purple"
  | "background-color-yellow"
  | "background-color-red"
  | "background-color-gray"
  | "background-color-green"
  | "background-color-blue"
  | "background-color-pink"
  | "toggle-todo"
  | "toggle-todo-done"
  | "insert-table"
  | "insert-image"
  | "toggle-collapse"
  | "toggle-collapse-siblings"
  | "toggle-collapse-level-1"
  | "toggle-collapse-level-2"
  | "toggle-collapse-level-3"
  | "toggle-collapse-all"
  | "delete-node"
  | "duplicate-node"
  | "move-node-up"
  | "move-node-down"
  | "zoom-in"
  | "zoom-out"
  | "toggle-view"
  | "shortcut-help";

export interface ShortcutCombo {
  /** A `KeyboardEvent.code` value — "KeyD", "Digit1", "Period", "ArrowUp". */
  code: string;
  /** Ctrl on Windows and Linux, ⌘ or Ctrl on macOS. */
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export type ShortcutSection =
  | "搜索"
  | "样式和功能"
  | "文字颜色"
  | "背景颜色"
  | "主题操作"
  | "导航";

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  section: ShortcutSection;
  combos: ShortcutCombo[];
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: "find-in-document", label: "文档内搜索", section: "搜索", combos: [{ code: "KeyF", mod: true }] },

  { id: "insert-link", label: "嵌入链接", section: "样式和功能", combos: [{ code: "KeyK", mod: true }] },
  { id: "heading-1", label: "1 级标题", section: "样式和功能", combos: [{ code: "Digit1", alt: true }] },
  { id: "heading-2", label: "2 级标题", section: "样式和功能", combos: [{ code: "Digit2", alt: true }] },
  { id: "heading-3", label: "3 级标题", section: "样式和功能", combos: [{ code: "Digit3", alt: true }] },
  { id: "set-paragraph", label: "设为正文", section: "样式和功能", combos: [{ code: "Digit4", alt: true }] },

  { id: "text-color-default", label: "默认", section: "文字颜色", combos: [{ code: "KeyD", alt: true }] },
  { id: "text-color-red", label: "红色", section: "文字颜色", combos: [{ code: "KeyR", alt: true }] },
  { id: "text-color-yellow", label: "黄色", section: "文字颜色", combos: [{ code: "KeyY", alt: true }] },
  { id: "text-color-green", label: "绿色", section: "文字颜色", combos: [{ code: "KeyG", alt: true }] },
  { id: "text-color-blue", label: "蓝色", section: "文字颜色", combos: [{ code: "KeyB", alt: true }] },
  { id: "text-color-purple", label: "紫色", section: "文字颜色", combos: [{ code: "KeyP", alt: true }] },

  { id: "background-color-yellow", label: "黄色", section: "背景颜色", combos: [{ code: "KeyY", mod: true, alt: true }] },
  { id: "background-color-red", label: "红色", section: "背景颜色", combos: [{ code: "KeyR", mod: true, alt: true }] },
  { id: "background-color-gray", label: "灰色", section: "背景颜色", combos: [{ code: "KeyH", mod: true, alt: true }] },
  { id: "background-color-green", label: "绿色", section: "背景颜色", combos: [{ code: "KeyG", mod: true, alt: true }] },
  { id: "background-color-blue", label: "蓝色", section: "背景颜色", combos: [{ code: "KeyB", mod: true, alt: true }] },
  { id: "background-color-pink", label: "粉色", section: "背景颜色", combos: [{ code: "KeyP", mod: true, alt: true }] },

  { id: "toggle-todo", label: "添加/删除待办", section: "主题操作", combos: [{ code: "KeyL", mod: true, shift: true }] },
  { id: "toggle-todo-done", label: "待办已完成/取消完成", section: "主题操作", combos: [{ code: "KeyK", mod: true, shift: true }] },
  { id: "insert-table", label: "添加表格", section: "主题操作", combos: [{ code: "KeyT", mod: true, alt: true }] },
  { id: "insert-image", label: "添加图片", section: "主题操作", combos: [{ code: "Enter", alt: true }] },
  {
    id: "toggle-collapse",
    label: "展开/折叠",
    section: "主题操作",
    // Two combos on purpose: Ctrl+. is the Windows habit, Alt+. the macOS one,
    // and the period is the same key either way.
    combos: [{ code: "Period", mod: true }, { code: "Period", alt: true }],
  },
  { id: "toggle-collapse-siblings", label: "展开/折叠同级主题", section: "主题操作", combos: [{ code: "Period", mod: true, shift: true }] },
  { id: "toggle-collapse-level-1", label: "展开/折叠 1 级主题", section: "主题操作", combos: [{ code: "Digit1", mod: true, alt: true }] },
  { id: "toggle-collapse-level-2", label: "展开/折叠 2 级主题", section: "主题操作", combos: [{ code: "Digit2", mod: true, alt: true }] },
  { id: "toggle-collapse-level-3", label: "展开/折叠 3 级主题", section: "主题操作", combos: [{ code: "Digit3", mod: true, alt: true }] },
  { id: "toggle-collapse-all", label: "全部展开/折叠", section: "主题操作", combos: [{ code: "Period", mod: true, alt: true, shift: true }] },
  { id: "delete-node", label: "快速删除", section: "主题操作", combos: [{ code: "Backspace", mod: true, shift: true }] },
  { id: "duplicate-node", label: "创建副本", section: "主题操作", combos: [{ code: "KeyD", mod: true }] },

  { id: "move-node-up", label: "向上移动主题", section: "导航", combos: [{ code: "ArrowUp", mod: true, shift: true }] },
  { id: "move-node-down", label: "向下移动主题", section: "导航", combos: [{ code: "ArrowDown", mod: true, shift: true }] },
  { id: "zoom-in", label: "进入当前主题", section: "导航", combos: [{ code: "BracketRight", mod: true }] },
  { id: "zoom-out", label: "返回上一级主题", section: "导航", combos: [{ code: "BracketLeft", mod: true }] },
  { id: "toggle-view", label: "切换导图/大纲", section: "导航", combos: [{ code: "KeyM", mod: true, alt: true, shift: true }] },
  { id: "shortcut-help", label: "打开快捷键帮助", section: "导航", combos: [{ code: "Slash", mod: true }] },
];

/**
 * Shortcuts the browser, ProseMirror or mind-elixir already answer on their own.
 * Nothing resolves them — they are here so the help dialog is the whole picture
 * rather than only the part this table binds.
 */
export interface NativeShortcut {
  label: string;
  hint: string;
  section: ShortcutSection;
}

export const NATIVE_SHORTCUTS: NativeShortcut[] = [
  { label: "全局搜索", hint: "Ctrl Shift F", section: "搜索" },
  { label: "撤销 / 重做", hint: "Ctrl Z / Ctrl Shift Z", section: "样式和功能" },
  { label: "加粗 / 斜体 / 下划线", hint: "Ctrl B / Ctrl I / Ctrl U", section: "样式和功能" },
  { label: "新增同级主题", hint: "Enter", section: "主题操作" },
  { label: "降级 / 升级主题", hint: "Tab / Shift Tab", section: "主题操作" },
  { label: "上下切换光标", hint: "↑ / ↓", section: "导航" },
  { label: "向上多选 / 向下多选", hint: "Shift ↑ / Shift ↓", section: "导航" },
  { label: "多选", hint: "Shift 鼠标点击", section: "导航" },
];

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  "搜索",
  "样式和功能",
  "文字颜色",
  "背景颜色",
  "主题操作",
  "导航",
];

/**
 * The colour each shortcut paints with, by BlockNote's palette name so that the
 * outline, the map's node editor and the map's own display layer all resolve it to
 * the same swatch. `null` is "默认": the colour comes off rather than on.
 */
export const SHORTCUT_TEXT_COLORS = new Map<ShortcutId, string | null>([
  ["text-color-default", null],
  ["text-color-red", "red"],
  ["text-color-yellow", "yellow"],
  ["text-color-green", "green"],
  ["text-color-blue", "blue"],
  ["text-color-purple", "purple"],
]);

export const SHORTCUT_BACKGROUND_COLORS = new Map<ShortcutId, string>([
  ["background-color-yellow", "yellow"],
  ["background-color-red", "red"],
  ["background-color-gray", "gray"],
  ["background-color-green", "green"],
  ["background-color-blue", "blue"],
  ["background-color-pink", "pink"],
]);

export const SHORTCUT_HEADING_LEVELS = new Map<ShortcutId, 1 | 2 | 3>([
  ["heading-1", 1],
  ["heading-2", 2],
  ["heading-3", 3],
]);

/** The shortcuts the whole app answers, wherever the focus happens to be. */
const APP_SHORTCUT_IDS = new Set<ShortcutId>([
  "find-in-document",
  "zoom-in",
  "zoom-out",
  "toggle-view",
  "shortcut-help",
]);

export function isAppShortcut(id: ShortcutId) {
  return APP_SHORTCUT_IDS.has(id);
}

type ShortcutEventLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

export function resolveShortcut(event: ShortcutEventLike): ShortcutId | null {
  const mod = event.ctrlKey || event.metaKey;
  for (const definition of SHORTCUTS) {
    for (const combo of definition.combos) {
      if (combo.code !== event.code) continue;
      // Every modifier is compared, including the ones a combo leaves out: Alt+1
      // must not answer Ctrl+Alt+1, which is a different shortcut in this table.
      if (Boolean(combo.mod) !== mod) continue;
      if (Boolean(combo.alt) !== event.altKey) continue;
      if (Boolean(combo.shift) !== event.shiftKey) continue;
      return definition.id;
    }
  }
  return null;
}

/** How a combo is written in the help dialog: "Ctrl Shift ." */
export function formatCombo(combo: ShortcutCombo) {
  return [combo.mod ? "Ctrl" : "", combo.alt ? "Alt" : "", combo.shift ? "Shift" : "", formatCode(combo.code)]
    .filter(Boolean)
    .join(" ");
}

export function formatShortcutHint(definition: ShortcutDefinition) {
  return definition.combos.map(formatCombo).join(" / ");
}

function formatCode(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return CODE_LABELS[code] ?? code;
}

const CODE_LABELS: Record<string, string> = {
  Period: ".",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  ArrowUp: "↑",
  ArrowDown: "↓",
};
