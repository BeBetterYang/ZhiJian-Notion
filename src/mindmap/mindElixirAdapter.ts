import type { MindElixirData, NodeObj } from "mind-elixir";
import MindElixir from "mind-elixir";
import {
  firstMarks,
  getNodeStyle,
  plainTextContent,
  richTextToPlainText,
  type ZhiJianNode,
  type ZhiJianNodeType,
  type ZhiJianTree,
} from "../core/tree";

interface MindMetadata {
  type?: ZhiJianNodeType;
  props?: ZhiJianNode["props"];
}

export function treeToMindElixir(tree: ZhiJianTree): MindElixirData {
  const visit = (id: string): NodeObj<MindMetadata> => {
    const node = tree.nodes[id];
    const style = getNodeStyle(node.props?.style);
    const marks = firstMarks(node.content);
    return {
      id: node.id,
      topic: richTextToPlainText(node.content) || node.type,
      note: node.description ? richTextToPlainText(node.description) : undefined,
      expanded: !node.props?.collapsed,
      style: {
        fontSize: style.fontSize,
        color: marks?.textColor ?? style.color,
        background: marks?.backgroundColor ?? style.backgroundColor,
        fontWeight: marks?.bold ? "700" : style.fontWeight,
        fontStyle: marks?.italic ? "italic" : style.fontStyle,
        textDecoration: marksToTextDecoration(marks) ?? style.textDecorationLine ?? style.textDecoration,
      } as NodeObj["style"] & { fontStyle?: string },
      image: style.imageUrl
        ? {
            url: style.imageUrl,
            width: 180,
            height: 110,
            fit: "contain",
          }
        : undefined,
      tags: node.type === "todo" ? [node.props?.checked ? "done" : "todo"] : undefined,
      metadata: {
        type: node.type,
        props: node.props,
      },
      children: node.children.map(visit),
    };
  };

  return {
    nodeData: visit(tree.rootId),
    direction: MindElixir.SIDE,
  };
}

export function mindElixirToTree(data: MindElixirData): ZhiJianTree {
  const nodes: ZhiJianTree["nodes"] = {};

  const visit = (obj: NodeObj<MindMetadata>, parentId: string | null) => {
    const children = obj.children?.map((child) => child.id) ?? [];
    const type = obj.metadata?.type ?? "text";
    nodes[obj.id] = {
      id: obj.id,
      parentId,
      children,
      content: type === "table" ? plainTextContent("") : plainTextContent(obj.topic),
      description: obj.note ? plainTextContent(obj.note) : undefined,
      type,
      props: {
        ...obj.metadata?.props,
        collapsed: obj.expanded === false,
      },
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    obj.children?.forEach((child) => visit(child as NodeObj<MindMetadata>, obj.id));
  };

  visit(data.nodeData as NodeObj<MindMetadata>, null);
  return {
    rootId: data.nodeData.id,
    nodes,
  };
}

function marksToTextDecoration(marks: ReturnType<typeof firstMarks>) {
  const values = [];
  if (marks?.underline) {
    values.push("underline");
  }
  if (marks?.strike) {
    values.push("line-through");
  }
  return values.length ? values.join(" ") : undefined;
}
