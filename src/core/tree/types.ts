import type { RichTextContent } from "./richText";

export type ZhiJianNodeType =
  | "text"
  | "heading"
  | "todo"
  | "table";

export interface ZhiJianTableCell {
  content: RichTextContent;
  backgroundColor?: string;
  textColor?: string;
  textAlignment?: "left" | "center" | "right" | "justify";
  colspan?: number;
  rowspan?: number;
}

export interface ZhiJianTableData {
  rows: ZhiJianTableCell[][];
  columnWidths?: (number | undefined)[];
  headerRows?: number;
  headerCols?: number;
}

export interface ZhiJianImageData {
  url?: string;
  assetId?: string;
  storagePath?: string;
  name?: string;
  caption?: string;
  previewWidth?: number;
  showPreview?: boolean;
}

export type ZhiJianNodeBlock =
  | {
      id: string;
      type: "quote";
      content: RichTextContent;
    }
  | {
      id: string;
      type: "image";
      image: ZhiJianImageData;
    };

export interface ZhiJianNode {
  id: string;
  parentId: string | null;
  children: string[];
  content: RichTextContent;
  description?: RichTextContent;
  type: ZhiJianNodeType;
  blocks?: ZhiJianNodeBlock[];
  props?: {
    checked?: boolean;
    collapsed?: boolean;
    headingLevel?: 1 | 2 | 3;
    table?: ZhiJianTableData;
    style?: object;
  };
  meta?: {
    createdAt: number;
    updatedAt: number;
  };
}

/**
 * 摘要: a bracket drawn beside a run of one parent's children, with a label.
 *
 * Addressed the way mind-elixir addresses it — the parent's id plus the first and
 * last child index — because that is what the map can draw from, and re-deriving
 * it from node ids on every render would be work for nothing.
 */
export interface ZhiJianMindMapSummary {
  id: string;
  label: string;
  parent: string;
  start: number;
  end: number;
  style?: {
    stroke?: string;
    labelColor?: string;
  };
}

/** 连接: a labelled arrow between two nodes, with its two dragged control points. */
export interface ZhiJianMindMapArrow {
  id: string;
  label: string;
  from: string;
  to: string;
  delta1?: { x: number; y: number };
  delta2?: { x: number; y: number };
  bidirectional?: boolean;
  style?: {
    stroke?: string;
    strokeWidth?: string | number;
    strokeDasharray?: string;
    opacity?: string | number;
    labelColor?: string;
  };
}

export type ZhiJianMindMapLayout = {
  type: "mind-map" | "logic" | "org-chart" | "timeline" | "tree";
  direction: "left" | "right" | "both" | "up" | "down";
  order?: "left-first" | "right-first" | "alternating";
};

/**
 * What the mind map draws over the tree and nothing else does.
 *
 * 摘要 and 连接 are the map's own two annotations — the outline has no room for a
 * bracket spanning siblings or an arrow across branches, and the user asked for
 * neither there. They live on the tree all the same, because that is what is
 * cloned, undone and persisted; keeping them inside mind-elixir's instance meant
 * losing them to the next `refresh`, and to every switch to the outline and back.
 */
export interface ZhiJianMindMapDecorations {
  summaries?: ZhiJianMindMapSummary[];
  arrows?: ZhiJianMindMapArrow[];
  theme?: {
    id: string;
    version: number;
  };
  connector?: {
    rounded: boolean;
  };
  frame?: {
    rounded: boolean;
  };
  canvas?: {
    background: string;
  };
  layout?: ZhiJianMindMapLayout;
}

export type ZhiJianMindMapDefaults = Pick<
  ZhiJianMindMapDecorations,
  "theme" | "connector" | "frame" | "canvas" | "layout"
>;

export interface ZhiJianTree {
  rootId: string;
  nodes: Record<string, ZhiJianNode>;
  mindMap?: ZhiJianMindMapDecorations;
}

export type TreeListener = (tree: ZhiJianTree) => void;
