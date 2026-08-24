import {
  readJsonBody,
  sendJson,
  upsertWorkspaceDocument,
} from "../../_workspaceStorage.js";
import { requireAuthenticatedUser } from "../../_supabaseAuth.js";

export default async function handler(request, response) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (request.method !== "PUT") {
      response.setHeader("Allow", "PUT");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }

    const body = await readJsonBody(request);
    const fileId = request.query?.fileId;
    const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;
    if (!normalizedFileId || !body.tree) {
      return sendJson(response, 400, { error: "文档保存参数不完整。" });
    }

    await upsertWorkspaceDocument(user.email, normalizedFileId, body.tree);
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, {
      error: error instanceof Error ? error.message : "服务器保存失败。",
    });
  }
}
