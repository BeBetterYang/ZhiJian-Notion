import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const catFace = readFileSync(resolve(process.cwd(), "src/ai/chat/cat-face.svg"), "utf8");

describe("AI chat cat face asset", () => {
  it("keeps the artwork centered in its square viewBox", () => {
    expect(catFace).toContain('<g transform="translate(0 20)">');
    expect(catFace).toContain('cx="627" cy="607"');
  });
});
