import { randomUUID } from "node:crypto";
import { readJsonBody, sendJson, supabaseRequest } from "../../_workspaceStorage.js";
import { requireAuthenticatedUser } from "../../_supabaseAuth.js";

const TABLE = "workspace_document_shares";

export default async function handler(request, response) {
  try {
    const user = await requireAuthenticatedUser(request);
    const fileId = decodeURIComponent(String(request.query?.fileId ?? ""));
    if (!fileId) return sendJson(response, 400, { error: "缺少文档 ID。" });
    if (request.method === "GET") return sendJson(response, 200, await findShare(user.id, fileId) ?? { enabled: false });
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const current = await findShare(user.id, fileId);
      const share = {
        token: current?.token ?? randomUUID(),
        owner_user_id: user.id,
        file_id: fileId,
        enabled: body.enabled === true,
        updated_at: new Date().toISOString(),
      };
      await supabaseRequest(TABLE, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(share) });
      return sendJson(response, 200, { token: share.token, enabled: share.enabled });
    }
    response.setHeader("Allow", "GET, PUT");
    return sendJson(response, 405, { error: "不支持的请求方法。" });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, { error: error instanceof Error ? error.message : "分享设置失败。" });
  }
}

async function findShare(userId, fileId) {
  const rows = await supabaseRequest(`${TABLE}?owner_user_id=eq.${encodeURIComponent(userId)}&file_id=eq.${encodeURIComponent(fileId)}&select=token,enabled`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] ?? null : null;
}
