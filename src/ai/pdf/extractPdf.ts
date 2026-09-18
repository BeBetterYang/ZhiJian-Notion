import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfSourceDocument, PdfSourcePage, PdfExtractionOptions } from "../types";
import { PdfImportError } from "../types";
import { normalizePdfOutline, type ResolvedPdfOutlineItem } from "./outlinePdf";
import {
  FAILED_PAGE_RATIO_LIMIT,
  MAX_PDF_PAGES,
  MIN_PAGE_TEXT_CHARS,
  MIN_TEXT_PAGE_RATIO,
  MIN_TOTAL_TEXT_CHARS,
} from "./pdfConstants";
import { normalizePdfText, reconstructPdfPageText, type PdfTextItemLike } from "./normalizePdfText";
import { validatePdfFile } from "./pdfValidation";

let workerConfigured = false;

function configurePdfWorker() {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  workerConfigured = true;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new PdfImportError("ABORTED", "PDF 解析已取消。");
}

function fileTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").trim() || "未命名 PDF";
}

function metadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isPasswordError(error: unknown) {
  return Boolean(error && typeof error === "object" && ("name" in error && error.name === "PasswordException"));
}

async function resolveOutlineItem(pdf: PDFDocumentProxy, item: ResolvedPdfOutlineItem & { dest?: unknown }) {
  try {
    let destination = item.dest;
    if (typeof destination === "string") destination = await pdf.getDestination(destination);
    if (!Array.isArray(destination) || !destination[0]) return { ...item, page: null };
    return { ...item, page: (await pdf.getPageIndex(destination[0])) + 1 };
  } catch (error) {
    console.warn("PDF outline item could not resolve its destination", error);
    return { ...item, page: null };
  }
}

async function resolveOutline(pdf: PDFDocumentProxy, items: Array<ResolvedPdfOutlineItem & { dest?: unknown }> | null | undefined): Promise<ResolvedPdfOutlineItem[]> {
  if (!items?.length) return [];
  const output: ResolvedPdfOutlineItem[] = [];
  for (const item of items) {
    const resolved = await resolveOutlineItem(pdf, item);
    output.push({
      ...resolved,
      items: await resolveOutline(pdf, item.items as Array<ResolvedPdfOutlineItem & { dest?: unknown }> | undefined),
    });
  }
  return output;
}

function outlineHasValue(outline: ReturnType<typeof normalizePdfOutline>) {
  return outline.length > 0;
}

async function yieldToBrowser() {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export function isLikelyScannedPdf(pages: PdfSourcePage[]) {
  const totalChars = pages.reduce((sum, page) => sum + page.charCount, 0);
  const textPageCount = pages.filter((page) => page.charCount >= MIN_PAGE_TEXT_CHARS).length;
  const ratio = pages.length ? textPageCount / pages.length : 0;
  return totalChars < MIN_TOTAL_TEXT_CHARS || ratio < MIN_TEXT_PAGE_RATIO;
}

function readPageText(content: { items: PdfTextItemLike[] }) {
  return reconstructPdfPageText(content.items);
}

export async function extractPdf(file: File, options: PdfExtractionOptions = {}): Promise<PdfSourceDocument> {
  const { onProgress, signal } = options;
  validatePdfFile(file);

  configurePdfWorker();
  assertNotAborted(signal);
  onProgress?.({ stage: "loading" });
  const data = await file.arrayBuffer();
  assertNotAborted(signal);
  let pdf: PDFDocumentProxy | null = null;
  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
  try {
    try {
      loadingTask = pdfjsLib.getDocument({ data });
      pdf = await loadingTask.promise;
    } catch (error) {
      if (isPasswordError(error)) {
        throw new PdfImportError("LOAD_FAILED", "当前暂不支持加密或密码保护的 PDF，请先解除保护后重新上传。", { cause: error });
      }
      throw new PdfImportError("LOAD_FAILED", "无法读取这个 PDF，文件可能已损坏或格式不完整。", { cause: error });
    }
    assertNotAborted(signal);
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new PdfImportError("TOO_MANY_PAGES", "当前版本最多支持 150 页 PDF，请拆分后重新上传。");
    }

    onProgress?.({ stage: "metadata" });
    let metadata: { info?: object } = {};
    try {
      metadata = await pdf.getMetadata();
    } catch (error) {
      console.warn("PDF metadata could not be read", error);
    }
    const info = (metadata.info ?? {}) as Record<string, unknown>;

    onProgress?.({ stage: "outline" });
    let outline: ReturnType<typeof normalizePdfOutline> | undefined;
    try {
      const rawOutline = await pdf.getOutline();
      const resolvedOutline = await resolveOutline(pdf, rawOutline as Array<ResolvedPdfOutlineItem & { dest?: unknown }> | null);
      const normalized = normalizePdfOutline(resolvedOutline, pdf.numPages);
      if (outlineHasValue(normalized)) outline = normalized;
    } catch (error) {
      console.warn("PDF outline could not be read", error);
    }

    const pages: PdfSourcePage[] = [];
    const failedPages: number[] = [];
    onProgress?.({ stage: "pages", current: 0, total: pdf.numPages });
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      assertNotAborted(signal);
      try {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = readPageText({ items: content.items.flatMap((item) => "str" in item ? [item] : []) });
        assertNotAborted(signal);
        pages.push({ page: pageNumber, text, charCount: text.length });
      } catch (error) {
        if (signal?.aborted || error instanceof PdfImportError && error.code === "ABORTED") {
          throw new PdfImportError("ABORTED", "PDF 解析已取消。", { cause: error });
        }
        console.warn(`PDF page ${pageNumber} could not be extracted`, error);
        failedPages.push(pageNumber);
        pages.push({ page: pageNumber, text: "", charCount: 0 });
      }
      onProgress?.({ stage: "pages", current: pageNumber, total: pdf.numPages });
      if (pageNumber % 5 === 0) await yieldToBrowser();
    }
    assertNotAborted(signal);
    if (failedPages.length / Math.max(1, pdf.numPages) > FAILED_PAGE_RATIO_LIMIT) {
      throw new PdfImportError("TEXT_EXTRACTION_FAILED", "PDF 文字提取失败，请确认文件内容完整后重试。");
    }

    onProgress?.({ stage: "normalizing" });
    const normalizedPages = pages.map((page) => {
      const text = normalizePdfText(page.text);
      return { ...page, text, charCount: text.length };
    });
    if (isLikelyScannedPdf(normalizedPages)) {
      throw new PdfImportError("SCANNED_PDF", "这个 PDF 主要由扫描图片组成，目前暂不支持扫描版 PDF。");
    }
    const document: PdfSourceDocument = {
      type: "pdf",
      fileName: file.name,
      title: metadataString(info.Title) ?? fileTitle(file.name),
      ...(metadataString(info.Author) ? { author: metadataString(info.Author) } : {}),
      pageCount: pdf.numPages,
      pages: normalizedPages,
      ...(outline ? { outline } : {}),
      stats: {
        totalChars: normalizedPages.reduce((sum, page) => sum + page.charCount, 0),
        textPageCount: normalizedPages.filter((page) => page.charCount >= MIN_PAGE_TEXT_CHARS).length,
        emptyPageCount: normalizedPages.filter((page) => !page.charCount).length,
        failedPageCount: failedPages.length,
        failedPages,
      },
    };
    onProgress?.({ stage: "done", current: pdf.numPages, total: pdf.numPages });
    return document;
  } finally {
    if (pdf) {
      await pdf.cleanup().catch(() => undefined);
    }
    await loadingTask?.destroy().catch(() => undefined);
  }
}
