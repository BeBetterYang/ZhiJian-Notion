const ICON_SIZE = 256;

export async function cropDocumentIcon(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const left = (image.naturalWidth - side) / 2;
    const top = (image.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理图标图片。");
    context.drawImage(image, left, top, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) throw new Error("无法生成图标图片。");
    const name = file.name.replace(/\.[^.]+$/, "") || "document-icon";
    return new File([blob], `${name}.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取图标图片。"));
    image.src = url;
  });
}
