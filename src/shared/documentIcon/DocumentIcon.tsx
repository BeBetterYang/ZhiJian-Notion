import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FileText, Image as ImageIcon, Smile, X } from "lucide-react";
import type { TreeStore } from "../../core/treeStore";
import type { ZhiJianDocumentIcon } from "../../core/tree";
import { getCachedImageAssetUrl, saveImageAsset, useImageAssetRevision } from "../imageAssetStore";
import { toast } from "../toast/toast";
import { EmojiPickerPopover } from "../emoji/EmojiPickerPopover";
import { cropDocumentIcon } from "./documentIconImage";
import { documentIconKey } from "./documentIconModel";

export type DocumentIconSize = "sidebar" | "header" | "page";

export function DocumentIcon({ icon, size = "sidebar", className = "" }: { icon?: ZhiJianDocumentIcon; size?: DocumentIconSize; className?: string }) {
  useImageAssetRevision();
  const imageUrl = icon?.type === "asset" ? getCachedImageAssetUrl(icon.assetId) : "";
  const classes = (extra: string) => `document-icon document-icon-${size} ${extra} ${className}`.trim();
  if (icon?.type === "emoji") {
    return <span className={classes("document-icon-emoji")} aria-hidden="true">{icon.value}</span>;
  }
  if (imageUrl) {
    return <img className={classes("document-icon-image")} src={imageUrl} alt="" />;
  }
  return <FileText className={classes("document-icon-fallback")} aria-hidden="true" />;
}

export function DocumentIconFromStore({ store, size = "sidebar", className = "", hideWhenEmpty = false }: { store: TreeStore; size?: DocumentIconSize; className?: string; hideWhenEmpty?: boolean }) {
  const getIconKey = useCallback(() => documentIconKey(store.getSnapshot().document?.icon), [store]);
  useSyncExternalStore(store.subscribe, getIconKey, getIconKey);
  const icon = store.getSnapshot().document?.icon;
  if (!icon && hideWhenEmpty) return null;
  return <DocumentIcon icon={icon} size={size} className={className} />;
}

export function DocumentIconControl({ store, readOnly = false, size = "page", showEmpty = true }: { store: TreeStore; readOnly?: boolean; size?: DocumentIconSize; showEmpty?: boolean }) {
  const icon = store.getSnapshot().document?.icon;
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const cropped = await cropDocumentIcon(file);
      const asset = await saveImageAsset(cropped);
      store.setDocumentIcon({ type: "asset", assetId: asset.assetId, storagePath: asset.storagePath, name: file.name });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? `图标上传失败：${error.message}` : "图标上传失败，请稍后重试。");
    } finally {
      setUploading(false);
    }
  };

  if (!icon && !showEmpty) return null;

  return (
    <div className={`document-icon-control document-icon-control-${size}${icon ? " has-document-icon" : " document-icon-control-empty"}`} ref={rootRef}>
      {readOnly ? <DocumentIcon icon={icon} size={size} /> : null}
      {!readOnly ? <button
        type="button"
        className={`document-icon-trigger${icon ? "" : " document-icon-trigger-empty"}`}
        disabled={uploading}
        aria-label={icon ? "更换文档图标" : "添加文档图标"}
        title={icon ? "更换文档图标" : "添加文档图标"}
        onClick={() => setOpen((value) => !value)}
      >
        {icon ? <DocumentIcon icon={icon} size={size} /> : <Smile aria-hidden="true" />}
        {!icon ? <span className="document-icon-add-label">添加图标</span> : null}
      </button> : null}
      {!readOnly && open ? (
        <div className="document-icon-picker" onPointerDown={(event) => event.stopPropagation()}>
          <header><strong>文档图标</strong><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="关闭图标选择器"><X /></button></header>
          <EmojiPickerPopover onEmojiSelect={(value) => { store.setDocumentIcon({ type: "emoji", value }); setOpen(false); }} />
          <div className="document-icon-picker-actions">
            <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}><ImageIcon />{uploading ? "上传中…" : "上传图片"}</button>
            {icon ? <button type="button" className="document-icon-remove" onClick={() => { store.setDocumentIcon(undefined); setOpen(false); }}>移除图标</button> : null}
          </div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        </div>
      ) : null}
    </div>
  );
}
