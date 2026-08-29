/* global Buffer, process, fetch, setTimeout, crypto */

const WORKSPACE_TABLE = "workspace_states";
const DOCUMENTS_TABLE = "workspace_documents";
const ASSETS_TABLE = "workspace_assets";
const ASSET_BUCKET = "workspace-images";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DOCUMENT_SCHEMA_VERSION = 1;

export async function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  const raw = await readRawBody(request);
  return raw.length ? JSON.parse(raw.toString("utf8")) : {};
}

export async function readRawBody(request) {
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return Buffer.from(request.body);
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function sendJson(response, status, body) { response.status(status).json(body); }

export async function readWorkspaceState(userId) {
  const rows = await supabaseRequest(`${WORKSPACE_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=profile,nodes,trash`, { method: "GET" });
  const state = Array.isArray(rows) ? rows[0] : null;
  return {
    profile: state?.profile ?? undefined,
    nodes: state?.nodes ?? undefined,
    trash: state?.trash ?? undefined,
  };
}

export async function readWorkspace(userId) {
  const [state, documentRows, assetRows] = await Promise.all([
    readWorkspaceState(userId),
    supabaseRequest(`${DOCUMENTS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=file_id,tree,revision,schema_version`, { method: "GET" }),
    supabaseRequest(`${ASSETS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=asset_id,storage_path`, { method: "GET" }),
  ]);
  const documents = {};
  const documentRevisions = {};
  for (const row of Array.isArray(documentRows) ? documentRows : []) {
    documents[row.file_id] = migratePersistedTree(row.tree, row.schema_version);
    documentRevisions[row.file_id] = Number(row.revision);
  }
  return {
    ...state,
    documents,
    documentRevisions,
    assets: await signAssetRows(Array.isArray(assetRows) ? assetRows : []),
  };
}

export async function upsertWorkspace(userId, patch) {
  await supabaseRequest(WORKSPACE_TABLE, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      profile: patch.profile ?? null,
      nodes: patch.nodes ?? null,
      trash: patch.trash ?? null,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function saveWorkspaceDocument(userId, fileId, tree, expectedRevision) {
  const now = new Date().toISOString();
  if (expectedRevision === 0) {
    // A first save races the same document being created in another tab; the primary key
    // catches it, and the client has to reload rather than silently win.
    const rows = await supabaseRequest(DOCUMENTS_TABLE, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, file_id: fileId, tree, revision: 1, schema_version: DOCUMENT_SCHEMA_VERSION, updated_at: now }),
    }).catch((error) => {
      throw isUniqueViolation(error) ? documentConflictError() : error;
    });
    return Number(rows?.[0]?.revision ?? 1);
  }
  const rows = await supabaseRequest(`${DOCUMENTS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&file_id=eq.${encodeURIComponent(fileId)}&revision=eq.${expectedRevision}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tree, revision: expectedRevision + 1, schema_version: DOCUMENT_SCHEMA_VERSION, updated_at: now }),
  });
  if (!Array.isArray(rows) || rows.length !== 1) throw documentConflictError();
  return Number(rows[0].revision);
}

function documentConflictError() {
  const error = new Error("文档已在其他标签页或设备更新，请刷新后继续编辑。");
  error.statusCode = 409;
  return error;
}

function isUniqueViolation(error) {
  return error instanceof Error && /duplicate key value|23505/.test(error.message);
}

/**
 * Documents used to live inside one JSON blob, so emptying the trash dropped them by
 * omission. They are their own rows now, which means a purge has to say so — and the
 * images only that document referenced are unreachable afterwards, so they go too.
 */
export async function deleteWorkspaceDocuments(userId, fileIds) {
  if (!fileIds.length) return;
  // One request per file rather than an `in.(…)` list: file ids are user-visible strings,
  // and quoting them safely inside a PostgREST list is easy to get subtly wrong.
  const removed = await Promise.all(fileIds.map((fileId) =>
    supabaseRequest(`${DOCUMENTS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&file_id=eq.${encodeURIComponent(fileId)}&select=tree`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    })
  ));
  const orphanIds = collectAssetReferences(removed).map((ref) => ref.assetId);
  if (orphanIds.length) await deleteUnreferencedAssets(userId, orphanIds);
}

async function deleteUnreferencedAssets(userId, candidateIds) {
  const remaining = await supabaseRequest(`${DOCUMENTS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=tree`, { method: "GET" });
  const stillUsed = new Set(collectAssetReferences(remaining).map((ref) => ref.assetId));
  const unused = [...new Set(candidateIds)].filter((assetId) => !stillUsed.has(assetId) && UUID_PATTERN.test(assetId));
  if (!unused.length) return;
  const rows = await supabaseRequest(`${ASSETS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&asset_id=in.(${unused.join(",")})&select=asset_id,storage_path`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  await Promise.all((Array.isArray(rows) ? rows : []).map((row) =>
    // The row is gone either way; a stranded object only costs storage, never correctness.
    storageRequest(`object/${ASSET_BUCKET}/${encodeStoragePath(row.storage_path)}`, { method: "DELETE" }).catch(() => undefined)
  ));
}

export async function readWorkspaceDocument(userId, fileId) {
  const rows = await supabaseRequest(`${DOCUMENTS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&file_id=eq.${encodeURIComponent(fileId)}&select=tree,revision,schema_version`, { method: "GET" });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? { tree: migratePersistedTree(row.tree, row.schema_version), revision: Number(row.revision) } : null;
}

export async function registerAsset({ assetId, userId, storagePath, fileName, mimeType, byteSize, bytes }) {
  await storageRequest(`object/${ASSET_BUCKET}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: { "Content-Type": mimeType, "x-upsert": "false" },
    body: bytes,
  });
  try {
    await supabaseRequest(ASSETS_TABLE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, user_id: userId, storage_path: storagePath, file_name: fileName, mime_type: mimeType, byte_size: byteSize }),
    });
  } catch (error) {
    await storageRequest(`object/${ASSET_BUCKET}/${encodeStoragePath(storagePath)}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
  return { assetId, storagePath, url: await createSignedAssetUrl(storagePath) };
}

export async function cloneAssetsForTree(tree, sourceUserId, targetUserId) {
  const refs = collectAssetReferences(tree);
  if (!refs.length) return tree;
  const rows = await supabaseRequest(`${ASSETS_TABLE}?user_id=eq.${encodeURIComponent(sourceUserId)}&asset_id=in.(${refs.map((ref) => ref.assetId).join(",")})&select=asset_id,storage_path,file_name,mime_type,byte_size`, { method: "GET" });
  const replacements = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const assetId = crypto.randomUUID();
    const storagePath = `${targetUserId}/${assetId}${extensionFromName(row.file_name)}`;
    const bytes = await storageRequest(`object/${ASSET_BUCKET}/${encodeStoragePath(row.storage_path)}`, { method: "GET" }, true);
    await registerAsset({ assetId, userId: targetUserId, storagePath, fileName: row.file_name, mimeType: row.mime_type, byteSize: Number(row.byte_size), bytes });
    replacements.set(row.asset_id, { assetId, storagePath });
  }
  return replaceAssetReferences(tree, replacements);
}

export async function signAssetsForTree(tree, userId) {
  const refs = collectAssetReferences(tree);
  if (!refs.length) return [];
  const rows = await supabaseRequest(`${ASSETS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&asset_id=in.(${refs.map((ref) => ref.assetId).join(",")})&select=asset_id,storage_path`, { method: "GET" });
  return signAssetRows(Array.isArray(rows) ? rows : []);
}

async function signAssetRows(rows) {
  return Promise.all(rows.map(async (row) => ({ assetId: row.asset_id, storagePath: row.storage_path, url: await createSignedAssetUrl(row.storage_path) })));
}

async function createSignedAssetUrl(storagePath) {
  const result = await storageRequest(`object/sign/${ASSET_BUCKET}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const signedPath = result?.signedURL ?? result?.signedUrl;
  if (!signedPath) throw new Error("无法生成图片访问地址。");
  return `${supabaseProjectUrl(process.env.SUPABASE_URL)}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
}

function collectAssetReferences(value) {
  const refs = new Map();
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    if (typeof item.assetId === "string") refs.set(item.assetId, { assetId: item.assetId, storagePath: item.storagePath });
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return [...refs.values()];
}

function replaceAssetReferences(value, replacements) {
  if (Array.isArray(value)) return value.map((item) => replaceAssetReferences(item, replacements));
  if (!value || typeof value !== "object") return value;
  const replacement = typeof value.assetId === "string" ? replacements.get(value.assetId) : null;
  const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceAssetReferences(item, replacements)]));
  return replacement ? { ...next, ...replacement, url: undefined } : next;
}

function migratePersistedTree(tree, schemaVersion) {
  const version = Number(schemaVersion || 1);
  if (version === DOCUMENT_SCHEMA_VERSION) return tree;
  throw new Error(`不支持的文档数据版本：${version}`);
}

function extensionFromName(name) {
  const match = typeof name === "string" ? name.match(/\.[a-z0-9]{1,8}$/i) : null;
  return match ? match[0].toLowerCase() : "";
}

function encodeStoragePath(path) { return String(path).split("/").map(encodeURIComponent).join("/"); }

export async function supabaseRequest(path, init) {
  return serviceRequest(`${supabaseProjectUrl(process.env.SUPABASE_URL)}/rest/v1/${path}`, init);
}

async function storageRequest(path, init, raw = false) {
  return serviceRequest(`${supabaseProjectUrl(process.env.SUPABASE_URL)}/storage/v1/${path}`, init, raw);
}

async function serviceRequest(url, init, raw = false) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseProjectUrl(process.env.SUPABASE_URL) || !serviceRoleKey) throw new Error("Supabase 环境变量未配置。");
  const request = () => fetch(url, { ...init, headers: { ...serviceKeyHeaders(serviceRoleKey), ...(init.headers ?? {}) } });
  let response = await request();
  let body = raw ? Buffer.from(await response.arrayBuffer()) : await response.text();
  if (!response.ok && !raw && isJwtIssuedAtFutureError(body)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    response = await request();
    body = raw ? Buffer.from(await response.arrayBuffer()) : await response.text();
  }
  if (!response.ok) throw new Error(raw ? `Supabase Storage 请求失败（${response.status}）。` : supabaseResponseError(body));
  if (raw) return body;
  if (response.status === 204 || !body) return null;
  return parseSupabaseJson(body);
}

function supabaseProjectUrl(value) { return typeof value === "string" ? value.trim().replace(/\/(?:rest|auth)\/v1\/?$/i, "").replace(/\/$/, "") : ""; }
function parseSupabaseJson(text) { try { return JSON.parse(text); } catch { throw new Error(supabaseResponseError(text)); } }
function supabaseResponseError(text) { return /^\s*<!doctype\s+html|^\s*<html/i.test(text) ? "Supabase 返回了网页而不是数据，请确认 SUPABASE_URL 是项目地址且不包含 /rest/v1。" : text || "Supabase 请求失败。"; }
function serviceKeyHeaders(key) { return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` }; }
function isJwtIssuedAtFutureError(text) {
  if (!text) return false;
  if (text.includes("JWT issued at future")) return true;
  try { const payload = JSON.parse(text); return payload?.code === "PGRST303" && typeof payload?.message === "string" && payload.message.includes("future"); } catch { return false; }
}
