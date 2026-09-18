import { richTextToPlainText, type ZhiJianNode, type ZhiJianTree } from "../../core/tree";

export const AI_DOCUMENT_CONTEXT_MAX_CHARS = 80_000;

export interface SerializedAIContext {
  title: string;
  content: string;
  nodeCount: number;
  charCount: number;
  truncated: boolean;
}

export function serializeTreeForAI(tree: ZhiJianTree): SerializedAIContext {
  const root = tree.nodes[tree.rootId];
  const lines: string[] = [];
  let nodeCount = 0;
  if (root) appendNode(tree, root, 0, lines, () => { nodeCount += 1; });
  const fullContent = lines.join("\n");
  const chars = Array.from(fullContent);
  const truncated = chars.length > AI_DOCUMENT_CONTEXT_MAX_CHARS;
  return {
    title: root ? richTextToPlainText(root.content).trim() : "",
    content: chars.slice(0, AI_DOCUMENT_CONTEXT_MAX_CHARS).join(""),
    nodeCount,
    charCount: chars.length,
    truncated,
  };
}

function appendNode(tree: ZhiJianTree, node: ZhiJianNode, depth: number, lines: string[], count: () => void) {
  count();
  const text = richTextToPlainText(node.content).trim();
  const prefix = depth === 0 ? "" : `${"  ".repeat(depth - 1)}- `;
  const kind = node.type === "todo" ? `[${node.props?.checked ? "x" : " "}] ` : "";
  lines.push(`${prefix}${kind}${text || "（空节点）"}`);
  if (node.description) lines.push(`${"  ".repeat(depth + 1)}> ${richTextToPlainText(node.description).trim()}`);
  for (const block of node.blocks ?? []) {
    if (block.type === "quote") {
      lines.push(`${"  ".repeat(depth + 1)}> ${richTextToPlainText(block.content).trim()}`);
    } else {
      const caption = block.image.caption?.trim();
      lines.push(`${"  ".repeat(depth + 1)}[图片${caption ? `：${caption}` : ""}]`);
    }
  }
  if (node.type === "table") {
    for (const row of node.props?.table?.rows ?? []) {
      lines.push(`${"  ".repeat(depth + 1)}| ${row.map((cell) => richTextToPlainText(cell.content).trim()).join(" | ")} |`);
    }
  }
  for (const childId of node.children) {
    const child = tree.nodes[childId];
    if (child) appendNode(tree, child, depth + 1, lines, count);
  }
}
