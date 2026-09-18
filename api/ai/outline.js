import { readJsonBody, sendJson } from "../_workspaceStorage.js";
import { requireAuthenticatedUser } from "../_supabaseAuth.js";
import { generateAIOutline } from "../_aiOutline.js";

export default async function handler(request, response) {
  try {
    await requireAuthenticatedUser(request);
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }
    const draft = await generateAIOutline(await readJsonBody(request));
    return sendJson(response, 200, draft);
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, {
      error: error instanceof Error ? error.message : "AI 生成失败，请稍后重试。",
    });
  }
}
