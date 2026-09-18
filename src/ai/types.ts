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

export interface PreparePdfOptions extends PdfExtractionOptions {
  targetChars?: number;
  maxChars?: number;
}
