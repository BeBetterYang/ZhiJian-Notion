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
  const response = await fetch(`/api/workspace?email=${encodeURIComponent(session.email)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("无法从服务器读取工作区数据。");
  return response.json() as Promise<WorkspaceServerState>;
}

export async function saveWorkspaceState(session: WorkspaceSession, state: WorkspaceServerState) {
  const response = await fetch("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: session.email, ...state }),
  });
  if (!response.ok) throw new Error("无法保存工作区数据到服务器。");
}

export async function saveWorkspaceDocument(session: WorkspaceSession, fileId: string, tree: ZhiJianTree) {
  const response = await fetch(`/api/workspace/documents/${encodeURIComponent(fileId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: session.email, tree }),
  });
  if (!response.ok) throw new Error("无法保存文档到服务器。");
}
