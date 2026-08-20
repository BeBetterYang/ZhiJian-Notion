import type { RichTextContent } from "./richText";

export type ZhiJianNodeType = "text" | "heading" | "todo" | "table" | "image";

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
  name?: string;
  caption?: string;
  previewWidth?: number;
  showPreview?: boolean;
}

export interface ZhiJianNode {
  id: string;
  parentId: string | null;
  children: string[];
  content: RichTextContent;
  description?: RichTextContent;
  type: ZhiJianNodeType;
  props?: {
    checked?: boolean;
    collapsed?: boolean;
    headingLevel?: 1 | 2 | 3;
    table?: ZhiJianTableData;
    image?: ZhiJianImageData;
    style?: object;
  };
  meta?: {
    createdAt: number;
    updatedAt: number;
  };
}

export interface ZhiJianTree {
  rootId: string;
  nodes: Record<string, ZhiJianNode>;
}

export type TreeListener = (tree: ZhiJianTree) => void;
