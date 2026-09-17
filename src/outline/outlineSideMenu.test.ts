import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("outline side menu controls", () => {
  it("keeps the drag handle hit area separate from the persistent node marker", () => {
    expect(styles).toContain('.outline-panel .bn-side-menu [draggable="true"]');
    expect(styles).toContain("box-sizing: border-box;");
    expect(styles).toContain("width: 24px;");
    expect(styles).toContain("min-width: 24px;");
    expect(styles).toContain("height: 24px;");
    expect(styles).toContain("min-height: 24px;");
    expect(styles).toContain("left: calc(100% - 9px);");
    expect(styles).toContain("display: grid;");
    expect(styles).toContain("place-items: center;");
    expect(styles).toContain("--zhijian-guide-step: 24px;");
    expect(styles).toContain("gap: calc(var(--zhijian-guide-step) - 20px);");
    expect(styles).toContain("transform: translateX(-1px);");
    expect(styles).toContain(".outline-panel .bn-side-menu .outline-focus-dot");
    expect(styles).toContain("display: none;");
    expect(styles).toContain(".outline-panel .bn-side-menu .outline-focus-drag-handle::before");
    expect(styles).toContain("top: 9px;");
    expect(styles).toContain("left: 9px;");
  });

  it("attaches hover and focus feedback to the drag handle itself", () => {
    expect(styles).toContain(".outline-focus-drag-handle:hover::before,");
    expect(styles).toContain(".outline-focus-drag-handle:focus-visible::before,");
    expect(styles).toContain(".outline-focus-drag-handle:active::before {");
    expect(styles).not.toContain('[draggable="true"]:hover::before');
    expect(styles).not.toContain('[draggable="true"]:focus-visible::before');
    expect(styles).not.toContain('[draggable="true"]:active::before');
  });
});
