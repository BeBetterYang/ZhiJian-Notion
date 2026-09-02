import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { dismissToast, getToastSnapshot, subscribeToToasts, type ToastType } from "./toast";

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  warning: "!",
  error: "!",
  info: "i",
};

export function ToastViewport() {
  const items = useSyncExternalStore(subscribeToToasts, getToastSnapshot, getToastSnapshot);
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions text">
      {items.map((item) => (
        <div
          className={`toast-item is-${item.type} ${item.exiting ? "is-exiting" : ""} ${item.type === "error" ? "is-dismissible" : ""}`}
          key={item.id}
          role={item.type === "error" ? "alert" : "status"}
        >
          <span className="toast-icon" aria-hidden="true">{TOAST_ICONS[item.type]}</span>
          <span className="toast-message">{item.message}</span>
          {item.type === "error" ? (
            <button type="button" className="toast-close" onClick={() => dismissToast(item.id)} aria-label="关闭通知">×</button>
          ) : null}
        </div>
      ))}
    </div>,
    document.body,
  );
}
