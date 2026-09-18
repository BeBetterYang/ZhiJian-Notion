import { PdfImportError } from "../types";
import { MAX_PDF_FILE_BYTES } from "./pdfConstants";

export function isPdfFile(file: File) {
  return file.type.toLowerCase() === "application/pdf" || (!file.type && file.name.toLowerCase().endsWith(".pdf"));
}

export function validatePdfFile(file: File) {
  if (!isPdfFile(file)) throw new PdfImportError("INVALID_FILE", "当前仅支持 PDF 文件。");
  if (file.size > MAX_PDF_FILE_BYTES) throw new PdfImportError("FILE_TOO_LARGE", "PDF 文件不能超过 20 MB。");
}
