import MindElixir from "mind-elixir";
import type { ZhiJianMindMapLayout } from "../core/tree";

export interface MindMapLayoutPreset {
  id: ZhiJianMindMapLayout["type"];
  name: string;
  directions: Array<{
    id: ZhiJianMindMapLayout["direction"];
    name: string;
  }>;
  defaultDirection: ZhiJianMindMapLayout["direction"];
}

export const MIND_MAP_LAYOUT_PRESETS: MindMapLayoutPreset[] = [
  {
    id: "mind-map",
    name: "思维导图",
    directions: [
      { id: "both", name: "双向" },
      { id: "right", name: "向右" },
      { id: "left", name: "向左" },
    ],
    defaultDirection: "both",
  },
  {
    id: "logic",
    name: "逻辑图",
    directions: [
      { id: "right", name: "向右" },
      { id: "left", name: "向左" },
    ],
    defaultDirection: "right",
  },
  {
    id: "org-chart",
    name: "组织架构图",
    directions: [
      { id: "down", name: "向下" },
      { id: "up", name: "向上" },
    ],
    defaultDirection: "down",
  },
  {
    id: "timeline",
    name: "时间轴",
    directions: [
      { id: "right", name: "向右" },
      { id: "down", name: "向下" },
    ],
    defaultDirection: "right",
  },
  {
    id: "tree",
    name: "树形图",
    directions: [
      { id: "right", name: "右分支" },
      { id: "left", name: "左分支" },
    ],
    defaultDirection: "right",
  },
];

export const DEFAULT_MIND_MAP_LAYOUT: ZhiJianMindMapLayout = {
  type: "mind-map",
  direction: "right",
};

export function resolveMindMapLayout(
  layout?: ZhiJianMindMapLayout | null,
  legacyDirection?: 0 | 1 | 2,
): ZhiJianMindMapLayout {
  const preset = MIND_MAP_LAYOUT_PRESETS.find((candidate) => candidate.id === layout?.type);
  if (preset && preset.directions.some((direction) => direction.id === layout?.direction)) {
    return { type: preset.id, direction: layout!.direction };
  }
  if (legacyDirection === MindElixir.LEFT) return { type: "mind-map", direction: "left" };
  if (legacyDirection === MindElixir.SIDE) return { type: "mind-map", direction: "both" };
  return { ...DEFAULT_MIND_MAP_LAYOUT };
}

export function mindMapLayoutDirection(layout: ZhiJianMindMapLayout): 0 | 1 | 2 | 3 {
  // 时间轴挑的轴和它的名字是反的：一条"向右"的时间轴要首层节点排成一行、各自的
  // 子树往下长，这正是 MindElixir 的 DOWN；"向下"的时间轴同理落在 RIGHT 上。
  // 根节点再由 `styles.css` 从这根轴的顶端搬到左边（或反过来），这样首层的排布
  // 和更深层的连线全都还是 MindElixir 自己算的。
  if (layout.type === "timeline") return layout.direction === "down" ? MindElixir.RIGHT : MindElixir.DOWN;
  if (layout.type === "org-chart" || layout.type === "tree") return MindElixir.DOWN;
  if (layout.direction === "left") return MindElixir.LEFT;
  if (layout.direction === "both") return MindElixir.SIDE;
  return MindElixir.RIGHT;
}

export function mindMapLayoutKey(layout: ZhiJianMindMapLayout) {
  return `${layout.type}:${layout.direction}`;
}

export function mindMapLayoutClassName(layout: ZhiJianMindMapLayout) {
  return `mindmap-layout-${layout.type} mindmap-layout-direction-${layout.direction}`;
}
