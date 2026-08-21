import type { Block, PartialBlock } from "@blocknote/core";
import {
  getNodeStyle,
  normalizeRichText,
  type NodeVisualStyle,
  type RichTextContent,
  type RichTextMarks,
  type RichTextSpan,
  type ZhiJianImageData,
  type ZhiJianNode,
  type ZhiJianNodeBlock,
  type ZhiJianNodeType,
  type ZhiJianTableData,
  type ZhiJianTree,
} from "../core/tree";
import { getCachedImageAssetUrl, getImageAssetId } from "../shared/imageAssetStore";

export function treeToBlockNote(tree: ZhiJianTree): PartialBlock[] {
  return [visitNode(tree, tree.rootId)];
}

function visitNode(tree: ZhiJianTree, id: string): PartialBlock {
  const node = tree.nodes[id];
  return {
    id: node.id,
    type: toBlockNoteType(node.type),
    props: toBlockNoteProps(node),
    content: toBlockNoteContent(node),
    children: [
      ...(node.description ? [descriptionToPartialBlock(node)] : []),
      ...(node.blocks ?? []).map(blockToPartialBlock),
      ...node.children.map((childId) => visitNode(tree, childId)),
    ],
  } as PartialBlock;
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
    const descriptionBlock = block.children.find(
      (child) => child.id === descriptionBlockId(block.id) && child.type === "quote",
    );
    const attachmentBlocks = block.children.filter(
      (child) => isAttachmentBlock(child) && child.id !== descriptionBlockId(block.id),
    );
    const childBlocks = block.children.filter(
      (child) => !isAttachmentBlock(child) || child.id === descriptionBlockId(block.id),
    ).filter((child) => child.id !== descriptionBlockId(block.id));
    nodes[block.id] = {
      id: block.id,
      parentId,
      children: childBlocks.map((child) => child.id),
      content: contentFromBlock(type, block),
      description: descriptionBlock
        ? blockNoteContentToRichText(descriptionBlock.content)
        : previous?.description,
      type,
      blocks: attachmentBlocks.length
        ? attachmentBlocks.map(blockToNodeBlock)
        : undefined,
      props: nodePropsFromBlock(type, block, previous),
      meta: previous?.meta ?? { createdAt: Date.now(), updatedAt: Date.now() },
    };
    childBlocks.forEach((child) => visit(child, block.id));
  };

  visit(first, null);
  return { rootId: first.id, nodes };
}

function nodePropsFromBlock(
  type: ZhiJianNodeType,
  block: Block,
  previous?: ZhiJianNode,
): ZhiJianNode["props"] {
  const blockProps = block.props as Record<string, unknown>;
  const previousProps = previous?.props;
  return {
    collapsed: previousProps?.collapsed,
    ...(type === "todo"
      ? {
          checked:
            typeof blockProps.checked === "boolean"
              ? blockProps.checked
              : previousProps?.checked ?? false,
        }
      : undefined),
    ...(type === "heading"
      ? { headingLevel: normalizeHeadingLevel(blockProps.level) }
      : undefined),
    ...(type === "table" ? { table: tableDataFromBlock(block) } : undefined),
    style: getNodeStyle(previousProps?.style),
  };
}

function toBlockNoteType(type: ZhiJianNodeType) {
  if (type === "heading") return "heading";
  if (type === "todo") return "checkListItem";
  if (type === "table") return "table";
  return "paragraph";
}

function fromBlockNoteType(type: string): ZhiJianNodeType {
  if (type === "heading") return "heading";
  if (type === "checkListItem") return "todo";
  if (type === "table") return "table";
  return "text";
}

function toBlockNoteProps(node: ZhiJianNode) {
  if (node.type === "heading") {
    return { level: node.props?.headingLevel ?? 1, isToggleable: false };
  }
  if (node.type === "todo") return { checked: node.props?.checked ?? false };
  return {};
}

