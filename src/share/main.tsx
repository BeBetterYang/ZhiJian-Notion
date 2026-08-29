import "@fontsource/source-sans-pro/400.css";
import "@fontsource/source-sans-pro/400-italic.css";
import "@fontsource/source-sans-pro/600.css";
import "@fontsource/source-sans-pro/700.css";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { FiDownload } from "react-icons/fi";
import App from "../App";
import type { ZhiJianTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import "../workspace/workspace.css";
import "./share.css";

interface SharedDocument { token: string; title: string; tree: ZhiJianTree }
const PENDING_SHARE_KEY = "zhijian.workspace.pending-share-token";

function SharedDocumentApp() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [sharedDocument, setSharedDocument] = useState<SharedDocument | null>(null);
  const [error, setError] = useState("");
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const store = useMemo(() => sharedDocument ? new TreeStore(sharedDocument.tree) : null, [sharedDocument]);

  useEffect(() => {
    if (!token) { setError("分享链接无效。"); return; }
    void fetch(`/api/shares/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = await response.json() as SharedDocument & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "无法打开分享文档。");
        setSharedDocument(result);
        window.document.title = `${result.title}-枝间`;
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "无法打开分享文档。"));
  }, [token]);

  const saveToWorkspace = () => {
    window.localStorage.setItem(PENDING_SHARE_KEY, token);
    window.location.href = "/workspace.html";
  };

  if (error) return <main className="share-state"><h1>无法打开文档</h1><p>{error}</p></main>;
  if (!store || !sharedDocument) return <main className="share-state"><div className="workspace-loading-spinner" /><p>正在加载分享文档</p></main>;
  return <main className="shared-document-shell">
    <header className="shared-document-header">
      <strong>{sharedDocument.title}</strong>
      <div className="shared-document-actions">
        <button type="button" onClick={saveToWorkspace}><FiDownload />保存到我的枝间</button>
        <div ref={setToolbarTarget} className="document-header-actions" />
      </div>
    </header>
    <section className="shared-document-stage"><App embedded readOnly store={store} toolbarTarget={toolbarTarget} viewStateStorageKey={`zhijian.share.${token}.view-state.v1`} /></section>
  </main>;
}

createRoot(document.getElementById("share-root")!).render(<StrictMode><SharedDocumentApp /></StrictMode>);
