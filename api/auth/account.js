import { supabaseAuthRequest } from "../_supabaseAuth.js";
import { readJsonBody, sendJson } from "../_workspaceStorage.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "PUT") return sendJson(response, 405, { error: "不支持的请求方法。" });
    const header = request.headers.authorization ?? request.headers.Authorization ?? "";
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return sendJson(response, 401, { error: "请先登录。" });
    const body = await readJsonBody(request);
    const update = {};
    if (typeof body.email === "string" && body.email.trim()) update.email = body.email.trim().toLowerCase();
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6) return sendJson(response, 400, { error: "密码至少需要 6 个字符。" });
      update.password = body.password;
    }
    if (typeof body.name === "string" && body.name.trim()) update.data = { name: body.name.trim() };
    if (!Object.keys(update).length) return sendJson(response, 400, { error: "没有需要修改的账号信息。" });
    const user = await supabaseAuthRequest("user", { method: "PUT", token, body: JSON.stringify(update) });
    return sendJson(response, 200, { ok: true, user });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 400, { error: error instanceof Error ? error.message : "账号修改失败。" });
  }
}
