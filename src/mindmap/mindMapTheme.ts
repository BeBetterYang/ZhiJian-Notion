import type { MainLineParams, SubLineParams, Theme } from "mind-elixir";
import type { ZhiJianMindMapLayout } from "../core/tree";
import { DEFAULT_MIND_MAP_LAYOUT } from "./mindMapLayout";

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
const ROUNDED_CORNER_RADIUS = 18;
/** 树形图里子节点相对父节点的缩进的一半，和 `styles.css` 的 24px 缩进配套。 */
const TREE_TRUNK_INSET = 12;

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
  group: "plain" | "light" | "dark";
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

export const DEFAULT_MIND_MAP_THEME_ID = "paper";

export const MIND_MAP_THEME_GROUPS = [
  { id: "plain", label: null },
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
] as const;

export const MIND_MAP_THEME_PRESETS: readonly MindMapTheme[] = [
  {
    id: "pure",
    version: 1,
    name: "纯境",
    group: "plain",
    type: "light",
    canvas: { background: "#ffffff" },
    root: nodeStyle("transparent", "#37352f", "transparent", "0px"),
    branchPalette: ["#b8babd"],
    level1: nodeStyle("transparent", "#37352f", "transparent", "0px"),
    child: nodeStyle("transparent", "#37352f", "transparent", "4px"),
    connector: { color: "#b8babd" },
    summary: { stroke: "#9b9da0", labelColor: "#5f6062" },
    arrow: { stroke: "#9b9da0", labelColor: "#5f6062" },
    selection: { color: "#2383e2" },
  },
  {
    id: "outline",
    version: 1,
    name: "明线",
    group: "plain",
    type: "light",
    canvas: { background: "#ffffff" },
    root: nodeStyle("transparent", "#37352f", "#3f3f3f", "3px"),
    branchPalette: ["#b8babd"],
    level1: nodeStyle("transparent", "#37352f", "transparent", "0px"),
    child: nodeStyle("transparent", "#37352f", "transparent", "0px"),
    connector: { color: "#b8babd" },
    summary: { stroke: "#8e9093", labelColor: "#555658" },
    arrow: { stroke: "#8e9093", labelColor: "#555658" },
    selection: { color: "#37352f" },
  },
  {
    id: "paper",
    version: 1,
    name: "素页",
    group: "plain",
    type: "light",
    canvas: { background: "#ffffff" },
    root: nodeStyle("#414141", "#ffffff", "#414141", "4px"),
    branchPalette: ["#b8babd"],
    level1: nodeStyle("transparent", "#37352f", "transparent", "0px"),
    child: nodeStyle("transparent", "#37352f", "transparent", "0px"),
    connector: { color: "#b8babd" },
    summary: { stroke: "#8e9093", labelColor: "#555658" },
    arrow: { stroke: "#8e9093", labelColor: "#555658" },
    selection: { color: "#37352f" },
  },
  {
    id: "ink",
    version: 1,
    name: "墨稿",
    group: "light",
    type: "light",
    canvas: { background: "#f6f6f8" },
    root: nodeStyle("#454545", "#ffffff", "#454545", "4px"),
    branchPalette: ["#d9dade"],
    level1: nodeStyle("#dddde1", "#4f5053", "#dddde1", "4px"),
    child: nodeStyle("transparent", "#4f5053", "transparent", "0px"),
    connector: { color: "#d9dade" },
    summary: { stroke: "#a9aaae", labelColor: "#66676a" },
    arrow: { stroke: "#7d7e81", labelColor: "#5b5c5f" },
    selection: { color: "#525356" },
  },
  {
    id: "yanpi",
    version: 1,
    name: "雁皮",
    group: "light",
    type: "light",
    canvas: { background: "#faf9f7" },
    root: nodeStyle("#9b8a76", "#ffffff", "#9b8a76", "4px"),
    branchPalette: ["#d5d1ca"],
    level1: nodeStyle("#d5d1ca", "#5f5140", "#d5d1ca", "4px"),
    child: nodeStyle("transparent", "#4f4942", "transparent", "0px"),
    connector: { color: "#d5d1ca" },
    summary: { stroke: "#b9ad9e", labelColor: "#756653" },
    arrow: { stroke: "#9b8a76", labelColor: "#756653" },
    selection: { color: "#8f7b63" },
  },
  {
    id: "mist",
    version: 1,
    name: "薄雾",
    group: "light",
    type: "light",
    canvas: { background: "#f4f6fa" },
    root: nodeStyle("#7186a6", "#ffffff", "#7186a6", "4px"),
    branchPalette: ["#d6deea"],
    level1: nodeStyle("#d6deea", "#52647d", "#d6deea", "4px"),
    child: nodeStyle("transparent", "#46556a", "transparent", "0px"),
    connector: { color: "#d6deea" },
    summary: { stroke: "#9eacc1", labelColor: "#60738f" },
    arrow: { stroke: "#7186a6", labelColor: "#52647d" },
    selection: { color: "#5f7ba5" },
  },
  {
    id: "breeze",
    version: 1,
    name: "清风",
    group: "light",
    type: "light",
    canvas: { background: "#f5faf4" },
    root: nodeStyle("#49b84b", "#ffffff", "#49b84b", "4px"),
    branchPalette: ["#e5f2e2"],
    level1: nodeStyle("#cee8c9", "#35783a", "#cee8c9", "4px"),
    child: nodeStyle("transparent", "#3f6542", "transparent", "0px"),
    connector: { color: "#e5f2e2" },
    summary: { stroke: "#8acb89", labelColor: "#3f8f43" },
    arrow: { stroke: "#49b84b", labelColor: "#35783a" },
    selection: { color: "#35a83c" },
  },
  {
    id: "pulse",
    version: 1,
    name: "脉搏",
    group: "light",
    type: "light",
    canvas: { background: "#fff7f2" },
    root: nodeStyle("#ef8148", "#ffffff", "#ef8148", "4px"),
    branchPalette: ["#fce8df"],
    level1: nodeStyle("#f8cfbc", "#a34f2d", "#f8cfbc", "4px"),
    child: nodeStyle("transparent", "#82503d", "transparent", "0px"),
    connector: { color: "#fce8df" },
    summary: { stroke: "#f2ad87", labelColor: "#bf6139" },
    arrow: { stroke: "#ef8148", labelColor: "#a34f2d" },
    selection: { color: "#e56e34" },
  },
  {
    id: "voyage",
    version: 1,
    name: "远航",
    group: "light",
    type: "light",
    canvas: { background: "#f3f8fc" },
    root: nodeStyle("#2f92e6", "#ffffff", "#2f92e6", "4px"),
    branchPalette: ["#e4f0fb"],
    level1: nodeStyle("#bad8f5", "#236ca9", "#bad8f5", "4px"),
    child: nodeStyle("transparent", "#34627f", "transparent", "0px"),
    connector: { color: "#e4f0fb" },
    summary: { stroke: "#80b8e9", labelColor: "#287abf" },
    arrow: { stroke: "#2f92e6", labelColor: "#236ca9" },
    selection: { color: "#1683dc" },
  },
  {
    id: "focus",
    version: 1,
    name: "焦点",
    group: "dark",
    type: "dark",
    canvas: { background: "#202022" },
    root: nodeStyle("#d0d0d2", "#232325", "#d0d0d2", "4px"),
    branchPalette: ["#606063"],
    level1: nodeStyle("#565658", "#f2f2f3", "#565658", "4px"),
    child: nodeStyle("transparent", "#dedee0", "transparent", "0px"),
    connector: { color: "#606063" },
    summary: { stroke: "#858588", labelColor: "#d0d0d2" },
    arrow: { stroke: "#a8a8aa", labelColor: "#d0d0d2" },
    selection: { color: "#f2f2f3" },
  },
  {
    id: "deep-dive",
    version: 1,
    name: "深潜",
    group: "dark",
    type: "dark",
    canvas: { background: "#0d1320" },
    root: nodeStyle("#8499c9", "#0d1320", "#8499c9", "4px"),
    branchPalette: ["#3b4761"],
    level1: nodeStyle("#344057", "#e4e9f5", "#344057", "4px"),
    child: nodeStyle("transparent", "#cbd4e8", "transparent", "0px"),
    connector: { color: "#3b4761" },
    summary: { stroke: "#5e6f94", labelColor: "#aebde0" },
    arrow: { stroke: "#8499c9", labelColor: "#aebde0" },
    selection: { color: "#9bb2e6" },
  },
  {
    id: "night-map",
    version: 1,
    name: "夜图",
    group: "dark",
    type: "dark",
    canvas: { background: "#150e19" },
    root: nodeStyle("#9875b5", "#170f1c", "#9875b5", "4px"),
    branchPalette: ["#4a3954"],
    level1: nodeStyle("#44334d", "#f0e4f7", "#44334d", "4px"),
    child: nodeStyle("transparent", "#dbc9e6", "transparent", "0px"),
    connector: { color: "#4a3954" },
    summary: { stroke: "#6c527d", labelColor: "#c9aad9" },
    arrow: { stroke: "#9875b5", labelColor: "#c9aad9" },
    selection: { color: "#b58bd2" },
  },
  {
    id: "secret-forest",
    version: 1,
    name: "秘林",
    group: "dark",
    type: "dark",
    canvas: { background: "#0d150f" },
    root: nodeStyle("#60731d", "#f0f3df", "#60731d", "4px"),
    branchPalette: ["#162012"],
    level1: nodeStyle("#293319", "#dfe7c8", "#293319", "4px"),
    child: nodeStyle("transparent", "#c9d4ae", "transparent", "0px"),
    connector: { color: "#162012" },
    summary: { stroke: "#40501c", labelColor: "#aebb83" },
    arrow: { stroke: "#60731d", labelColor: "#aebb83" },
    selection: { color: "#81973b" },
  },
  {
    id: "volcano",
    version: 1,
    name: "火山",
    group: "dark",
    type: "dark",
    canvas: { background: "#180e0b" },
    root: nodeStyle("#a1512d", "#f7e7df", "#a1512d", "4px"),
    branchPalette: ["#291711"],
    level1: nodeStyle("#4b291c", "#f0d5c8", "#4b291c", "4px"),
    child: nodeStyle("transparent", "#dec0b2", "transparent", "0px"),
    connector: { color: "#291711" },
    summary: { stroke: "#6f3824", labelColor: "#c98b70" },
    arrow: { stroke: "#a1512d", labelColor: "#c98b70" },
    selection: { color: "#c4663d" },
  },
  {
    id: "dream-lake",
    version: 1,
    name: "梦湖",
    group: "dark",
    type: "dark",
    canvas: { background: "#0b1718" },
    root: nodeStyle("#368d8d", "#e7f4f3", "#368d8d", "4px"),
    branchPalette: ["#0d2a2b"],
    level1: nodeStyle("#173d3e", "#d8eceb", "#173d3e", "4px"),
    child: nodeStyle("transparent", "#bededc", "transparent", "0px"),
    connector: { color: "#0d2a2b" },
    summary: { stroke: "#286364", labelColor: "#7dc1c0" },
    arrow: { stroke: "#368d8d", labelColor: "#7dc1c0" },
    selection: { color: "#4eb2b1" },
  },
] as const;

