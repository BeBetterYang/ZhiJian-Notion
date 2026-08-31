import { randomUUID } from "node:crypto";
import { readJsonBody, registerAsset, sendJson } from "../_workspaceStorage.js";
import { downloadRemoteImage } from "../_remoteImageImport.js";
import { requireAuthenticatedUser } from "../_supabaseAuth.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") return sendJson(response, 405, { error: "不支持的请求方法。" });
    const user = await requireAuthenticatedUser(request);
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
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, { error: error instanceof Error ? error.message : "外部图片导入失败。" });
  }
}
