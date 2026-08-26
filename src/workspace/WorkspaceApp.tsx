import { useCallback, useState } from "react";
import { clearWorkspaceSession, loadWorkspaceSession, saveWorkspaceSession, type WorkspaceSession } from "./auth";
import { LoginScreen } from "./LoginScreen";
import { WorkspaceShell } from "./WorkspaceShell";

export function WorkspaceApp() {
  const [session, setSession] = useState<WorkspaceSession | null>(() => loadWorkspaceSession());
  const updateSession = useCallback((nextSession: WorkspaceSession) => {
    saveWorkspaceSession(nextSession);
    setSession(nextSession);
  }, []);
  const logout = useCallback(() => {
    clearWorkspaceSession();
    setSession(null);
  }, []);

  if (!session) {
    return <LoginScreen onLogin={(nextSession) => {
      updateSession(nextSession);
    }} />;
  }

  return <WorkspaceShell session={session} onSessionRefresh={updateSession} onLogout={logout} />;
}
