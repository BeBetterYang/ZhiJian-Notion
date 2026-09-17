import { afterEach, describe, expect, it, vi } from "vitest";
import { installEmojiSearchInputGuard } from "./emojiSearchInputGuard";

describe("installEmojiSearchInputGuard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards only the latest value after IME composition", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    root.appendChild(input);
    let searchCount = 0;
    input.addEventListener("input", () => { searchCount += 1; });
    const removeGuard = installEmojiSearchInputGuard(root, input, { debounceMs: 20 });

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    for (const value of ["x", "xi", "笑"]) {
      input.value = value;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, isComposing: true }));
    }
    expect(searchCount).toBe(0);

    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    vi.advanceTimersByTime(19);
    expect(searchCount).toBe(0);
    vi.advanceTimersByTime(1);
    expect(searchCount).toBe(1);

    removeGuard();
  });

  it("cancels pending searches when removed", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    root.appendChild(input);
    let searchCount = 0;
    input.addEventListener("input", () => { searchCount += 1; });
    const removeGuard = installEmojiSearchInputGuard(root, input, { debounceMs: 20 });

    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "笑" }));
    removeGuard();
    vi.advanceTimersByTime(20);

    expect(searchCount).toBe(0);
  });
});
