import { describe, expect, it } from "vitest";
import { PdfImportError } from "../types";
import { isPdfFile, validatePdfFile } from "./pdfValidation";

describe("pdfValidation", () => {
  it("accepts PDF MIME and empty-MIME .pdf files only", () => {
    expect(isPdfFile({ name: "讲义.pdf", type: "application/pdf" } as File)).toBe(true);
    expect(isPdfFile({ name: "讲义.pdf", type: "" } as File)).toBe(true);
    expect(isPdfFile({ name: "讲义.txt", type: "text/plain" } as File)).toBe(false);
  });

  it("reports invalid and oversized files with stable error codes", () => {
    expect(() => validatePdfFile({ name: "讲义.txt", type: "text/plain", size: 1 } as File)).toThrowError(PdfImportError);
    try {
      validatePdfFile({ name: "讲义.txt", type: "text/plain", size: 1 } as File);
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_FILE" });
    }
    try {
      validatePdfFile({ name: "large.pdf", type: "application/pdf", size: 20 * 1024 * 1024 + 1 } as File);
    } catch (error) {
      expect(error).toMatchObject({ code: "FILE_TOO_LARGE" });
    }
  });
});
