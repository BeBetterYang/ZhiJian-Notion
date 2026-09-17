import { describe, expect, it } from "vitest";
import { outlineEmojiPickerPosition } from "./outlineEmojiPickerPosition";

const picker = { width: 352, height: 435 };
const viewport = { width: 1200, height: 900 };

describe("outlineEmojiPickerPosition", () => {
  it("opens beside the row menu when the right side has room", () => {
    expect(outlineEmojiPickerPosition({ top: 110, left: 310, width: 180, height: 680 }, picker, viewport)).toEqual({
      top: 110,
      left: 496,
    });
  });

  it("keeps the picker above the viewport bottom", () => {
    expect(outlineEmojiPickerPosition({ top: 620, left: 310, width: 180, height: 220 }, picker, viewport).top).toBe(457);
  });

  it("flips to the left when the right side is too narrow", () => {
    expect(outlineEmojiPickerPosition({ top: 110, left: 900, width: 180, height: 220 }, picker, viewport).left).toBe(542);
  });
});
