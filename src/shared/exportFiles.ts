export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function captureOutlinePng() {
  const element = document.querySelector<HTMLElement>(".outline-panel .bn-container");
  if (!element) throw new Error("大纲视图尚未准备好。");
  await document.fonts?.ready;
  const { toBlob } = await import("html-to-image");
  const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width));
  const height = Math.ceil(Math.max(element.scrollHeight, element.getBoundingClientRect().height));
  const pixelRatio = Math.min(2, 15_000 / Math.max(width, height));
  const blob = await toBlob(element, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    width,
    height,
    pixelRatio,
    style: {
      height: `${height}px`,
      maxWidth: "none",
      overflow: "visible",
      width: `${width}px`,
    },
    filter: (node) => !(node instanceof Element) || !node.matches(
      ".bn-side-menu, .bn-formatting-toolbar, .bn-slash-menu, .bn-table-handle, .bn-resize-handle",
    ),
  });
  if (!blob) throw new Error("大纲图片生成失败。");
  return blob;
}

/**
 * The map, photographed as it is drawn rather than re-drawn.
 *
 * mind-elixir's own `exportPng` rebuilds the map into an SVG from what it knows
 * about it, which is a plain string of text per topic — our nodes are React-rendered
 * HTML with quotes, pictures and tables inside, so its picture came out as a
 * different document, and on a map carrying attachments it failed outright. Reading
 * the live canvas instead gives back exactly what is on screen, connectors and
 * summaries included, since those are DOM too.
 *
 * The canvas is captured with its own pan transform removed and sized to the node
 * layer, so the picture holds the whole map rather than the part currently scrolled
 * into view.
 */
export async function captureMindMapPng() {
  const canvas = document.querySelector<HTMLElement>(".mindmap-canvas .map-canvas");
  const nodes = canvas?.querySelector<HTMLElement>("me-nodes");
  if (!canvas || !nodes) throw new Error("思维导图尚未准备好。");
  await document.fonts?.ready;
  const { toBlob } = await import("html-to-image");
  const width = Math.ceil(Math.max(nodes.scrollWidth, nodes.getBoundingClientRect().width));
  const height = Math.ceil(Math.max(nodes.scrollHeight, nodes.getBoundingClientRect().height));
  const pixelRatio = Math.min(2, 15_000 / Math.max(width, height));
  const blob = await toBlob(canvas, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    width,
    height,
    pixelRatio,
    style: {
      height: `${height}px`,
      transform: "none",
      transformOrigin: "0 0",
      width: `${width}px`,
    },
    // Everything that is only on screen because a pointer is somewhere: the inline
    // editor, mind-elixir's own text box, the drag ghost and the rubber band.
    filter: (node) => !(node instanceof Element) || !node.matches(
      ".mindmap-node-editor, .bn-formatting-toolbar, .bn-slash-menu, #input-box, .selection-area, .circle, .mind-elixir-ghost",
    ),
  });
  if (!blob) throw new Error("思维导图图片生成失败。");
  return blob;
}

export async function imageBlobToPdf(blob: Blob, layout: "outline" | "mindmap") {
  const { jsPDF } = await import("jspdf");
  const image = await decodeImage(blob);
  try {
    const landscape = layout === "mindmap";
    const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    if (landscape) {
      const scale = Math.min(usableWidth / image.width, usableHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      pdf.addImage(await imageSliceDataUrl(image, 0, image.height), "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
      return pdf.output("blob");
    }

    const scale = usableWidth / image.width;
    const sourcePageHeight = usableHeight / scale;
    let sourceY = 0;
    let page = 0;
    while (sourceY < image.height) {
      const sliceHeight = Math.min(sourcePageHeight, image.height - sourceY);
      if (page > 0) pdf.addPage();
      const dataUrl = await imageSliceDataUrl(image, sourceY, sliceHeight);
      pdf.addImage(dataUrl, "JPEG", margin, margin, usableWidth, sliceHeight * scale, undefined, "FAST");
      sourceY += sliceHeight;
      page += 1;
    }
    return pdf.output("blob");
  } finally {
    image.close?.();
  }
}

type DecodedImage = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("导出图片读取失败。"));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageSliceDataUrl(image: DecodedImage, sourceY: number, sourceHeight: number) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = Math.max(1, Math.ceil(sourceHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建导出画布。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.source, 0, sourceY, image.width, sourceHeight, 0, 0, image.width, sourceHeight);
  return canvas.toDataURL("image/jpeg", 0.94);
}
