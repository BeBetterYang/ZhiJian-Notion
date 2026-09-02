export type ToastType = "success" | "warning" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  persistent: boolean;
  exiting: boolean;
}

export interface ToastOptions {
  duration?: number;
  persistent?: boolean;
}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2000,
  info: 2500,
  warning: 3500,
  error: 5000,
};
const MAX_TOASTS = 3;
const DEDUPE_WINDOW_MS = 1500;
const EXIT_DURATION_MS = 180;

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const autoDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const recentMessages = new Map<string, { id: string; shownAt: number }>();

function emit() {
  listeners.forEach((listener) => listener());
}

function clearItemTimers(id: string) {
  const autoDismiss = autoDismissTimers.get(id);
  if (autoDismiss) clearTimeout(autoDismiss);
  autoDismissTimers.delete(id);
  const removal = removalTimers.get(id);
  if (removal) clearTimeout(removal);
  removalTimers.delete(id);
}

function removeToast(id: string) {
  clearItemTimers(id);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function dismissToast(id: string) {
  const item = items.find((entry) => entry.id === id);
  if (!item || item.exiting) return;
  const autoDismiss = autoDismissTimers.get(id);
  if (autoDismiss) clearTimeout(autoDismiss);
  autoDismissTimers.delete(id);
  items = items.map((entry) => entry.id === id ? { ...entry, exiting: true } : entry);
  emit();
  removalTimers.set(id, setTimeout(() => removeToast(id), EXIT_DURATION_MS));
}

export function showToast(type: ToastType, message: string, options: ToastOptions = {}) {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return "";
  const now = Date.now();
  recentMessages.forEach((entry, key) => {
    if (now - entry.shownAt >= DEDUPE_WINDOW_MS) recentMessages.delete(key);
  });
  const dedupeKey = `${type}:${normalizedMessage}`;
  const recent = recentMessages.get(dedupeKey);
  if (recent && now - recent.shownAt < DEDUPE_WINDOW_MS) return recent.id;

  const id = `toast-${nextId++}`;
  const item: ToastItem = {
    id,
    type,
    message: normalizedMessage,
    duration: options.duration ?? DEFAULT_DURATION[type],
    persistent: options.persistent ?? false,
    exiting: false,
  };
  recentMessages.set(dedupeKey, { id, shownAt: now });
  const overflow = Math.max(0, items.length + 1 - MAX_TOASTS);
  const dropped = items.slice(0, overflow);
  dropped.forEach((entry) => clearItemTimers(entry.id));
  items = [...items.slice(overflow), item];
  emit();

  if (!item.persistent) {
    autoDismissTimers.set(id, setTimeout(() => dismissToast(id), item.duration));
  }
  return id;
}

export const toast = {
  success: (message: string, options?: ToastOptions) => showToast("success", message, options),
  info: (message: string, options?: ToastOptions) => showToast("info", message, options),
  warning: (message: string, options?: ToastOptions) => showToast("warning", message, options),
  error: (message: string, options?: ToastOptions) => showToast("error", message, options),
};

export function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToastSnapshot() {
  return items;
}

export function clearToasts() {
  items.forEach((item) => clearItemTimers(item.id));
  items = [];
  recentMessages.clear();
  emit();
}
