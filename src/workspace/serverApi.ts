import type { ZhiJianTree } from "../core/tree";
import type { WorkspaceSession } from "./auth";
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

export async function loadWorkspaceState(session: WorkspaceSession): Promise<WorkspaceServerState | null> {
  const response = await fetch("/api/workspace", { headers: authHeaders(session) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readApiError(response, "无法从服务器读取工作区数据。"));
  return response.json() as Promise<WorkspaceServerState>;
}

export async function saveWorkspaceState(session: WorkspaceSession, state: WorkspaceServerState) {
  const response = await fetch("/api/workspace", {
    method: "PUT",
    headers: authHeaders(session),
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(await readApiError(response, "无法保存工作区数据到服务器。"));
}

export async function saveWorkspaceDocument(session: WorkspaceSession, fileId: string, tree: ZhiJianTree) {
  const response = await fetch(`/api/workspace/documents/${encodeURIComponent(fileId)}`, {
    method: "PUT",
    headers: authHeaders(session),
    body: JSON.stringify({ tree }),
  });
  if (!response.ok) throw new Error(await readApiError(response, "无法保存文档到服务器。"));
}

function authHeaders(session: WorkspaceSession) {
  return {
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
