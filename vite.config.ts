import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { loadEnv, type Connect } from "vite";

const DATA_DIR = path.resolve(".zhijian-server-data", "users");
const SHARES_FILE = path.resolve(".zhijian-server-data", "shares.json");
const REGISTRATION_CODE = "nihaozhijian";

export default defineConfig(({ mode }) => {
  const appEnv = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), workspaceServerPlugin(appEnv)],
    build: {
      rollupOptions: {
        input: {
          editor: "index.html",
          workspace: "workspace.html",
          share: "share.html",
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
    },
  };
});

function workspaceServerPlugin(appEnv: Record<string, string>) {
  const attachApi = (middlewares: Connect.Server) => {
    middlewares.use("/api/shares", async (request, response, next) => {
      if (request.method !== "GET") return next();
      const token = decodeURIComponent(request.url?.slice(1).split("?")[0] ?? "");
      const share = (await readLocalShares()).find((item) => item.token === token && item.enabled);
      if (!share) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });
      const workspace = withoutViewState(await readUserRecord(share.ownerEmail));
      const tree = readRecord(workspace?.documents)[share.fileId];
      const nodes = Array.isArray(workspace?.nodes) ? workspace.nodes : [];
      const file = nodes.find((node) => readRecord(node).id === share.fileId);
      if (!tree || !file) return sendJson(response, 404, { error: "分享的文档已不存在。" });
      return sendJson(response, 200, { token, title: String(readRecord(file).title || "无标题"), tree });
    });

    middlewares.use("/api/auth", async (request, response, next) => {
      try {
        if (request.method !== "POST") return next();
        if (request.url === "/login") {
          const body = await readJsonBody(request);
          const email = normalizeEmail(body.email);
          const password = typeof body.password === "string" ? body.password : "";
          if (!email || !password) return sendJson(response, 400, { error: "请输入邮箱和密码。" });
          const payload = await supabaseAuthRequest(appEnv, "token?grant_type=password", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });
          const session = authSessionFromPayload(payload);
          return sendJson(response, session ? 200 : 401, session ? { session } : { error: "登录失败，请检查邮箱或密码。" });
        }

        if (request.url === "/register") {
          const body = await readJsonBody(request);
          const name = typeof body.name === "string" ? body.name.trim() : "";
          const email = normalizeEmail(body.email);
          const password = typeof body.password === "string" ? body.password : "";
          if (!name) return sendJson(response, 400, { error: "请输入用户名。" });
          if (typeof body.code !== "string" || body.code.trim() !== REGISTRATION_CODE) {
            return sendJson(response, 403, { error: "注册码不正确。" });
          }
          if (!email || !password) return sendJson(response, 400, { error: "请输入邮箱和密码。" });
          const payload = await supabaseAuthRequest(appEnv, "signup", {
            method: "POST",
            body: JSON.stringify({ email, password, data: { name } }),
          });
          const session = authSessionFromPayload(payload);
          return sendJson(response, 200, session ? { session } : { message: "注册成功，请确认邮箱后登录。" });
        }

        return next();
      } catch (error) {
        return sendJson(response, 400, {
          error: error instanceof Error ? error.message : "认证失败，请重试。",
        });
      }
    });

    middlewares.use("/api/workspace", async (request, response, next) => {
      try {
        const user = await requireAuthenticatedUser(appEnv, request);
        if (request.url?.startsWith("/shares/")) {
          const fileId = decodeURIComponent(request.url.slice("/shares/".length).split("?")[0] ?? "");
          const shares = await readLocalShares();
          const current = shares.find((item) => item.ownerEmail === user.email && item.fileId === fileId);
          if (request.method === "GET") return sendJson(response, 200, current ? { token: current.token, enabled: current.enabled } : { enabled: false });
          if (request.method === "PUT") {
            const body = await readJsonBody(request);
            const next = { token: current?.token ?? randomUUID(), ownerEmail: user.email, fileId, enabled: body.enabled === true };
            await writeLocalShares([...shares.filter((item) => !(item.ownerEmail === user.email && item.fileId === fileId)), next]);
            return sendJson(response, 200, { token: next.token, enabled: next.enabled });
          }
        }

        if (request.url === "/import-share" && request.method === "POST") {
          const body = await readJsonBody(request);
          const share = (await readLocalShares()).find((item) => item.token === body.token && item.enabled);
          if (!share) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });
          const source = withoutViewState(await readUserRecord(share.ownerEmail));
          const tree = readRecord(source?.documents)[share.fileId];
          const sourceNodes = Array.isArray(source?.nodes) ? source.nodes : [];
          const sourceFile = sourceNodes.find((node) => readRecord(node).id === share.fileId);
          if (!tree || !sourceFile) return sendJson(response, 404, { error: "分享的文档已不存在。" });
          const current = withoutViewState(await readUserRecord(user.email)) ?? {};
          const id = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const nodes = (Array.isArray(current.nodes) ? current.nodes : []).map((node) => readRecord(node).parentId === null ? { ...readRecord(node), order: Number(readRecord(node).order) + 1 } : node);
          nodes.push({ id, title: String(readRecord(sourceFile).title || "无标题"), type: "file", parentId: null, order: 0, favorite: false, openedAt: Date.now() });
          await writeUserRecord(user.email, { ...current, nodes, documents: { ...readRecord(current.documents), [id]: tree }, updatedAt: Date.now() });
          return sendJson(response, 200, { ok: true, fileId: id });
        }

        if (request.method === "GET") {
          const record = await readUserRecord(user.email);
          return sendJson(response, 200, withoutViewState(record) ?? {});
        }

        if (request.method === "PUT" && request.url?.startsWith("/documents/")) {
          const fileId = decodeURIComponent(request.url.slice("/documents/".length).split("?")[0] ?? "");
          const body = await readJsonBody(request);
          if (!fileId || !body.tree) return sendJson(response, 400, { error: "文档保存参数不完整。" });
          const current = withoutViewState(await readUserRecord(user.email));
          const next = {
            ...current,
            documents: { ...(current?.documents ?? {}), [fileId]: body.tree },
            updatedAt: Date.now(),
          };
          await writeUserRecord(user.email, next);
          return sendJson(response, 200, { ok: true });
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          const current = withoutViewState(await readUserRecord(user.email));
          const next = {
            ...current,
            profile: body.profile ?? current?.profile,
            nodes: body.nodes ?? current?.nodes,
            trash: body.trash ?? current?.trash,
            documents: body.documents ?? current?.documents,
            updatedAt: Date.now(),
          };
          await writeUserRecord(user.email, next);
          return sendJson(response, 200, { ok: true });
        }

        return next();
      } catch (error) {
        return sendJson(response, statusCodeFromError(error) ?? 500, {
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

async function requireAuthenticatedUser(appEnv: Record<string, string>, request: Connect.IncomingMessage) {
  const header = request.headers.authorization ?? "";
  const accessToken = typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!accessToken) throw statusError("请先登录。", 401);
  const user = await supabaseAuthRequest(appEnv, "user", { method: "GET", token: accessToken });
  const email = normalizeEmail(readRecord(user).email);
  if (!email) throw statusError("登录状态无效。", 401);
  return { email };
}

async function supabaseAuthRequest(appEnv: Record<string, string>, pathname: string, init: RequestInit & { token?: string }) {
  const rawUrl = appEnv.SUPABASE_URL || appEnv.VITE_SUPABASE_URL || "";
  const url = rawUrl.trim().replace(/\/(?:rest|auth)\/v1\/?$/i, "").replace(/\/$/, "");
  const publishableKey = appEnv.SUPABASE_PUBLISHABLE_KEY || appEnv.VITE_SUPABASE_PUBLISHABLE_KEY || appEnv.SUPABASE_ANON_KEY || "";
  if (!url || !publishableKey) throw new Error("Supabase Auth 环境变量未配置。");
  const response = await fetch(`${url}/auth/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${init.token ?? publishableKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) as unknown : {};
  } catch {
    throw new Error(/^\s*<!doctype\s+html|^\s*<html/i.test(text)
      ? "Supabase Auth 返回了网页而不是数据，请检查 SUPABASE_URL。"
      : "Supabase Auth 返回的数据格式不正确。");
  }
  if (!response.ok) throw new Error(readSupabaseError(payload));
  return payload;
}

function authSessionFromPayload(payload: unknown) {
  const record = readRecord(payload);
  const user = readRecord(record.user);
  const email = normalizeEmail(user.email);
  const accessToken = typeof record.access_token === "string" ? record.access_token : "";
  if (!email || !accessToken) return null;
  const metadata = readRecord(user.user_metadata);
  const name = typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : displayNameFromEmail(email);
  return {
    email,
    name,
    userId: typeof user.id === "string" ? user.id : "",
    accessToken,
    refreshToken: typeof record.refresh_token === "string" ? record.refresh_token : "",
    expiresAt: typeof record.expires_at === "number" ? record.expires_at : undefined,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readSupabaseError(payload: unknown) {
  const record = readRecord(payload);
  for (const key of ["msg", "message", "error_description", "error"]) {
    if (typeof record[key] === "string") return record[key];
  }
  return "Supabase Auth 请求失败。";
}

function statusError(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

function statusCodeFromError(error: unknown) {
  return typeof error === "object" && error !== null && typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : null;
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

interface LocalShareRecord { token: string; ownerEmail: string; fileId: string; enabled: boolean }
async function readLocalShares(): Promise<LocalShareRecord[]> {
  try { return JSON.parse(await readFile(SHARES_FILE, "utf8")) as LocalShareRecord[]; } catch { return []; }
}

async function writeLocalShares(shares: LocalShareRecord[]) {
  await mkdir(path.dirname(SHARES_FILE), { recursive: true });
  await writeFile(SHARES_FILE, JSON.stringify(shares, null, 2), "utf8");
}

function userFilePath(email: string) {
  return path.join(DATA_DIR, `${Buffer.from(email).toString("base64url")}.json`);
}

function displayNameFromEmail(email: string) {
  const source = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "用户";
  return source.replace(/\b\w/g, (character) => character.toUpperCase());
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
