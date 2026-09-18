import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAIOutline } from "../aiOutlineApi";
import { PdfImportError, type AIOutlineDraft, type DocxSourceChunk, type DocxSourceDocument, type PdfSourceChunk, type PdfSourceDocument } from "../types";
import { preparePdfForAI } from "../pdf/preparePdfForAI";
import { prepareDocxForAI } from "../docx/prepareDocxForAI";
import { PdfImportDialog } from "./PdfImportDialog";

vi.mock("../pdf/preparePdfForAI", () => ({ preparePdfForAI: vi.fn() }));
vi.mock("../docx/prepareDocxForAI", () => ({ prepareDocxForAI: vi.fn() }));
vi.mock("../aiOutlineApi", () => ({ generateAIOutline: vi.fn() }));

const mockedPreparePdfForAI = vi.mocked(preparePdfForAI);
const mockedPrepareDocxForAI = vi.mocked(prepareDocxForAI);
const mockedGenerateAIOutline = vi.mocked(generateAIOutline);
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
const parsedDocx: DocxSourceDocument = {
  type: "docx",
  fileName: "测试.docx",
  title: "测试 Word",
  sections: [
    { id: "section-1", title: "第一章", level: 1, text: "第一章内容", charCount: 7 },
    { id: "section-2", title: "第二章", level: 1, text: "第二章内容", charCount: 7 },
  ],
  stats: { totalChars: 14, sectionCount: 2, titledSectionCount: 2, emptySectionCount: 0 },
};
const parsedDocxChunks: DocxSourceChunk[] = [{ id: "docx-1", title: "第一章", startSection: 1, endSection: 2, text: "## 第一章\n第一章内容", charCount: 16, source: "headings" }];
const session = { email: "test@example.com", name: "测试", userId: "user-1", accessToken: "token" };
const generatedDraft: AIOutlineDraft = {
  type: "ai-outline-draft",
  version: 1,
  title: "AI 课程大纲",
  source: { fileName: "测试.pdf", title: "测试讲义", pageCount: 2 },
  nodes: [{ id: "draft-1", title: "核心内容", summary: "课程重点", sourcePages: { startPage: 1, endPage: 2 }, children: [] }],
};

function choosePdf() {
  const input = screen.getByRole("dialog").querySelector<HTMLInputElement>("input[type=file]")!;
  fireEvent.change(input, { target: { files: [new File(["pdf"], "测试.pdf", { type: "application/pdf" })] } });
}

