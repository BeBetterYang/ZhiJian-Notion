import type { DocxSourceChunk, DocxSourceDocument } from "../types";
import { DEFAULT_MAX_CHARS, DEFAULT_TARGET_CHARS } from "../pdf/pdfConstants";

export interface ChunkDocxOptions {
  targetChars?: number;
  maxChars?: number;
}

function chunkText(document: DocxSourceDocument, indexes: number[], source: DocxSourceChunk["source"], index: number): DocxSourceChunk | null {
  const sections = indexes.map((sectionIndex) => document.sections[sectionIndex]).filter(Boolean);
  if (!sections.length) return null;
  const text = sections.map((section) => [section.title ? `## ${section.title}` : "", section.text].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
  if (!text) return null;
  const first = sections[0];
  const last = sections.at(-1) ?? first;
  return {
    id: `docx-${index}`,
    ...(sections.length === 1 && first.title ? { title: first.title } : {}),
    startSection: document.sections.indexOf(first) + 1,
    endSection: document.sections.indexOf(last) + 1,
    text,
    charCount: text.length,
    source,
  };
}

export function chunkDocx(document: DocxSourceDocument, options: ChunkDocxOptions = {}) {
  const targetChars = Math.max(1, options.targetChars ?? DEFAULT_TARGET_CHARS);
  const maxChars = Math.max(targetChars, options.maxChars ?? DEFAULT_MAX_CHARS);
  const chunks: DocxSourceChunk[] = [];
  let indexes: number[] = [];
  let chars = 0;
  let chunkIndex = 1;
  for (let index = 0; index < document.sections.length; index += 1) {
    const section = document.sections[index];
    const sectionChars = section.charCount;
    if (indexes.length && (chars >= targetChars || chars + sectionChars > maxChars)) {
      const chunk = chunkText(document, indexes, indexes.some((item) => document.sections[item].title) ? "headings" : "sections", chunkIndex);
      if (chunk) chunks.push(chunk);
      chunkIndex += 1;
      indexes = [];
      chars = 0;
    }
    indexes.push(index);
    chars += sectionChars;
    if (chars >= maxChars && indexes.length === 1) {
      const chunk = chunkText(document, indexes, section.title ? "headings" : "sections", chunkIndex);
      if (chunk) chunks.push(chunk);
      chunkIndex += 1;
      indexes = [];
      chars = 0;
    }
  }
  const last = chunkText(document, indexes, indexes.some((item) => document.sections[item].title) ? "headings" : "sections", chunkIndex);
  if (last) chunks.push(last);
  return chunks;
}
