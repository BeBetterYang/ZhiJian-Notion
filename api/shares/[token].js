import { readWorkspaceState, readWorkspaceDocument, sendJson, signAssetsForTree, supabaseRequest } from "../_workspaceStorage.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "GET") return sendJson(response, 405, { error: "不支持的请求方法。" });
    const token = String(request.query?.token ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(token)) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });
    const rows = await supabaseRequest(`workspace_document_shares?token=eq.${encodeURIComponent(token)}&enabled=eq.true&select=owner_user_id,file_id`, { method: "GET" });
    const share = Array.isArray(rows) ? rows[0] : null;
    if (!share) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });
    const [workspace, document] = await Promise.all([
      readWorkspaceState(share.owner_user_id),
      readWorkspaceDocument(share.owner_user_id, share.file_id),
    ]);
    const tree = document?.tree;
    const file = workspace?.nodes?.find((node) => node.id === share.file_id && node.type === "file");
    if (!tree || !file) return sendJson(response, 404, { error: "分享的文档已不存在。" });
    return sendJson(response, 200, { token, title: file.title || "无标题", tree, assets: await signAssetsForTree(tree, share.owner_user_id) });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, { error: error instanceof Error ? error.message : "无法读取分享文档。" });
  }
}
