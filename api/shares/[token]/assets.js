/* global process, console */

import { readWorkspaceDocument, sendJson, signAssetsForTree, supabaseRequest } from "../../_workspaceStorage.js";

export default async function handler(request, response) {
  const totalStartedAt = Date.now();
  try {
    if (request.method !== "GET") return sendJson(response, 405, { error: "不支持的请求方法。" });
    const token = String(request.query?.token ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(token)) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });

    const shareStartedAt = Date.now();
    const rows = await supabaseRequest(`workspace_document_shares?token=eq.${encodeURIComponent(token)}&enabled=eq.true&select=owner_user_id,file_id`, { method: "GET" });
    logTiming("share lookup", shareStartedAt);
    const share = Array.isArray(rows) ? rows[0] : null;
    if (!share) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });

    const documentStartedAt = Date.now();
    const document = await readWorkspaceDocument(share.owner_user_id, share.file_id);
    logTiming("document fetch", documentStartedAt);
    if (!document?.tree) return sendJson(response, 404, { error: "分享的文档已不存在。" });

    const signingStartedAt = Date.now();
    const assets = await signAssetsForTree(document.tree, share.owner_user_id);
    logTiming("asset signing", signingStartedAt);
    return sendJson(response, 200, { assets });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, { error: error instanceof Error ? error.message : "无法读取分享图片。" });
  } finally {
    logTiming("total share assets API", totalStartedAt);
  }
}

function logTiming(label, startedAt) {
  if (process.env.NODE_ENV === "development") console.info(`[share] ${label}: ${Date.now() - startedAt}ms`);
}
