import {
  readJsonBody,
  sendJson,
  saveWorkspaceDocument,
  deleteWorkspaceDocuments,
} from "../../_workspaceStorage.js";
import { requireAuthenticatedUser } from "../../_supabaseAuth.js";

export default async function handler(request, response) {
  try {
    const user = await requireAuthenticatedUser(request);
    const fileId = request.query?.fileId;
    const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;

    if (request.method === "DELETE") {
      if (!normalizedFileId) return sendJson(response, 400, { error: "缺少文档 ID。" });
      await deleteWorkspaceDocuments(user.id, [normalizedFileId]);
      return sendJson(response, 200, { ok: true });
    }

    if (request.method !== "PUT") {
      response.setHeader("Allow", "PUT, DELETE");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }

    const body = await readJsonBody(request);
    if (!normalizedFileId || !body.tree || !Number.isInteger(body.revision) || body.revision < 0) {
      return sendJson(response, 400, { error: "文档保存参数不完整。" });
    }

    const revision = await saveWorkspaceDocument(user.id, normalizedFileId, body.tree, body.revision);
    return sendJson(response, 200, { ok: true, revision });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, {
      error: error instanceof Error ? error.message : "服务器保存失败。",
    });
  }
}
