import { describe, expect, it } from "vitest";
import { resolveMindMapTextRange } from "./mindMapTextSelection";

describe("resolveMindMapTextRange", () => {
  const blockRange = { from: 10, to: 20 };

  it("maps a partial mindmap selection into the BlockNote range", () => {
    expect(
      resolveMindMapTextRange("node-a", blockRange, {
        nodeId: "node-a",
        from: 2,
        to: 6,
      }),
    ).toEqual({ from: 12, to: 16 });
  });

  it("normalizes reversed selections and clamps offsets", () => {
    expect(
      resolveMindMapTextRange("node-a", blockRange, {
        nodeId: "node-a",
        from: 30,
        to: -3,
      }),
    ).toEqual(blockRange);
  });

  it("uses the complete block for a different node", () => {
    expect(
      resolveMindMapTextRange("node-a", blockRange, {
        nodeId: "node-b",
        from: 2,
        to: 6,
      }),
    ).toEqual(blockRange);
  });
});