function toBlockNoteContent(node: ZhiJianNode): PartialBlock["content"] {
  const style = getNodeStyle(node.props?.style);
  const content = normalizeRichText(node.content);
  if (node.type === "table") {
    const table = node.props?.table ?? createDefaultTableData();
    return {
      type: "tableContent",
      columnWidths: table.columnWidths,
      headerRows: table.headerRows,
      headerCols: table.headerCols,
      rows: table.rows.map((row) => ({
        cells: row.map((cell) => ({
          type: "tableCell",
          props: {
            backgroundColor: cell.backgroundColor ?? "default",
            textColor: cell.textColor ?? "default",
            textAlignment: cell.textAlignment ?? "left",
            colspan: cell.colspan,
            rowspan: cell.rowspan,
          },
          content: richTextToBlockNoteInline(cell.content),
        })),
      })),
    } as PartialBlock["content"];
  }
  if (content.spans?.length) {
    return content.spans.map(spanToBlockNoteInline) as PartialBlock["content"];
  }
  const marks = content.marks;
  const styledText = {
    type: "text",
    text: content.text,
    styles: {
      bold: marks?.bold ?? style.fontWeight === "700",
      italic: marks?.italic ?? style.fontStyle === "italic",
      underline: marks?.underline ?? hasTextDecoration(style, "underline"),
      strike: marks?.strike ?? hasTextDecoration(style, "line-through"),
      textColor: marks?.textColor ?? style.color,
      backgroundColor: marks?.backgroundColor ?? style.backgroundColor,
    },
  };
  if (marks?.linkUrl ?? style.linkUrl) {
    return [{ type: "link", href: marks?.linkUrl ?? style.linkUrl, content: [styledText] }] as PartialBlock["content"];
  }
  if (marks || style.color || style.backgroundColor || style.fontWeight || style.fontStyle || style.textDecoration) {
    return [styledText] as PartialBlock["content"];
  }
  return content.text;
}

function blockToPartialBlock(block: ZhiJianNodeBlock): PartialBlock {
  if (block.type === "quote") {
    return { id: block.id, type: "quote", content: richTextToBlockNoteInline(block.content) } as PartialBlock;
  }
  const image = block.image;
  return {
    id: block.id,
    type: "image",
    props: {
      url: image.assetId ? getCachedImageAssetUrl(image.assetId) : image.url ?? "",
      name: image.name ?? "图片",
      caption: image.caption ?? "",
      previewWidth: image.previewWidth,
      showPreview: image.showPreview ?? true,
    },
  } as PartialBlock;
}

function descriptionToPartialBlock(node: ZhiJianNode): PartialBlock {
  return {
    id: descriptionBlockId(node.id),
    type: "quote",
    content: richTextToBlockNoteInline(node.description ?? { text: "" }),
  } as PartialBlock;
}

function descriptionBlockId(nodeId: string) {
  return `${nodeId}::description`;
}

function blockToNodeBlock(block: Block): ZhiJianNodeBlock {
  if (block.type === "quote") {
    return { id: block.id, type: "quote", content: blockNoteContentToRichText(block.content) };
  }
  return { id: block.id, type: "image", image: imageDataFromBlock(block) };
}

function isAttachmentBlock(block: Block) {
  return block.type === "quote" || block.type === "image";
}

function contentFromBlock(type: ZhiJianNodeType, block: Block): RichTextContent {
  return type === "table" ? { text: "" } : blockNoteContentToRichText(block.content);
}

function blockNoteContentToRichText(content: Block["content"]): RichTextContent {
  if (typeof content === "string") return { text: content };
  if (!Array.isArray(content)) return { text: "" };
  const spans: RichTextSpan[] = (content as Array<Record<string, unknown> | string>).flatMap((item) => {
    if (typeof item === "string") return [{ text: item }];
    if ("text" in item && typeof item.text === "string") {
      return [{ text: item.text, marks: blockNoteStylesToMarks(item.styles as Record<string, unknown> | undefined) }];
    }
    if (item.type === "link" && Array.isArray(item.content)) {
      return item.content
        .map((child: Record<string, unknown>) => ({
          text: typeof child.text === "string" ? child.text : "",
          marks: { ...blockNoteStylesToMarks(child.styles as Record<string, unknown> | undefined), linkUrl: typeof item.href === "string" ? item.href : undefined },
        }))
        .filter((span) => span.text.length > 0);
    }
    return [];
  });
  const text = spans.map((span) => span.text).join("");
  return { text, spans: spans.some((span) => span.marks && Object.keys(span.marks).length > 0) ? spans : undefined };
}

