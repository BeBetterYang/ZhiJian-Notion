import type { Block, PartialBlock } from "@blocknote/core";
import {
  getNodeStyle,
  normalizeRichText,
  richTextToPlainText,
  type NodeVisualStyle,
  type RichTextContent,
  type RichTextMarks,
  type RichTextSpan,
  type ZhiJianImageData,
  type ZhiJianNode,
  type ZhiJianNodeType,
  type ZhiJianTableData,
  type ZhiJianTree,
} from "../core/tree";
import { getCachedImageAssetUrl, getImageAssetId } from "../shared/imageAssetStore";

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

  const visit = (block: Block, parentId: string | null, extraChildren: Block[] = []) => {
    const type = fromBlockNoteType(block.type);
    const previous = previousTree?.nodes[block.id];
    const childBlocks = [...block.children, ...extraChildren];
    const children = childBlocks.map((child) => child.id);
    const blockProps = block.props as Record<string, unknown>;
    const blockContent = contentFromBlock(type, block);
    nodes[block.id] = {
      id: block.id,
      parentId,
      children,
      content: blockContent,
      description: previous?.description,
      type,
      props: {
        ...previous?.props,
        checked: typeof blockProps.checked === "boolean" ? blockProps.checked : previous?.props?.checked,
        headingLevel:
          type === "heading" ? normalizeHeadingLevel(blockProps.level) : previous?.props?.headingLevel,
        table: type === "table" ? tableDataFromBlock(block) : previous?.props?.table,
        image: type === "image" ? imageDataFromBlock(block) : previous?.props?.image,
        style: getNodeStyle(previous?.props?.style),
      },
      meta: previous?.meta ?? {
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
    childBlocks.forEach((child) => visit(child, block.id));
  };

  visit(first, null, blocks.slice(1));
  return { rootId: first.id, nodes };
}

function toBlockNoteType(type: ZhiJianNodeType) {
  if (type === "heading") {
    return "heading";
  }
  if (type === "todo") {
    return "checkListItem";
  }
  if (type === "quote") {
    return "quote";
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
  if (type === "quote") {
    return "quote";
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
    return { level: node.props?.headingLevel ?? 1, isToggleable: false };
  }
  if (node.type === "todo") {
    return { checked: node.props?.checked ?? false };
  }
  if (node.type === "image") {
    const image = node.props?.image;
    return {
      url:
        (image?.assetId ? getCachedImageAssetUrl(image.assetId) : image?.url) ??
        style.imageUrl ??
        richTextToPlainText(node.content),
      name: image?.name ?? "图片",
      caption:
        image?.caption ?? (node.description ? richTextToPlainText(node.description) : ""),
      previewWidth: image?.previewWidth,
      showPreview: image?.showPreview ?? true,
    };
  }
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
  if (node.type === "image") {
    return undefined;
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
    return [
      {
        type: "link",
        href: marks?.linkUrl ?? style.linkUrl,
        content: [styledText],
      },
    ] as PartialBlock["content"];
  }
  if (marks || style.color || style.backgroundColor || style.fontWeight || style.fontStyle || style.textDecoration) {
    return [styledText] as PartialBlock["content"];
  }
  return content.text;
}

function contentFromBlock(type: ZhiJianNodeType, block: Block): RichTextContent {
  if (type === "table") {
    return { text: "" };
  }
  if (type === "image") {
    return { text: "" };
  }
  return blockNoteContentToRichText(block.content);
}

function blockNoteContentToRichText(content: Block["content"]): RichTextContent {
  if (typeof content === "string") {
    return { text: content };
  }
  if (!Array.isArray(content)) {
    return { text: "" };
  }
  const inlineContent = content as Array<Record<string, unknown> | string>;
  const spans: RichTextSpan[] = inlineContent.flatMap((item) => {
      if (typeof item === "string") {
        return [{ text: item }];
      }
      if ("text" in item && typeof item.text === "string") {
        return [{ text: item.text, marks: blockNoteStylesToMarks(item.styles as Record<string, unknown> | undefined) }];
      }
      if ("type" in item && item.type === "link" && "content" in item && Array.isArray(item.content)) {
        return item.content
          .map((child: Record<string, unknown>) => ({
            text: typeof child.text === "string" ? child.text : "",
            marks: {
              ...blockNoteStylesToMarks(child.styles as Record<string, unknown> | undefined),
              linkUrl: typeof item.href === "string" ? item.href : undefined,
            },
          }))
          .filter((span) => span.text.length > 0);
      }
      return [];
    })
  const text = spans.map((span) => span.text).join("");
  return {
    text,
    spans: spans.some((span) => span.marks && Object.keys(span.marks).length > 0)
      ? spans
      : undefined,
  };
}

function richTextToBlockNoteInline(content: RichTextContent) {
  const richText = normalizeRichText(content);
  if (richText.spans?.length) {
    return richText.spans.map(spanToBlockNoteInline);
  }
  if (richText.marks) {
    return [spanToBlockNoteInline({ text: richText.text, marks: richText.marks })];
  }
  return richText.text;
}

function tableDataFromBlock(block: Block): ZhiJianTableData {
  const content = block.content as unknown as {
    columnWidths?: (number | undefined)[];
    headerRows?: number;
    headerCols?: number;
    rows?: Array<{ cells: Array<unknown> }>;
  };
  const rows = (content.rows ?? []).map((row) =>
    row.cells.map((cell) => {
      const tableCell = Array.isArray(cell)
        ? { content: cell, props: undefined }
        : (cell as { content?: unknown; props?: Record<string, unknown> });
      const props = tableCell.props;
      return {
        content: blockNoteContentToRichText(tableCell.content as Block["content"]),
        backgroundColor: stringProp(props, "backgroundColor"),
        textColor: stringProp(props, "textColor"),
        textAlignment: textAlignmentProp(props),
        colspan: numberProp(props, "colspan"),
        rowspan: numberProp(props, "rowspan"),
      };
    }),
  );
  return {
    rows: rows.length ? rows : createDefaultTableData().rows,
    columnWidths: content.columnWidths,
    headerRows: content.headerRows,
    headerCols: content.headerCols,
  };
}

function imageDataFromBlock(block: Block): ZhiJianImageData {
  const props = block.props as Record<string, unknown>;
  const url = stringProp(props, "url") ?? "";
  const assetId = getImageAssetId(url);
  return {
    url: assetId ? undefined : url,
    assetId,
    name: stringProp(props, "name"),
    caption: stringProp(props, "caption"),
    previewWidth: numberProp(props, "previewWidth") ?? 480,
    showPreview: typeof props.showPreview === "boolean" ? props.showPreview : true,
  };
}

function createDefaultTableData(): ZhiJianTableData {
  return {
    rows: Array.from({ length: 2 }, () =>
      Array.from({ length: 3 }, () => ({ content: { text: "" } })),
    ),
  };
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

function textAlignmentProp(
  props: Record<string, unknown> | undefined,
): "left" | "center" | "right" | "justify" | undefined {
  const value = props?.textAlignment;
  return value === "center" || value === "right" || value === "justify" ? value : undefined;
}

function hasTextDecoration(style: NodeVisualStyle, value: "underline" | "line-through") {
  return Boolean(
    style.textDecoration?.split(" ").includes(value) ||
      style.textDecorationLine?.split(" ").includes(value),
  );
}

function blockNoteStylesToMarks(styles: Record<string, unknown> | undefined): RichTextMarks | undefined {
  if (!styles) {
    return undefined;
  }
  const marks: RichTextMarks = {
    bold: styles.bold === true || undefined,
    italic: styles.italic === true || undefined,
    underline: styles.underline === true || undefined,
    strike: styles.strike === true || undefined,
    textColor:
      typeof styles.textColor === "string" && styles.textColor !== "default"
        ? styles.textColor
        : undefined,
    backgroundColor:
      typeof styles.backgroundColor === "string" && styles.backgroundColor !== "default"
        ? styles.backgroundColor
        : undefined,
  };
  return Object.values(marks).some(Boolean) ? marks : undefined;
}

function spanToBlockNoteInline(span: RichTextSpan) {
  const styledText = {
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
  if (span.marks?.linkUrl) {
    return {
      type: "link",
      href: span.marks.linkUrl,
      content: [styledText],
    };
  }
  return styledText;
}
