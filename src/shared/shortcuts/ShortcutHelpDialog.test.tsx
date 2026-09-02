import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";
import {
  NATIVE_SHORTCUTS,
  SHORTCUTS,
  SHORTCUT_SECTIONS,
  formatShortcutHint,
} from "./shortcutRegistry";

/**
 * 这个面板的全部内容都来自 shortcutRegistry.ts，所以断言也照着那张表算，一条都不手写。
 *
 * 这样才守得住那个目标：以后改快捷键只动 registry，这里跟着变；要是哪天有人在这儿写死了一份，
 * 下面「每一条都在」的断言会在新增快捷键的那次就红。
 */
describe("ShortcutHelpDialog", () => {
  function openDialog() {
    const onClose = vi.fn();
    render(<ShortcutHelpDialog onClose={onClose} />);
    return { onClose, dialog: screen.getByRole("dialog", { name: "快捷键" }) };
  }

  it("按 registry 的六个分类排列", () => {
    const { dialog } = openDialog();

    expect(SHORTCUT_SECTIONS).toEqual(["搜索", "样式和功能", "文字颜色", "背景颜色", "主题操作", "导航"]);
    expect(within(dialog).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent))
      .toEqual(SHORTCUT_SECTIONS);
  });

  it("registry 里的每一条都在自己那一类下面，键位也是 registry 算出来的", () => {
    const { dialog } = openDialog();
    const sectionOf = new Map(
      within(dialog).getAllByRole("heading", { level: 3 })
        .map((heading) => [heading.textContent, heading.parentElement!] as const),
    );

    for (const shortcut of SHORTCUTS) {
      const section = sectionOf.get(shortcut.section)!;
      // 同一个名字在不同分类下会重复（文字颜色和背景颜色都有「红色」），所以限定在本类里找。
      const row = within(section).getAllByText(shortcut.label, { selector: "dt" })[0];
      expect(row, `${shortcut.section} 缺少 ${shortcut.label}`).toBeInTheDocument();
      const hint = row.nextElementSibling!;
      expect(hint.textContent?.replace(/或/g, "/")).toBe(
        formatShortcutHint(shortcut).replace(/ /g, ""),
      );
    }
  });

  it("浏览器和编辑器自带的那些也一起列出来", () => {
    const { dialog } = openDialog();

    for (const native of NATIVE_SHORTCUTS) {
      const section = within(dialog).getAllByRole("heading", { level: 3 })
        .find((heading) => heading.textContent === native.section)!
        .parentElement!;
      expect(
        within(section).getAllByText(native.label, { selector: "dt" })[0],
        `${native.section} 缺少 ${native.label}`,
      ).toBeInTheDocument();
    }
  });

  it("键位用 kbd 显示，并且说明 Mac 上的 Ctrl 是 ⌘", () => {
    const { dialog } = openDialog();

    expect(within(dialog).getAllByText("Ctrl", { selector: "kbd" }).length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Mac 上的 Ctrl 为 ⌘")).toBeInTheDocument();
  });
});
