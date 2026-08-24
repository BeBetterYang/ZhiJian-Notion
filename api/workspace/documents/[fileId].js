import {
  normalizeEmail,
  readJsonBody,
  sendJson,
  upsertWorkspaceDocument,
} from "../../_workspaceStorage.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "PUT") {
      response.setHeader("Allow", "PUT");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }

    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    const fileId = request.query?.fileId;
    const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;
    if (!email || !normalizedFileId || !body.tree) {
      return sendJson(response, 400, { error: "文档保存参数不完整。" });
    }

    await upsertWorkspaceDocument(email, normalizedFileId, body.tree);
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "服务器保存失败。",
    });
  }
}
