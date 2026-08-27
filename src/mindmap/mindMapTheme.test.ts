import { describe, expect, it } from "vitest";
import { mindMapMainBranchPath, mindMapSubBranchPath } from "./mindMapTheme";

const NODE_GAP_X = 30;

/** Where the line leaves the parent. */
function start(path: string) {
  const [, x, y] = /^M (-?[\d.]+) (-?[\d.]+)/.exec(path) ?? [];
  return { x: Number(x), y: Number(y) };
}

/** Where the line meets the child. */
function endX(path: string) {
  return Number(/H (-?[\d.]+)$/.exec(path)?.[1]);
}

/** The x of the vertical leg, which siblings are meant to share. */
function trunkX(path: string) {
  return Number(/H (-?[\d.]+) V/.exec(path)?.[1]);
}

const mainParams = { pT: 200, pL: 100, pW: 80, pH: 40, containerHeight: 1000, containerWidth: 1000 };
const child = { cT: 100, cL: 280, cW: 60, cH: 30 };

describe("mindMapMainBranchPath", () => {
  it("runs from the root's near edge to the child's near edge", () => {
    const path = mindMapMainBranchPath({ ...mainParams, ...child, direction: "rhs" });

    expect(start(path)).toEqual({ x: 180, y: 220 });
    expect(endX(path)).toBe(280);
  });

  it("mirrors for a left-hand branch", () => {
    const path = mindMapMainBranchPath({ ...mainParams, ...child, cL: 20, direction: "lhs" });

    expect(start(path)).toEqual({ x: 100, y: 220 });
    expect(endX(path)).toBe(80);
  });

  // The whole point of measuring the leg from the child: mind-elixir draws one
  // path per child and knows nothing about siblings, so a shared trunk can only
  // come from every sibling computing the same x.
  it("puts every sibling's leg on one trunk", () => {
    const paths = [100, 300, 640].map((cT) =>
      mindMapMainBranchPath({ ...mainParams, ...child, cT, direction: "rhs" }),
    );

    expect(new Set(paths.map(trunkX)).size).toBe(1);
    expect(trunkX(paths[0])).toBe(250);
  });

  it("draws a straight line when parent and child already share a centre", () => {
    const path = mindMapMainBranchPath({ ...mainParams, ...child, cT: 205, direction: "rhs" });

    expect(path).toBe("M 180 220 H 280");
  });

  it("turns square corners, however short the step", () => {
    expect(mindMapMainBranchPath({ ...mainParams, ...child, direction: "rhs" })).toBe(
      "M 180 220 H 250 V 115 H 280",
    );
    // 4px between the two centres, and still a corner rather than a bend.
    expect(mindMapMainBranchPath({ ...mainParams, ...child, cT: 201, direction: "rhs" })).toBe(
      "M 180 220 H 250 V 216 H 280",
    );
  });

  it("turns the elbow a quarter for the top-down layout", () => {
    const path = mindMapMainBranchPath({ ...mainParams, ...child, cT: 300, direction: "down" });

    expect(start(path)).toEqual({ x: 140, y: 240 });
    expect(path).toBe("M 140 240 V 270 H 310 V 300");
  });
});

const subParams = { pT: 200, pL: 0, pW: 160, pH: 40, cT: 100, cL: 160, cW: 200, cH: 30 };

describe("mindMapSubBranchPath", () => {
  // `me-parent` pads its topic by `--node-gap-x`, so both ends need taking in to
  // land on the text instead of a column gap away from it.
  it("takes the column padding off both boxes", () => {
    const path = mindMapSubBranchPath({ ...subParams, direction: "rhs", isFirst: false }, NODE_GAP_X);

    expect(start(path)).toEqual({ x: 130, y: 220 });
    expect(endX(path)).toBe(190);
  });

  // A first-level `me-parent` is spaced by a margin and has no padding to remove.
  it("leaves the first level's near edge alone", () => {
    const path = mindMapSubBranchPath({ ...subParams, direction: "rhs", isFirst: true }, NODE_GAP_X);

    expect(start(path).x).toBe(160);
    expect(endX(path)).toBe(190);
  });

  it("mirrors for a left-hand branch", () => {
    const path = mindMapSubBranchPath({ ...subParams, pL: 200, cL: 0, direction: "lhs", isFirst: false }, NODE_GAP_X);

    expect(start(path)).toEqual({ x: 230, y: 220 });
    expect(endX(path)).toBe(170);
  });

  it("puts every sibling's leg on one trunk", () => {
    const paths = [100, 300, 640].map((cT) =>
      mindMapSubBranchPath({ ...subParams, cT, direction: "rhs", isFirst: false }, NODE_GAP_X),
    );

    expect(new Set(paths.map(trunkX)).size).toBe(1);
    expect(trunkX(paths[0])).toBe(160);
  });
});
