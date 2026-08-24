import { useState } from "react";
import { clearWorkspaceSession, loadWorkspaceSession, saveWorkspaceSession, type WorkspaceSession } from "./auth";
import { LoginScreen } from "./LoginScreen";
import { WorkspaceShell } from "./WorkspaceShell";

export function WorkspaceApp() {
  const [session, setSession] = useState<WorkspaceSession | null>(() => loadWorkspaceSession());

  if (!session) {
    return <LoginScreen onLogin={(nextSession) => {
      saveWorkspaceSession(nextSession);
      setSession(nextSession);
    }} />;
  }

  return <WorkspaceShell session={session} onLogout={() => {
    clearWorkspaceSession();
    setSession(null);
  }} />;
}
