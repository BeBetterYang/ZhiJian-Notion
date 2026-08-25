import { LinkToolbar, useBlockNoteEditor } from "@blocknote/react";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  closeMindMapLinkHover,
  closeMindMapLinkHoverSoon,
  getMindMapLinkHover,
  holdMindMapLinkHover,
  subscribeMindMapLinkHover,
  type MindMapLinkHover,
} from "../mindmap/mindMapLinkHover";

/** How far above the link the popup sits, matching BlockNote's own offset. */
const GAP = 10;
/** Below the link instead when there is no room above — as floating-ui would flip it. */
const FLIP_BELOW_ABOVE = 80;

/**
 * The popup a link in the map opens under the pointer: 编辑链接, 新窗口打开, 清除链接.
 *
 * It is the outline's popup, not a copy of it — the same `LinkToolbar` component, so
 * the two views cannot drift apart in looks or in what the buttons do. That is why
 * this renders inside the outline's `BlockNoteView` (BlockNote's components, theme and
 * dictionary all come from there) while the hover it answers is reported from the map,
 * through `mindMapLinkHover`.
 *
 * The buttons work on the document, so the link has to be found in it: the map only
 * knows the address it is standing on and which block it is in. Both views project the
 * same tree, so the link the pointer is on is also a marked run in the outline's
 * document, and editing it there is what reaches the map — as a store commit, the same
 * way the bridged formatting toolbar reaches it.
 *
 * Placed by hand rather than by floating-ui: the map draws itself in a transformed
 * container, where a fixed overlay is positioned against that container rather than
 * the window, and the link's `getBoundingClientRect` is the one measurement that
 * survives the transform.
 */
export function MindMapLinkToolbar() {
  const editor = useBlockNoteEditor();
  const hover = useSyncExternalStore(subscribeMindMapLinkHover, getMindMapLinkHover);
  // The edit form is a popover of the toolbar's own, so the pointer leaving the
  // toolbar while it is open is not a reason to close anything.
  const formOpen = useRef(false);

  const link = useMemo(
    () => (hover ? findLink(editor.prosemirrorState, hover) : null),
    [editor, hover],
  );
  if (!hover || !link) return null;

  const above = hover.top >= FLIP_BELOW_ABOVE;
  return createPortal(
    <div
      className="mindmap-link-toolbar-layer bn-root bn-mantine light"
      data-color-scheme="light"
      data-mantine-color-scheme="light"
      style={{
        left: hover.left,
        top: above ? hover.top - GAP : hover.bottom + GAP,
        transform: above ? "translateY(-100%)" : undefined,
      }}
      onPointerEnter={holdMindMapLinkHover}
      onPointerLeave={() => {
        if (!formOpen.current) closeMindMapLinkHoverSoon();
      }}
    >
      <LinkToolbar
        url={hover.url}
        text={link.text}
        range={{ from: link.from, to: link.to }}
        setToolbarOpen={(open) => {
          if (!open) closeMindMapLinkHover();
        }}
        setToolbarPositionFrozen={(frozen) => {
          formOpen.current = frozen;
        }}
      />
    </div>,
    document.body,
  );
}

interface FoundLink {
  from: number;
  to: number;
  text: string;
}

/**
 * The hovered link's run in the outline's document. Searched inside the block it was
 * reported from, so a node that links twice to one address gives up the right one, and
 * matched on the text as well for the same reason. A link split across runs by another
 * mark — half of it bold — is one link to BlockNote, so neighbours are joined.
 */
function findLink(
  state: ReturnType<typeof useBlockNoteEditor>["prosemirrorState"],
  hover: MindMapLinkHover,
): FoundLink | null {
  const linkMark = state.schema.marks.link;
  if (!linkMark) return null;

  let scope = state.doc;
  // A node's content starts one position after the node itself.
  let start = 0;
  state.doc.descendants((node, pos) => {
    if (start !== 0) return false;
    if (node.attrs.id !== hover.scopeId) return true;
    scope = node;
    start = pos + 1;
    return false;
  });

  const found: FoundLink[] = [];
  scope.descendants((node, pos) => {
    if (!node.isText) return true;
    if (!node.marks.some((mark) => mark.type === linkMark && mark.attrs.href === hover.url)) {
      return true;
    }
    const from = start + pos;
    const previous = found[found.length - 1];
    if (previous && previous.to === from) {
      previous.to = from + node.nodeSize;
      previous.text += node.text ?? "";
    } else {
      found.push({ from, to: from + node.nodeSize, text: node.text ?? "" });
    }
    return true;
  });

  return found.find((candidate) => candidate.text === hover.text) ?? found[0] ?? null;
}
