import { describe, expect, it } from "vitest";
import {
  createMindElixirTheme,
  MIND_MAP_BACKGROUND_PRESETS,
  MIND_MAP_THEME_PRESETS,
  mindMapMainBranchPath,
  mindMapSubBranchPath,
  resolveMindMapTheme,
} from "./mindMapTheme";

const NODE_GAP_X = 30;

describe("mind map theme presets", () => {
  it("falls back to the default paper theme when a document has no known theme", () => {
    expect(resolveMindMapTheme().id).toBe("paper");
    expect(resolveMindMapTheme({ id: "missing", version: 1 }).id).toBe("paper");
  });

  it("contains the complete reference theme set in display order", () => {
    expect(MIND_MAP_THEME_PRESETS.map((theme) => theme.name)).toEqual([
      "纯境", "明线", "素页",
      "墨稿", "雁皮", "薄雾", "清风", "脉搏", "远航",
      "焦点", "深潜", "夜图", "秘林", "火山", "梦湖",
    ]);
    expect(MIND_MAP_THEME_PRESETS.filter((theme) => theme.group === "plain")).toHaveLength(3);
    expect(MIND_MAP_THEME_PRESETS.filter((theme) => theme.group === "light")).toHaveLength(6);
    expect(MIND_MAP_THEME_PRESETS.filter((theme) => theme.group === "dark")).toHaveLength(6);
  });

  it("uses neutral black text only for the three plain themes", () => {
    const plainThemes = MIND_MAP_THEME_PRESETS.filter((theme) => ["pure", "outline", "paper"].includes(theme.id));
    expect(plainThemes.map((theme) => ({
      id: theme.id,
      level1: theme.level1.text,
      child: theme.child.text,
    }))).toEqual([
      { id: "pure", level1: "#181818", child: "#202020" },
      { id: "outline", level1: "#181818", child: "#202020" },
      { id: "paper", level1: "#181818", child: "#202020" },
    ]);
    expect(plainThemes.map((theme) => ({
      id: theme.id,
      rootBackground: theme.root.background,
      rootText: theme.root.text,
    }))).toEqual([
      { id: "pure", rootBackground: "transparent", rootText: "#37352f" },
      { id: "outline", rootBackground: "transparent", rootText: "#37352f" },
      { id: "paper", rootBackground: "#414141", rootText: "#ffffff" },
    ]);
  });

  it("keeps every non-plain theme's existing node text colours", () => {
    expect(Object.fromEntries(
      MIND_MAP_THEME_PRESETS
        .filter((theme) => !["pure", "outline", "paper"].includes(theme.id))
        .map((theme) => [theme.id, [theme.level1.text, theme.child.text]]),
    )).toEqual({
      ink: ["#4f5053", "#4f5053"],
      yanpi: ["#5f5140", "#4f4942"],
      mist: ["#52647d", "#46556a"],
      breeze: ["#35783a", "#3f6542"],
      pulse: ["#a34f2d", "#82503d"],
      voyage: ["#236ca9", "#34627f"],
      focus: ["#f2f2f3", "#dedee0"],
      "deep-dive": ["#e4e9f5", "#cbd4e8"],
      "night-map": ["#f0e4f7", "#dbc9e6"],
      "secret-forest": ["#dfe7c8", "#c9d4ae"],
      volcano: ["#f0d5c8", "#dec0b2"],
      "dream-lake": ["#d8eceb", "#bededc"],
    });
  });

  it("offers every unique theme canvas colour in the background palette", () => {
    const themeBackgrounds = [...new Set(MIND_MAP_THEME_PRESETS.map((theme) => theme.canvas.background))];
    expect(MIND_MAP_BACKGROUND_PRESETS.map((background) => background.value)).toEqual(themeBackgrounds);
  });

  it("keeps every preset visual-only by sharing identical geometry variables", () => {
    const geometryKeys = ["--topic-padding", "--node-gap-y", "--main-gap-y"] as const;
    const values = MIND_MAP_THEME_PRESETS.map((preset) => {
      const css = createMindElixirTheme(preset).cssVar;
      return geometryKeys.map((key) => css?.[key]);
    });

    expect(new Set(values.map((value) => JSON.stringify(value))).size).toBe(1);
  });

  it("defines root, direct-child and remaining-descendant treatments for every theme", () => {
    MIND_MAP_THEME_PRESETS.forEach((theme) => {
      expect(theme.root.background).toBeTruthy();
      expect(theme.level1.background).toBeTruthy();
      expect(theme.child.background).toBeTruthy();
    });
  });

  it("keeps coloured direct children framed and every deeper node unframed", () => {
    MIND_MAP_THEME_PRESETS.filter((theme) => theme.group !== "plain").forEach((theme) => {
      expect(theme.level1.background).not.toBe("transparent");
      expect(theme.level1.border).not.toBe("transparent");
    });
    MIND_MAP_THEME_PRESETS.forEach((theme) => {
      expect(theme.child.background).toBe("transparent");
      expect(theme.child.border).toBe("transparent");
    });
  });

  it("maps previously stored theme ids to the closest current preset", () => {
    expect(resolveMindMapTheme({ id: "zhijian", version: 1 }).id).toBe("paper");
    expect(resolveMindMapTheme({ id: "forest", version: 1 }).id).toBe("breeze");
    expect(resolveMindMapTheme({ id: "dark", version: 1 }).id).toBe("focus");
  });

  it("uses the Yanpi third swatch as a line for unframed descendants and connectors", () => {
    const yanpi = resolveMindMapTheme({ id: "yanpi", version: 1 });
    expect(yanpi.root.background).toBe("#9b8a76");
    expect(yanpi.level1.background).toBe("#d5d1ca");
    expect(yanpi.child.background).toBe("transparent");
    expect(yanpi.connector.color).toBe("#d5d1ca");
  });

  it("overrides only the canvas background with a custom palette colour", () => {
    const original = resolveMindMapTheme({ id: "ocean", version: 1 });
    const customized = resolveMindMapTheme({ id: "ocean", version: 1 }, "#f1f3f5");
    expect(customized.canvas.background).toBe("#f1f3f5");
    expect(customized.root).toBe(original.root);
    expect(customized.child).toBe(original.child);
  });
});

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

  it("connects from the upper edge when the vertical layout grows upward", () => {
    const path = mindMapMainBranchPath({ ...mainParams, ...child, cT: 100, direction: "down" });

    expect(start(path)).toEqual({ x: 140, y: 200 });
    expect(path).toBe("M 140 200 V 160 H 310 V 130");
  });

  it("keeps the shared trunk junction square and rounds only the child corner", () => {
    const path = mindMapMainBranchPath({ ...mainParams, ...child, direction: "rhs" }, true);

    expect(path).toBe("M 180 220 H 250 V 133 Q 250 115 268 115 H 280");
    expect(start(path)).toEqual({ x: 180, y: 220 });
    expect(path.endsWith("H 280")).toBe(true);
  });

  it("uses the same shared-trunk corner treatment in top-down layout", () => {
    expect(mindMapMainBranchPath({ ...mainParams, ...child, cT: 300, direction: "down" }, true)).toBe(
      "M 140 240 V 270 H 292 Q 310 270 310 288 V 300",
    );
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

  it("rounds only the child-side corner of a sub branch", () => {
    expect(mindMapSubBranchPath({ ...subParams, direction: "rhs", isFirst: false }, NODE_GAP_X, true)).toBe(
      "M 130 220 H 160 V 133 Q 160 115 178 115 H 190",
    );
  });
});

