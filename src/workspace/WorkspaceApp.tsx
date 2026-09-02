import { useCallback, useEffect, useState } from "react";
import { toast } from "../shared/toast/toast";
import { clearWorkspaceSession, loadWorkspaceSession, saveWorkspaceSession, type WorkspaceSession } from "./auth";
import { importSharedDocument } from "./serverApi";
import { LoginScreen } from "./LoginScreen";
import { WorkspaceShell } from "./WorkspaceShell";

export function WorkspaceApp() {
  const [session, setSession] = useState<WorkspaceSession | null>(() => loadWorkspaceSession());
  const [pendingShareToken, setPendingShareToken] = useState(() => window.localStorage.getItem("zhijian.workspace.pending-share-token"));
  const updateSession = useCallback((nextSession: WorkspaceSession) => {
    saveWorkspaceSession(nextSession);
    setSession(nextSession);
  }, []);
  const logout = useCallback(() => {
    clearWorkspaceSession();
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session || !pendingShareToken) return;
    void importSharedDocument(session, pendingShareToken, { onSessionRefresh: updateSession })
      .then(() => {
        window.localStorage.removeItem("zhijian.workspace.pending-share-token");
        setPendingShareToken(null);
      })
      .catch((error) => {
        window.localStorage.removeItem("zhijian.workspace.pending-share-token");
        toast.error(error instanceof Error ? error.message : "保存分享文档失败。");
        setPendingShareToken(null);
      });
  }, [pendingShareToken, session, updateSession]);

  if (!session) {
    return <LoginScreen onLogin={(nextSession) => {
      updateSession(nextSession);
    }} />;
  }

  if (pendingShareToken) return <main className="workspace-loading"><div className="workspace-loading-spinner" /><span>正在保存分享文档</span></main>;

  return <WorkspaceShell session={session} onSessionRefresh={updateSession} onLogout={logout} />;
}
