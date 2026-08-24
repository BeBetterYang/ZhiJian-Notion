import {
  normalizeEmail,
  readJsonBody,
  readWorkspace,
  sendJson,
  upsertWorkspace,
} from "./_workspaceStorage.js";

/* global URL */

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      const url = new URL(request.url, "http://localhost");
      const email = normalizeEmail(url.searchParams.get("email"));
      if (!email) return sendJson(response, 400, { error: "缺少邮箱。" });
      return sendJson(response, 200, await readWorkspace(email) ?? {});
    }

    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const email = normalizeEmail(body.email);
      if (!email) return sendJson(response, 400, { error: "缺少邮箱。" });
      await upsertWorkspace(email, {
        profile: body.profile,
        nodes: body.nodes,
        documents: body.documents,
      });
      return sendJson(response, 200, { ok: true });
    }

    response.setHeader("Allow", "GET, PUT");
    return sendJson(response, 405, { error: "不支持的请求方法。" });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "服务器保存失败。",
    });
  }
}
