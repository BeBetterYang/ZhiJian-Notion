/**
 * Which link in the map the pointer is on, shared between the canvas that sees the
 * hover and the popup that answers it.
 *
 * The two sit far apart on purpose. The popup has to be a child of the outline's
 * `BlockNoteView` to *be* the outline's link toolbar rather than a lookalike, and the
 * canvas is a pane away from it, so the hover travels through a module instead of
 * props. The delay before closing lives here too, because both sides hold it open:
 * the pointer has to leave the link to reach the popup.
 */
export interface MindMapLinkHover {
  /**
   * The outline block the link lives in — a quote, a description, or (for a node's own
   * row and for a table's cells) the node itself. Narrows the search for the link's
   * position in the document to where it can actually be.
   */
  scopeId: string;
  url: string;
  /** The link's own text, which picks it out when a node links to one address twice. */
  text: string;
  /** The link's box, in viewport coordinates, for the popup to place itself against. */
  left: number;
  top: number;
  bottom: number;
}

const CLOSE_DELAY_MS = 240;

let current: MindMapLinkHover | null = null;
let closeTimer = 0;
const listeners = new Set<() => void>();

export function subscribeMindMapLinkHover(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMindMapLinkHover() {
  return current;
}

export function openMindMapLinkHover(hover: MindMapLinkHover) {
  window.clearTimeout(closeTimer);
  // Held stable while the pointer wanders within one link: `useSyncExternalStore`
  // compares snapshots by identity, and a fresh object every pointermove would
  // re-render the popup out from under its own edit form.
  if (current && isSameLink(current, hover)) return;
  publish(hover);
}

/** The pointer reached the popup, which is off the link — it stays open. */
export function holdMindMapLinkHover() {
  window.clearTimeout(closeTimer);
}

export function closeMindMapLinkHoverSoon() {
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => publish(null), CLOSE_DELAY_MS);
}

export function closeMindMapLinkHover() {
  window.clearTimeout(closeTimer);
  if (current) publish(null);
}

function publish(next: MindMapLinkHover | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function isSameLink(a: MindMapLinkHover, b: MindMapLinkHover) {
  return (
    a.scopeId === b.scopeId &&
    a.url === b.url &&
    a.text === b.text &&
    a.left === b.left &&
    a.top === b.top &&
    a.bottom === b.bottom
  );
}
