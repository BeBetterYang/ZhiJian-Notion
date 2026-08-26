import { authSessionFromPayload, supabaseAuthRequest } from "../_supabaseAuth.js";
import { readJsonBody, sendJson } from "../_workspaceStorage.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }

    const body = await readJsonBody(request);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    if (!refreshToken) return sendJson(response, 400, { error: "登录状态已过期，请重新登录。" });

    const payload = await supabaseAuthRequest("token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const session = authSessionFromPayload(payload);
    if (!session) return sendJson(response, 401, { error: "登录状态已过期，请重新登录。" });
    return sendJson(response, 200, { session });
  } catch (error) {
    return sendJson(response, 401, {
      error: error instanceof Error ? error.message : "登录状态刷新失败，请重新登录。",
    });
  }
}
