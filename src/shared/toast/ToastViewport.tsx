import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { dismissToast, getToastSnapshot, subscribeToToasts, type ToastType } from "./toast";

const TOAST_ICONS: Record<ToastType, LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  info: Info,
};

export function ToastViewport() {
  const items = useSyncExternalStore(subscribeToToasts, getToastSnapshot, getToastSnapshot);
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions text">
      {items.map((item) => {
        const StatusIcon = TOAST_ICONS[item.type];
        return (
          <div
            className={`toast-item is-${item.type} ${item.exiting ? "is-exiting" : ""} ${item.type === "error" ? "is-dismissible" : ""}`}
            key={item.id}
            role={item.type === "error" ? "alert" : "status"}
          >
            <span className="toast-icon" aria-hidden="true"><StatusIcon /></span>
            <span className="toast-message">{item.message}</span>
            {item.type === "error" ? (
              <button type="button" className="toast-close" onClick={() => dismissToast(item.id)} aria-label="关闭通知"><X aria-hidden="true" /></button>
            ) : null}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
