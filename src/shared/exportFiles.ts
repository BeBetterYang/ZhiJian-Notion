/**
 * 一张拍好的图，连同它该配的底色。
 *
 * 底色跟着图一起走，而不是在写文件时另外定一次：导图的画布颜色是主题的一部分，而
 * PDF 那一步已经离开了导图视图（`withExportView` 在 `finally` 里就切回去了），到那时
 * 再去量画布已经量不到了。
 */
export interface CapturedImage {
  blob: Blob;
  background: string;
}

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

export async function captureOutlinePng(): Promise<CapturedImage> {
  const element = document.querySelector<HTMLElement>(".outline-panel .bn-container");
  if (!element) throw new Error("大纲视图尚未准备好。");
  await document.fonts?.ready;
  const { toBlob } = await import("html-to-image");
  const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width));
  const height = outlineCaptureHeight(element);
  const pixelRatio = Math.min(2, 15_000 / Math.max(width, height));
  const blob = await toBlob(element, {
    backgroundColor: PAPER_WHITE,
    cacheBust: true,
    width,
    height,
    pixelRatio,
    style: {
      height: `${height}px`,
      // The reading column is centred on screen with `margin-inline: auto`, and Chrome
      // reports that as the used value — 350px a side on a wide window. html-to-image
      // copies computed styles onto its clone, where the box is exactly as wide as the
      // picture, so those margins survive as real ones and push the whole document off
      // the right edge. Stating zero here puts the column back in the frame, centred by
      // the editor's own symmetric padding.
      margin: "0",
      maxWidth: "none",
      overflow: "visible",
      width: `${width}px`,
    },
    filter: (node) => !(node instanceof Element) || !node.matches(
      ".bn-side-menu, .bn-formatting-toolbar, .bn-slash-menu, .bn-table-handle, .bn-resize-handle",
    ),
  });
  if (!blob) throw new Error("大纲图片生成失败。");
  return { blob, background: PAPER_WHITE };
}

/**
 * How tall the picture has to be to hold the document and nothing else.
 *
 * The editor is stretched to fill the panel (`min-height: 100%`) and keeps a run of
 * empty space below the last row for clicking into, which in a picture is just blank
 * paper — and in the PDF, an extra near-empty page. So the last row's own bottom is
 * measured and given the same air as the top instead, falling back to the box when
 * there is no row to measure.
 */
function outlineCaptureHeight(element: HTMLElement) {
  const box = Math.max(element.scrollHeight, element.getBoundingClientRect().height);
  const rows = element.querySelectorAll<HTMLElement>(".bn-editor > .bn-block-group > .bn-block-outer");
  const last = rows[rows.length - 1];
  if (!last) return Math.ceil(box);
  const content = last.getBoundingClientRect().bottom - element.getBoundingClientRect().top;
  return Math.ceil(Math.min(box, content + OUTLINE_CAPTURE_TAIL));
}

const OUTLINE_CAPTURE_TAIL = 24;

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
export async function captureMindMapPng(): Promise<CapturedImage> {
  const canvas = document.querySelector<HTMLElement>(".mindmap-canvas .map-canvas");
  const nodes = canvas?.querySelector<HTMLElement>("me-nodes");
  if (!canvas || !nodes) throw new Error("思维导图尚未准备好。");
  await document.fonts?.ready;
  const { toBlob } = await import("html-to-image");
  const background = mindMapCaptureBackground(canvas);
  const width = Math.ceil(Math.max(nodes.scrollWidth, nodes.getBoundingClientRect().width));
  const height = Math.ceil(Math.max(nodes.scrollHeight, nodes.getBoundingClientRect().height));
  const pixelRatio = Math.min(2, 15_000 / Math.max(width, height));
  const blob = await toBlob(canvas, {
    backgroundColor: background,
    cacheBust: true,
    width,
    height,
    pixelRatio,
    style: {
      height: `${height}px`,
      margin: "0",
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
  return { blob, background };
}

const PAPER_WHITE = "#ffffff";

/**
 * 主题给导图定的画布颜色。
 *
 * 主题把它画在 `.map-container` 上（mind-elixir 的 `--bgcolor`），而这里取景的是它
 * 里面的 `.map-canvas`——底色本身不在画面里。以前这里写死白色，于是深色主题导出成
 * 白纸配浅色字，几乎看不见；浅色主题也丢掉那层米白或浅灰的底。从容器上量一次现用的
 * 颜色，导出的就是屏幕上那一张。
 *
 * 量出来的是 `rgb(...)`，这里换成十六进制：同一个值还要交给 jsPDF 铺页面底色，而
 * `setFillColor` 认的是十六进制。
 */
function mindMapCaptureBackground(canvas: HTMLElement) {
  const container = canvas.closest<HTMLElement>(".map-container");
  return toHexColor(container ? window.getComputedStyle(container).backgroundColor : "") ?? PAPER_WHITE;
}

function toHexColor(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const channels = color.match(/^rgba?\(([^)]+)\)$/i)?.[1].split(",").map((part) => Number.parseFloat(part));
  if (!channels || channels.length < 3 || channels.some((channel) => !Number.isFinite(channel))) return null;
  // A fully transparent canvas is the browser's default, not a colour anyone chose.
  if (channels.length > 3 && channels[3] === 0) return null;
  return `#${channels.slice(0, 3).map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 图片装进 PDF。
 *
 * 页面底色跟着图走，而不是一律白纸：横放的导图是整张居中缩放的，四周留白如果是白的，
 * 深色主题就成了白框里嵌一块深色，主题也就没导出来。
 */
export async function imageBlobToPdf({ blob, background }: CapturedImage, layout: "outline" | "mindmap") {
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
    const paintPage = () => {
      if (background === PAPER_WHITE) return;
      pdf.setFillColor(background);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
    };

    if (landscape) {
      const scale = Math.min(usableWidth / image.width, usableHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      paintPage();
      pdf.addImage(await imageSliceDataUrl(image, 0, image.height, background), "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
      return pdf.output("blob");
    }

    const scale = usableWidth / image.width;
    const sourcePageHeight = usableHeight / scale;
    let sourceY = 0;
    let page = 0;
    while (sourceY < image.height) {
      const sliceHeight = Math.min(sourcePageHeight, image.height - sourceY);
      if (page > 0) pdf.addPage();
      paintPage();
      const dataUrl = await imageSliceDataUrl(image, sourceY, sliceHeight, background);
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

async function imageSliceDataUrl(image: DecodedImage, sourceY: number, sourceHeight: number, background: string) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = Math.max(1, Math.ceil(sourceHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建导出画布。");
  // JPEG 没有透明通道，所以底下先铺一层主题的画布色，而不是一律白。
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.source, 0, sourceY, image.width, sourceHeight, 0, 0, image.width, sourceHeight);
  return canvas.toDataURL("image/jpeg", 0.94);
}
