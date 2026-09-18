import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfImportError, type PdfSourceChunk, type PdfSourceDocument } from "../types";
import { preparePdfForAI } from "../pdf/preparePdfForAI";
import { PdfImportDialog } from "./PdfImportDialog";

vi.mock("../pdf/preparePdfForAI", () => ({ preparePdfForAI: vi.fn() }));

const mockedPreparePdfForAI = vi.mocked(preparePdfForAI);
const parsedDocument: PdfSourceDocument = {
  type: "pdf",
  fileName: "测试.pdf",
  title: "测试讲义",
  pageCount: 2,
  pages: [{ page: 1, text: "第一页", charCount: 3 }, { page: 2, text: "第二页", charCount: 3 }],
  outline: [{ title: "第一章", page: 1, depth: 0 }],
  stats: { totalChars: 6, textPageCount: 2, emptyPageCount: 0, failedPageCount: 0, failedPages: [] },
};
const parsedChunks: PdfSourceChunk[] = [{ id: "chunk-1", title: "第一章", startPage: 1, endPage: 2, text: "[第 1 页]\n第一页", charCount: 15, source: "outline" }];

function choosePdf() {
  const input = screen.getByRole("dialog").querySelector<HTMLInputElement>("input[type=file]")!;
  fireEvent.change(input, { target: { files: [new File(["pdf"], "测试.pdf", { type: "application/pdf" })] } });
}

describe("PdfImportDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens, starts parsing immediately, shows progress and renders the parsed preview", async () => {
    let resolve: ((value: { document: PdfSourceDocument; chunks: PdfSourceChunk[] }) => void) | undefined;
    mockedPreparePdfForAI.mockImplementation(() => new Promise((complete) => { resolve = complete; }));
    render(<PdfImportDialog onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "从 PDF 生成大纲" })).toBeInTheDocument();
    choosePdf();
    expect(await screen.findByText("正在读取 PDF…")).toBeInTheDocument();
    resolve?.({ document: parsedDocument, chunks: parsedChunks });
    expect(await screen.findByText("测试讲义")).toBeInTheDocument();
    expect(screen.getByText("目录")).toBeInTheDocument();
    expect(screen.getAllByText("第一章")).toHaveLength(2);
    expect(screen.getByText("内容分块")).toBeInTheDocument();
  });

  it("shows parser errors and allows choosing another PDF", async () => {
    mockedPreparePdfForAI.mockRejectedValueOnce(new PdfImportError("SCANNED_PDF", "这个 PDF 主要由扫描图片组成，目前暂不支持扫描版 PDF。"));
    render(<PdfImportDialog onClose={vi.fn()} />);
    choosePdf();
    expect(await screen.findByRole("alert")).toHaveTextContent("扫描图片");
    expect(screen.getByText("拖入 PDF 文件")).toBeInTheDocument();
  });

  it("cancels parsing without showing an error", async () => {
    mockedPreparePdfForAI.mockImplementation(() => new Promise(() => undefined));
    const onClose = vi.fn();
    render(<PdfImportDialog onClose={onClose} />);
    choosePdf();
    await waitFor(() => expect(screen.getByText("正在读取 PDF…")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
