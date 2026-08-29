import type {
  RichTextContent,
  RichTextMarks,
  RichTextSpan,
  ZhiJianNode,
  ZhiJianNodeBlock,
  ZhiJianTableCell,
  ZhiJianTableData,
  ZhiJianTree,
} from "../tree";
import { normalizeRichText, richTextToPlainText } from "../tree";
import { nowMeta } from "../tree/utils";

/**
 * The outline markdown the app reads and writes, modelled on the mubu export
 * the user handed us as the template (思维导图大纲模板.md).
 *
 * The shape that matters is the text column: a node's depth is decided by the
 * column its text starts at, not by how many list markers precede it. Depth 1
 * sits at column 0 with no marker; every deeper node is `- ` at column
 * `2 * (depth - 1)`. Anything else found at a node's own text column — `>`,
 * `![]()`, `|` — is that node's attachment rather than a node of its own.
 */

const BULLET_LINE = /^(\s*)[-*+](\s+)(.*)$/;
const HEADING_LINE = /^(\s*)(#{1,3})\s+(.*)$/;
const HEADING_PREFIX = /^(#{1,3})\s+(.*)$/;
const QUOTE_LINE = /^(\s*)>\s?(.*)$/;
const IMAGE_LINE = /^(\s*)!\[([^\]]*)\]\((\S*)\)\s*$/;
const IMAGE_ONLY = /^!\[([^\]]*)\]\((\S*)\)$/;
const TABLE_LINE = /^(\s*)\|(.*)\|\s*$/;
const TODO_PREFIX = /^\[([ xX])\]\s+(.*)$/;
const SEPARATOR_CELL = /^:?-{3,}:?$/;
const LINK = /^\[([^\]]+)\]\((\S*)\)/;
const ASSET_URL = /^asset:(.+)$/;

const DELIMITERS: { token: string; mark: "bold" | "italic" | "strike" }[] = [
  { token: "**", mark: "bold" },
  { token: "~~", mark: "strike" },
  { token: "*", mark: "italic" },
];

const DEFAULT_TITLE = "未命名";

export function markdownFileName(tree: ZhiJianTree) {
  const root = tree.nodes[tree.rootId];
  const title = root ? richTextToPlainText(root.content).trim() : "";
  return `${sanitizeFileName(title || DEFAULT_TITLE)}.md`;
}

/** 导入时文件名顶替标题：没有 `# ` 那一行的 Markdown 只能靠它命名。 */
export function markdownImportTitle(fileName: string) {
  return fileName.replace(/\.(md|markdown|txt)$/i, "").trim();
}

export function treeToMarkdown(tree: ZhiJianTree): string {
  const root = tree.nodes[tree.rootId];
  if (!root) {
    return "";
  }
  const lines = [`# ${inlineToMarkdown(root.content)}`];
  root.children.forEach((childId) => {
    lines.push("", ...nodeToLines(tree, childId, 1));
  });
  return `${lines.join("\n")}\n`;
}

