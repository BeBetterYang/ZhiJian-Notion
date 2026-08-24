/* global Buffer, process, fetch */

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
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase 环境变量未配置。");
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Supabase 请求失败。");
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
