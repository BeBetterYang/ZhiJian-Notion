import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerResponse } from "node:http";
import type { Connect } from "vite";

const DATA_DIR = path.resolve(".zhijian-server-data", "users");

export default defineConfig({
  plugins: [react(), workspaceServerPlugin()],
  build: {
    rollupOptions: {
      input: {
        editor: "index.html",
        workspace: "workspace.html",
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});

function workspaceServerPlugin() {
  const attachApi = (middlewares: Connect.Server) => {
    middlewares.use("/api/workspace", async (request, response, next) => {
      try {
        if (request.method === "GET") {
          const url = new URL(request.url ?? "", "http://localhost");
          const email = normalizeEmail(url.searchParams.get("email"));
          if (!email) return sendJson(response, 400, { error: "缺少邮箱。" });
          const record = await readUserRecord(email);
          return sendJson(response, 200, withoutViewState(record) ?? {});
        }

        if (request.method === "PUT" && request.url?.startsWith("/documents/")) {
          const fileId = decodeURIComponent(request.url.slice("/documents/".length).split("?")[0] ?? "");
          const body = await readJsonBody(request);
          const email = normalizeEmail(body.email);
          if (!email || !fileId || !body.tree) return sendJson(response, 400, { error: "文档保存参数不完整。" });
          const current = withoutViewState(await readUserRecord(email));
          const next = {
            ...current,
            documents: { ...(current?.documents ?? {}), [fileId]: body.tree },
            updatedAt: Date.now(),
          };
          await writeUserRecord(email, next);
          return sendJson(response, 200, { ok: true });
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          const email = normalizeEmail(body.email);
          if (!email) return sendJson(response, 400, { error: "缺少邮箱。" });
          const current = withoutViewState(await readUserRecord(email));
          const next = {
            ...current,
            profile: body.profile ?? current?.profile,
            nodes: body.nodes ?? current?.nodes,
            documents: body.documents ?? current?.documents,
            updatedAt: Date.now(),
          };
          await writeUserRecord(email, next);
          return sendJson(response, 200, { ok: true });
        }

        return next();
      } catch (error) {
        return sendJson(response, 500, {
          error: error instanceof Error ? error.message : "服务器保存失败。",
        });
      }
    });
  };

  return {
    name: "zhijian-workspace-server",
    configureServer(server: { middlewares: Connect.Server }) {
      attachApi(server.middlewares);
    },
    configurePreviewServer(server: { middlewares: Connect.Server }) {
      attachApi(server.middlewares);
    },
  };
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim())
    ? value.trim().toLowerCase()
    : "";
}

async function readJsonBody(request: Connect.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

async function readUserRecord(email: string) {
  try {
    return JSON.parse(await readFile(userFilePath(email), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeUserRecord(email: string, record: Record<string, unknown>) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(userFilePath(email), JSON.stringify(record, null, 2), "utf8");
}

function userFilePath(email: string) {
  return path.join(DATA_DIR, `${Buffer.from(email).toString("base64url")}.json`);
}

function withoutViewState(record: Record<string, unknown> | null) {
  if (!record) return null;
  const rest = { ...record };
  delete rest.viewState;
  return rest;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
