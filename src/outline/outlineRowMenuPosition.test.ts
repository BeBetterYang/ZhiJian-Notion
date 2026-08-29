import { describe, expect, it } from "vitest";
import { outlineRowMenuPosition } from "./outlineRowMenuPosition";

const menu = { width: 180, height: 260 };
const viewport = { width: 800, height: 700 };

describe("outlineRowMenuPosition", () => {
  it("opens below the trigger when there is enough room", () => {
    expect(outlineRowMenuPosition({ top: 100, bottom: 124, left: 80, width: 24, height: 24 }, menu, viewport)).toEqual({
      top: 128,
      left: 80,
    });
  });

  it("flips above the trigger near the bottom", () => {
    expect(outlineRowMenuPosition({ top: 620, bottom: 644, left: 80, width: 24, height: 24 }, menu, viewport).top).toBe(356);
  });

  it("keeps every edge inside the viewport safety margin", () => {
    expect(outlineRowMenuPosition({ top: 2, bottom: 26, left: 760, width: 24, height: 24 }, menu, viewport)).toEqual({
      top: 30,
      left: 612,
    });
  });
});
