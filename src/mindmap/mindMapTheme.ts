import type { MainLineParams, MindElixirInstance, SubLineParams, Theme } from "mind-elixir";

/**
 * How the map is drawn: right-angle connectors and no node chrome.
 *
 * mind-elixir's own look is a pill per node joined by curves, and its deeper
 * branches are drawn as an underline running beneath the whole child. Both are
 * replaced here — the connectors through the theme's two branch generators, the
 * pills through `--root-*`/`--main-*` and the flattening rules in `styles.css`.
 */

/** Line ink. A one-colour palette gives every branch the same stroke. */
const BRANCH_COLOR = "#4d5666";
/**
 * Node ink and canvas. Both are the app-wide tokens from `styles.css`, which the
 * outline reads too — the map and the outline show one document, so a node cannot
 * change colour by being looked at in the other view. mind-elixir applies every
 * `cssVar` entry with `setProperty` on the container, so a `var()` here resolves
 * exactly as it would in a stylesheet; `palette` above is written into an SVG
 * `stroke` attribute instead and has to stay a literal colour.
 *
 * The canvas doubles as every node's own background: a node being edited floats
 * above the map, so an opaque box is what keeps the text being typed legible over
 * whatever it covers. See the `me-tpc` background rule in `styles.css` for the
 * levels mind-elixir does not colour from a variable.
 */
const NODE_INK = "var(--zhijian-ink)";
const CANVAS_COLOR = "var(--zhijian-canvas)";
/** Distance from a node's near edge to the vertical leg, where there is room. */
const TRUNK_GAP = 30;

export const MINDMAP_THEME: Theme = {
  name: "zhijian",
  type: "light",
  palette: [BRANCH_COLOR],
  cssVar: {
    "--bgcolor": CANVAS_COLOR,
    "--color": NODE_INK,
    // The root is the one node that keeps a frame: a rounded outline in the branch
    // ink, no fill of its own. mind-elixir reads this as `border: var(
    // --root-border-color) 2px solid`, so the colour is all there is to set — the
    // rounding comes from `--root-radius` and the box from its own padding.
    "--root-color": NODE_INK,
    "--root-bgcolor": CANVAS_COLOR,
    "--root-border-color": BRANCH_COLOR,
    "--root-radius": "10px",
    "--main-color": NODE_INK,
    "--main-bgcolor": CANVAS_COLOR,
    // Read as `border: var(--main-border, 2px solid var(--main-color))`, so this
    // is the only way to take the first level's frame away.
    "--main-border": "0",
    "--main-radius": "6px",
    // Wider than it is tall, and the width is deliberately double mind-elixir's
    // own 3px: a node's text needs air between it and where its box ends, and the
    // box is what a connector arrives at and what a selection outlines. Rows stay
    // as tight as they were, so the map's vertical rhythm is untouched. The root
    // is not affected — mind-elixir pads it from its own rule.
    "--topic-padding": "3px 6px",
    // The row rhythm, taken from the reference map: siblings sit a little over
    // 2.6× their font size apart, and two first-level branches about 1.3× that
    // again — enough to read as separate branches without leaving the map airy.
    // Half of this lands above a row and half below (see the `me-parent` rule in
    // `styles.css`), and `me-parent`'s own vertical padding is trimmed there to
    // the 2px that makes the sum come out at the reference's pitch.
    "--node-gap-y": "6px",
    "--main-gap-y": "12px",
    "--selected": "#2383e2",
    "--panel-color": NODE_INK,
    "--panel-bgcolor": CANVAS_COLOR,
    "--panel-border-color": "#e5e7eb",
  },
  generateMainBranch(params) {
    return mindMapMainBranchPath(params, mindMapBranchAnchorContext(this));
  },
  generateSubBranch(params) {
    return mindMapSubBranchPath(params, mindMapNodeGapX(this.container), mindMapBranchAnchorContext(this));
  },
};

/** The column gap mind-elixir is currently laying out with. */
export function mindMapNodeGapX(container: HTMLElement) {
  return Number.parseInt(container.style.getPropertyValue("--node-gap-x"), 10) || 0;
}

/**
 * Root to first level. Both boxes here are the visible node boxes, so the line
 * runs from one edge to the other with nothing to compensate for.
 */
