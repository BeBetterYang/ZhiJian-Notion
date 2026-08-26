import type { ZhiJianTree } from "../core/tree";
import {
  refreshWorkspaceSession,
  saveWorkspaceSession,
  shouldRefreshWorkspaceSession,
  type WorkspaceSession,
} from "./auth";
import type { WorkspaceNode } from "./workspaceData";

export interface WorkspaceProfile {
  name: string;
  email: string;
  avatarUrl: string;
}

export interface WorkspaceServerState {
  profile?: WorkspaceProfile;
  nodes?: WorkspaceNode[];
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

export async function loadWorkspaceState(session: WorkspaceSession, options?: WorkspaceApiOptions): Promise<WorkspaceServerState | null> {
  const response = await workspaceFetch("/api/workspace", {}, session, options);
  if (response.status === 404) return null;
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法从服务器读取工作区数据。"), response.status);
  return response.json() as Promise<WorkspaceServerState>;
}

export async function saveWorkspaceState(session: WorkspaceSession, state: WorkspaceServerState, options?: WorkspaceApiOptions) {
  const response = await workspaceFetch("/api/workspace", {
    method: "PUT",
    body: JSON.stringify(state),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法保存工作区数据到服务器。"), response.status);
}

export async function saveWorkspaceDocument(session: WorkspaceSession, fileId: string, tree: ZhiJianTree, options?: WorkspaceApiOptions) {
  const response = await workspaceFetch(`/api/workspace/documents/${encodeURIComponent(fileId)}`, {
    method: "PUT",
    body: JSON.stringify({ tree }),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法保存文档到服务器。"), response.status);
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
  const result = await refreshWorkspaceSession(session);
  if (!result.session) throw new WorkspaceApiError(result.error ?? "登录状态已过期，请重新登录。", 401);
  saveWorkspaceSession(result.session);
  options?.onSessionRefresh?.(result.session);
  return result.session;
}

function authHeaders(session: WorkspaceSession, headers?: HeadersInit) {
  return {
    ...(headers instanceof Headers ? Object.fromEntries(headers.entries()) : Array.isArray(headers) ? Object.fromEntries(headers) : headers),
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
  };
}

async function readApiError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: unknown };
    return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
  } catch {
    return fallback;
  }
}
