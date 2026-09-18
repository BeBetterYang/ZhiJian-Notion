export class DocxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxImportError";
  }
}
