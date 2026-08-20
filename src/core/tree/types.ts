export type ZhiJianNodeType = "text" | "heading" | "todo" | "table" | "image";

export interface ZhiJianNode {
  id: string;
  parentId: string | null;
  children: string[];
  content: string;
  description?: string;
  type: ZhiJianNodeType;
  props?: {
    checked?: boolean;
    collapsed?: boolean;
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
