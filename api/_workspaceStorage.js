/* global Buffer, process, fetch, setTimeout */

const TABLE = "workspace_states";

export function normalizeEmail(value) {
  return typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim())
    ? value.trim().toLowerCase()
    : "";
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(response, status, body) {
  response.status(status).json(body);
}

export async function readWorkspace(email) {
  const rows = await supabaseRequest(`${TABLE}?email=eq.${encodeURIComponent(email)}&select=profile,nodes,documents`, {
    method: "GET",
  });
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record) return null;
  return {
    profile: record.profile ?? undefined,
    nodes: record.nodes ?? undefined,
    documents: record.documents ?? undefined,
  };
}

export async function upsertWorkspace(email, patch) {
  const current = await readWorkspace(email);
  const next = {
    email,
    profile: patch.profile ?? current?.profile ?? null,
    nodes: patch.nodes ?? current?.nodes ?? null,
    documents: patch.documents ?? current?.documents ?? null,
    updated_at: new Date().toISOString(),
  };
  await supabaseRequest(TABLE, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(next),
  });
}

export async function upsertWorkspaceDocument(email, fileId, tree) {
  const current = await readWorkspace(email);
  const nextDocuments = {
    ...(current?.documents ?? {}),
    [fileId]: tree,
  };
  await upsertWorkspace(email, { documents: nextDocuments });
}

async function supabaseRequest(path, init) {
  const url = supabaseProjectUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase 环境变量未配置。");
  }

  const request = () => fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...serviceKeyHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  let response = await request();
  let text = await response.text();
  if (!response.ok && isJwtIssuedAtFutureError(text)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    response = await request();
    text = await response.text();
  }

  if (!response.ok) {
    throw new Error(supabaseResponseError(text));
  }

  if (response.status === 204) return null;
  return text ? parseSupabaseJson(text) : null;
}

function supabaseProjectUrl(value) {
  return typeof value === "string"
    ? value.trim().replace(/\/(?:rest|auth)\/v1\/?$/i, "").replace(/\/$/, "")
    : "";
}

function parseSupabaseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(supabaseResponseError(text));
  }
}

function supabaseResponseError(text) {
  return /^\s*<!doctype\s+html|^\s*<html/i.test(text)
    ? "Supabase 返回了网页而不是数据，请确认 SUPABASE_URL 是项目地址且不包含 /rest/v1。"
    : text || "Supabase 请求失败。";
}

function serviceKeyHeaders(key) {
  return key.startsWith("sb_secret_")
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };
}

function isJwtIssuedAtFutureError(text) {
  if (!text) return false;
  if (text.includes("JWT issued at future")) return true;
  try {
    const payload = JSON.parse(text);
    return payload?.code === "PGRST303" && typeof payload?.message === "string" && payload.message.includes("future");
  } catch {
    return false;
  }
}
