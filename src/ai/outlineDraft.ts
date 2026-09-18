import type {
  AIOutlineDraft,
  AIOutlineDraftNode,
  AIOutlineDraftSource,
  AIOutlineDraftSourcePages,
  AIOutlineDraftSourceSections,
} from "./types";

export const MAX_AI_DRAFT_NODES = 300;
export const MAX_AI_DRAFT_DEPTH = 8;
export const MAX_AI_DRAFT_TITLE_CHARS = 200;
export const MAX_AI_DRAFT_SUMMARY_CHARS = 1_000;

export class AIOutlineDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIOutlineDraftValidationError";
  }
}

export function validateAIOutlineDraft(value: unknown): AIOutlineDraft {
  const root = record(value, "AI 大纲返回格式不正确。");
  if (root.type !== "ai-outline-draft" || root.version !== 1) {
    throw new AIOutlineDraftValidationError("AI 大纲版本不受支持。");
  }

  const source = record(root.source, "AI 大纲缺少来源信息。");
  const sourceFormat = source.format === undefined ? "pdf" : source.format;
  if (sourceFormat !== "pdf" && sourceFormat !== "docx") throw new AIOutlineDraftValidationError("AI 大纲来源格式不受支持。");
  const sourceData: AIOutlineDraftSource = {
    fileName: requiredText(source.fileName, "来源文件名不能为空。"),
    title: requiredText(source.title, "来源标题不能为空。"),
    ...(source.format === undefined ? {} : { format: sourceFormat }),
    ...(sourceFormat === "pdf"
      ? { pageCount: positiveInteger(source.pageCount, "PDF 页数不正确。") }
      : { sectionCount: positiveInteger(source.sectionCount, "Word 章节数不正确。") }),
  };
  const title = requiredText(root.title, "AI 大纲标题不能为空。");
  const ids = new Set<string>();
  let nodeCount = 0;
  const nodes = nodeList(root.nodes, "AI 大纲缺少节点列表。").map((node, index) => parseNode(
    node,
    `root.${index}`,
    0,
    sourceData,
    ids,
    () => {
      nodeCount += 1;
      if (nodeCount > MAX_AI_DRAFT_NODES) {
        throw new AIOutlineDraftValidationError(`AI 大纲最多支持 ${MAX_AI_DRAFT_NODES} 个节点。`);
      }
    },
  ));

  return {
    type: "ai-outline-draft",
    version: 1,
    title,
    source: sourceData,
    nodes,
  };
}

function parseNode(
  value: unknown,
  path: string,
  depth: number,
  source: AIOutlineDraftSource,
  ids: Set<string>,
  countNode: () => void,
): AIOutlineDraftNode {
  if (depth > MAX_AI_DRAFT_DEPTH) {
    throw new AIOutlineDraftValidationError(`AI 大纲层级不能超过 ${MAX_AI_DRAFT_DEPTH} 层。`);
  }
  const node = record(value, `${path} 节点格式不正确。`);
  countNode();
  const id = requiredText(node.id, `${path} 缺少节点 ID。`);
  if (ids.has(id)) throw new AIOutlineDraftValidationError(`AI 大纲存在重复节点 ID：${id}。`);
  ids.add(id);

  const title = boundedText(node.title, MAX_AI_DRAFT_TITLE_CHARS, `${path} 标题不正确。`);
  const summary = optionalBoundedText(node.summary, MAX_AI_DRAFT_SUMMARY_CHARS, `${path} 摘要不正确。`);
  const sourcePages = node.sourcePages === undefined ? undefined : parseSourcePages(node.sourcePages, source.pageCount ?? 0, path);
  const sourceSections = node.sourceSections === undefined ? undefined : parseSourceSections(node.sourceSections, source.sectionCount ?? 0, path);
  if (source.format === "docx" && sourcePages) throw new AIOutlineDraftValidationError(`${path} Word 大纲不能包含 PDF 页码。`);
  if (source.format !== "docx" && sourceSections) throw new AIOutlineDraftValidationError(`${path} PDF 大纲不能包含 Word 章节范围。`);
  const children = nodeList(node.children ?? [], `${path} 子节点格式不正确。`).map((child, index) => parseNode(
    child,
    `${path}.children.${index}`,
    depth + 1,
    source,
    ids,
    countNode,
  ));

  return {
    id,
    title,
    ...(summary ? { summary } : {}),
    ...(sourcePages ? { sourcePages } : {}),
    ...(sourceSections ? { sourceSections } : {}),
    children,
  };
}

function parseSourcePages(value: unknown, pageCount: number, path: string): AIOutlineDraftSourcePages {
  const pages = record(value, `${path} 来源页码格式不正确。`);
  const startPage = positiveInteger(pages.startPage, `${path} 起始页码不正确。`);
  const endPage = positiveInteger(pages.endPage, `${path} 结束页码不正确。`);
  if (startPage > endPage || endPage > pageCount) {
    throw new AIOutlineDraftValidationError(`${path} 来源页码超出 PDF 范围。`);
  }
  return { startPage, endPage };
}

function parseSourceSections(value: unknown, sectionCount: number, path: string): AIOutlineDraftSourceSections {
  const sections = record(value, `${path} 来源章节范围格式不正确。`);
  const startSection = positiveInteger(sections.startSection, `${path} 起始章节不正确。`);
  const endSection = positiveInteger(sections.endSection, `${path} 结束章节不正确。`);
  if (startSection > endSection || endSection > sectionCount) {
    throw new AIOutlineDraftValidationError(`${path} 来源章节范围超出 Word 文档范围。`);
  }
  return { startSection, endSection };
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AIOutlineDraftValidationError(message);
  }
  return value as Record<string, unknown>;
}

function nodeList(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new AIOutlineDraftValidationError(message);
  return value;
}

function requiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) throw new AIOutlineDraftValidationError(message);
  return value.trim();
}

function boundedText(value: unknown, maxChars: number, message: string) {
  const text = requiredText(value, message);
  if (text.length > maxChars) throw new AIOutlineDraftValidationError(`${message}长度不能超过 ${maxChars} 个字符。`);
  return text;
}

function optionalBoundedText(value: unknown, maxChars: number, message: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new AIOutlineDraftValidationError(message);
  const text = value.trim();
  if (text.length > maxChars) throw new AIOutlineDraftValidationError(`${message}长度不能超过 ${maxChars} 个字符。`);
  return text || undefined;
}

function positiveInteger(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AIOutlineDraftValidationError(message);
  }
  return value;
}
