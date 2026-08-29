import { readJsonBody, readWorkspace, sendJson, supabaseRequest, upsertWorkspace } from "../_workspaceStorage.js";
import { requireAuthenticatedUser } from "../_supabaseAuth.js";

export default async function handler(request, response) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (request.method !== "POST") return sendJson(response, 405, { error: "不支持的请求方法。" });
    const body = await readJsonBody(request);
    const token = typeof body.token === "string" ? body.token : "";
    const rows = await supabaseRequest(`workspace_document_shares?token=eq.${encodeURIComponent(token)}&enabled=eq.true&select=owner_email,file_id`, { method: "GET" });
    const share = Array.isArray(rows) ? rows[0] : null;
    if (!share) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });
    const source = await readWorkspace(share.owner_email);
    const tree = source?.documents?.[share.file_id];
    const sourceFile = source?.nodes?.find((node) => node.id === share.file_id && node.type === "file");
    if (!tree || !sourceFile) return sendJson(response, 404, { error: "分享的文档已不存在。" });
    const current = await readWorkspace(user.email) ?? {};
    const id = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nodes = (current.nodes ?? []).map((node) => node.parentId === null ? { ...node, order: node.order + 1 } : node);
    nodes.push({ id, title: sourceFile.title || "无标题", type: "file", parentId: null, order: 0, favorite: false, openedAt: Date.now() });
    await upsertWorkspace(user.email, { nodes, documents: { ...(current.documents ?? {}), [id]: tree } });
    return sendJson(response, 200, { ok: true, fileId: id });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, { error: error instanceof Error ? error.message : "保存分享文档失败。" });
  }
}
