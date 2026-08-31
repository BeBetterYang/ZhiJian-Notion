import { cleanupUnreferencedAssets, sendJson } from "../_workspaceStorage.js";
import { requireAuthenticatedUser } from "../_supabaseAuth.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }
    const user = await requireAuthenticatedUser(request);
    return sendJson(response, 200, await cleanupUnreferencedAssets(user.id));
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, { error: error instanceof Error ? error.message : "图片清理失败。" });
  }
}
