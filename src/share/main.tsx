import "@fontsource/source-sans-pro/400.css";
import "@fontsource/source-sans-pro/400-italic.css";
import "@fontsource/source-sans-pro/600.css";
import "@fontsource/source-sans-pro/700.css";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { FiCheck, FiDownload } from "react-icons/fi";
import App from "../App";
import type { ZhiJianTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import { hydrateRemoteImageAssets, type ImageAssetReference } from "../shared/imageAssetStore";
import { AppErrorBoundary } from "../shared/AppErrorBoundary";
import { preloadEditorView } from "../shared/editorPreload";
import { loadWorkspaceSession } from "../workspace/auth";
import { importSharedDocument, WorkspaceApiError } from "../workspace/serverApi";
import "../workspace/workspace.css";
import "./share.css";

interface SharedDocument { token: string; title: string; tree: ZhiJianTree }
const PENDING_SHARE_KEY = "zhijian.workspace.pending-share-token";
const token = new URLSearchParams(window.location.search).get("token") ?? "";
const viewStateStorageKey = `zhijian.share.${token}.view-state.v1`;
const editorPreloadStartedAt = performance.now();
const editorPreload = preloadEditorView(loadInitialShareView(viewStateStorageKey));
void editorPreload.then(() => logShareTiming("editor preload", editorPreloadStartedAt)).catch(() => undefined);

type SaveState = { status: "idle" | "saving" | "saved" } | { status: "failed"; message: string };

function SharedDocumentApp() {
  const [sharedDocument, setSharedDocument] = useState<SharedDocument | null>(null);
  const [assetRevision, setAssetRevision] = useState(0);
  const [error, setError] = useState("");
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const store = useMemo(() => sharedDocument ? new TreeStore(sharedDocument.tree) : null, [sharedDocument]);

  useEffect(() => {
    if (!token) { setError("分享链接无效。"); return; }
    void fetch(`/api/shares/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = await response.json() as SharedDocument & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "无法打开分享文档。");
        setSharedDocument(result);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "无法打开分享文档。"));
  }, []);

  useEffect(() => {
    if (!sharedDocument) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      void fetch(`/api/shares/${encodeURIComponent(token)}/assets`)
        .then(async (response) => {
          const result = await response.json() as { assets?: ImageAssetReference[]; error?: string };
          if (!response.ok) throw new Error(result.error ?? "无法加载分享图片。");
          if (cancelled) return;
          hydrateRemoteImageAssets(result.assets);
          if (result.assets?.length) setAssetRevision((current) => current + 1);
        })
        .catch((reason) => {
          if (import.meta.env.DEV) console.info("[share] assets load failed", reason instanceof Error ? reason.message : reason);
        });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [sharedDocument]);

  useEffect(() => {
    if (!sharedDocument) return;
    void editorPreload.then(() => {
      window.requestAnimationFrame(() => logShareTiming("editor mount", editorPreloadStartedAt));
    }).catch(() => undefined);
  }, [sharedDocument]);

  useEffect(() => {
    if (sharedDocument) window.document.title = `${sharedDocument.title}-枝间`;
  }, [sharedDocument]);

  const saveToWorkspace = async () => {
    // The session lives in sessionStorage, so a link opened in a fresh tab has none even
    // when the visitor is signed in elsewhere; the token is parked and imported after login.
    const session = loadWorkspaceSession();
    if (!session) {
      window.localStorage.setItem(PENDING_SHARE_KEY, token);
      window.location.href = "/workspace.html";
      return;
    }
    setSave({ status: "saving" });
    try {
      await importSharedDocument(session, token);
      setSave({ status: "saved" });
    } catch (reason) {
      if (reason instanceof WorkspaceApiError && reason.status === 401) {
        window.localStorage.setItem(PENDING_SHARE_KEY, token);
        window.location.href = "/workspace.html";
        return;
      }
      setSave({ status: "failed", message: reason instanceof Error ? reason.message : "保存失败，请稍后重试。" });
    }
  };

  if (error) return <main className="share-state"><h1>无法打开文档</h1><p>{error}</p></main>;
  if (!store || !sharedDocument) return <main className="share-state"><div className="workspace-loading-spinner" /><p>正在加载分享文档</p></main>;
  return <main className="shared-document-shell">
    <header className="shared-document-header">
      <strong>{sharedDocument.title}</strong>
      <span className="shared-document-badge">只读分享</span>
      <div className="shared-document-actions">
        {save.status === "saved"
          ? <a className="shared-document-saved" href="/workspace.html"><FiCheck />已保存，去我的枝间查看</a>
          : <button type="button" disabled={save.status === "saving"} onClick={() => void saveToWorkspace()}>
              <FiDownload />{save.status === "saving" ? "保存中…" : "保存到我的枝间"}
            </button>}
        <div ref={setToolbarTarget} className="document-header-actions" />
      </div>
    </header>
    {save.status === "failed" ? <p className="shared-document-error" role="alert">{save.message}</p> : null}
    <section className="shared-document-stage"><AppErrorBoundary scope="文档"><App key={assetRevision} embedded readOnly store={store} toolbarTarget={toolbarTarget} viewStateStorageKey={viewStateStorageKey} /></AppErrorBoundary></section>
  </main>;
}

function loadInitialShareView(storageKey: string): "outline" | "mindmap" {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as { activeView?: unknown } | null;
    return value?.activeView === "mindmap" ? "mindmap" : "outline";
  } catch {
    return "outline";
  }
}

function logShareTiming(label: string, startedAt: number) {
  if (import.meta.env.DEV) console.info(`[share] ${label}: ${(performance.now() - startedAt).toFixed(1)}ms`);
}

createRoot(document.getElementById("share-root")!).render(<StrictMode><SharedDocumentApp /></StrictMode>);
