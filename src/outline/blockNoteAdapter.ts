import type { Block, PartialBlock } from "@blocknote/core";
import {
  getNodeStyle,
  type NodeVisualStyle,
  type ZhiJianNode,
  type ZhiJianNodeType,
  type ZhiJianTree,
} from "../core/tree";

export function treeToBlockNote(tree: ZhiJianTree): PartialBlock[] {
  const visit = (id: string): PartialBlock => {
    const node = tree.nodes[id];
    return {
      id: node.id,
      type: toBlockNoteType(node.type),
      props: toBlockNoteProps(node),
      content: toBlockNoteContent(node),
      children: node.children.map(visit),
    } as PartialBlock;
  };

  return [visit(tree.rootId)];
}

export function blockNoteToTree(blocks: Block[], previousTree?: ZhiJianTree): ZhiJianTree | null {
  const first = blocks[0];
  if (!first) {
    return null;
  }
  const nodes: ZhiJianTree["nodes"] = {};

  const visit = (block: Block, parentId: string | null) => {
    const type = fromBlockNoteType(block.type);
    const previous = previousTree?.nodes[block.id];
    const children = block.children.map((child) => child.id);
    const blockProps = block.props as Record<string, unknown>;
    nodes[block.id] = {
      id: block.id,
      parentId,
      children,
      content: contentFromBlock(type, block),
      description: previous?.description,
      type,
      props: {
        ...previous?.props,
        checked: typeof blockProps.checked === "boolean" ? blockProps.checked : previous?.props?.checked,
        style: {
          ...getNodeStyle(previous?.props?.style),
          ...extractStyleFromBlock(block),
        },
      },
      meta: previous?.meta ?? {
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    block.children.forEach((child) => visit(child, block.id));
  };

  visit(first, null);
  return { rootId: first.id, nodes };
}

function toBlockNoteType(type: ZhiJianNodeType) {
  if (type === "heading") {
    return "heading";
  }
  if (type === "todo") {
    return "checkListItem";
  }
  if (type === "table") {
    return "table";
  }
  if (type === "image") {
    return "image";
  }
  return "paragraph";
}

function fromBlockNoteType(type: string): ZhiJianNodeType {
  if (type === "heading") {
    return "heading";
  }
  if (type === "checkListItem") {
    return "todo";
  }
  if (type === "table") {
    return "table";
  }
  if (type === "image") {
    return "image";
  }
  return "text";
}

function toBlockNoteProps(node: ZhiJianNode) {
  const style = getNodeStyle(node.props?.style);
  if (node.type === "heading") {
    return { level: 1 };
  }
  if (node.type === "todo") {
    return { checked: node.props?.checked ?? false };
  }
  if (node.type === "image") {
    return { url: style.imageUrl ?? node.content, name: node.description ?? "图片" };
  }
  return {};
}

function toBlockNoteContent(node: ZhiJianNode): PartialBlock["content"] {
  const style = getNodeStyle(node.props?.style);
  if (node.type === "table") {
    return {
      type: "tableContent",
      rows: [
        { cells: ["", ""] },
        { cells: ["", ""] },
      ],
    } as PartialBlock["content"];
  }
  if (node.type === "image") {
    return undefined;
  }
  const styledText = {
    type: "text",
    text: node.content,
    styles: {
      bold: style.fontWeight === "700",
      italic: style.fontStyle === "italic",
      underline: hasTextDecoration(style, "underline"),
      strike: hasTextDecoration(style, "line-through"),
      textColor: style.color,
      backgroundColor: style.backgroundColor,
    },
  };
  if (style.linkUrl) {
    return [
      {
        type: "link",
        href: style.linkUrl,
        content: [styledText],
      },
    ] as PartialBlock["content"];
  }
  if (style.color || style.backgroundColor || style.fontWeight || style.fontStyle || style.textDecoration) {
    return [styledText] as PartialBlock["content"];
  }
  return node.content;
}

function contentFromBlock(type: ZhiJianNodeType, block: Block) {
  if (type === "table") {
    return "";
  }
  if (type === "image") {
    const props = block.props as Record<string, unknown>;
    return typeof props.url === "string" ? props.url : "";
  }
  return contentToText(block.content);
}

function contentToText(content: Block["content"]) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if ("text" in item && typeof item.text === "string") {
        return item.text;
      }
      if ("type" in item && item.type === "link" && "content" in item && Array.isArray(item.content)) {
        return item.content
          .map((child) => ("text" in child && typeof child.text === "string" ? child.text : ""))
          .join("");
      }
      return "";
    })
    .join("");
}

function extractStyleFromBlock(block: Block): NodeVisualStyle {
  const blockProps = block.props as Record<string, unknown>;
  const style: NodeVisualStyle = {};

  const contentStyles = firstInlineStyle(block.content);
  if (contentStyles.__found) {
    style.fontWeight = undefined;
    style.fontStyle = undefined;
    style.textDecoration = undefined;
    style.textDecorationLine = undefined;
    style.color = undefined;
    style.backgroundColor = undefined;
    style.linkUrl = undefined;
  }

  if (contentStyles.bold) {
    style.fontWeight = "700";
  }
  if (contentStyles.italic) {
    style.fontStyle = "italic";
  }

  const decorations = new Set<string>();
  if (contentStyles.underline) {
    decorations.add("underline");
  }
  if (contentStyles.strike) {
    decorations.add("line-through");
  }
  if (contentStyles.underline !== undefined || contentStyles.strike !== undefined) {
    style.textDecoration = Array.from(decorations).join(" ") || undefined;
    style.textDecorationLine = style.textDecoration;
  }

  if (typeof contentStyles.textColor === "string" && contentStyles.textColor !== "default") {
    style.color = contentStyles.textColor;
  }
  if (
    typeof contentStyles.backgroundColor === "string" &&
    contentStyles.backgroundColor !== "default"
  ) {
    style.backgroundColor = contentStyles.backgroundColor;
  }
  if (contentStyles.linkUrl) {
    style.linkUrl = contentStyles.linkUrl;
  }

  if (typeof blockProps.textColor === "string" && blockProps.textColor !== "default") {
    style.color = blockProps.textColor;
  }
  if (typeof blockProps.backgroundColor === "string" && blockProps.backgroundColor !== "default") {
    style.backgroundColor = blockProps.backgroundColor;
  }

  return style;
}

function firstInlineStyle(content: Block["content"]) {
  const result: Record<string, unknown> & { linkUrl?: string; __found?: boolean } = {};
  if (!Array.isArray(content)) {
    return result;
  }
  for (const item of content) {
    if (typeof item === "string") {
      continue;
    }
    if ("type" in item && item.type === "link") {
      result.linkUrl = item.href;
      result.__found = true;
      const first = Array.isArray(item.content) ? item.content[0] : undefined;
      if (first && "styles" in first) {
        return { ...first.styles, linkUrl: item.href, __found: true };
      }
      return result;
    }
    if ("styles" in item) {
      return { ...(item.styles as Record<string, unknown>), __found: true };
    }
  }
  return result;
}

function hasTextDecoration(style: NodeVisualStyle, value: "underline" | "line-through") {
  return Boolean(
    style.textDecoration?.split(" ").includes(value) ||
      style.textDecorationLine?.split(" ").includes(value),
  );
}
