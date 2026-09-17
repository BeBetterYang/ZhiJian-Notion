type EmojiSearchInputGuardOptions = {
  debounceMs?: number;
};

/**
 * emoji-mart starts an async search for every input event. IME composition can
 * emit several intermediate events, so only forward the latest query.
 */
export function installEmojiSearchInputGuard(
  root: ShadowRoot,
  input: HTMLInputElement,
  { debounceMs = 80 }: EmojiSearchInputGuardOptions = {},
) {
  let isComposing = false;
  let forwardNextInput = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearPendingSearch = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const forwardLatestInput = () => {
    timer = undefined;
    if (!root.contains(input)) return;
    forwardNextInput = true;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  };

  const scheduleLatestInput = () => {
    clearPendingSearch();
    timer = setTimeout(forwardLatestInput, debounceMs);
  };

  const handleInput = (event: Event) => {
    if (forwardNextInput) {
      forwardNextInput = false;
      return;
    }

    event.stopImmediatePropagation();
    if (!isComposing) scheduleLatestInput();
  };

  const handleCompositionStart = () => {
    isComposing = true;
    clearPendingSearch();
  };

  const handleCompositionEnd = () => {
    isComposing = false;
    scheduleLatestInput();
  };

  root.addEventListener("input", handleInput, true);
  root.addEventListener("compositionstart", handleCompositionStart, true);
  root.addEventListener("compositionend", handleCompositionEnd, true);

  return () => {
    clearPendingSearch();
    root.removeEventListener("input", handleInput, true);
    root.removeEventListener("compositionstart", handleCompositionStart, true);
    root.removeEventListener("compositionend", handleCompositionEnd, true);
  };
}
