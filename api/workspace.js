import {
  readJsonBody,
  readWorkspace,
  sendJson,
  upsertWorkspace,
} from "./_workspaceStorage.js";
import { requireAuthenticatedUser } from "./_supabaseAuth.js";

export default async function handler(request, response) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (request.method === "GET") {
      return sendJson(response, 200, await readWorkspace(user.id));
    }

    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      await upsertWorkspace(user.id, {
        profile: body.profile,
        preferences: body.preferences,
        nodes: body.nodes,
        trash: body.trash,
      });
      return sendJson(response, 200, { ok: true });
    }

    response.setHeader("Allow", "GET, PUT");
    return sendJson(response, 405, { error: "不支持的请求方法。" });
  } catch (error) {
    return sendJson(response, error.statusCode ?? 500, {
      error: error instanceof Error ? error.message : "服务器保存失败。",
    });
  }
}
