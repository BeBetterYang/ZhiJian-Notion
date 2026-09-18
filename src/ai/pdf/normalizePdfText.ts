const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_PUNCTUATION = /^[\u3000-\u303f\uff00-\uff65]/;

export interface PdfTextItemLike {
  str?: string;
  hasEOL?: boolean;
  transform?: Array<unknown>;
}

function isCjk(value: string) {
  return CJK_CHAR.test(value);
}

function shouldJoinWithoutSpace(left: string, right: string) {
  const leftChar = left.at(-1) ?? "";
  const rightChar = right.at(0) ?? "";
  return (isCjk(leftChar) && isCjk(rightChar)) || CJK_PUNCTUATION.test(rightChar)
    || /[([{「『【]$/.test(leftChar) || /^[,.;:!?%)\]}，。！？；：、）】》」』]/.test(rightChar);
}

function appendText(line: string, value: string) {
  if (!value) return line;
  if (!line || !line.trim()) return value;
  if (/\s$/.test(line) || /^\s/.test(value) || shouldJoinWithoutSpace(line, value)) return line + value;
  return `${line} ${value}`;
}

function lineY(item: PdfTextItemLike) {
  const y = item.transform?.[5];
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

/**
 * Rebuilds a readable page without trying to reproduce the PDF layout.
 * PDF.js commonly returns one item per glyph for Chinese; the CJK join rule
 * prevents those items from turning into `市 场 营 销`.
 */
export function reconstructPdfPageText(items: PdfTextItemLike[]) {
  const lines: Array<{ y: number | null; text: string }> = [];
  let current: { y: number | null; text: string } | null = null;

  for (const item of items) {
    const value = typeof item.str === "string" ? item.str : "";
    if (!value && !item.hasEOL) continue;
    const y = lineY(item);
    const sameLine = current && (y === null || current.y === null || Math.abs(current.y - y) <= 2.5);
    if (!current || !sameLine) {
      current = { y, text: "" };
      lines.push(current);
    }
    current.text = appendText(current.text, value);
    if (item.hasEOL) current = null;
  }

  return normalizePdfText(lines.map((line) => line.text).join("\n"));
}

export function normalizePdfText(value: string) {
  const withoutControls = [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return (code > 0x1f && code !== 0x7f) || code === 9 || code === 10 || code === 13;
  }).join("");
  return withoutControls
    .replace(/\r\n?/g, "\n")
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .reduce<string[]>((lines, line) => {
      if (!line && lines.at(-1) === "") return lines;
      lines.push(line);
      return lines;
    }, [])
    .join("\n")
    .trim();
}

export function pageTextLabel(page: number, text: string) {
  return `[第 ${page} 页]\n${text}`.trim();
}