describe("structure-specific connectors", () => {
  // 树形图：一根竖线从父节点底下挂下来，横着接进子节点靠根那一侧，兄弟共用同一根竖线。
  it("hangs a tree's children off one shared trunk", () => {
    const paths = [100, 300, 640].map((cT) =>
      mindMapSubBranchPath(
        { ...subParams, cT, direction: "down", isFirst: false },
        NODE_GAP_X,
        false,
        { type: "tree", direction: "right" },
      ),
    );

    expect(paths[0]).toBe("M 148 240 V 115 H 160");
    expect(new Set(paths.map((path) => start(path).x)).size).toBe(1);
    expect(paths.map(endX)).toEqual([160, 160, 160]);
  });

  it("mirrors a left-branching tree", () => {
    expect(
      mindMapSubBranchPath(
        { ...subParams, pL: 200, cL: 0, direction: "down", isFirst: false },
        NODE_GAP_X,
        false,
        { type: "tree", direction: "left" },
      ),
    ).toBe("M 212 240 V 115 H 200");
  });

  // 时间轴的根被 CSS 搬到了轴的侧面，所以主干沿着轴走，再逐个拐进首层节点。
  it("combs a timeline's first level off the spine", () => {
    expect(
      mindMapMainBranchPath({ ...mainParams, ...child, direction: "down" }, false, {
        type: "timeline",
        direction: "right",
      }),
    ).toBe("M 180 220 H 310 V 100");
    expect(
      mindMapMainBranchPath({ ...mainParams, ...child, direction: "rhs" }, false, {
        type: "timeline",
        direction: "down",
      }),
    ).toBe("M 140 240 V 115 H 280");
  });

  it("keeps an organisation chart's centre-to-centre drop", () => {
    expect(
      mindMapMainBranchPath({ ...mainParams, ...child, cT: 300, direction: "down" }, false, {
        type: "org-chart",
        direction: "down",
      }),
    ).toBe("M 140 240 V 270 H 310 V 300");
  });
});