function richTextToBlockNoteInline(content: RichTextContent) {
  const richText = normalizeRichText(content);
  if (richText.spans?.length) return richText.spans.map(spanToBlockNoteInline);
  if (richText.marks) return [spanToBlockNoteInline({ text: richText.text, marks: richText.marks })];
  return richText.text;
}

function tableDataFromBlock(block: Block): ZhiJianTableData {
  const content = block.content as unknown as { columnWidths?: (number | undefined)[]; headerRows?: number; headerCols?: number; rows?: Array<{ cells: Array<unknown> }> };
  const rows = (content.rows ?? []).map((row) => row.cells.map((cell) => {
    const tableCell = Array.isArray(cell) ? { content: cell, props: undefined } : cell as { content?: unknown; props?: Record<string, unknown> };
    const props = tableCell.props;
    return {
      content: blockNoteContentToRichText(tableCell.content as Block["content"]),
      backgroundColor: stringProp(props, "backgroundColor"),
      textColor: stringProp(props, "textColor"),
      textAlignment: textAlignmentProp(props),
      colspan: numberProp(props, "colspan"),
      rowspan: numberProp(props, "rowspan"),
    };
  }));
  return { rows: rows.length ? rows : createDefaultTableData().rows, columnWidths: content.columnWidths, headerRows: content.headerRows, headerCols: content.headerCols };
}

function imageDataFromBlock(block: Block): ZhiJianImageData {
  const props = block.props as Record<string, unknown>;
  const url = stringProp(props, "url") ?? "";
  const assetId = getImageAssetId(url);
  return { url: assetId ? undefined : url, assetId, name: stringProp(props, "name"), caption: stringProp(props, "caption"), previewWidth: numberProp(props, "previewWidth") ?? 480, showPreview: typeof props.showPreview === "boolean" ? props.showPreview : true };
}

function createDefaultTableData(): ZhiJianTableData {
  return { rows: Array.from({ length: 2 }, () => Array.from({ length: 3 }, () => ({ content: { text: "" } }))) };
}

function normalizeHeadingLevel(value: unknown): 1 | 2 | 3 {
  return value === 2 || value === 3 ? value : 1;
}

function stringProp(props: Record<string, unknown> | undefined, key: string) {
  const value = props?.[key];
  return typeof value === "string" && value !== "default" ? value : undefined;
}

function numberProp(props: Record<string, unknown> | undefined, key: string) {
  const value = props?.[key];
  return typeof value === "number" ? value : undefined;
}

function textAlignmentProp(props: Record<string, unknown> | undefined): "left" | "center" | "right" | "justify" | undefined {
  const value = props?.textAlignment;
  return value === "center" || value === "right" || value === "justify" ? value : undefined;
}

function hasTextDecoration(style: NodeVisualStyle, value: "underline" | "line-through") {
  return Boolean(style.textDecoration?.split(" ").includes(value) || style.textDecorationLine?.split(" ").includes(value));
}

function blockNoteStylesToMarks(styles: Record<string, unknown> | undefined): RichTextMarks | undefined {
  if (!styles) return undefined;
  const marks: RichTextMarks = {
    bold: styles.bold === true || undefined,
    italic: styles.italic === true || undefined,
    underline: styles.underline === true || undefined,
    strike: styles.strike === true || undefined,
    textColor: typeof styles.textColor === "string" && styles.textColor !== "default" ? styles.textColor : undefined,
    backgroundColor: typeof styles.backgroundColor === "string" && styles.backgroundColor !== "default" ? styles.backgroundColor : undefined,
  };
  return Object.values(marks).some(Boolean) ? marks : undefined;
}

function spanToBlockNoteInline(span: RichTextSpan) {
  return {
    type: "text",
    text: span.text,
    styles: {
      bold: span.marks?.bold,
      italic: span.marks?.italic,
      underline: span.marks?.underline,
      strike: span.marks?.strike,
      textColor: span.marks?.textColor,
      backgroundColor: span.marks?.backgroundColor,
    },
  };
}
