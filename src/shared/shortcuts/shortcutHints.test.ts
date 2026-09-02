import { describe, expect, it } from "vitest";
import { nativeShortcutHint, shortcutHint } from "./shortcutHints";

describe("shortcutHint", () => {
  it("reads the combo off the registry", () => {
    expect(shortcutHint("shortcut-help")).toBe("Ctrl /");
    expect(shortcutHint("toggle-collapse-all")).toBe("Ctrl Alt Shift .");
    expect(shortcutHint("toggle-collapse-level-1")).toBe("Ctrl Alt 1");
  });

  it("keeps both combos of a shortcut that answers two", () => {
    expect(shortcutHint("toggle-collapse")).toBe("Ctrl . / Alt .");
  });
});

describe("nativeShortcutHint", () => {
  it("takes its own half of a paired entry", () => {
    expect(nativeShortcutHint("撤销")).toBe("Ctrl Z");
    expect(nativeShortcutHint("重做")).toBe("Ctrl Shift Z");
  });

  it("reads an entry that stands alone", () => {
    expect(nativeShortcutHint("全局搜索")).toBe("Ctrl Shift F");
    expect(nativeShortcutHint("多选")).toBe("Shift 鼠标点击");
  });

  it("has nothing to say about a name the registry does not carry", () => {
    // 拿不到就该是 undefined，菜单据此不画 <kbd>——显示一个错的键比不显示更糟。
    expect(nativeShortcutHint("添加星标")).toBeUndefined();
    expect(nativeShortcutHint("撤销 ")).toBeUndefined();
  });
});
