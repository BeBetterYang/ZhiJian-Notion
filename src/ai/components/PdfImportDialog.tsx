import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FileText, RotateCcw, Upload, X } from "lucide-react";
import type { WorkspaceSession } from "../../workspace/auth";
import { generateAIOutline } from "../aiOutlineApi";
import type { AIProviderConfig } from "../aiProviderConfig";
import type { AIOutlineDraft, AIOutlineDraftNode, DocxExtractionProgress, PdfExtractionProgress, PdfSourceDocument, SourceChunk, SourceDocument } from "../types";
import { PdfImportError } from "../types";
import { DocxImportError } from "../docx/docxErrors";
import { isDocxFile } from "../docx/docxValidation";

interface PdfImportDialogProps {
  onClose: () => void;
  session?: WorkspaceSession;
  aiProvider?: AIProviderConfig;
  onCreateDocument?: (draft: AIOutlineDraft) => void;
}

type PdfImportState = "idle" | "parsing" | "parsed" | "generating" | "draft" | "error";
type SourceExtractionProgress = PdfExtractionProgress | DocxExtractionProgress;

const progressLabels: Record<SourceExtractionProgress["stage"], string> = {
  loading: "正在读取文件…",
  metadata: "正在读取文档信息…",
  outline: "正在读取目录…",
  pages: "正在提取文字…",
  parsing: "正在解析 Word 内容…",
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
  if (error instanceof DocxImportError) return error.message;
  return "无法读取这个文件，文件可能已损坏或格式不完整。";
}

