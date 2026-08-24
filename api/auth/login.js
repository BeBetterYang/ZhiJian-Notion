import { authSessionFromPayload, supabaseAuthRequest } from "../_supabaseAuth.js";
import { readJsonBody, sendJson } from "../_workspaceStorage.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }

    const body = await readJsonBody(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return sendJson(response, 400, { error: "请输入邮箱和密码。" });

    const payload = await supabaseAuthRequest("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const session = authSessionFromPayload(payload);
    if (!session) return sendJson(response, 401, { error: "登录失败，请检查邮箱或密码。" });
    return sendJson(response, 200, { session });
  } catch (error) {
    return sendJson(response, 401, {
      error: error instanceof Error ? error.message : "登录失败，请重试。",
    });
  }
}
