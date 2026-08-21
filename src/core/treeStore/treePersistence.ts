import type { ZhiJianTree } from "../tree";
import type { TreeStore } from "./TreeStore";

const STORAGE_KEY = "zhijian.tree.v1";

/**
 * Read the last persisted ZhiJianTree from localStorage. Returns null when
 * nothing is stored, when storage is unavailable, or when the stored payload is
 * corrupt / structurally invalid — callers fall back to the seed tree.
 */
export function loadPersistedTree(): ZhiJianTree | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return isValidTree(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Serialize and store a single tree snapshot. Failures (quota, etc.) are ignored. */
export function persistTree(tree: ZhiJianTree) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  } catch {
    // Quota exceeded or serialization failure — skip this snapshot.
  }
}

/**
 * Subscribe to the store and persist snapshots, debounced so rapid keystrokes
 * collapse into a single write. Returns a disposer that flushes the pending
 * snapshot and unsubscribes.
 */
export function attachTreePersistence(store: TreeStore, delay = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = store.subscribe((tree) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      persistTree(tree);
    }, delay);
  });
  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      persistTree(store.getSnapshot());
    }
    unsubscribe();
  };
}

function isValidTree(value: unknown): value is ZhiJianTree {
  if (!value || typeof value !== "object") {
    return false;
  }
  const tree = value as Partial<ZhiJianTree>;
  if (typeof tree.rootId !== "string" || !tree.nodes || typeof tree.nodes !== "object") {
    return false;
  }
  return Boolean((tree.nodes as Record<string, unknown>)[tree.rootId]);
}
