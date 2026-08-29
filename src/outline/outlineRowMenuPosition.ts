interface RectLike {
  top: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export function outlineRowMenuPosition(
  anchor: RectLike,
  menu: Pick<RectLike, "width" | "height">,
  viewport: { width: number; height: number },
  margin = 8,
  gap = 4,
) {
  const below = anchor.bottom + gap;
  const above = anchor.top - menu.height - gap;
  const preferredTop = below + menu.height <= viewport.height - margin ? below : above;
  const maxTop = Math.max(margin, viewport.height - menu.height - margin);
  const maxLeft = Math.max(margin, viewport.width - menu.width - margin);
  return {
    top: Math.min(Math.max(preferredTop, margin), maxTop),
    left: Math.min(Math.max(anchor.left, margin), maxLeft),
  };
}
