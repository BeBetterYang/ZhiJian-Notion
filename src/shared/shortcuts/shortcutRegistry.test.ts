import { describe, expect, it } from "vitest";
import {
  SHORTCUTS,
  formatShortcutHint,
  isAppShortcut,
  resolveShortcut,
  type ShortcutCombo,
} from "./shortcutRegistry";

function press(code: string, modifiers: { mod?: boolean; alt?: boolean; shift?: boolean } = {}) {
  return {
    code,
    ctrlKey: modifiers.mod ?? false,
    metaKey: false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
  };
}

describe("resolveShortcut", () => {
  it("reads the combos the user asked for", () => {
    expect(resolveShortcut(press("KeyF", { mod: true }))).toBe("find-in-document");
    expect(resolveShortcut(press("KeyK", { mod: true }))).toBe("insert-link");
    expect(resolveShortcut(press("Digit2", { alt: true }))).toBe("heading-2");
    expect(resolveShortcut(press("Digit4", { alt: true }))).toBe("set-paragraph");
    expect(resolveShortcut(press("KeyH", { mod: true, alt: true }))).toBe("background-color-gray");
    expect(resolveShortcut(press("KeyL", { mod: true, shift: true }))).toBe("toggle-todo");
    expect(resolveShortcut(press("Backspace", { mod: true, shift: true }))).toBe("delete-node");
    expect(resolveShortcut(press("ArrowUp", { mod: true, shift: true }))).toBe("move-node-up");
    expect(resolveShortcut(press("BracketRight", { mod: true }))).toBe("zoom-in");
    expect(resolveShortcut(press("KeyM", { mod: true, alt: true, shift: true }))).toBe("toggle-view");
    expect(resolveShortcut(press("Slash", { mod: true }))).toBe("shortcut-help");
  });

  it("answers ⌘ the same as Ctrl", () => {
    expect(resolveShortcut({ code: "KeyD", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe(
      "duplicate-node",
    );
  });

  it("keeps the period family apart", () => {
    expect(resolveShortcut(press("Period", { mod: true }))).toBe("toggle-collapse");
    expect(resolveShortcut(press("Period", { alt: true }))).toBe("toggle-collapse");
    expect(resolveShortcut(press("Period", { mod: true, shift: true }))).toBe("toggle-collapse-siblings");
    expect(resolveShortcut(press("Period", { mod: true, alt: true, shift: true }))).toBe("toggle-collapse-all");
  });

  it("keeps a digit's three shortcuts apart by modifier", () => {
    expect(resolveShortcut(press("Digit1", { alt: true }))).toBe("heading-1");
    expect(resolveShortcut(press("Digit1", { mod: true, alt: true }))).toBe("toggle-collapse-level-1");
    expect(resolveShortcut(press("Digit1", { mod: true }))).toBeNull();
  });

  it("ignores a plain key press", () => {
    expect(resolveShortcut(press("KeyD"))).toBeNull();
    expect(resolveShortcut(press("Enter"))).toBeNull();
    expect(resolveShortcut(press("Enter", { alt: true }))).toBe("insert-image");
  });

  it("routes only the app-wide shortcuts away from the editors", () => {
    expect(isAppShortcut("find-in-document")).toBe(true);
    expect(isAppShortcut("toggle-view")).toBe(true);
    expect(isAppShortcut("heading-1")).toBe(false);
    expect(isAppShortcut("toggle-collapse")).toBe(false);
  });
});

describe("the table itself", () => {
  it("binds each combination once", () => {
    const seen = new Map<string, string>();
    for (const definition of SHORTCUTS) {
      for (const combo of definition.combos) {
        const key = comboKey(combo);
        expect(seen.has(key), `${key} is bound to both ${seen.get(key)} and ${definition.id}`).toBe(false);
        seen.set(key, definition.id);
      }
    }
  });

  it("writes a hint the way the shortcut is pressed", () => {
    const hint = (id: string) => formatShortcutHint(SHORTCUTS.find((item) => item.id === id)!);

    expect(hint("delete-node")).toBe("Ctrl Shift Backspace");
    expect(hint("toggle-collapse")).toBe("Ctrl . / Alt .");
    expect(hint("toggle-collapse-all")).toBe("Ctrl Alt Shift .");
    expect(hint("move-node-down")).toBe("Ctrl Shift ↓");
    expect(hint("heading-3")).toBe("Alt 3");
    expect(hint("zoom-out")).toBe("Ctrl [");
  });
});

function comboKey(combo: ShortcutCombo) {
  return [combo.mod ? "mod" : "", combo.alt ? "alt" : "", combo.shift ? "shift" : "", combo.code].join("-");
}
