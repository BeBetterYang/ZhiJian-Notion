import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const catFace = readFileSync(resolve(process.cwd(), "src/ai/chat/cat-face.svg"), "utf8");

describe("AI chat cat face asset", () => {
  it("provides the filled circle used by every AI cat icon", () => {
    expect(catFace).toContain('<g>');
    expect(catFace).toContain('fill="#FFFFFF"');
    expect(catFace).toContain('cx="627" cy="607"');
  });
});
