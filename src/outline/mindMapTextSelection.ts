import type { MindMapTextSelection } from "../mindmap/MindMapEditor";

interface TextRange {
  from: number;
  to: number;
}

export function resolveMindMapTextRange(
  blockId: string,
  blockRange: TextRange,
  selection: MindMapTextSelection | null,
): TextRange {
  if (!selection || selection.nodeId !== blockId) {
    return blockRange;
  }

  const startOffset = Math.min(selection.from, selection.to);
  const endOffset = Math.max(selection.from, selection.to);

  return {
    from: clamp(blockRange.from + startOffset, blockRange.from, blockRange.to),
    to: clamp(blockRange.from + endOffset, blockRange.from, blockRange.to),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
