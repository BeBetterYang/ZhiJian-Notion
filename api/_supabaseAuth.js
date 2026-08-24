/* global process, fetch */

const REGISTRATION_CODE = "nihaozhijian";

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

export function getSupabasePublishableKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
}

export function assertRegistrationCode(value) {
  return typeof value === "string" && value.trim() === REGISTRATION_CODE;
}

export async function supabaseAuthRequest(path, init = {}) {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  if (!url || !publishableKey) throw new Error("Supabase Auth 环境变量未配置。");

  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${init.token ?? publishableKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(readSupabaseError(payload));
  return payload;
}

export async function requireAuthenticatedUser(request) {
  const header = request.headers.authorization ?? request.headers.Authorization ?? "";
  const token = Array.isArray(header) ? header[0] : header;
  const accessToken = typeof token === "string" && token.startsWith("Bearer ") ? token.slice("Bearer ".length) : "";
  if (!accessToken) {
    const error = new Error("请先登录。");
    error.statusCode = 401;
    throw error;
  }
  const user = await supabaseAuthRequest("user", { method: "GET", token: accessToken });
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) {
    const error = new Error("登录状态无效。");
    error.statusCode = 401;
    throw error;
  }
  return { id: user.id, email, user };
}

export function authSessionFromPayload(payload) {
  const user = payload.user;
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!email || !accessToken) return null;
  return {
    email,
    name: typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()
      ? user.user_metadata.name.trim()
      : displayNameFromEmail(email),
    userId: typeof user?.id === "string" ? user.id : "",
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : "",
    expiresAt: typeof payload.expires_at === "number" ? payload.expires_at : undefined,
  };
}

function displayNameFromEmail(email) {
  const source = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "用户";
  return source.replace(/\b\w/g, (character) => character.toUpperCase());
}

function readSupabaseError(payload) {
  if (typeof payload?.msg === "string") return payload.msg;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.error_description === "string") return payload.error_description;
  if (typeof payload?.error === "string") return payload.error;
  return "Supabase Auth 请求失败。";
}
