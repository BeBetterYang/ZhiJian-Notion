import type { DocxExtractionOptions, DocxSourceChunk, DocxSourceDocument } from "../types";
import { chunkDocx, type ChunkDocxOptions } from "./chunkDocx";
import { extractDocx } from "./extractDocx";
export { DocxImportError } from "./docxErrors";

export type PrepareDocxOptions = DocxExtractionOptions & ChunkDocxOptions;

export async function prepareDocxForAI(file: File, options: PrepareDocxOptions = {}): Promise<{ document: DocxSourceDocument; chunks: DocxSourceChunk[] }> {
  const document = await extractDocx(file, options);
  return { document, chunks: chunkDocx(document, options) };
}
