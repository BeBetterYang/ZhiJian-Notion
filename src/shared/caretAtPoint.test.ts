import { describe, expect, it } from "vitest";
import { caretPositionAtPoint } from "./caretAtPoint";

describe("caretPositionAtPoint", () => {
  it("keeps the resolved position when the click landed on a character", () => {
    expect(caretPositionAtPoint({ position: 4, onCharacter: true, lineEnd: 9 })).toBe(4);
  });

  it("appends when the click landed in the line but on no character", () => {
    // A row is as wide as the view gives it while its text is only as wide as
    // itself, so clicking level with a short line but past its last character
    // resolves to the line's *start*.
    expect(caretPositionAtPoint({ position: 1, onCharacter: false, lineEnd: 4 })).toBe(4);
  });

  it("leaves a click that landed in no line to the caller", () => {
    expect(caretPositionAtPoint({ position: 1, onCharacter: false, lineEnd: null })).toBeNull();
  });
});
