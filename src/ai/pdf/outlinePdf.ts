import type { PdfSourceOutlineNode } from "../types";

export interface ResolvedPdfOutlineItem {
  title?: string;
  page?: number | null;
  items?: ResolvedPdfOutlineItem[];
}

function firstChildPage(children: PdfSourceOutlineNode[]) {
  return children.find((child) => child.page >= 1)?.page ?? null;
}

export function normalizePdfOutline(
  items: ResolvedPdfOutlineItem[] | null | undefined,
  pageCount: number,
  depth = 0,
): PdfSourceOutlineNode[] {
  if (!items?.length) return [];
  const output: PdfSourceOutlineNode[] = [];
  for (const item of items) {
    const children = normalizePdfOutline(item.items, pageCount, depth + 1);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const resolvedPage = typeof item.page === "number" && item.page >= 1 && item.page <= pageCount
      ? item.page
      : firstChildPage(children);
    if (!title) {
      output.push(...children);
      continue;
    }
    if (!resolvedPage) continue;
    output.push({
      title,
      page: resolvedPage,
      depth,
      ...(children.length ? { children } : {}),
    });
  }
  return output;
}
