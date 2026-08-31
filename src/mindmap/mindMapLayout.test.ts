import MindElixir from "mind-elixir";
import { describe, expect, it } from "vitest";
import { MIND_MAP_BRANCH_ORDERS, MIND_MAP_LAYOUT_PRESETS, mindMapLayoutDirection, resolveMindMapLayout } from "./mindMapLayout";

describe("mindMapLayout", () => {
  it("defaults documents without a saved structure to a right-facing logic map", () => {
    const fallback = { type: "logic", direction: "right" };
    expect(resolveMindMapLayout()).toEqual(fallback);
    expect(resolveMindMapLayout(undefined, MindElixir.RIGHT)).toEqual(fallback);
    expect(resolveMindMapLayout({ type: "mind-map", direction: "left" })).toEqual({
      type: "mind-map",
      direction: "both",
      order: "right-first",
    });
  });

  it("exposes only the directions supported by each structure", () => {
    expect(Object.fromEntries(MIND_MAP_LAYOUT_PRESETS.map((preset) => [
      preset.id,
      preset.directions.map((direction) => direction.id),
    ]))).toEqual({
      "mind-map": [],
      logic: ["right", "left"],
      "org-chart": ["down", "up"],
      timeline: ["right", "down"],
      tree: ["right", "left"],
    });
    expect(MIND_MAP_BRANCH_ORDERS.map((order) => order.id)).toEqual([
      "left-first",
      "right-first",
      "alternating",
    ]);
  });

  it("maps every structure to a real MindElixir layout axis", () => {
    expect(mindMapLayoutDirection({ type: "mind-map", direction: "both", order: "alternating" })).toBe(MindElixir.SIDE);
    expect(mindMapLayoutDirection({ type: "logic", direction: "left" })).toBe(MindElixir.LEFT);
    expect(mindMapLayoutDirection({ type: "org-chart", direction: "up" })).toBe(MindElixir.DOWN);
    // 时间轴挑的轴和它的名字是反的，见 `mindMapLayoutDirection` 的注释。
    expect(mindMapLayoutDirection({ type: "timeline", direction: "right" })).toBe(MindElixir.DOWN);
    expect(mindMapLayoutDirection({ type: "timeline", direction: "down" })).toBe(MindElixir.RIGHT);
    expect(mindMapLayoutDirection({ type: "tree", direction: "left" })).toBe(MindElixir.DOWN);
  });

  it("rejects a direction that does not belong to its structure", () => {
    expect(resolveMindMapLayout({ type: "logic", direction: "down" })).toEqual({
      type: "logic",
      direction: "right",
    });
  });
});
