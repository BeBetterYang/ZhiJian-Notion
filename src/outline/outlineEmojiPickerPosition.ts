interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function outlineEmojiPickerPosition(
  menu: RectLike,
  picker: Pick<RectLike, "width" | "height">,
  viewport: { width: number; height: number },
  margin = 8,
  gap = 6,
) {
  const menuRight = menu.left + menu.width;
  const rightLeft = menuRight + gap;
  const leftLeft = menu.left - picker.width - gap;
  const rightFits = rightLeft + picker.width <= viewport.width - margin;
  const leftFits = leftLeft >= margin;
  const maxLeft = Math.max(margin, viewport.width - picker.width - margin);
  const left = rightFits
    ? rightLeft
    : leftFits
      ? leftLeft
      : Math.min(Math.max(rightLeft, margin), maxLeft);
  const maxTop = Math.max(margin, viewport.height - picker.height - margin);

  return {
    top: Math.min(Math.max(menu.top, margin), maxTop),
    left,
  };
}