export function PdfImportDialog({ onClose, session, aiProvider, onCreateDocument }: PdfImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<PdfImportState>("idle");
  const [progress, setProgress] = useState<SourceExtractionProgress>({ stage: "loading" });
  const [document, setDocument] = useState<SourceDocument | null>(null);
  const [chunks, setChunks] = useState<SourceChunk[]>([]);
  const [draft, setDraft] = useState<AIOutlineDraft | null>(null);
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
    setDraft(null);
    setError("");
    setProgress({ stage: "loading" });
    try {
      const result = isDocxFile(file)
        ? await (async () => {
          const { prepareDocxForAI } = await import("../docx/prepareDocxForAI");
          return prepareDocxForAI(file, { signal: controller.signal, onProgress: setProgress });
        })()
        : await (async () => {
          const { preparePdfForAI } = await import("../pdf/preparePdfForAI");
          return preparePdfForAI(file, { signal: controller.signal, onProgress: setProgress });
        })();
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

  const generateDraft = async () => {
    if (!document || !session) {
      setError("当前登录状态无法生成 AI 大纲，请重新登录后重试。");
      setState("error");
      return;
    }
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setState("generating");
    setError("");
    try {
      const nextDraft = await generateAIOutline(session, document, chunks, { signal: controller.signal, provider: aiProvider });
      if (controller.signal.aborted) return;
      setDraft(nextDraft);
      setState("draft");
    } catch (caughtError) {
      if (controller.signal.aborted) return;
      setError(caughtError instanceof Error ? caughtError.message : "AI 生成失败，请稍后重试。");
      setState("error");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const updateDraftTitle = (title: string) => {
    setDraft((current) => current ? { ...current, title } : current);
  };

  const updateDraftNode = (nodeId: string, patch: { title?: string; summary?: string }) => {
    const updateNodes = (nodes: AIOutlineDraftNode[]): AIOutlineDraftNode[] => nodes.map((node) => {
      if (node.id === nodeId) return { ...node, ...patch };
      return { ...node, children: updateNodes(node.children) };
    });
    setDraft((current) => current ? { ...current, nodes: updateNodes(current.nodes) } : current);
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
            <h2 id="pdf-import-title">从 PDF / Word 生成大纲</h2>
            <p>先在浏览器本地解析文件，查看目录和内容分块。</p>
          </div>
          <button type="button" className="icon-button" onClick={close} aria-label="关闭文件导入"><X /></button>
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
              <input ref={inputRef} type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={(event) => selectFile(event.target.files?.[0])} />
              <Upload aria-hidden="true" />
              <strong>拖入 PDF 或 DOCX 文件</strong>
              <span>或点击选择文件</span>
            </label>
            <p className="pdf-import-hint">支持文字型 PDF 和 DOCX · 最大 20 MB · PDF 暂不支持扫描件</p>
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

        {state === "generating" ? (
          <div className="pdf-import-progress" aria-live="polite">
            <FileText aria-hidden="true" />
            <strong>正在生成 AI 大纲…</strong>
            <div className="pdf-import-progress-line" />
            <span>正在根据文件内容整理章节和知识点</span>
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
              {document.type === "pdf" ? <span>{formatNumber(document.pageCount)} 页</span> : <span>{formatNumber(document.sections.length)} 个章节</span>}
              <span>{formatNumber(document.stats?.totalChars ?? 0)} 字符</span>
              {document.type === "pdf"
                ? <span>{document.outline ? `${countOutlineNodes(document)} 个章节` : "未检测到目录"}</span>
                : <span>{formatNumber(document.stats?.titledSectionCount ?? 0)} 个标题章节</span>}
              <span>{chunks.length} 个分析分块</span>
            </div>
            {document.type === "pdf" && document.stats?.failedPageCount ? <p className="pdf-import-warning">有部分内容无法读取，已保留为空页。</p> : null}

            <div className="pdf-import-result-scroll">
              {document.type === "pdf" && document.outline?.length ? (
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
                      <summary><span>{chunk.title || `Chunk ${chunks.indexOf(chunk) + 1}`}</span><small>{formatNumber(chunk.charCount)} 字符</small></summary>
                      <pre>{chunk.text}</pre>
                    </details>
                  ))}
                </div>
              </section>
            </div>
            <footer className="pdf-import-dialog-footer">
              <button type="button" className="pdf-import-secondary-button" onClick={() => { setState("idle"); setDocument(null); setChunks([]); setError(""); }}><RotateCcw />重新选择文件</button>
              <button type="button" className="pdf-import-primary-button" onClick={() => void generateDraft()}>生成 AI 大纲</button>
            </footer>
          </div>
        ) : null}

        {state === "draft" && draft ? (
          <div className="pdf-import-result">
            <div className="pdf-import-file-summary">
              <FileText aria-hidden="true" />
              <div><input className="pdf-import-draft-title" aria-label="大纲标题" value={draft.title} onChange={(event) => updateDraftTitle(event.target.value)} /><span>AI 大纲草稿 · 尚未写入工作区</span></div>
            </div>
            <div className="pdf-import-result-scroll">
              <section className="pdf-import-result-section">
                <h3>大纲草稿</h3>
                <div className="pdf-import-draft-list">
                  {draft.nodes.map((node) => <DraftPreviewNode key={node.id} node={node} onChange={updateDraftNode} />)}
                </div>
              </section>
            </div>
            <footer className="pdf-import-dialog-footer">
              <button type="button" className="pdf-import-secondary-button" onClick={() => { setState("parsed"); setDraft(null); }}>返回解析结果</button>
              {onCreateDocument ? <button type="button" className="pdf-import-primary-button" onClick={() => onCreateDocument(draft)}>创建工作区文档</button> : <button type="button" className="pdf-import-primary-button" onClick={close}>关闭预览</button>}
            </footer>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function OutlinePreviewNode({ node }: { node: NonNullable<PdfSourceDocument["outline"]>[number] }) {
  return (
    <div className="pdf-import-outline-node">
      <div className="pdf-import-outline-node-row" style={{ "--outline-depth": node.depth } as CSSProperties}>
        <span>{node.title}</span>
      </div>
      {node.children?.length ? <div className="pdf-import-outline-children">{node.children.map((child) => <OutlinePreviewNode key={`${child.title}-${child.page}-${child.depth}`} node={child} />)}</div> : null}
    </div>
  );
}

function DraftPreviewNode({ node, onChange }: { node: AIOutlineDraftNode; onChange: (nodeId: string, patch: { title?: string; summary?: string }) => void }) {
  return (
    <div className="pdf-import-draft-node">
      <div className="pdf-import-draft-node-row">
        <input aria-label={`大纲节点标题：${node.title}`} value={node.title} onChange={(event) => onChange(node.id, { title: event.target.value })} />
      </div>
      <textarea aria-label={`大纲节点摘要：${node.title}`} value={node.summary ?? ""} placeholder="添加摘要（可选）" onChange={(event) => onChange(node.id, { summary: event.target.value })} />
      {node.children.length ? <div className="pdf-import-draft-children">{node.children.map((child) => <DraftPreviewNode key={child.id} node={child} onChange={onChange} />)}</div> : null}
    </div>
  );
}
