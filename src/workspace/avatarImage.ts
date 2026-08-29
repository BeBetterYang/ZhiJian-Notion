const MAX_AVATAR_SIZE = 256;
const AVATAR_QUALITY = 0.8;
const AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

/**
 * 头像跟着 profile 一起存进数据库，所以原图的 Base64 不能直接写进去——一张手机照片能占
 * 几 MB，每次工作区保存都要带上。这里先缩到 256×256 以内再编码成 WebP，容量通常只有几 KB，
 * 而头像最大也只显示到 40px 左右，看不出差别。
 */
export async function compressAvatarFile(file: File): Promise<string> {
  if (!AVATAR_MIME_TYPES.has(file.type)) throw new Error("头像只支持 JPG、PNG、GIF、WebP 或 AVIF 图片。");
  const bitmap = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_AVATAR_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("头像处理失败，请更换图片重试。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", AVATAR_QUALITY);
    // 不支持 WebP 编码的浏览器会安静地退回 PNG，那份数据依然可用，只是大一些。
    if (!dataUrl.startsWith("data:image/")) throw new Error("头像处理失败，请更换图片重试。");
    return dataUrl;
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari 曾经对部分格式抛错，退回 <img> 解码。
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener("error", () => reject(new Error("头像读取失败，请更换图片重试。")), { once: true });
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
