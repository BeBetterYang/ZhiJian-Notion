import type { ZhiJianTree } from "../core/tree";
import {
  refreshWorkspaceSession,
  saveWorkspaceSession,
  shouldRefreshWorkspaceSession,
  type WorkspaceSession,
} from "./auth";
import type { WorkspaceNode, WorkspaceTrashEntry } from "./workspaceData";

export interface WorkspaceProfile {
  name: string;
  email: string;
  avatarUrl: string;
}

export interface WorkspaceServerState {
  profile?: WorkspaceProfile;
  nodes?: WorkspaceNode[];
  trash?: WorkspaceTrashEntry[];
  documents?: Record<string, ZhiJianTree>;
}

export class WorkspaceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkspaceApiError";
  }
}

interface WorkspaceApiOptions {
  onSessionRefresh?: (session: WorkspaceSession) => void;
}

let pendingSessionRefresh: Promise<WorkspaceSession> | null = null;

export async function loadWorkspaceState(session: WorkspaceSession, options?: WorkspaceApiOptions): Promise<WorkspaceServerState | null> {
  const response = await workspaceFetch("/api/workspace", {}, session, options);
  if (response.status === 404) return null;
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法从服务器读取工作区数据。"), response.status);
  return readJsonResponse(response, "服务器返回的工作区数据格式不正确。") as Promise<WorkspaceServerState>;
}

export async function saveWorkspaceState(session: WorkspaceSession, state: WorkspaceServerState, options?: WorkspaceApiOptions) {
  const response = await workspaceFetch("/api/workspace", {
    method: "PUT",
    body: JSON.stringify(state),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法保存工作区数据到服务器。"), response.status);
  await readJsonResponse(response, "服务器未返回有效的工作区保存结果。");
}

export async function saveWorkspaceDocument(session: WorkspaceSession, fileId: string, tree: ZhiJianTree, options?: WorkspaceApiOptions) {
  const response = await workspaceFetch(`/api/workspace/documents/${encodeURIComponent(fileId)}`, {
    method: "PUT",
    body: JSON.stringify({ tree }),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法保存文档到服务器。"), response.status);
  await readJsonResponse(response, "服务器未返回有效的文档保存结果。");
}

async function workspaceFetch(input: RequestInfo | URL, init: RequestInit, session: WorkspaceSession, options?: WorkspaceApiOptions) {
  const freshSession = await ensureFreshSession(session, options);
  const response = await fetch(input, {
    ...init,
    headers: authHeaders(freshSession, init.headers),
  });
  if (response.status !== 401 || !freshSession.refreshToken) return response;

  const refreshedSession = await refreshSessionOrThrow(freshSession, options);
  return fetch(input, {
    ...init,
    headers: authHeaders(refreshedSession, init.headers),
  });
}

async function ensureFreshSession(session: WorkspaceSession, options?: WorkspaceApiOptions) {
  if (!shouldRefreshWorkspaceSession(session)) return session;
  return refreshSessionOrThrow(session, options);
}

async function refreshSessionOrThrow(session: WorkspaceSession, options?: WorkspaceApiOptions) {
  if (!pendingSessionRefresh) {
    pendingSessionRefresh = refreshWorkspaceSession(session)
      .then((result) => {
        if (!result.session) throw new WorkspaceApiError(result.error ?? "登录状态已过期，请重新登录。", 401);
        saveWorkspaceSession(result.session);
        return result.session;
      })
      .finally(() => {
        pendingSessionRefresh = null;
      });
  }
  const refreshedSession = await pendingSessionRefresh;
  options?.onSessionRefresh?.(refreshedSession);
  return refreshedSession;
}

function authHeaders(session: WorkspaceSession, headers?: HeadersInit) {
  return {
    ...(headers instanceof Headers ? Object.fromEntries(headers.entries()) : Array.isArray(headers) ? Object.fromEntries(headers) : headers),
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
  };
}

async function readApiError(response: Response, fallback: string) {
  const text = await response.text();
  if (looksLikeHtml(text)) return apiRouteError();
  try {
    const payload = JSON.parse(text) as { error?: unknown };
    return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

async function readJsonResponse(response: Response, fallback: string) {
  const text = await response.text();
  if (!text.trim()) return {};
  if (looksLikeHtml(text)) throw new WorkspaceApiError(apiRouteError(), response.status || 502);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new WorkspaceApiError(fallback, response.status || 502);
  }
}

function looksLikeHtml(text: string) {
  return /^\s*<!doctype\s+html|^\s*<html/i.test(text);
}

function apiRouteError() {
  return "服务器 API 返回了网页而不是数据，请检查 Vercel 的 /api 路由和 Supabase 环境变量。";
}
