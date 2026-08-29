import type { MainLineParams, SubLineParams, Theme } from "mind-elixir";

/**
 * How the map is drawn: right-angle connectors and no node chrome.
 *
 * mind-elixir's own look is a pill per node joined by curves, and its deeper
 * branches are drawn as an underline running beneath the whole child. Both are
 * replaced here — the connectors through the theme's two branch generators, the
 * pills through `--root-*`/`--main-*` and the flattening rules in `styles.css`.
 */

/** Distance from a node's near edge to the vertical leg, where there is room. */
const TRUNK_GAP = 30;

export interface MindMapThemeNodeStyle {
  background: string;
  text: string;
  border: string;
  radius: string;
}

export interface MindMapTheme {
  id: string;
  version: number;
  name: string;
  type: "light" | "dark";
  canvas: { background: string };
  root: MindMapThemeNodeStyle;
  branchPalette: string[];
  level1: MindMapThemeNodeStyle;
  child: MindMapThemeNodeStyle;
  connector: { color: string };
  summary: { stroke: string; labelColor: string };
  arrow: { stroke: string; labelColor: string };
  selection: { color: string };
}

const nodeStyle = (background: string, text: string, border: string, radius = "6px"): MindMapThemeNodeStyle => ({
  background,
  text,
  border,
  radius,
});

export const DEFAULT_MIND_MAP_THEME_ID = "zhijian";

export const MIND_MAP_THEME_PRESETS: readonly MindMapTheme[] = [
  {
    id: "zhijian",
    version: 1,
    name: "枝间",
    type: "light",
    canvas: { background: "#ffffff" },
    root: nodeStyle("#37352f", "#ffffff", "#37352f", "10px"),
    branchPalette: ["#4f78a7", "#5f8b6d", "#a8793c", "#a15f6c", "#70669a", "#4f8587"],
    level1: nodeStyle("transparent", "#252525", "transparent"),
    child: nodeStyle("transparent", "#37352f", "transparent"),
    connector: { color: "#4d5666" },
    summary: { stroke: "#697386", labelColor: "#535c6d" },
    arrow: { stroke: "#697386", labelColor: "#535c6d" },
    selection: { color: "#2383e2" },
  },
  {
    id: "minimal",
    version: 1,
    name: "极简",
    type: "light",
    canvas: { background: "#ffffff" },
    root: nodeStyle("#ffffff", "#202124", "#202124", "4px"),
    branchPalette: ["#34373b", "#60646c", "#81858c", "#4b4f54"],
    level1: nodeStyle("transparent", "#202124", "transparent", "3px"),
    child: nodeStyle("transparent", "#34373b", "transparent", "3px"),
    connector: { color: "#777b82" },
    summary: { stroke: "#777b82", labelColor: "#4b4f54" },
    arrow: { stroke: "#777b82", labelColor: "#4b4f54" },
    selection: { color: "#37352f" },
  },
  {
    id: "rainbow",
    version: 1,
    name: "彩虹",
    type: "light",
    canvas: { background: "#fffefe" },
    root: nodeStyle("#5b50c7", "#ffffff", "#5b50c7", "10px"),
    branchPalette: ["#e45858", "#e89135", "#d3ad2f", "#4f9b69", "#3b8dc4", "#7266cf", "#b55da0"],
    level1: nodeStyle("transparent", "#29272e", "transparent"),
    child: nodeStyle("transparent", "#37343c", "transparent"),
    connector: { color: "#77717e" },
    summary: { stroke: "#7266cf", labelColor: "#5b50c7" },
    arrow: { stroke: "#e45858", labelColor: "#b14444" },
    selection: { color: "#6257dc" },
  },
  {
    id: "forest",
    version: 1,
    name: "森林",
    type: "light",
    canvas: { background: "#f7faf7" },
    root: nodeStyle("#315f48", "#ffffff", "#315f48", "10px"),
    branchPalette: ["#48765c", "#6f8d57", "#8a7850", "#477876", "#7a6960"],
    level1: nodeStyle("transparent", "#244837", "transparent"),
    child: nodeStyle("transparent", "#34483d", "transparent"),
    connector: { color: "#607a69" },
    summary: { stroke: "#48765c", labelColor: "#315f48" },
    arrow: { stroke: "#8a7850", labelColor: "#6c5b3d" },
    selection: { color: "#2f8f62" },
  },
  {
    id: "ocean",
    version: 1,
    name: "海洋",
    type: "light",
    canvas: { background: "#f6fafc" },
    root: nodeStyle("#245f83", "#ffffff", "#245f83", "10px"),
    branchPalette: ["#337da5", "#418c9b", "#526fa7", "#4f91c2", "#637ca1"],
    level1: nodeStyle("transparent", "#224b65", "transparent"),
    child: nodeStyle("transparent", "#314a59", "transparent"),
    connector: { color: "#52788e" },
    summary: { stroke: "#337da5", labelColor: "#245f83" },
    arrow: { stroke: "#526fa7", labelColor: "#415985" },
    selection: { color: "#1683c6" },
  },
  {
    id: "sunny",
    version: 1,
    name: "暖阳",
    type: "light",
    canvas: { background: "#fffaf4" },
    root: nodeStyle("#b86b38", "#ffffff", "#b86b38", "10px"),
    branchPalette: ["#c77a3d", "#d39a45", "#b86155", "#b2884e", "#9e6d4c"],
    level1: nodeStyle("transparent", "#704224", "transparent"),
    child: nodeStyle("transparent", "#59483d", "transparent"),
    connector: { color: "#a77b5e" },
    summary: { stroke: "#c77a3d", labelColor: "#9a552d" },
    arrow: { stroke: "#b86155", labelColor: "#91473f" },
    selection: { color: "#d47732" },
  },
  {
    id: "morandi",
    version: 1,
    name: "莫兰迪",
    type: "light",
    canvas: { background: "#f8f7f5" },
    root: nodeStyle("#6f7475", "#ffffff", "#6f7475", "10px"),
    branchPalette: ["#81939a", "#8d9a83", "#a38e86", "#938aa0", "#9d947d", "#7f9692"],
    level1: nodeStyle("transparent", "#4f5557", "transparent"),
    child: nodeStyle("transparent", "#5c5d5c", "transparent"),
    connector: { color: "#858b8c" },
    summary: { stroke: "#81939a", labelColor: "#68777c" },
    arrow: { stroke: "#a38e86", labelColor: "#826f69" },
    selection: { color: "#697f8a" },
  },
  {
    id: "dark",
    version: 1,
    name: "深色",
    type: "dark",
    canvas: { background: "#202124" },
    root: nodeStyle("#e8eaed", "#202124", "#e8eaed", "10px"),
    branchPalette: ["#7da6d8", "#78ad88", "#d2a563", "#ca8491", "#9b90cd", "#71aeb0"],
    level1: nodeStyle("transparent", "#f1f3f4", "transparent"),
    child: nodeStyle("transparent", "#d7d9dc", "transparent"),
    connector: { color: "#9aa0a6" },
    summary: { stroke: "#aeb4ba", labelColor: "#e2e4e7" },
    arrow: { stroke: "#ca8491", labelColor: "#e0a3ae" },
    selection: { color: "#8ab4f8" },
  },
] as const;

