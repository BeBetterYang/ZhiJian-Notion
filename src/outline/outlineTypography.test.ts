import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const flattened = styles.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\s+/g, " ");

function ruleContaining(selector: string, declaration: string) {
  return [...flattened.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    ([, selectorText, body]) => selectorText.split(",").map((entry) => entry.trim()).includes(selector)
      && body.includes(declaration),
  );
}

describe("outline typography", () => {
  it("uses the MuBu fallback order without prioritising Source Sans Pro", () => {
    expect(flattened).toContain(
      '--zhijian-outline-font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", Helvetica, Arial, "Microsoft YaHei", 微软雅黑, 黑体, Heiti, sans-serif, SimSun, 宋体, serif, "Source Sans Pro";',
    );
  });

  it("applies the same family to outline display and BlockNote editing surfaces", () => {
    const familyRule = ruleContaining(
      ".outline-panel .bn-inline-content",
      "font-family: var(--zhijian-outline-font-family) !important",
    );
    expect(familyRule).toBeDefined();
    expect(familyRule![1]).toContain(".outline-panel .bn-root");
    expect(familyRule![1]).toContain(".outline-panel .bn-default-styles");
    expect(familyRule![1]).toContain(".outline-panel .bn-editor");
    expect(familyRule![1]).toContain(".outline-panel .bn-block-content");
  });

  it("keeps inline content aligned with the block's size, weight, and line height", () => {
    const inlineRule = ruleContaining(".outline-panel .bn-inline-content", "font-size: inherit");
    expect(inlineRule).toBeDefined();
    expect(inlineRule![2]).toContain("font-style: inherit");
    expect(inlineRule![2]).toContain("font-weight: inherit");
    expect(inlineRule![2]).toContain("line-height: inherit");
    expect(flattened).toContain(".outline-panel .bn-block-content[data-content-type=\"paragraph\"]");
    expect(flattened).toContain("font-size: var(--zhijian-type-body-size)");
    expect(flattened).toContain("font-weight: var(--zhijian-type-body-weight)");
    expect(flattened).toContain("line-height: var(--zhijian-type-body-line-height)");
  });
});
