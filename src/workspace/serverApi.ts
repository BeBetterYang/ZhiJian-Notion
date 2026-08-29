import type { ZhiJianTree } from "../core/tree";
import {
  refreshWorkspaceSession,
  saveWorkspaceSession,
  shouldRefreshWorkspaceSession,
  type WorkspaceSession,
} from "./auth";
import type { WorkspaceNode, WorkspaceTrashEntry } from "./workspaceData";
import type { ImageAssetReference } from "../shared/imageAssetStore";

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
  documentRevisions?: Record<string, number>;
  assets?: ImageAssetReference[];
}

export interface WorkspaceDocumentShare {
  token?: string;
  enabled: boolean;
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

export async function saveWorkspaceDocument(session: WorkspaceSession, fileId: string, tree: ZhiJianTree, revision: number, options?: WorkspaceApiOptions) {
  const response = await workspaceFetch(`/api/workspace/documents/${encodeURIComponent(fileId)}`, {
    method: "PUT",
    body: JSON.stringify({ tree, revision }),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法保存文档到服务器。"), response.status);
  return readJsonResponse(response, "服务器未返回有效的文档保存结果。") as Promise<{ ok: true; revision: number }>;
}

export async function deleteWorkspaceDocument(session: WorkspaceSession, fileId: string, options?: WorkspaceApiOptions) {
  const response = await workspaceFetch(`/api/workspace/documents/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法删除服务器上的文档。"), response.status);
}

export async function uploadWorkspaceImage(session: WorkspaceSession, file: File, options?: WorkspaceApiOptions): Promise<ImageAssetReference> {
  const response = await workspaceFetch("/api/workspace/assets", {
    method: "POST",
    headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "图片上传失败。"), response.status);
  return readJsonResponse(response, "服务器返回的图片信息格式不正确。") as Promise<ImageAssetReference>;
}

export async function updateWorkspaceAccount(
  session: WorkspaceSession,
  update: { name?: string; email?: string; password?: string },
  options?: WorkspaceApiOptions,
) {
  const response = await workspaceFetch("/api/auth/account", {
    method: "PUT",
    body: JSON.stringify(update),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "账号修改失败。"), response.status);
  return readJsonResponse(response, "服务器返回的账号信息格式不正确。") as Promise<{
    ok: true;
    user: { email?: string; user_metadata?: { name?: string } };
  }>;
}

export async function loadDocumentShare(session: WorkspaceSession, fileId: string, options?: WorkspaceApiOptions): Promise<WorkspaceDocumentShare> {
  const response = await workspaceFetch(`/api/workspace/shares/${encodeURIComponent(fileId)}`, {}, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法读取文档分享设置。"), response.status);
  return readJsonResponse(response, "服务器返回的分享设置格式不正确。") as Promise<WorkspaceDocumentShare>;
}

export async function updateDocumentShare(session: WorkspaceSession, fileId: string, enabled: boolean, options?: WorkspaceApiOptions): Promise<WorkspaceDocumentShare> {
  const response = await workspaceFetch(`/api/workspace/shares/${encodeURIComponent(fileId)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法更新文档分享设置。"), response.status);
  return readJsonResponse(response, "服务器返回的分享设置格式不正确。") as Promise<WorkspaceDocumentShare>;
}

export async function importSharedDocument(session: WorkspaceSession, token: string, options?: WorkspaceApiOptions) {
  const response = await workspaceFetch("/api/workspace/import-share", {
    method: "POST",
    body: JSON.stringify({ token }),
  }, session, options);
  if (!response.ok) throw new WorkspaceApiError(await readApiError(response, "无法保存分享文档。"), response.status);
  return readJsonResponse(response, "服务器返回的保存结果格式不正确。") as Promise<{ ok: boolean; fileId: string }>;
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
    ...(!hasContentType(headers) ? { "Content-Type": "application/json" } : null),
    Authorization: `Bearer ${session.accessToken}`,
  };
}

function hasContentType(headers?: HeadersInit) {
  if (!headers) return false;
  return new Headers(headers).has("Content-Type");
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
