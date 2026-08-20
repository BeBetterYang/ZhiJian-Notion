import type { NodeObj } from "mind-elixir";
import type { ZhiJianNodeType } from "../core/tree";

export interface MindMapNodeMetadata {
  type: ZhiJianNodeType;
  plainText: string;
  richTextHtml?: string;
  quoteBodyHtml?: string;
  checked?: boolean;
}

export function renderMindMapNode(topic: string, obj: NodeObj) {
  const metadata = (obj as NodeObj<MindMapNodeMetadata>).metadata;
  if (!metadata || metadata.plainText !== topic) {
    return escapeHtml(topic);
  }
  if (metadata.type === "todo") {
    return `<span class="mindmap-todo ${metadata.checked ? "is-checked" : ""}"><span class="mindmap-todo-checkbox" data-node-id="${escapeHtml(obj.id)}" role="checkbox" aria-label="待办" aria-checked="${metadata.checked ? "true" : "false"}">${metadata.checked ? "✓" : ""}</span><span class="mindmap-todo-content">${metadata.richTextHtml ?? escapeHtml(topic)}</span></span>`;
  }
  if (metadata.type === "quote") {
    return `<span class="mindmap-quote-node"><span class="mindmap-quote-body">${metadata.quoteBodyHtml || "&nbsp;"}</span><span class="mindmap-quote">${metadata.richTextHtml ?? escapeHtml(topic)}</span></span>`;
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
