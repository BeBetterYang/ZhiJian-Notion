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

export interface ZhiJianTree {
  rootId: string;
  nodes: Record<string, ZhiJianNode>;
}

export type TreeListener = (tree: ZhiJianTree) => void;
