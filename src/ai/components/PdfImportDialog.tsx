import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FileText, RotateCcw, Upload, X } from "lucide-react";
import { PdfImportError, type PdfSourceDocument, type PdfSourceChunk, type PdfExtractionProgress } from "../types";

interface PdfImportDialogProps {
  onClose: () => void;
}

type PdfImportState = "idle" | "parsing" | "parsed" | "error";

const progressLabels: Record<PdfExtractionProgress["stage"], string> = {
  loading: "正在读取 PDF…",
  metadata: "正在读取文档信息…",
  outline: "正在读取目录…",
  pages: "正在提取文字…",
  normalizing: "正在整理文本…",
  done: "解析完成",
};

function countOutlineNodes(document: PdfSourceDocument) {
  const count = (nodes: PdfSourceDocument["outline"]): number => (nodes ?? []).reduce((total, node) => total + 1 + count(node.children), 0);
  return count(document.outline);
}

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function errorMessage(error: unknown) {
  if (error instanceof PdfImportError) return error.message;
  return "无法读取这个 PDF，文件可能已损坏或格式不完整。";
}

export function PdfImportDialog({ onClose }: PdfImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<PdfImportState>("idle");
  const [progress, setProgress] = useState<PdfExtractionProgress>({ stage: "loading" });
  const [document, setDocument] = useState<PdfSourceDocument | null>(null);
  const [chunks, setChunks] = useState<PdfSourceChunk[]>([]);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const close = () => {
    controllerRef.current?.abort();
    onClose();
  };

  const parseFile = async (file: File | undefined) => {
    if (!file) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("parsing");
    setDocument(null);
    setChunks([]);
    setError("");
    setProgress({ stage: "loading" });
    try {
      const { preparePdfForAI } = await import("../pdf/preparePdfForAI");
      const result = await preparePdfForAI(file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      setDocument(result.document);
      setChunks(result.chunks);
      setState("parsed");
    } catch (caughtError) {
      if (controller.signal.aborted || caughtError instanceof PdfImportError && caughtError.code === "ABORTED") return;
      setError(errorMessage(caughtError));
      setState("error");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const selectFile = (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    void parseFile(file);
  };

  return (
    <div className="workspace-dialog-layer pdf-import-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="pdf-import-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-import-title">
        <header className="pdf-import-dialog-header">
          <div>
            <h2 id="pdf-import-title">从 PDF 生成大纲</h2>
            <p>先在浏览器本地解析 PDF，查看目录和内容分块。</p>
          </div>
          <button type="button" className="icon-button" onClick={close} aria-label="关闭 PDF 导入"><X /></button>
        </header>

        {state === "idle" || state === "error" ? (
          <>
            <label
              className={`pdf-import-dropzone${dragActive ? " is-drag-active" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
              onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFile(event.dataTransfer.files[0]); }}
            >
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => selectFile(event.target.files?.[0])} />
              <Upload aria-hidden="true" />
              <strong>拖入 PDF 文件</strong>
              <span>或点击选择文件</span>
            </label>
            <p className="pdf-import-hint">支持文字型 PDF · 最大 20 MB · 150 页 · 暂不支持扫描件</p>
            {state === "error" ? <div className="pdf-import-error" role="alert">{error}</div> : null}
          </>
        ) : null}

        {state === "parsing" ? (
          <div className="pdf-import-progress" aria-live="polite">
            <FileText aria-hidden="true" />
            <strong>{progress.stage === "pages" && progress.current && progress.total ? `正在提取第 ${progress.current} / ${progress.total} 页…` : progressLabels[progress.stage]}</strong>
            {progress.stage === "pages" && progress.total ? <progress value={progress.current ?? 0} max={progress.total} /> : <div className="pdf-import-progress-line" />}
            <button type="button" className="pdf-import-secondary-button" onClick={close}>取消</button>
          </div>
        ) : null}

        {state === "parsed" && document ? (
          <div className="pdf-import-result">
            <div className="pdf-import-file-summary">
              <FileText aria-hidden="true" />
              <div><strong>{document.title}</strong><span>{document.fileName}</span></div>
            </div>
            <div className="pdf-import-stats">
              <span>{formatNumber(document.pageCount)} 页</span>
              <span>{formatNumber(document.stats?.totalChars ?? 0)} 字符</span>
              <span>{document.outline ? `${countOutlineNodes(document)} 个章节` : "未检测到目录"}</span>
              <span>{chunks.length} 个分析分块</span>
            </div>
            {document.stats?.failedPageCount ? <p className="pdf-import-warning">有 {document.stats.failedPageCount} 页内容无法读取，已保留为空页。</p> : null}

            <div className="pdf-import-result-scroll">
              {document.outline?.length ? (
                <section className="pdf-import-result-section">
                  <h3>目录</h3>
                  <div className="pdf-import-outline-list">
                    {document.outline.map((node) => <OutlinePreviewNode key={`${node.title}-${node.page}-${node.depth}`} node={node} />)}
                  </div>
                </section>
              ) : null}
              <section className="pdf-import-result-section">
                <h3>内容分块</h3>
                <div className="pdf-import-chunk-list">
                  {chunks.map((chunk) => (
                    <details key={chunk.id} className="pdf-import-chunk">
                      <summary><span>{chunk.title || `Chunk ${chunks.indexOf(chunk) + 1}`}</span><small>第 {chunk.startPage}–{chunk.endPage} 页 · {formatNumber(chunk.charCount)} 字符</small></summary>
                      <pre>{chunk.text}</pre>
                    </details>
                  ))}
                </div>
              </section>
            </div>
            <footer className="pdf-import-dialog-footer">
              <button type="button" className="pdf-import-secondary-button" onClick={() => { setState("idle"); setDocument(null); setChunks([]); setError(""); }}><RotateCcw />重新选择 PDF</button>
              <button type="button" className="pdf-import-primary-button" onClick={close}>完成</button>
            </footer>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function OutlinePreviewNode({ node }: { node: NonNullable<PdfSourceDocument["outline"]>[number] }) {
  return (
    <div className="pdf-import-outline-node" style={{ "--outline-depth": node.depth } as CSSProperties}>
      <span>{node.title}</span><small>第 {node.page} 页</small>
      {node.children?.map((child) => <OutlinePreviewNode key={`${child.title}-${child.page}-${child.depth}`} node={child} />)}
    </div>
  );
}