interface BranchGeometry {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface BranchAnchor {
  left: number;
  width: number;
  centerY: number;
}

interface MindMapBranchAnchorContext {
  parentAnchor?: (geometry: BranchGeometry) => BranchAnchor | null;
  childAnchor?: (geometry: BranchGeometry) => BranchAnchor | null;
  parentAnchorY?: (geometry: BranchGeometry) => number | null;
  childAnchorY?: (geometry: BranchGeometry) => number | null;
}

export function mindMapMainBranchPath(
  { pT, pL, pW, pH, cT, cL, cW, cH, direction }: MainLineParams,
  anchors?: MindMapBranchAnchorContext,
) {
  if (direction === "down") return verticalElbowPath(pL + pW / 2, pT + pH, cL + cW / 2, cT);
  const parent = anchorBox(anchors?.parentAnchor, anchors?.parentAnchorY, { top: pT, left: pL, width: pW, height: pH });
  const child = anchorBox(anchors?.childAnchor, anchors?.childAnchorY, { top: cT, left: cL, width: cW, height: cH });
  return direction === "lhs"
    ? elbowPath(parent.left, parent.centerY, child.left + child.width, child.centerY)
    : elbowPath(parent.left + parent.width, parent.centerY, child.left, child.centerY);
}

/**
 * Every deeper level. Here mind-elixir measures `me-parent` rather than the node
 * box, and `me-parent` pads its topic by `--node-gap-x` — that padding *is* the
 * gap between two columns, so an uncompensated line would stop a whole column gap
 * short of the text. A first-level `me-parent` is the one exception: it is spaced
 * by a margin instead and carries no padding, which is exactly the case `isFirst`
 * marks.
 */
export function mindMapSubBranchPath(
  { pT, pL, pW, pH, cT, cL, cW, cH, direction, isFirst }: SubLineParams,
  nodeGapX: number,
  anchors?: MindMapBranchAnchorContext,
) {
  if (direction === "down") return verticalElbowPath(pL + pW / 2, pT + pH, cL + cW / 2, cT);
  const parent = anchorBox(anchors?.parentAnchor, anchors?.parentAnchorY, { top: pT, left: pL, width: pW, height: pH });
  const child = anchorBox(anchors?.childAnchor, anchors?.childAnchorY, { top: cT, left: cL, width: cW, height: cH });
  const fromY = parent.centerY;
  const toY = child.centerY;
  const parentInset = isFirst ? 0 : nodeGapX;
  if (anchors?.parentAnchor || anchors?.childAnchor) {
    return direction === "lhs"
      ? elbowPath(parent.left, fromY, child.left + child.width, toY)
      : elbowPath(parent.left + parent.width, fromY, child.left, toY);
  }
  return direction === "lhs"
    ? elbowPath(pL + parentInset, fromY, cL + cW - nodeGapX, toY)
    : elbowPath(pL + pW - parentInset, fromY, cL + nodeGapX, toY);
}

function anchorBox(
  resolveBox: ((geometry: BranchGeometry) => BranchAnchor | null) | undefined,
  resolveY: ((geometry: BranchGeometry) => number | null) | undefined,
  geometry: BranchGeometry,
) {
  return resolveBox?.(geometry) ?? {
    left: geometry.left,
    width: geometry.width,
    centerY: resolveY?.(geometry) ?? geometry.top + geometry.height / 2,
  };
}

function mindMapBranchAnchorContext(instance: MindElixirInstance): MindMapBranchAnchorContext {
  const container = instance.container;
  return {
    parentAnchor: (geometry) => resolveMindMapPrimaryAnchor(container, geometry),
    childAnchor: (geometry) => resolveMindMapPrimaryAnchor(container, geometry),
  };
}

export function resolveMindMapPrimaryAnchorY(container: HTMLElement | null | undefined, geometry: BranchGeometry) {
  return resolveMindMapPrimaryAnchor(container, geometry)?.centerY ?? null;
}

export function resolveMindMapPrimaryAnchor(container: HTMLElement | null | undefined, geometry: BranchGeometry): BranchAnchor | null {
  const element = findMindMapGeometryElement(container, geometry);
  if (!element) return null;
  const primary = element.querySelector<HTMLElement>(".mindmap-node-primary");
  if (!primary) return null;
  const scale = mindMapScaleFromElement(container);
  const elementRect = element.getBoundingClientRect();
  const primaryRect = primary.getBoundingClientRect();
  const anchorRect = firstLineAnchorRect(primary);
  if (!elementRect.height || !anchorRect.height || !primaryRect.width) return null;
  return {
    left: geometry.left + (primaryRect.left - elementRect.left) / scale,
    width: primaryRect.width / scale,
    centerY: geometry.top + (anchorRect.top + anchorRect.height / 2 - elementRect.top) / scale,
  };
}

function findMindMapGeometryElement(container: HTMLElement | null | undefined, geometry: BranchGeometry): HTMLElement | null {
  if (!container) return null;
  const candidates = container.querySelectorAll<HTMLElement>("me-root, me-parent, me-tpc");
  let bestElement: HTMLElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const element of candidates) {
    if (!element.querySelector(".mindmap-node-primary")) continue;
    const distance =
      Math.abs(element.offsetTop - geometry.top) +
      Math.abs(element.offsetLeft - geometry.left) +
      Math.abs(element.offsetWidth - geometry.width) +
      Math.abs(element.offsetHeight - geometry.height);
    if (distance > 2) continue;
    if (distance < bestDistance) {
      bestElement = element;
      bestDistance = distance;
    }
  }
  return bestElement;
}