export const MIND_MAP_BACKGROUND_PRESETS = MIND_MAP_THEME_PRESETS
  .filter((theme, index, themes) => themes.findIndex((candidate) => candidate.canvas.background === theme.canvas.background) === index)
  .map((theme) => ({ name: theme.name, value: theme.canvas.background }));

const LEGACY_MIND_MAP_THEME_IDS: Record<string, string> = {
  zhijian: "paper",
  minimal: "pure",
  rainbow: "pulse",
  forest: "breeze",
  ocean: "voyage",
  sunny: "pulse",
  morandi: "ink",
  dark: "focus",
};

export function resolveMindMapTheme(
  theme?: { id: string; version: number } | null,
  canvasBackground?: string,
): MindMapTheme {
  const requestedId = theme?.id ? LEGACY_MIND_MAP_THEME_IDS[theme.id] ?? theme.id : DEFAULT_MIND_MAP_THEME_ID;
  const preset = MIND_MAP_THEME_PRESETS.find((candidate) => candidate.id === requestedId)
    ?? MIND_MAP_THEME_PRESETS.find((candidate) => candidate.id === DEFAULT_MIND_MAP_THEME_ID)
    ?? MIND_MAP_THEME_PRESETS[0];
  return canvasBackground ? { ...preset, canvas: { background: canvasBackground } } : preset;
}

