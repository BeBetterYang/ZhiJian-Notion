import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldRenderOutlinePageIcon } from "./outlineDocumentIcon";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("shouldRenderOutlinePageIcon", () => {
  it("renders an existing page icon when the document is not focused", () => {
    expect(shouldRenderOutlinePageIcon({
      hasDocumentIcon: true,
      showDocumentIcon: false,
      readOnly: false,
      zoomedNodeId: null,
    })).toBe(true);
  });

  it("hides an existing page icon while focusing a node", () => {
    expect(shouldRenderOutlinePageIcon({
      hasDocumentIcon: true,
      showDocumentIcon: false,
      readOnly: false,
      zoomedNodeId: "child",
    })).toBe(false);
  });

  it("only renders the empty add trigger after the root is active", () => {
    expect(shouldRenderOutlinePageIcon({
      hasDocumentIcon: false,
      showDocumentIcon: true,
      readOnly: false,
      zoomedNodeId: null,
    })).toBe(true);
    expect(shouldRenderOutlinePageIcon({
      hasDocumentIcon: false,
      showDocumentIcon: false,
      readOnly: false,
      zoomedNodeId: null,
    })).toBe(false);
  });

  it("never renders an empty add trigger in readonly or focus mode", () => {
    expect(shouldRenderOutlinePageIcon({
      hasDocumentIcon: false,
      showDocumentIcon: true,
      readOnly: true,
      zoomedNodeId: null,
    })).toBe(false);
    expect(shouldRenderOutlinePageIcon({
      hasDocumentIcon: false,
      showDocumentIcon: true,
      readOnly: false,
      zoomedNodeId: "child",
    })).toBe(false);
  });

  it("uses the same CSS frame and gutter for the editor and page icon", () => {
    expect(styles).toContain("--outline-editor-inline-gutter: 54px;");
    expect(styles).toContain("--outline-content-frame-width: calc(");
    expect(styles).toContain("max-width: var(--outline-content-frame-width);");
    expect(styles).toContain("padding-inline: var(--outline-editor-inline-gutter);");
    expect(styles).toContain(".outline-panel.is-full-width .outline-document-icon {");
    expect(styles).toContain(".outline-panel.is-full-width .outline-document-icon.is-empty .outline-document-icon-frame {");
    expect(styles).not.toContain("width: min(720px, calc(100% - 48px));");
    const emptyIconRule = styles.slice(styles.indexOf(".outline-document-icon.is-empty {"), styles.indexOf(".document-icon-control {"));
    expect(emptyIconRule).not.toContain("transform: translateX(-50%);");
  });
});
