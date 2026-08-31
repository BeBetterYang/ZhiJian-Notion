export function workspaceNodeMenuPosition(
  anchor: Pick<DOMRect, "top" | "right" | "bottom">,
  menu: Pick<DOMRect, "width" | "height">,
  viewport: { width: number; height: number },
) {
  const safe = 8;
  const gap = 4;
  const left = Math.min(
    Math.max(safe, anchor.right - menu.width),
    Math.max(safe, viewport.width - menu.width - safe),
  );
  const below = anchor.bottom + gap;
  const above = anchor.top - menu.height - gap;
  const top = below + menu.height <= viewport.height - safe
    ? below
    : Math.max(safe, Math.min(above, viewport.height - menu.height - safe));
  return { top, left };
}
