import { useEffect, type RefObject } from "react";
import {
  closeMindMapLinkHover,
  closeMindMapLinkHoverSoon,
  openMindMapLinkHover,
} from "./mindMapLinkHover";

/**
 * Watches the canvas for the pointer coming to rest on a link and reports it, so the
 * outline's link toolbar can open over it. Renders nothing itself: the popup is
 * BlockNote's own, and lives where BlockNote's context is.
 *
 * A node is display HTML at rest, with no editor behind it, so nothing here can be
 * left to BlockNote's own hover plugin — it watches an editor's DOM. While a node is
 * being edited both copies are on the canvas, and either one answers.
 */
export function MindMapLinkHoverTracker({
  canvasRef,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerOver = (event: PointerEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor || !canvas.contains(anchor)) return;
      const url = anchor.getAttribute("href");
      // A quote and a description are blocks of their own in the document; a node's
      // own row and a table's cells belong to the node's block.
      const scopeId =
        anchor.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ??
        anchor.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
      if (!url || !scopeId) return;
      const rect = anchor.getBoundingClientRect();
      openMindMapLinkHover({
        scopeId,
        url,
        text: anchor.textContent ?? "",
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
      });
    };

    const onPointerOut = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.("a[href]")) return;
      closeMindMapLinkHoverSoon();
    };

    // A pan, a zoom or a scroll moves the link away from a popup that was measured
    // against where it used to be, so the popup goes rather than pointing at nothing.
    const close = () => closeMindMapLinkHover();

    canvas.addEventListener("pointerover", onPointerOver);
    canvas.addEventListener("pointerout", onPointerOut);
    window.addEventListener("scroll", close, true);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      canvas.removeEventListener("pointerover", onPointerOver);
      canvas.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("wheel", close);
      closeMindMapLinkHover();
    };
  }, [canvasRef]);

  return null;
}
