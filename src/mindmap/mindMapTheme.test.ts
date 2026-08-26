import { describe, expect, it, vi } from "vitest";
import {
  mindMapMainBranchPath,
  mindMapSubBranchPath,
  resolveMindMapPrimaryAnchor,
  resolveMindMapPrimaryAnchorY,
} from "./mindMapTheme";

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

  it("anchors to the supplied primary-line y instead of the full node centre", () => {
    const path = mindMapMainBranchPath({
      ...mainParams,
      pH: 180,
      ...child,
      cH: 160,
      direction: "rhs",
    }, {
      parentAnchorY: () => 218,
      childAnchorY: () => 116,
    });

    expect(path).toBe("M 180 218 H 250 V 116 H 280");
  });

  it("uses primary content edges when anchor boxes are supplied", () => {
    const path = mindMapMainBranchPath({
      ...mainParams,
      pW: 260,
      pH: 180,
      ...child,
      cW: 240,
      cH: 160,
      direction: "rhs",
    }, {
      parentAnchor: () => ({ left: 120, width: 80, centerY: 218 }),
      childAnchor: () => ({ left: 300, width: 64, centerY: 116 }),
    });

    expect(path).toBe("M 200 218 H 270 V 116 H 300");
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

  it("keeps quote and image height out of sub-branch y anchors", () => {
    const path = mindMapSubBranchPath({
      ...subParams,
      pH: 220,
      cH: 180,
      direction: "rhs",
      isFirst: false,
    }, NODE_GAP_X, {
      parentAnchorY: () => 221,
      childAnchorY: () => 114,
    });

    expect(path).toBe("M 130 221 H 160 V 114 H 190");
  });
});

describe("resolveMindMapPrimaryAnchorY", () => {
  it("measures the primary content within the matched mind-elixir frame", () => {
    const container = document.createElement("div");
    const map = document.createElement("div");
    map.className = "map-canvas";
    const parent = document.createElement("me-parent");
    const primary = document.createElement("div");
    primary.className = "mindmap-node-primary";
    primary.textContent = "第一行\n第二行";
    parent.append(primary, document.createElement("div"));
    map.append(parent);
    container.append(map);
    document.body.append(container);

    mockBox(parent, { top: 200, left: 80, width: 180, height: 180 });
    mockRect(parent, { top: 400, left: 160, width: 360, height: 360 });
    mockRect(primary, { top: 410, left: 172, width: 320, height: 48 });
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => ({
      transform: element === map ? "matrix(2, 0, 0, 2, 0, 0)" : "none",
      lineHeight: "24px",
    } as CSSStyleDeclaration));

    const geometry = {
      top: 200,
      left: 80,
      width: 180,
      height: 180,
    };
    expect(resolveMindMapPrimaryAnchorY(container, geometry)).toBe(211);
    expect(resolveMindMapPrimaryAnchor(container, geometry)).toEqual({
      left: 86,
      width: 160,
      centerY: 211,
    });
  });
});

function mockBox(element: HTMLElement, box: { top: number; left: number; width: number; height: number }) {
  Object.defineProperties(element, {
    offsetTop: { configurable: true, value: box.top },
    offsetLeft: { configurable: true, value: box.left },
    offsetWidth: { configurable: true, value: box.width },
    offsetHeight: { configurable: true, value: box.height },
  });
}

function mockRect(element: HTMLElement, rect: { top: number; left: number; width: number; height: number }) {
  element.getBoundingClientRect = () => new DOMRect(rect.left, rect.top, rect.width, rect.height);
}
