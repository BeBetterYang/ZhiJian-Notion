import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { loadEnv, type Connect } from "vite";

const DATA_DIR = path.resolve(".zhijian-server-data", "users");
const ASSETS_DIR = path.resolve(".zhijian-server-data", "assets");
const SHARES_FILE = path.resolve(".zhijian-server-data", "shares.json");
const REGISTRATION_CODE = "nihaozhijian";
const DOCUMENT_SCHEMA_VERSION = 1;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
    },
  };
});

function workspaceServerPlugin(appEnv: Record<string, string>) {
  const attachApi = (middlewares: Connect.Server) => {
    // An <img> tag cannot send an Authorization header, which is why production hands out
    // signed Storage URLs; the dev server serves the bytes unauthenticated instead — it only
    // ever holds local scratch data under `.zhijian-server-data`.
    middlewares.use("/api/workspace/assets", async (request, response, next) => {
      if (request.method !== "GET") return next();
      const assetId = decodeURIComponent(request.url?.slice(1).split("?")[0] ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(assetId)) return next();
      try {
        const meta = readRecord(JSON.parse(await readFile(assetMetaPath(assetId), "utf8")));
        const bytes = await readFile(assetBytesPath(assetId));
        response.statusCode = 200;
        response.setHeader("Content-Type", typeof meta.mimeType === "string" ? meta.mimeType : "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        return response.end(bytes);
      } catch {
        return sendJson(response, 404, { error: "图片不存在。" });
      }
    });

    middlewares.use("/api/shares", async (request, response, next) => {
      if (request.method !== "GET") return next();
      const totalStartedAt = Date.now();
      const [encodedToken = "", action = ""] = request.url?.slice(1).split("?")[0]?.split("/") ?? [];
      if (action && action !== "assets") return next();
      const token = decodeURIComponent(encodedToken);
      const shareStartedAt = Date.now();
      const share = (await readLocalShares()).find((item) => item.token === token && item.enabled);
      logLocalShareTiming("share lookup", shareStartedAt);
      if (!share) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });
      const documentStartedAt = Date.now();
      const owner = (await readUserRecord(share.ownerUserId)) ?? {};
      const tree = readRecord(readRecord(owner.documents)[share.fileId]).tree;
      logLocalShareTiming("document fetch", documentStartedAt);
      const nodes = Array.isArray(owner.nodes) ? owner.nodes : [];
      const file = nodes.find((node) => readRecord(node).id === share.fileId);
      if (!tree || !file) return sendJson(response, 404, { error: "分享的文档已不存在。" });
      if (action === "assets") {
        const signingStartedAt = Date.now();
        const assets = assetReferences(owner, [...collectAssetIds(tree)]);
        logLocalShareTiming("asset signing", signingStartedAt);
        logLocalShareTiming("total share assets API", totalStartedAt);
        return sendJson(response, 200, { assets });
      }
      logLocalShareTiming("total share API", totalStartedAt);
      return sendJson(response, 200, {
        token,
        title: String(readRecord(file).title || "无标题"),
        tree,
      });
    });

    middlewares.use("/api/auth", async (request, response, next) => {
      try {
        if (request.url === "/account" && request.method === "PUT") {
          const header = request.headers.authorization ?? "";
          const accessToken = typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
          if (!accessToken) return sendJson(response, 401, { error: "请先登录。" });
          const body = await readJsonBody(request);
          const update: Record<string, unknown> = {};
          if (typeof body.email === "string" && normalizeEmail(body.email)) update.email = normalizeEmail(body.email);
          if (typeof body.password === "string" && body.password) {
            if (body.password.length < 6) return sendJson(response, 400, { error: "密码至少 6 位。" });
            update.password = body.password;
          }
          if (typeof body.name === "string" && body.name.trim()) update.data = { name: body.name.trim() };
          if (!Object.keys(update).length) return sendJson(response, 400, { error: "没有需要修改的内容。" });
          const user = await supabaseAuthRequest(appEnv, "user", { method: "PUT", token: accessToken, body: JSON.stringify(update) });
          return sendJson(response, 200, { ok: true, user });
        }

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
          const current = shares.find((item) => item.ownerUserId === user.id && item.fileId === fileId);
          if (request.method === "GET") return sendJson(response, 200, current ? { token: current.token, enabled: current.enabled } : { enabled: false });
          if (request.method === "PUT") {
            const body = await readJsonBody(request);
            const next = { token: current?.token ?? randomUUID(), ownerUserId: user.id, fileId, enabled: body.enabled === true };
            await writeLocalShares([...shares.filter((item) => !(item.ownerUserId === user.id && item.fileId === fileId)), next]);
            return sendJson(response, 200, { token: next.token, enabled: next.enabled });
          }
        }

        if (request.url === "/assets" && request.method === "POST") {
          const mimeType = String(request.headers["content-type"] ?? "");
          if (!IMAGE_MIME_TYPES.has(mimeType)) return sendJson(response, 415, { error: "仅支持 JPEG/PNG/GIF/WebP/AVIF 图片。" });
          const bytes = await readRawBody(request);
          if (!bytes.byteLength) return sendJson(response, 400, { error: "图片内容为空。" });
          if (bytes.byteLength > MAX_IMAGE_BYTES) return sendJson(response, 413, { error: "图片不能超过 10MB。" });
          const assetId = randomUUID();
          const fileName = decodeURIComponent(String(request.headers["x-file-name"] ?? "image"));
          const storagePath = `${user.id}/${assetId}`;
          await writeAsset(assetId, bytes, { mimeType, fileName, storagePath });
          const record = (await readUserRecord(user.id, user.email)) ?? {};
          await writeUserRecord(user.id, {
            ...record,
            assets: { ...readRecord(record.assets), [assetId]: { storagePath, fileName, mimeType } },
            updatedAt: Date.now(),
          });
          return sendJson(response, 201, { assetId, storagePath, url: assetUrl(assetId) });
        }

        if (request.url === "/import-share" && request.method === "POST") {
          const body = await readJsonBody(request);
          const share = (await readLocalShares()).find((item) => item.token === body.token && item.enabled);
          if (!share) return sendJson(response, 404, { error: "分享链接不存在或已关闭。" });
          const owner = (await readUserRecord(share.ownerUserId)) ?? {};
          const tree = readRecord(readRecord(owner.documents)[share.fileId]).tree;
          const sourceNodes = Array.isArray(owner.nodes) ? owner.nodes : [];
          const sourceFile = sourceNodes.find((node) => readRecord(node).id === share.fileId);
          if (!tree || !sourceFile) return sendJson(response, 404, { error: "分享的文档已不存在。" });
          const current = (await readUserRecord(user.id, user.email)) ?? {};
          const id = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const nodes = (Array.isArray(current.nodes) ? current.nodes : []).map((node) => readRecord(node).parentId === null ? { ...readRecord(node), order: Number(readRecord(node).order) + 1 } : node);
          nodes.push({ id, title: String(readRecord(sourceFile).title || "无标题"), type: "file", parentId: null, order: 0, favorite: false, openedAt: Date.now() });
          // The importer gets their own copies of the images, exactly as production clones them.
          const cloned = await cloneAssets(tree, owner, user.id);
          await writeUserRecord(user.id, {
            ...current,
            nodes,
            documents: { ...readRecord(current.documents), [id]: { tree: cloned.tree, revision: 1, schemaVersion: DOCUMENT_SCHEMA_VERSION } },
            assets: { ...readRecord(current.assets), ...cloned.assets },
            updatedAt: Date.now(),
          });
          return sendJson(response, 200, { ok: true, fileId: id });
        }

        if (request.method === "GET" && (request.url === "/" || !request.url)) {
          const record = (await readUserRecord(user.id, user.email)) ?? {};
          const documents = readRecord(record.documents);
          return sendJson(response, 200, {
            profile: record.profile,
            nodes: record.nodes,
            trash: record.trash,
            documents: Object.fromEntries(Object.entries(documents).map(([fileId, value]) => [fileId, readRecord(value).tree])),
            documentRevisions: Object.fromEntries(Object.entries(documents).map(([fileId, value]) => [fileId, Number(readRecord(value).revision ?? 1)])),
            assets: assetReferences(record, Object.keys(readRecord(record.assets))),
          });
        }

        if (request.url?.startsWith("/documents/")) {
          const fileId = decodeURIComponent(request.url.slice("/documents/".length).split("?")[0] ?? "");
          if (!fileId) return sendJson(response, 400, { error: "缺少文档 ID。" });
          const record = (await readUserRecord(user.id, user.email)) ?? {};
          const documents = readRecord(record.documents);
          if (request.method === "DELETE") {
            delete documents[fileId];
            await writeUserRecord(user.id, { ...record, documents, updatedAt: Date.now() });
            return sendJson(response, 200, { ok: true });
          }
          if (request.method === "PUT") {
            const body = await readJsonBody(request);
            const revision = Number(body.revision);
            if (!body.tree || !Number.isInteger(revision) || revision < 0) return sendJson(response, 400, { error: "文档保存参数不完整。" });
            const stored = readRecord(documents[fileId]);
            const storedRevision = documents[fileId] ? Number(stored.revision ?? 1) : 0;
            // Same optimistic concurrency as production, so a second tab is caught here too.
            if (revision !== storedRevision) return sendJson(response, 409, { error: "文档已在其他标签页或设备更新，请刷新后继续编辑。" });
            const nextRevision = storedRevision + 1;
            documents[fileId] = { tree: body.tree, revision: nextRevision, schemaVersion: DOCUMENT_SCHEMA_VERSION };
            await writeUserRecord(user.id, { ...record, documents, updatedAt: Date.now() });
            return sendJson(response, 200, { ok: true, revision: nextRevision });
          }
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          const record = (await readUserRecord(user.id, user.email)) ?? {};
          await writeUserRecord(user.id, {
            ...record,
            profile: body.profile ?? record.profile,
            nodes: body.nodes ?? record.nodes,
            trash: body.trash ?? record.trash,
            updatedAt: Date.now(),
          });
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
  const user = readRecord(await supabaseAuthRequest(appEnv, "user", { method: "GET", token: accessToken }));
  const email = normalizeEmail(user.email);
  const id = typeof user.id === "string" ? user.id : "";
  if (!email || !id) throw statusError("登录状态无效。", 401);
  return { id, email };
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
  const raw = (await readRawBody(request)).toString("utf8");
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

async function readRawBody(request: Connect.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readUserRecord(userId: string, legacyEmail?: string) {
  const record = await readRecordFile(userFilePath(userId));
  if (record) return record;
  // Local dev data used to be keyed by email, with documents stored as bare trees. Adopting
  // it keeps an existing scratch workspace usable now that everything is keyed by user id.
  const legacy = legacyEmail ? await readRecordFile(userFilePath(legacyEmail)) : null;
  return legacy ? { ...legacy, documents: adoptLegacyDocuments(legacy.documents) } : null;
}

async function readRecordFile(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function adoptLegacyDocuments(documents: unknown) {
  return Object.fromEntries(Object.entries(readRecord(documents)).map(([fileId, value]) => [
    fileId,
    readRecord(value).tree ? value : { tree: value, revision: 1, schemaVersion: DOCUMENT_SCHEMA_VERSION },
  ]));
}

async function writeUserRecord(userId: string, record: Record<string, unknown>) {
  await mkdir(DATA_DIR, { recursive: true });
  const rest = { ...record };
  delete rest.viewState;
  await writeFile(userFilePath(userId), JSON.stringify(rest, null, 2), "utf8");
}

interface LocalShareRecord { token: string; ownerUserId: string; fileId: string; enabled: boolean }
async function readLocalShares(): Promise<LocalShareRecord[]> {
  try { return JSON.parse(await readFile(SHARES_FILE, "utf8")) as LocalShareRecord[]; } catch { return []; }
}

async function writeLocalShares(shares: LocalShareRecord[]) {
  await mkdir(path.dirname(SHARES_FILE), { recursive: true });
  await writeFile(SHARES_FILE, JSON.stringify(shares, null, 2), "utf8");
}

function userFilePath(userId: string) {
  return path.join(DATA_DIR, `${Buffer.from(userId).toString("base64url")}.json`);
}

function assetBytesPath(assetId: string) { return path.join(ASSETS_DIR, assetId); }
function assetMetaPath(assetId: string) { return path.join(ASSETS_DIR, `${assetId}.json`); }
function assetUrl(assetId: string) { return `/api/workspace/assets/${assetId}`; }

function logLocalShareTiming(label: string, startedAt: number) {
  console.info(`[share] ${label}: ${Date.now() - startedAt}ms`);
}

async function writeAsset(assetId: string, bytes: Buffer, meta: Record<string, unknown>) {
  await mkdir(ASSETS_DIR, { recursive: true });
  await writeFile(assetBytesPath(assetId), bytes);
  await writeFile(assetMetaPath(assetId), JSON.stringify(meta, null, 2), "utf8");
}

function assetReferences(record: Record<string, unknown>, assetIds: string[]) {
  const assets = readRecord(record.assets);
  return assetIds
    .filter((assetId) => assets[assetId])
    .map((assetId) => ({ assetId, storagePath: String(readRecord(assets[assetId]).storagePath ?? ""), url: assetUrl(assetId) }));
}

function collectAssetIds(value: unknown, found = new Set<string>()) {
  if (Array.isArray(value)) { value.forEach((item) => collectAssetIds(item, found)); return found; }
  if (!value || typeof value !== "object") return found;
  const record = value as Record<string, unknown>;
  if (typeof record.assetId === "string") found.add(record.assetId);
  Object.values(record).forEach((item) => collectAssetIds(item, found));
  return found;
}

async function cloneAssets(tree: unknown, owner: Record<string, unknown>, targetUserId: string) {
  const ownerAssets = readRecord(owner.assets);
  const assets: Record<string, unknown> = {};
  const replacements = new Map<string, { assetId: string; storagePath: string }>();
  for (const assetId of collectAssetIds(tree)) {
    const source = readRecord(ownerAssets[assetId]);
    if (!source.storagePath) continue;
    const nextId = randomUUID();
    const storagePath = `${targetUserId}/${nextId}`;
    try {
      await writeAsset(nextId, await readFile(assetBytesPath(assetId)), { ...source, storagePath });
    } catch {
      continue;
    }
    assets[nextId] = { ...source, storagePath };
    replacements.set(assetId, { assetId: nextId, storagePath });
  }
  return { tree: replaceAssetIds(tree, replacements), assets };
}

function replaceAssetIds(value: unknown, replacements: Map<string, { assetId: string; storagePath: string }>): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceAssetIds(item, replacements));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const replacement = typeof record.assetId === "string" ? replacements.get(record.assetId) : undefined;
  const next = Object.fromEntries(Object.entries(record).map(([key, item]) => [key, replaceAssetIds(item, replacements)]));
  return replacement ? { ...next, ...replacement, url: undefined } : next;
}

function displayNameFromEmail(email: string) {
  const source = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "用户";
  return source.replace(/\b\w/g, (character) => character.toUpperCase());
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
