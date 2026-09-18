import mammoth from "mammoth";
import type { DocxExtractionOptions, DocxSourceDocument, DocxSourceSection } from "../types";
import { isDocxFile } from "./docxValidation";
import { DocxImportError } from "./docxErrors";

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DocxImportError("Word 解析已取消。");
}

function fileTitle(fileName: string) {
  return fileName.replace(/\.docx$/i, "").trim() || "未命名 Word 文档";
}

function normalizedText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function elementText(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (tag === "table") {
    return Array.from(element.querySelectorAll("tr"))
      .map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => normalizedText(cell.textContent ?? "")).filter(Boolean).join(" | "))
      .filter(Boolean)
      .join("\n");
  }
  if (tag === "ul" || tag === "ol") {
    return Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => `${tag === "ol" ? `${index + 1}. ` : "- "}${normalizedText(child.textContent ?? "")}`)
      .filter(Boolean)
      .join("\n");
  }
  return normalizedText(element.textContent ?? "");
}

function isHeading(element: Element) {
  return /^h[1-6]$/i.test(element.tagName);
}

function sectionText(section: Pick<DocxSourceSection, "title" | "text">) {
  return [section.title, section.text].filter(Boolean).join("\n");
}

function buildSections(html: string): DocxSourceSection[] {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild;
  if (!root) return [];

  const sections: DocxSourceSection[] = [];
  let current: { title?: string; level?: number; lines: string[] } | null = null;
  let sectionIndex = 0;
  const pushCurrent = () => {
    if (!current) return;
    const text = normalizedText(current.lines.join("\n"));
    if (!current.title && !text) return;
    const section: DocxSourceSection = {
      id: `section-${sectionIndex + 1}`,
      ...(current.title ? { title: current.title } : {}),
      ...(current.level ? { level: current.level } : {}),
      text,
      charCount: sectionText({ title: current.title, text }).length,
    };
    sections.push(section);
    sectionIndex += 1;
  };

  for (const element of Array.from(root.children)) {
    if (isHeading(element)) {
      pushCurrent();
      current = { title: normalizedText(element.textContent ?? ""), level: Number(element.tagName.slice(1)), lines: [] };
      continue;
    }
    const text = elementText(element);
    if (!text) continue;
    if (!current) current = { title: "前置内容", lines: [] };
    current.lines.push(text);
  }
  pushCurrent();
  return sections;
}

export async function extractDocx(file: File, options: DocxExtractionOptions = {}): Promise<DocxSourceDocument> {
  if (!isDocxFile(file)) {
    throw new DocxImportError("当前仅支持 .docx Word 文档。");
  }
  if (file.size > 20 * 1024 * 1024) throw new DocxImportError("Word 文档不能超过 20 MB。");
  assertNotAborted(options.signal);
  options.onProgress?.({ stage: "loading" });
  let result: Awaited<ReturnType<typeof mammoth.convertToHtml>>;
  try {
    result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { ignoreEmptyParagraphs: true });
  } catch (error) {
    throw new DocxImportError(error instanceof Error ? `无法读取 Word 文档：${error.message}` : "无法读取 Word 文档。");
  }
  assertNotAborted(options.signal);
  options.onProgress?.({ stage: "parsing" });
  const sections = buildSections(result.value);
  if (!sections.length || sections.every((section) => !section.text && !section.title)) {
    throw new DocxImportError("这个 Word 文档没有可读取的文字内容。");
  }
  options.onProgress?.({ stage: "normalizing" });
  const document: DocxSourceDocument = {
    type: "docx",
    fileName: file.name,
    title: fileTitle(file.name),
    sections,
    stats: {
      totalChars: sections.reduce((sum, section) => sum + section.charCount, 0),
      sectionCount: sections.length,
      titledSectionCount: sections.filter((section) => Boolean(section.title)).length,
      emptySectionCount: sections.filter((section) => !section.text).length,
    },
  };
  options.onProgress?.({ stage: "done" });
  return document;
}
