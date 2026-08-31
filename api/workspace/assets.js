import { randomUUID } from "node:crypto";
import { readJsonBody, readRawBody, registerAsset, sendJson } from "../_workspaceStorage.js";
import { downloadRemoteImage } from "../_remoteImageImport.js";
import { requireAuthenticatedUser } from "../_supabaseAuth.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") return sendJson(response, 405, { error: "不支持的请求方法。" });
    const user = await requireAuthenticatedUser(request);
    const mimeType = String(request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (mimeType === "application/json") {
      const body = await readJsonBody(request);
      const remoteImage = await downloadRemoteImage(body.url, body.name);
      const assetId = randomUUID();
      const storagePath = `${user.id}/${assetId}${remoteImage.extension}`;
      const asset = await registerAsset({
        assetId,
        userId: user.id,
        storagePath,
        fileName: remoteImage.fileName,
        mimeType: remoteImage.mimeType,
        byteSize: remoteImage.bytes.length,
        bytes: remoteImage.bytes,
      });
      return sendJson(response, 201, { ...asset, name: remoteImage.fileName });
    }
    if (!ALLOWED_TYPES.has(mimeType)) return sendJson(response, 415, { error: "仅支持 JPG、PNG、GIF、WebP 或 AVIF 图片。" });
    const bytes = await readRawBody(request);
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return sendJson(response, 413, { error: "图片大小必须在 10MB 以内。" });
    const assetId = randomUUID();
    const fileName = decodeURIComponent(String(request.headers["x-file-name"] ?? "图片"));
    const extension = extensionForMimeType(mimeType);
    const storagePath = `${user.id}/${assetId}${extension}`;
    return sendJson(response, 201, await registerAsset({ assetId, userId: user.id, storagePath, fileName, mimeType, byteSize: bytes.length, bytes }));
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, { error: error instanceof Error ? error.message : "图片上传失败。" });
  }
}

function extensionForMimeType(type) {
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif" })[type] ?? "";
}
