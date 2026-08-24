import { assertRegistrationCode, authSessionFromPayload, supabaseAuthRequest } from "../_supabaseAuth.js";
import { readJsonBody, sendJson } from "../_workspaceStorage.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }

    const body = await readJsonBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!name) return sendJson(response, 400, { error: "请输入用户名。" });
    if (!assertRegistrationCode(body.code)) return sendJson(response, 403, { error: "注册码不正确。" });
    if (!email || !password) return sendJson(response, 400, { error: "请输入邮箱和密码。" });

    const payload = await supabaseAuthRequest("signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: { name } }),
    });
    const session = authSessionFromPayload(payload);
    return sendJson(response, 200, session
      ? { session }
      : { message: "注册成功，请确认邮箱后登录。" });
  } catch (error) {
    return sendJson(response, 400, {
      error: error instanceof Error ? error.message : "注册失败，请重试。",
    });
  }
}
