import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A stylesheet test rather than a rendering test: jsdom applies no CSS from an
 * `import` and does not resolve `var()` in `getComputedStyle`, so comparing computed
 * typography between the two layers here would compare two empty strings. What can be
 * checked is that the map's display selectors and its BlockNote selectors are declared
 * together, with every property that decides how a glyph is drawn — which is the thing
 * that regressed: BlockNote 0.54 hard-codes Inter and switches ligatures off on
 * `.bn-default-styles`, so anything left unstated there falls back to its own defaults.
 * The rendered result is verified in the browser.
 */
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
/** Comments can hold braces, and a long selector is wrapped over several lines. */
const flattened = styles.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\s+/g, " ");

function rulesFor(selector: string) {
  return [...flattened.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selectorText, body]) => ({
      selectors: selectorText.split(",").map((entry) => entry.trim()),
      body,
    }))
    .filter((rule) => rule.selectors.includes(selector));
}

/** Every declaration the sheet makes for a selector, wherever it makes them. */
function declarationsFor(selector: string) {
  return rulesFor(selector).map((rule) => rule.body).join(" ");
}

const TYPOGRAPHY_PROPERTIES = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "letter-spacing",
  "font-synthesis",
  "font-variant-ligatures",
  "font-kerning",
  "text-rendering",
  "-webkit-font-smoothing",
  "-moz-osx-font-smoothing",
];

describe("mind map display/editor typography", () => {
  it("states every glyph property on both layers at once", () => {
    const rule = rulesFor(".mindmap-node-rich-text").find((entry) =>
      entry.body.includes("font-family"),
    );
    expect(rule).toBeDefined();
    // The editor's own selectors have to ride in the same rule, or the two layers can
    // drift the next time one of them is edited.
    for (const selector of [
      ".mindmap-node-renderer",
      ".mindmap-node-editor .bn-default-styles",
      ".mindmap-node-editor .bn-editor",
      ".mindmap-node-editor .bn-inline-content",
    ]) {
      expect(rule!.selectors, selector).toContain(selector);
    }
    for (const property of TYPOGRAPHY_PROPERTIES) {
      expect(rule!.body, property).toContain(`${property}:`);
    }
    // `--bn-font-family` cannot reach `.bn-default-styles`, which declares the family
    // itself; only an `!important` of our own outranks it.
    expect(rule!.body).toContain("font-family: var(--zhijian-font-family) !important");
  });

  it("hands the document ink to BlockNote as its own token", () => {
    // Not as a `color` declaration: BlockNote paints from this variable on its own
    // elements, and a declaration strong enough to beat it would also beat the
    // checked-todo colour below.
    expect(declarationsFor(".mindmap-node-editor .bn-container")).toContain(
      "--bn-colors-editor-text: var(--zhijian-ink)",
    );
  });

  it("gives a checked todo the same ink and line in both layers", () => {
    for (const selector of [
      ".mindmap-node-todo.is-checked .mindmap-node-rich-text",
      '.mindmap-node-editor .bn-block-content[data-content-type="checkListItem"][data-checked="true"] .bn-inline-content',
    ]) {
      const declarations = declarationsFor(selector);
      expect(declarations, selector).toContain("color: #73808a");
      expect(declarations, selector).toContain("text-decoration: line-through");
    }
  });

  it("keeps a todo row on the same vertical padding as the display layer", () => {
    // Zeroing it left a todo's text and checkbox 1.3px higher while being edited.
    expect(
      declarationsFor('.mindmap-node-editor .bn-block-content[data-content-type="checkListItem"]'),
    ).toContain("padding: 0.08em 0");
    expect(declarationsFor(".mindmap-node-primary")).toContain("padding: 0.08em 0");
  });

  it("uses one stable row box for todo display and editing", () => {
    const display = declarationsFor(".mindmap-node-todo");
    const editor = declarationsFor('.mindmap-node-editor .bn-block-content[data-content-type="checkListItem"]');
    for (const declarations of [display, editor]) {
      expect(declarations).toContain("display: flex");
      expect(declarations).toContain("align-items: center");
      expect(declarations).toContain("min-height: 1lh");
      expect(declarations).toContain("line-height: inherit");
    }
    const paragraph = declarationsFor('.mindmap-node-editor .bn-block-content[data-content-type="checkListItem"] p');
    expect(paragraph).toContain("margin: 0");
    expect(paragraph).toContain("padding: 0");
    expect(paragraph).toContain("line-height: inherit");
  });
});