function firstLineAnchorRect(primary: HTMLElement) {
  const text = firstTextNode(primary);
  if (text && text.textContent) {
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(1, text.textContent.length));
    const rect = typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : null;
    range.detach();
    if (rect && rect.height > 0) return rect;
  }
  const checkbox = primary.querySelector<HTMLElement>(".mindmap-node-checkbox");
  if (checkbox) {
    const rect = checkbox.getBoundingClientRect();
    if (rect.height > 0) return rect;
  }
  const rect = primary.getBoundingClientRect();
  const lineHeight = Number.parseFloat(window.getComputedStyle(primary).lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) {
    return new DOMRect(rect.left, rect.top, rect.width, Math.min(lineHeight, rect.height || lineHeight));
  }
  return rect;
}

function firstTextNode(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  return walker.nextNode();
}

function mindMapScaleFromElement(container: HTMLElement | null | undefined) {
  const map = container?.querySelector<HTMLElement>(".map-canvas");
  if (!map) return 1;
  const transform = window.getComputedStyle(map).transform;
  if (!transform || transform === "none") return 1;
  if (typeof DOMMatrixReadOnly === "undefined") {
    const match = /^matrix\(([-\d.]+),/.exec(transform);
    return match ? Number(match[1]) || 1 : 1;
  }
  const matrix = new DOMMatrixReadOnly(transform);
  return matrix.a || 1;
}

/**
 * A horizontal run, a vertical leg, then a horizontal run into the child, turning
 * a square corner at each end of the leg.
 *
 * mind-elixir draws one path per parent-child pair and knows nothing about
 * siblings, so the shared vertical trunk the design shows has to fall out of the
 * geometry: the leg is placed at a distance measured from the *child*, and
 * children of one parent share a column — hence an x — so every sibling's leg
 * lands on the same line and the paths overlap into a single trunk.
 */
function elbowPath(fromX: number, fromY: number, toX: number, toY: number) {
  const towards = toX >= fromX ? 1 : -1;
  const trunkX = toX - towards * Math.min(TRUNK_GAP, Math.abs(toX - fromX) / 2);
  if (Math.abs(toY - fromY) < 1) return `M ${round(fromX)} ${round(fromY)} H ${round(toX)}`;
  return [
    `M ${round(fromX)} ${round(fromY)}`,
    `H ${round(trunkX)}`,
    `V ${round(toY)}`,
    `H ${round(toX)}`,
  ].join(" ");
}

/** The same elbow turned a quarter, for the top-down layout. */
function verticalElbowPath(fromX: number, fromY: number, toX: number, toY: number) {
  const downwards = toY >= fromY ? 1 : -1;
  const trunkY = toY - downwards * Math.min(TRUNK_GAP, Math.abs(toY - fromY) / 2);
  if (Math.abs(toX - fromX) < 1) return `M ${round(fromX)} ${round(fromY)} V ${round(toY)}`;
  return [
    `M ${round(fromX)} ${round(fromY)}`,
    `V ${round(trunkY)}`,
    `H ${round(toX)}`,
    `V ${round(toY)}`,
  ].join(" ");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
