// Scratch entry for local verification only: mounts the document editor on its own
// local-storage tree, without the workspace shell's server session. The fake
// .document-header wrapper reproduces the workspace's floating toolbar host so the
// header-scoped toolbar styles can be checked without the real login shell.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./workspace/workspace.css";

function PreviewShell() {
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const [favorite, setFavorite] = useState(false);
  return (
    <div className="workspace-shell-ui" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="document-header">
        <strong style={{ flex: 1, minWidth: 0 }}>预览文档</strong>
        <div className="document-header-actions" ref={setToolbarTarget} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <App
          embedded
          toolbarTarget={toolbarTarget}
          onShare={() => undefined}
          favorite={favorite}
          onToggleFavorite={() => setFavorite((current) => !current)}
          onDeleteDocument={() => undefined}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<PreviewShell />);
