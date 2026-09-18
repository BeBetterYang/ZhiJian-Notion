import type { PdfSourceChunk, PdfSourceDocument, PdfSourceOutlineNode } from "../types";
import {
  DEFAULT_MAX_CHARS,
  DEFAULT_TARGET_CHARS,
  MIN_PREFACE_CHARS,
} from "./pdfConstants";
import { pageTextLabel } from "./normalizePdfText";

export interface ChunkPdfOptions {
  targetChars?: number;
  maxChars?: number;
}

interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}

function flattenOutline(nodes: PdfSourceOutlineNode[], output: OutlineEntry[] = []) {
  for (const node of nodes) {
    output.push({ title: node.title, page: node.page, depth: node.depth });
    if (node.children?.length) flattenOutline(node.children, output);
  }
  return output;
}

export function isUsablePdfOutline(outline: PdfSourceOutlineNode[] | undefined | null, pageCount: number) {
  const pages = outline ? flattenOutline(outline).map((item) => item.page).filter((page) => page >= 1 && page <= pageCount) : [];
  const uniquePages = new Set(pages);
  if (pages.length < 2 || uniquePages.size < 2) return false;
  let inversions = 0;
  for (let index = 1; index < pages.length; index += 1) {
    if (pages[index] < pages[index - 1]) inversions += 1;
  }
  return inversions <= Math.max(1, Math.floor(pages.length * 0.2));
}

function pageRangeText(document: PdfSourceDocument, startPage: number, endPage: number) {
  return document.pages
    .filter((page) => page.page >= startPage && page.page <= endPage)
    .map((page) => pageTextLabel(page.page, page.text))
    .filter(Boolean)
    .join("\n\n");
}

function pageTextLength(document: PdfSourceDocument, pageNumber: number) {
  const page = document.pages.find((item) => item.page === pageNumber);
  return page ? pageTextLabel(page.page, page.text).length : 0;
}

function chunkPages(document: PdfSourceDocument, pageNumbers: number[], source: "outline" | "pages", title?: string, idPrefix: string = source) {
  const pages = pageNumbers
    .map((page) => document.pages.find((item) => item.page === page))
    .filter((page): page is PdfSourceDocument["pages"][number] => Boolean(page));
  if (!pages.length) return null;
  const text = pages.map((page) => pageTextLabel(page.page, page.text)).filter(Boolean).join("\n\n");
  return {
    id: `${idPrefix}-${pages[0].page}-${pages.at(-1)?.page ?? pages[0].page}`,
    ...(title ? { title } : {}),
    startPage: pages[0].page,
    endPage: pages.at(-1)?.page ?? pages[0].page,
    text,
    charCount: text.length,
    source,
  } satisfies PdfSourceChunk;
}

function outlineChunks(document: PdfSourceDocument, targetChars: number, maxChars: number) {
  const outline = document.outline ?? [];
  const entries = flattenOutline(outline)
    .filter((item) => item.page >= 1 && item.page <= document.pageCount)
    .sort((left, right) => left.page - right.page);
  const uniqueEntries = entries.filter((entry, index) => index === 0 || entry.page !== entries[index - 1].page);
  if (uniqueEntries.length < 2) return null;

  const chunks: PdfSourceChunk[] = [];
  const firstPage = uniqueEntries[0].page;
  const preface = firstPage > 1
    ? chunkPages(document, Array.from({ length: firstPage - 1 }, (_, index) => index + 1), "outline", "前置内容", "preface")
    : null;
  if (firstPage > 1) {
    if (preface && preface.charCount >= MIN_PREFACE_CHARS) chunks.push(preface);
  }

  uniqueEntries.forEach((entry, index) => {
    const endPage = uniqueEntries[index + 1]?.page ? uniqueEntries[index + 1].page - 1 : document.pageCount;
    const chapterStart = index === 0 && preface && preface.charCount < MIN_PREFACE_CHARS ? 1 : entry.page;
    const pages = Array.from({ length: Math.max(0, endPage - chapterStart + 1) }, (_, offset) => chapterStart + offset);
    const full = chunkPages(document, pages, "outline", entry.title, `outline-${index + 1}`);
    if (!full) return;
    if (full.charCount <= maxChars) {
      chunks.push(full);
      return;
    }
    let part = 1;
    let cursor: number[] = [];
    let cursorChars = 0;
    for (const page of pages) {
      const pageChars = pageTextLength(document, page);
      if (cursor.length && (cursorChars >= targetChars || cursorChars + pageChars > maxChars)) {
        const split = chunkPages(document, cursor, "outline", `${entry.title} · ${part}`, `outline-${index + 1}-${part}`);
        if (split) chunks.push(split);
        part += 1;
        cursor = [];
        cursorChars = 0;
      }
      cursor.push(page);
      cursorChars += pageChars;
    }
    const split = chunkPages(document, cursor, "outline", part > 1 ? `${entry.title} · ${part}` : entry.title, `outline-${index + 1}-${part}`);
    if (split) chunks.push(split);
  });
  return chunks;
}

function pageChunks(document: PdfSourceDocument, targetChars: number, maxChars: number) {
  const chunks: PdfSourceChunk[] = [];
  let pageNumbers: number[] = [];
  let chars = 0;
  let index = 1;
  for (const page of document.pages) {
    const pageChars = pageTextLabel(page.page, page.text).length;
    if (pageNumbers.length && (chars >= targetChars || chars + pageChars > maxChars)) {
      const chunk = chunkPages(document, pageNumbers, "pages", undefined, `pages-${index}`);
      if (chunk) chunks.push(chunk);
      index += 1;
      pageNumbers = [];
      chars = 0;
    }
    pageNumbers.push(page.page);
    chars += pageChars;
    if (chars >= maxChars && pageNumbers.length === 1) {
      const chunk = chunkPages(document, pageNumbers, "pages", undefined, `pages-${index}`);
      if (chunk) chunks.push(chunk);
      index += 1;
      pageNumbers = [];
      chars = 0;
    }
  }
  const last = chunkPages(document, pageNumbers, "pages", undefined, `pages-${index}`);
  if (last) chunks.push(last);
  return chunks;
}

export function chunkPdf(document: PdfSourceDocument, options: ChunkPdfOptions = {}) {
  const targetChars = Math.max(1, options.targetChars ?? DEFAULT_TARGET_CHARS);
  const maxChars = Math.max(targetChars, options.maxChars ?? DEFAULT_MAX_CHARS);
  if (isUsablePdfOutline(document.outline, document.pageCount)) {
    const chunks = outlineChunks(document, targetChars, maxChars);
    if (chunks?.length) return chunks;
  }
  return pageChunks(document, targetChars, maxChars);
}

export function outlinePageRanges(document: PdfSourceDocument) {
  const entries = flattenOutline(document.outline ?? [])
    .filter((item) => item.page >= 1 && item.page <= document.pageCount)
    .sort((left, right) => left.page - right.page);
  return entries
    .filter((entry, index) => index === 0 || entry.page !== entries[index - 1].page)
    .map((entry, index, unique) => ({
      title: entry.title,
      startPage: entry.page,
      endPage: unique[index + 1]?.page ? unique[index + 1].page - 1 : document.pageCount,
      text: pageRangeText(document, entry.page, unique[index + 1]?.page ? unique[index + 1].page - 1 : document.pageCount),
    }));
}
