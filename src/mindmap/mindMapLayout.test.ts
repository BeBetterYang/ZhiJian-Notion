import MindElixir from "mind-elixir";
import { describe, expect, it } from "vitest";
import { MIND_MAP_LAYOUT_PRESETS, mindMapLayoutDirection, resolveMindMapLayout } from "./mindMapLayout";

describe("mindMapLayout", () => {
  it("falls back to the existing right-facing mind map for old documents", () => {
    expect(resolveMindMapLayout()).toEqual({ type: "mind-map", direction: "right" });
    expect(resolveMindMapLayout(undefined, MindElixir.SIDE)).toEqual({ type: "mind-map", direction: "both" });
  });

  it("exposes only the directions supported by each structure", () => {
    expect(Object.fromEntries(MIND_MAP_LAYOUT_PRESETS.map((preset) => [
      preset.id,
      preset.directions.map((direction) => direction.id),
    ]))).toEqual({
      "mind-map": ["both", "right", "left"],
      logic: ["right", "left"],
      "org-chart": ["down", "up"],
      timeline: ["right", "down"],
      tree: ["right", "left"],
    });
  });

  it("maps every structure to a real MindElixir layout axis", () => {
    expect(mindMapLayoutDirection({ type: "mind-map", direction: "both" })).toBe(MindElixir.SIDE);
    expect(mindMapLayoutDirection({ type: "logic", direction: "left" })).toBe(MindElixir.LEFT);
    expect(mindMapLayoutDirection({ type: "org-chart", direction: "up" })).toBe(MindElixir.DOWN);
    // 时间轴挑的轴和它的名字是反的，见 `mindMapLayoutDirection` 的注释。
    expect(mindMapLayoutDirection({ type: "timeline", direction: "right" })).toBe(MindElixir.DOWN);
    expect(mindMapLayoutDirection({ type: "timeline", direction: "down" })).toBe(MindElixir.RIGHT);
    expect(mindMapLayoutDirection({ type: "tree", direction: "left" })).toBe(MindElixir.DOWN);
  });

  it("rejects a direction that does not belong to its structure", () => {
    expect(resolveMindMapLayout({ type: "logic", direction: "down" })).toEqual({
      type: "mind-map",
      direction: "right",
    });
  });
});
