import type { NodeObj } from "mind-elixir";
import { type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  normalizeRichText,
  type RichTextContent,
  type RichTextMarks,
  type ZhiJianNode,
  type ZhiJianNodeBlock,
  type ZhiJianNodeType,
} from "../core/tree";
import { getCachedImageAssetUrl } from "../shared/imageAssetStore";

export interface MindMapNodeMetadata {
  type: ZhiJianNodeType;
  plainText: string;
  richTextHtml?: string;
  checked?: boolean;
  hasQuote?: boolean;
  imageCount?: number;
}

interface MindMapNodeRendererProps {
  node: ZhiJianNode;
  onSelect: (nodeId: string) => void;
  onEdit: (nodeId: string, focusBlockId?: string) => void;
}

export function MindMapNodeRenderer({ node, onSelect, onEdit }: MindMapNodeRendererProps) {
  const handleSelect = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onSelect(node.id);
  };
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const block = (event.target as HTMLElement).closest<HTMLElement>("[data-block-id]");
    onEdit(node.id, block?.dataset.blockId);
  };
  const images = (node.blocks ?? []).filter(
    (block): block is Extract<ZhiJianNodeBlock, { type: "image" }> => block.type === "image",
  );
  const quotes = (node.blocks ?? []).filter(
    (block): block is Extract<ZhiJianNodeBlock, { type: "quote" }> => block.type === "quote",
  );

  return (
    <div
      className="mindmap-node-renderer"
      data-node-id={node.id}
      onClick={handleSelect}
      onDoubleClick={handleDoubleClick}
    >
      <div className="mindmap-node-body">
        {node.type === "table" ? (
          <MindMapTablePreview node={node} />
        ) : (
          <div className="mindmap-node-primary">
            {node.type === "todo" ? (
              <span className={`mindmap-node-todo ${node.props?.checked ? "is-checked" : ""}`}>
                <span
                  className="mindmap-node-checkbox"
                  data-node-id={node.id}
                  role="checkbox"
                  aria-checked={node.props?.checked ? "true" : "false"}
                >
                  {node.props?.checked ? "✓" : ""}
                </span>
                <RichTextView content={node.content} />
              </span>
            ) : (
              <RichTextView content={node.content} />
            )}
          </div>
        )}
        {node.description ? (
          <MindMapQuote blockId={`${node.id}::description`} content={node.description} />
        ) : null}
        {quotes.map((block) => (
          <MindMapQuote key={block.id} blockId={block.id} content={block.content} />
        ))}
        {images.length ? (
          <div className="mindmap-node-images">
            {images.map((block) => (
              <MindMapImage key={block.id} block={block} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RichTextView({ content }: { content: RichTextContent }) {
  const normalized = normalizeRichText(content);
  const spans = normalized.spans?.length
    ? normalized.spans
    : [{ text: normalized.text, marks: normalized.marks }];
  return (
    <span className="mindmap-node-rich-text">
      {spans.map((span, index) => (
        <RichTextSpan key={`${index}-${span.text}`} text={span.text} marks={span.marks} />
      ))}
    </span>
  );
}

function RichTextSpan({ text, marks }: { text: string; marks?: RichTextMarks }) {
  const style: CSSProperties = {
    fontWeight: marks?.bold ? 700 : undefined,
    fontStyle: marks?.italic ? "italic" : undefined,
    textDecoration: [marks?.underline ? "underline" : "", marks?.strike ? "line-through" : ""]
      .filter(Boolean)
      .join(" ") || undefined,
    color: marks?.textColor,
    backgroundColor: marks?.backgroundColor,
  };
  const content: ReactNode = <span style={style}>{text}</span>;
  return marks?.linkUrl ? (
    <a href={marks.linkUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
      {content}
    </a>
  ) : content;
}

function MindMapQuote({ blockId, content }: { blockId: string; content: RichTextContent }) {
  return (
    <div className="mindmap-node-quote" data-block-id={blockId}>
      <RichTextView content={content} />
    </div>
  );
}

function MindMapImage({ block }: { block: Extract<ZhiJianNodeBlock, { type: "image" }> }) {
  const url = block.image.assetId
    ? getCachedImageAssetUrl(block.image.assetId)
    : block.image.url;
  return (
    <div className="mindmap-node-image" data-block-id={block.id}>
      {url ? <img src={url} alt={block.image.name ?? "图片"} /> : <span>图片</span>}
    </div>
  );
}

function MindMapTablePreview({ node }: { node: ZhiJianNode }) {
  const rows = node.props?.table?.rows ?? [];
  return (
    <div className="mindmap-node-table">
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  <RichTextView content={cell.content} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <span>表格</span> : null}
    </div>
  );
}

// Kept as the native MindElixir fallback for nodes while their React portal mounts.
// eslint-disable-next-line react-refresh/only-export-components
export function renderMindMapNode(topic: string, obj: NodeObj) {
  const metadata = (obj as NodeObj<MindMapNodeMetadata>).metadata;
  if (!metadata || metadata.plainText !== topic) {
    return escapeHtml(topic);
  }
  if (metadata.type === "todo") {
    return `<span class="mindmap-todo ${metadata.checked ? "is-checked" : ""}"><span class="mindmap-todo-checkbox" data-node-id="${escapeHtml(obj.id)}" role="checkbox" aria-label="待办" aria-checked="${metadata.checked ? "true" : "false"}">${metadata.checked ? "✓" : ""}</span><span class="mindmap-todo-content">${metadata.richTextHtml ?? escapeHtml(topic)}</span></span>`;
  }
  return `<span class="mindmap-node-text">${metadata.richTextHtml ?? escapeHtml(topic)}</span>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
