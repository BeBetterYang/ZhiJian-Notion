import type { PdfSourceChunk, PdfSourceDocument, PreparePdfOptions } from "../types";
import { chunkPdf } from "./chunkPdf";
import { extractPdf } from "./extractPdf";

export async function preparePdfForAI(file: File, options: PreparePdfOptions = {}): Promise<{ document: PdfSourceDocument; chunks: PdfSourceChunk[] }> {
  const document = await extractPdf(file, options);
  const chunks = chunkPdf(document, options);
  return { document, chunks };
}