function chooseDocx() {
  const input = screen.getByRole("dialog").querySelector<HTMLInputElement>("input[type=file]")!;
  fireEvent.change(input, { target: { files: [new File(["docx"], "测试.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })] } });
}

describe("PdfImportDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens, starts parsing immediately, shows progress and renders the parsed preview", async () => {
    let resolve: ((value: { document: PdfSourceDocument; chunks: PdfSourceChunk[] }) => void) | undefined;
    mockedPreparePdfForAI.mockImplementation(() => new Promise((complete) => { resolve = complete; }));
    render(<PdfImportDialog onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "从 PDF / Word 生成大纲" })).toBeInTheDocument();
    choosePdf();
    expect(await screen.findByText("正在读取文件…")).toBeInTheDocument();
    resolve?.({ document: parsedDocument, chunks: parsedChunks });
    expect(await screen.findByText("测试讲义")).toBeInTheDocument();
    expect(screen.getByText("目录")).toBeInTheDocument();
    expect(screen.getAllByText("第一章")).toHaveLength(2);
    expect(screen.getByText("内容分块")).toBeInTheDocument();
    expect(screen.queryByText("第 1–2 页")).not.toBeInTheDocument();
  });

  it("shows parser errors and allows choosing another PDF", async () => {
    mockedPreparePdfForAI.mockRejectedValueOnce(new PdfImportError("SCANNED_PDF", "这个 PDF 主要由扫描图片组成，目前暂不支持扫描版 PDF。"));
    render(<PdfImportDialog onClose={vi.fn()} />);
    choosePdf();
    expect(await screen.findByRole("alert")).toHaveTextContent("扫描图片");
    expect(screen.getByText("拖入 PDF 或 DOCX 文件")).toBeInTheDocument();
  });

  it("renders nested outline items as separate rows", async () => {
    mockedPreparePdfForAI.mockResolvedValueOnce({
      document: { ...parsedDocument, outline: [{ title: "第一章", page: 1, depth: 0, children: [{ title: "第一节", page: 1, depth: 1 }] }] },
      chunks: parsedChunks,
    });
    render(<PdfImportDialog onClose={vi.fn()} />);
    choosePdf();
    await screen.findByText("测试讲义");
    const rows = document.querySelectorAll(".pdf-import-outline-node-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector("span")).toHaveTextContent("第一章");
    expect(rows[1].querySelector("span")).toHaveTextContent("第一节");
  });

  it("generates and previews an AI draft without creating a workspace document", async () => {
    mockedPreparePdfForAI.mockResolvedValueOnce({ document: parsedDocument, chunks: parsedChunks });
    let resolveDraft: ((draft: AIOutlineDraft) => void) | undefined;
    mockedGenerateAIOutline.mockImplementationOnce(() => new Promise((resolve) => { resolveDraft = resolve; }));
    const onClose = vi.fn();
    render(<PdfImportDialog session={session} onClose={onClose} />);
    choosePdf();
    await screen.findByText("测试讲义");
    fireEvent.click(screen.getByRole("button", { name: "生成 AI 大纲" }));
    expect(await screen.findByText("正在生成 AI 大纲…")).toBeInTheDocument();
    resolveDraft?.(generatedDraft);
    expect(await screen.findByDisplayValue("AI 课程大纲")).toBeInTheDocument();
    expect(screen.getByDisplayValue("核心内容")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockedGenerateAIOutline).toHaveBeenCalledOnce();
    expect(mockedGenerateAIOutline).toHaveBeenCalledWith(session, parsedDocument, parsedChunks, expect.objectContaining({ provider: undefined }));
    expect(screen.queryByText("第 1–2 页")).not.toBeInTheDocument();
  });

  it("parses DOCX files and shows section-based results without source ranges", async () => {
    mockedPrepareDocxForAI.mockResolvedValueOnce({ document: parsedDocx, chunks: parsedDocxChunks });
    render(<PdfImportDialog onClose={vi.fn()} />);
    chooseDocx();
    expect(await screen.findByText("测试 Word")).toBeInTheDocument();
    expect(screen.getByText("2 个章节")).toBeInTheDocument();
    expect(screen.getByText("2 个标题章节")).toBeInTheDocument();
    expect(screen.getByText("内容分块")).toBeInTheDocument();
    expect(screen.queryByText(/第 \d+–\d+ 个章节/)).not.toBeInTheDocument();
    expect(mockedPrepareDocxForAI).toHaveBeenCalledOnce();
  });

  it("passes the edited draft to the workspace creation callback", async () => {
    mockedPreparePdfForAI.mockResolvedValueOnce({ document: parsedDocument, chunks: parsedChunks });
    mockedGenerateAIOutline.mockResolvedValueOnce(generatedDraft);
    const onCreateDocument = vi.fn();
    render(<PdfImportDialog session={session} onClose={vi.fn()} onCreateDocument={onCreateDocument} />);
    choosePdf();
    await screen.findByText("测试讲义");
    fireEvent.click(screen.getByRole("button", { name: "生成 AI 大纲" }));
    await screen.findByDisplayValue("AI 课程大纲");
    fireEvent.change(screen.getByDisplayValue("核心内容"), { target: { value: "修改后的标题" } });
    fireEvent.click(screen.getByRole("button", { name: "创建工作区文档" }));
    expect(onCreateDocument).toHaveBeenCalledWith(expect.objectContaining({
      title: "AI 课程大纲",
      nodes: [expect.objectContaining({ title: "修改后的标题" })],
    }));
  });

  it("cancels parsing without showing an error", async () => {
    mockedPreparePdfForAI.mockImplementation(() => new Promise(() => undefined));
    const onClose = vi.fn();
    render(<PdfImportDialog onClose={onClose} />);
    choosePdf();
    await waitFor(() => expect(screen.getByText("正在读取文件…")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
