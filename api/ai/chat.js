/* global process, AbortController */

import { readJsonBody, readWorkspaceDocument, sendJson } from "../../_workspaceStorage.js";
import { requireAuthenticatedUser } from "../../_supabaseAuth.js";
import { openAIChatStream, sse } from "../../_aiChatCore.js";

export default async function handler(request, response) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { error: "不支持的请求方法。" });
    }
    const body = await readJsonBody(request);
    if (typeof body.documentId !== "string" || !body.documentId.trim()) {
      return sendJson(response, 400, { error: "缺少文档 ID。" });
    }
    const document = await readWorkspaceDocument(user.id, body.documentId.trim());
    if (!document) return sendJson(response, 404, { error: "文档不存在。" });
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once?.("close", abortOnDisconnect);
    const stream = await openAIChatStream(body, process.env, controller.signal);
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    for await (const event of stream) response.write(event);
    response.end();
    response.off?.("close", abortOnDisconnect);
    return;
  } catch (error) {
    if (error?.name === "AbortError" || error?.code === 499) return response.end();
    if (response.headersSent) {
      response.write(sse("error", { message: error instanceof Error ? error.message : "AI 生成失败，请稍后重试。" }));
      return response.end();
    }
    return sendJson(response, error?.statusCode ?? 500, {
      error: error instanceof Error ? error.message : "AI 生成失败，请稍后重试。",
    });
  }
}
