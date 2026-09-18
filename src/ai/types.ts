export interface PdfSourcePage {
  page: number;
  text: string;
  charCount: number;
}

export interface PdfSourceOutlineNode {
  title: string;
  page: number;
  depth: number;
  children?: PdfSourceOutlineNode[];
}

export interface PdfSourceDocumentStats {
  totalChars: number;
  textPageCount: number;
  emptyPageCount: number;
  failedPageCount: number;
  failedPages: number[];
}

export interface PdfSourceDocument {
  type: "pdf";
  fileName: string;
  title: string;
  author?: string;
  pageCount: number;
  pages: PdfSourcePage[];
  outline?: PdfSourceOutlineNode[];
  stats?: PdfSourceDocumentStats;
}

export interface DocxSourceSection {
  id: string;
  title?: string;
  level?: number;
  text: string;
  charCount: number;
}

export interface DocxSourceDocumentStats {
  totalChars: number;
  sectionCount: number;
  titledSectionCount: number;
  emptySectionCount: number;
}

export interface DocxSourceDocument {
  type: "docx";
  fileName: string;
  title: string;
  sections: DocxSourceSection[];
  stats?: DocxSourceDocumentStats;
}

export type SourceDocument = PdfSourceDocument | DocxSourceDocument;

export type PdfSourceChunkSource = "outline" | "pages";

export interface PdfSourceChunk {
  id: string;
  title?: string;
  startPage: number;
  endPage: number;
  text: string;
  charCount: number;
  source: PdfSourceChunkSource;
}

export type DocxSourceChunkSource = "headings" | "sections";

export interface DocxSourceChunk {
  id: string;
  title?: string;
  startSection: number;
  endSection: number;
  text: string;
  charCount: number;
  source: DocxSourceChunkSource;
}

export type SourceChunk = PdfSourceChunk | DocxSourceChunk;

export interface PdfExtractionProgress {
  stage: "loading" | "metadata" | "outline" | "pages" | "normalizing" | "done";
  current?: number;
  total?: number;
}

export type PdfImportErrorCode =
  | "INVALID_FILE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_PAGES"
  | "LOAD_FAILED"
  | "SCANNED_PDF"
  | "TEXT_EXTRACTION_FAILED"
  | "ABORTED";

export class PdfImportError extends Error {
  readonly code: PdfImportErrorCode;

  constructor(code: PdfImportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfImportError";
    this.code = code;
  }
}

export interface PdfExtractionOptions {
  onProgress?: (progress: PdfExtractionProgress) => void;
  signal?: AbortSignal;
}

export interface DocxExtractionProgress {
  stage: "loading" | "parsing" | "normalizing" | "done";
}

export interface DocxExtractionOptions {
  onProgress?: (progress: DocxExtractionProgress) => void;
  signal?: AbortSignal;
}

export interface PreparePdfOptions extends PdfExtractionOptions {
  targetChars?: number;
  maxChars?: number;
}

export interface AIOutlineDraftSource {
  fileName: string;
  title: string;
  format?: "pdf" | "docx";
  pageCount?: number;
  sectionCount?: number;
}

export interface AIOutlineDraftSourcePages {
  startPage: number;
  endPage: number;
}

export interface AIOutlineDraftSourceSections {
  startSection: number;
  endSection: number;
}

export interface AIOutlineDraftNode {
  id: string;
  title: string;
  summary?: string;
  sourcePages?: AIOutlineDraftSourcePages;
  sourceSections?: AIOutlineDraftSourceSections;
  children: AIOutlineDraftNode[];
}

export interface AIOutlineDraft {
  type: "ai-outline-draft";
  version: 1;
  title: string;
  source: AIOutlineDraftSource;
  nodes: AIOutlineDraftNode[];
}