export function markdownToTree(
  markdown: string,
  options: { createId?: () => string; fallbackTitle?: string } = {},
): ZhiJianTree {
  const createId = options.createId ?? defaultCreateId;
  const lines = markdown.split(/\r?\n/);
  const nodes: Record<string, ZhiJianNode> = {};

  const addNode = (
    parentId: string,
    fields: Partial<ZhiJianNode> & Pick<ZhiJianNode, "content" | "type">,
  ) => {
    const id = createId();
    nodes[id] = { id, parentId, children: [], meta: nowMeta(), ...fields };
    nodes[parentId]?.children.push(id);
    return id;
  };

  let index = 0;
  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }
  const titleMatch = index < lines.length ? HEADING_LINE.exec(lines[index]) : null;
  const rootId = createId();
  nodes[rootId] = {
    id: rootId,
    parentId: null,
    children: [],
    content: markdownToInline(titleMatch?.[3] ?? options.fallbackTitle ?? DEFAULT_TITLE),
    type: "heading",
    props: { headingLevel: 1 },
    meta: nowMeta(),
  };
  if (titleMatch) {
    index += 1;
  }

  // Text column of every node still open, outermost first. The root sits below
  // column 0 so that a depth-1 line (column 0) resolves to it as its parent.
  const stack: { nodeId: string; textColumn: number }[] = [{ nodeId: rootId, textColumn: -2 }];
  let openTable: { nodeId: string; column: number } | null = null;

  /** The node an attachment at `column` hangs off, closing anything deeper. */
  const ownerAt = (column: number) => {
    while (stack.length > 1 && stack[stack.length - 1].textColumn > column) {
      stack.pop();
    }
    return stack[stack.length - 1].nodeId;
  };
  const pushNode = (nodeId: string, textColumn: number) => {
    stack.push({ nodeId, textColumn });
  };
  /** The node a line at `textColumn` hangs off, closing its siblings first. */
  const parentAt = (textColumn: number) => {
    while (stack.length > 1 && stack[stack.length - 1].textColumn >= textColumn) {
      stack.pop();
    }
    return stack[stack.length - 1].nodeId;
  };
  const addAttachment = (column: number, block: ZhiJianNodeBlock) => {
    const owner = nodes[ownerAt(column)];
    if (!owner || owner.type === "table") {
      // Table nodes keep their cells in props and carry no attachment blocks.
      return;
    }
    owner.blocks = [...(owner.blocks ?? []), block];
  };

  /**
   * Opens a quote and hands back the seam a following `>` line extends.
   *
   * `>` marks a *line* in markdown while a quote is one block here, so a run of
   * them is one quote of several lines rather than several quotes — which is also
   * how {@link nodeToLines} writes a quote back out.
   */
  const addQuote = (column: number, content: RichTextContent) => {
    const owner = nodes[ownerAt(column)];
    if (!owner || owner.type === "table") {
      return null;
    }
    if (!owner.description) {
      owner.description = content;
      return { content, extend: (next: RichTextContent) => void (owner.description = next) };
    }
    const block: ZhiJianNodeBlock = { id: createId(), type: "quote", content };
    owner.blocks = [...(owner.blocks ?? []), block];
    return { content, extend: (next: RichTextContent) => void (block.content = next) };
  };
  let openQuote: { content: RichTextContent; extend: (next: RichTextContent) => void } | null =
    null;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const quoteMatch = QUOTE_LINE.exec(line);
    if (!quoteMatch) {
      // Only an unbroken run of `>` lines belongs to one quote; a blank line, a
      // node or a picture in between starts a new one.
      openQuote = null;
    }
    if (!line.trim()) {
      openTable = null;
      continue;
    }

    const tableMatch = TABLE_LINE.exec(line);
    if (tableMatch) {
      const column = tableMatch[1].length;
      const cells = splitTableRow(tableMatch[2]);
      if (!openTable || openTable.column !== column) {
        const nodeId = addNode(ownerAt(column), {
          content: { text: "" },
          type: "table",
          props: { table: { rows: [] } },
        });
        pushNode(nodeId, column + 2);
        openTable = { nodeId, column };
      }
      const table = nodes[openTable.nodeId].props?.table;
      if (!table) continue;
      if (cells.length && cells.every((cell) => SEPARATOR_CELL.test(cell))) {
        table.headerRows = 1;
        continue;
      }
      table.rows.push(cells.map((cell) => ({ content: markdownToInline(cell) })));
      continue;
    }
    openTable = null;

    const imageMatch = IMAGE_LINE.exec(line);
    if (imageMatch) {
      addAttachment(imageMatch[1].length, {
        id: createId(),
        type: "image",
        image: markdownToImage(imageMatch[2], imageMatch[3]),
      });
      continue;
    }

    if (quoteMatch) {
      const content = markdownToInline(quoteMatch[2]);
      if (openQuote) {
        const joined = joinRichTextLines(openQuote.content, content);
        openQuote.extend(joined);
        openQuote.content = joined;
      } else {
        openQuote = addQuote(quoteMatch[1].length, content);
      }
      continue;
    }

    const bulletMatch = BULLET_LINE.exec(line);
    const headingMatch = bulletMatch ? null : HEADING_LINE.exec(line);
    const textColumn = bulletMatch
      ? bulletMatch[1].length + 1 + bulletMatch[2].length
      : (headingMatch?.[1].length ?? line.length - line.trimStart().length);
    const rawText = bulletMatch
      ? bulletMatch[3]
      : headingMatch
        ? headingMatch[3]
        : line.trimStart();
    const headingPrefix = bulletMatch ? HEADING_PREFIX.exec(rawText) : null;
    const todoMatch = TODO_PREFIX.exec(headingPrefix?.[2] ?? rawText);
    const text = todoMatch?.[2] ?? headingPrefix?.[2] ?? rawText;
    const headingLevel = (headingMatch?.[2] ?? headingPrefix?.[1])?.length as
      | 1
      | 2
      | 3
      | undefined;
    const imageOnly = IMAGE_ONLY.exec(text);

    const nodeId = addNode(parentAt(textColumn), {
      content: imageOnly ? { text: "" } : markdownToInline(text),
      type: todoMatch ? "todo" : headingLevel ? "heading" : "text",
      blocks: imageOnly
        ? [{ id: createId(), type: "image", image: markdownToImage(imageOnly[1], imageOnly[2]) }]
        : undefined,
      props: {
        ...(todoMatch ? { checked: todoMatch[1].toLowerCase() === "x" } : undefined),
        ...(!todoMatch && headingLevel ? { headingLevel } : undefined),
      },
    });
    pushNode(nodeId, textColumn);
  }

  return { rootId, nodes };
}

