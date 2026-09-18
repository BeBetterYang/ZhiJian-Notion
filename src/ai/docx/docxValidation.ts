export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isDocxFile(file: File) {
  return file.type === DOCX_MIME_TYPE || /\.docx$/i.test(file.name);
}