export function resolveMindMapTheme(theme?: { id: string; version: number } | null): MindMapTheme {
  return MIND_MAP_THEME_PRESETS.find((preset) => preset.id === theme?.id) ?? MIND_MAP_THEME_PRESETS[0];
}

export function createMindElixirTheme(theme: MindMapTheme): Theme {
  return {
    name: theme.id,
    type: theme.type,
    palette: [...theme.branchPalette],
    cssVar: {
      "--bgcolor": theme.canvas.background,
      "--color": theme.child.text,
      "--root-color": theme.root.text,
      "--root-bgcolor": theme.root.background,
      "--root-border-color": theme.root.border,
      "--root-radius": theme.root.radius,
      "--main-color": theme.level1.text,
      "--main-bgcolor": theme.canvas.background,
      "--main-border": "0",
      "--main-radius": theme.level1.radius,
      "--topic-padding": "3px 6px",
      "--node-gap-y": "6px",
      "--main-gap-y": "12px",
      "--selected": theme.selection.color,
      "--accent-color": theme.selection.color,
      "--panel-color": theme.child.text,
      "--panel-bgcolor": theme.canvas.background,
      "--panel-border-color": theme.child.border === "transparent" ? theme.connector.color : theme.child.border,
    },
    generateMainBranch: mindMapMainBranchPath,
    generateSubBranch(params) {
      return mindMapSubBranchPath(params, mindMapNodeGapX(this.container));
    },
  };
}

/** The column gap mind-elixir is currently laying out with. */
export function mindMapNodeGapX(container: HTMLElement) {
  return Number.parseInt(container.style.getPropertyValue("--node-gap-x"), 10) || 0;
}

/**
 * Root to first level. Both boxes here are the visible node boxes, so the line
 * runs from one edge to the other with nothing to compensate for.
 */
export function mindMapMainBranchPath({ pT, pL, pW, pH, cT, cL, cW, cH, direction }: MainLineParams) {
  if (direction === "down") return verticalElbowPath(pL + pW / 2, pT + pH, cL + cW / 2, cT);
  const fromY = pT + pH / 2;
  const toY = cT + cH / 2;
  return direction === "lhs"
    ? elbowPath(pL, fromY, cL + cW, toY)
    : elbowPath(pL + pW, fromY, cL, toY);
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
) {
  if (direction === "down") return verticalElbowPath(pL + pW / 2, pT + pH, cL + cW / 2, cT);
  const fromY = pT + pH / 2;
  const toY = cT + cH / 2;
  const parentInset = isFirst ? 0 : nodeGapX;
  return direction === "lhs"
    ? elbowPath(pL + parentInset, fromY, cL + cW - nodeGapX, toY)
    : elbowPath(pL + pW - parentInset, fromY, cL + nodeGapX, toY);
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