function nodeToLines(tree: ZhiJianTree, nodeId: string, depth: number): string[] {
  const node = tree.nodes[nodeId];
  if (!node) {
    return [];
  }
  const textColumn = " ".repeat(2 * (depth - 1));
  const parentColumn = " ".repeat(Math.max(0, 2 * (depth - 2)));
  const lines: string[] = [];

  if (node.type === "table") {
    lines.push(...tableToLines(node.props?.table, parentColumn));
  } else {
    const marker = depth === 1 ? "" : `${parentColumn}- `;
    lines.push(`${marker}${nodePrefix(node)}${inlineToMarkdown(node.content)}`);
  }
  if (node.description?.text) {
    lines.push(...quoteToLines(node.description, textColumn));
  }
  node.blocks?.forEach((block) => {
    lines.push(
      ...(block.type === "quote"
        ? quoteToLines(block.content, textColumn)
        : [`${textColumn}![${block.image.name || "image"}](${imageToMarkdownUrl(block.image)})`]),
    );
  });
  node.children.forEach((childId) => {
    lines.push(...nodeToLines(tree, childId, depth + 1));
  });
  return lines;
}

/**
 * One `> ` line per line of the quote. `>` is a line marker in markdown, so a quote
 * holding two lines has to be written as two of them — and is read back as one
 * quote again, because {@link markdownToTree} joins an unbroken run. Splitting the
 * text before the marks are spelled out keeps a bold run that crosses a line break
 * from becoming an unclosed `**`.
 */
function quoteToLines(content: RichTextContent, indent: string) {
  const rich = normalizeRichText(content);
  const spans = rich.spans?.length ? rich.spans : [{ text: rich.text, marks: rich.marks }];
  const markdownLines = [""];
  spans.forEach((span) => {
    span.text.split("\n").forEach((piece, index) => {
      if (index > 0) {
        markdownLines.push("");
      }
      markdownLines[markdownLines.length - 1] += spanToMarkdown({ text: piece, marks: span.marks });
    });
  });
  return markdownLines.map((line) => `${indent}> ${line}`);
}

/** Two quote lines as one quote: the break between them is a break in its text. */
function joinRichTextLines(first: RichTextContent, second: RichTextContent): RichTextContent {
  const spans = [
    ...(first.spans ?? [{ text: first.text, marks: first.marks }]),
    { text: "\n" },
    ...(second.spans ?? [{ text: second.text, marks: second.marks }]),
  ].filter((span) => span.text.length > 0);
  const text = spans.map((span) => span.text).join("");
  return spans.some((span) => span.marks) ? { text, spans } : { text };
}

function nodePrefix(node: ZhiJianNode) {
  if (node.type === "todo") {
    return node.props?.checked ? "[x] " : "[ ] ";
  }
  if (node.type === "heading") {
    return `${"#".repeat(node.props?.headingLevel ?? 1)} `;
  }
  return "";
}