export function createMindElixirTheme(
  theme: MindMapTheme,
  roundedConnectors = false,
  layout: ZhiJianMindMapLayout = DEFAULT_MIND_MAP_LAYOUT,
): Theme {
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
    generateMainBranch(params) {
      return mindMapMainBranchPath(params, roundedConnectors, layout);
    },
    generateSubBranch(params) {
      return mindMapSubBranchPath(params, mindMapNodeGapX(this.container), roundedConnectors, layout);
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
export function mindMapMainBranchPath(
  { pT, pL, pW, pH, cT, cL, cW, cH, direction }: MainLineParams,
  rounded = false,
  layout: ZhiJianMindMapLayout = DEFAULT_MIND_MAP_LAYOUT,
) {
  // 树形图的根和首层之间也是"挂"下来的一竖一横，和更深的层级一致。
  if (layout.type === "tree") {
    return treeHangingPath({ pT, pH, cT, cL, cW, cH }, layout.direction === "left", rounded);
  }
  // 时间轴的根被 CSS 搬到了轴的侧面：轴向右时它在左边，轴向下时它在上面。首层节点
  // 串在一条主轴上，所以这里画的是一根从根引出的主干，再逐个"梳"进每个节点靠近根
  // 的那条边——从节点的另一头绕进去会横穿整条主轴。
  if (layout.type === "timeline") {
    return layout.direction === "down"
      ? timelineSpinePath(pL + pW / 2, pT + pH, cL, cT + cH / 2, false, rounded)
      : timelineSpinePath(pT + pH / 2, pL + pW, cT, cL + cW / 2, true, rounded);
  }
  if (direction === "down") {
    const childIsBelow = cT >= pT;
    return verticalElbowPath(
      pL + pW / 2,
      childIsBelow ? pT + pH : pT,
      cL + cW / 2,
      childIsBelow ? cT : cT + cH,
      rounded,
    );
  }
  const fromY = pT + pH / 2;
  const toY = cT + cH / 2;
  return direction === "lhs"
    ? elbowPath(pL, fromY, cL + cW, toY, rounded)
    : elbowPath(pL + pW, fromY, cL, toY, rounded);
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
  rounded = false,
  layout: ZhiJianMindMapLayout = DEFAULT_MIND_MAP_LAYOUT,
) {
  if (layout.type === "tree") {
    return treeHangingPath({ pT, pH, cT, cL, cW, cH }, layout.direction === "left", rounded);
  }
  if (direction === "down") {
    const childIsBelow = cT >= pT;
    return verticalElbowPath(
      pL + pW / 2,
      childIsBelow ? pT + pH : pT,
      cL + cW / 2,
      childIsBelow ? cT : cT + cH,
      rounded,
    );
  }
  const fromY = pT + pH / 2;
  const toY = cT + cH / 2;
  const parentInset = isFirst ? 0 : nodeGapX;
  return direction === "lhs"
    ? elbowPath(pL + parentInset, fromY, cL + cW - nodeGapX, toY, rounded)
    : elbowPath(pL + pW - parentInset, fromY, cL + nodeGapX, toY, rounded);
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
function elbowPath(fromX: number, fromY: number, toX: number, toY: number, rounded: boolean) {
  const towards = toX >= fromX ? 1 : -1;
  const trunkX = toX - towards * Math.min(TRUNK_GAP, Math.abs(toX - fromX) / 2);
  if (Math.abs(toY - fromY) < 1) return `M ${round(fromX)} ${round(fromY)} H ${round(toX)}`;
  if (rounded) {
    const vertical = toY >= fromY ? 1 : -1;
    const radius = Math.min(ROUNDED_CORNER_RADIUS, Math.abs(toX - trunkX), Math.abs(toY - fromY));
    return [
      `M ${round(fromX)} ${round(fromY)}`,
      `H ${round(trunkX)}`,
      `V ${round(toY - vertical * radius)}`,
      `Q ${round(trunkX)} ${round(toY)} ${round(trunkX + towards * radius)} ${round(toY)}`,
      `H ${round(toX)}`,
    ].join(" ");
  }
  return [
    `M ${round(fromX)} ${round(fromY)}`,
    `H ${round(trunkX)}`,
    `V ${round(toY)}`,
    `H ${round(toX)}`,
  ].join(" ");
}

/**
 * 树形图的连线：从父节点底下引一竖，再横着接进子节点靠近的那一侧。所有兄弟共用
 * 同一根竖线——它的 x 是从子节点量出来的，而树形图里一个父节点的孩子排成一列、
 * 共用同一条边。`TREE_TRUNK_INSET` 必须是 `styles.css` 里那份缩进的一半，竖线
 * 才落在父节点底下而不是飘在它外面。
 */
function treeHangingPath(
  { pT, pH, cT, cL, cW, cH }: Pick<SubLineParams, "pT" | "pH" | "cT" | "cL" | "cW" | "cH">,
  leftBranch: boolean,
  rounded: boolean,
) {
  const toX = leftBranch ? cL + cW : cL;
  const trunkX = leftBranch ? toX + TREE_TRUNK_INSET : toX - TREE_TRUNK_INSET;
  const toY = cT + cH / 2;
  const fromY = pT + pH;
  if (!rounded) return `M ${round(trunkX)} ${round(fromY)} V ${round(toY)} H ${round(toX)}`;
  const towards = leftBranch ? -1 : 1;
  const radius = Math.min(ROUNDED_CORNER_RADIUS, TREE_TRUNK_INSET, Math.abs(toY - fromY));
  return [
    `M ${round(trunkX)} ${round(fromY)}`,
    `V ${round(toY - radius)}`,
    `Q ${round(trunkX)} ${round(toY)} ${round(trunkX + towards * radius)} ${round(toY)}`,
    `H ${round(toX)}`,
  ].join(" ");
}

/**
 * 时间轴的根到首层：一根主干从根引出，在每个首层节点处拐一个直角接进去。
 * `horizontalSpine` 是"轴向右"那一种（主干横着走，逐个往下拐进节点的上边）；
 * 反过来就是"轴向下"（主干竖着走，逐个往右拐进节点的左边）。参数按主干的方向命名，
 * 两种情形只差一次坐标转置。
 */
function timelineSpinePath(
  trunk: number,
  start: number,
  edge: number,
  along: number,
  horizontalSpine: boolean,
  rounded: boolean,
) {
  const point = (alongAxis: number, crossAxis: number) =>
    horizontalSpine ? `${round(alongAxis)} ${round(crossAxis)}` : `${round(crossAxis)} ${round(alongAxis)}`;
  const alongCommand = horizontalSpine ? "H" : "V";
  const crossCommand = horizontalSpine ? "V" : "H";
  if (Math.abs(along - start) < 1) return `M ${point(start, trunk)} ${crossCommand} ${round(edge)}`;
  if (rounded) {
    const towards = along >= start ? 1 : -1;
    const radius = Math.min(ROUNDED_CORNER_RADIUS, Math.abs(along - start), Math.abs(edge - trunk));
    return [
      `M ${point(start, trunk)}`,
      `${alongCommand} ${round(along - towards * radius)}`,
      `Q ${point(along, trunk)} ${point(along, trunk + (edge >= trunk ? radius : -radius))}`,
      `${crossCommand} ${round(edge)}`,
    ].join(" ");
  }
  return [
    `M ${point(start, trunk)}`,
    `${alongCommand} ${round(along)}`,
    `${crossCommand} ${round(edge)}`,
  ].join(" ");
}

/** The same elbow turned a quarter, for the top-down layout. */
function verticalElbowPath(fromX: number, fromY: number, toX: number, toY: number, rounded: boolean) {
  const downwards = toY >= fromY ? 1 : -1;
  const trunkY = toY - downwards * Math.min(TRUNK_GAP, Math.abs(toY - fromY) / 2);
  if (Math.abs(toX - fromX) < 1) return `M ${round(fromX)} ${round(fromY)} V ${round(toY)}`;
  if (rounded) {
    const horizontal = toX >= fromX ? 1 : -1;
    const radius = Math.min(ROUNDED_CORNER_RADIUS, Math.abs(toY - trunkY), Math.abs(toX - fromX));
    return [
      `M ${round(fromX)} ${round(fromY)}`,
      `V ${round(trunkY)}`,
      `H ${round(toX - horizontal * radius)}`,
      `Q ${round(toX)} ${round(trunkY)} ${round(toX)} ${round(trunkY + downwards * radius)}`,
      `V ${round(toY)}`,
    ].join(" ");
  }
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
