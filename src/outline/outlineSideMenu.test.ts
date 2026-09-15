import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("outline side menu controls", () => {
  it("keeps the drag handle and dot on one fixed centered box", () => {
    expect(styles).toContain('.outline-panel .bn-side-menu [draggable="true"]');
    expect(styles).toContain("box-sizing: border-box;");
    expect(styles).toContain("width: 24px;");
    expect(styles).toContain("min-width: 24px;");
    expect(styles).toContain("height: 24px;");
    expect(styles).toContain("min-height: 24px;");
    expect(styles).toContain("display: grid;");
    expect(styles).toContain("place-items: center;");
    expect(styles).toContain(".outline-panel .bn-side-menu .outline-focus-dot");
    expect(styles).toContain("width: 6px;");
    expect(styles).toContain("height: 6px;");
    expect(styles).toContain("margin: 0;");
  });

  it("attaches hover and focus feedback to the drag handle itself", () => {
    expect(styles).toContain(".outline-focus-drag-handle:hover .outline-focus-dot,");
    expect(styles).toContain(".outline-focus-drag-handle:focus-visible .outline-focus-dot,");
    expect(styles).toContain(".outline-focus-drag-handle:active .outline-focus-dot {");
    expect(styles).not.toContain('[draggable="true"]:hover::before');
    expect(styles).not.toContain('[draggable="true"]:focus-visible::before');
    expect(styles).not.toContain('[draggable="true"]:active::before');
  });
});