function tableToLines(table: ZhiJianTableData | undefined, indent: string) {
  const rows = table?.rows ?? [];
  if (!rows.length) {
    return [];
  }
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const rowToLine = (cells: string[]) =>
    `${indent}|${Array.from({ length: columns }, (_, column) => ` ${cells[column] ?? ""} `).join("|")}|`;
  const cellText = (cell: ZhiJianTableCell | undefined) =>
    cell ? inlineToMarkdown(cell.content).replace(/\|/g, "\\|") : "";
  return [
    rowToLine(rows[0].map(cellText)),
    rowToLine(Array.from({ length: columns }, () => "---")),
    ...rows.slice(1).map((row) => rowToLine(row.map(cellText))),
  ];
}

function splitTableRow(raw: string) {
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "\\" && raw[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (raw[index] === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += raw[index];
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function imageToMarkdownUrl(image: { url?: string; assetId?: string }) {
  return image.assetId ? `asset:${image.assetId}` : (image.url ?? "");
}

function markdownToImage(name: string, url: string) {
  const asset = ASSET_URL.exec(url);
  return asset ? { assetId: asset[1], name } : { url, name };
}

/**
 * Inline marks markdown can carry. Underline and the two colours have no
 * markdown spelling — the template drops them too (下划线 and 颜色测试 arrive as
 * plain text) — so they survive a save but not a round trip through a file.
 */
function inlineToMarkdown(content: RichTextContent | string): string {
  const rich = normalizeRichText(content);
  const spans = rich.spans?.length ? rich.spans : [{ text: rich.text, marks: rich.marks }];
  return spans.map(spanToMarkdown).join("");
}

function spanToMarkdown(span: RichTextSpan) {
  let text = span.text;
  if (!text || !span.marks) {
    return text;
  }
  if (span.marks.bold) text = `**${text}**`;
  if (span.marks.italic) text = `*${text}*`;
  if (span.marks.strike) text = `~~${text}~~`;
  if (span.marks.linkUrl) text = `[${text}](${span.marks.linkUrl})`;
  return text;
}

function markdownToInline(text: string): RichTextContent {
  const spans = mergeSpans(parseInline(text, undefined));
  if (!spans.some((span) => span.marks)) {
    return { text: spans.map((span) => span.text).join("") };
  }
  return { text: spans.map((span) => span.text).join(""), spans };
}

function parseInline(text: string, marks: RichTextMarks | undefined): RichTextSpan[] {
  const spans: RichTextSpan[] = [];
  let plain = "";
  const flush = () => {
    if (plain) {
      spans.push(marks ? { text: plain, marks } : { text: plain });
      plain = "";
    }
  };
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const link = LINK.exec(rest);
    if (link) {
      flush();
      spans.push(...parseInline(link[1], { ...marks, linkUrl: link[2] }));
      index += link[0].length;
      continue;
    }
    const delimiter = DELIMITERS.find(
      ({ token }) => rest.startsWith(token) && rest.indexOf(token, token.length) > 0,
    );
    if (delimiter) {
      const end = rest.indexOf(delimiter.token, delimiter.token.length);
      flush();
      spans.push(
        ...parseInline(rest.slice(delimiter.token.length, end), {
          ...marks,
          [delimiter.mark]: true,
        }),
      );
      index += end + delimiter.token.length;
      continue;
    }
    plain += text[index];
    index += 1;
  }
  flush();
  return spans;
}

function mergeSpans(spans: RichTextSpan[]) {
  return spans.reduce<RichTextSpan[]>((result, span) => {
    if (!span.text) {
      return result;
    }
    const previous = result.at(-1);
    if (previous && JSON.stringify(previous.marks ?? null) === JSON.stringify(span.marks ?? null)) {
      previous.text += span.text;
      return result;
    }
    result.push({ ...span });
    return result;
  }, []);
}

function sanitizeFileName(title: string) {
  return title.replace(/[\\/:*?"<>|\r\n\t]+/g, "_").slice(0, 80);
}

function defaultCreateId() {
  return globalThis.crypto?.randomUUID?.() ?? `node_${Math.random().toString(36).slice(2)}`;
}
