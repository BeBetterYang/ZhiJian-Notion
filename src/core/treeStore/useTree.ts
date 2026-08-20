import { useSyncExternalStore } from "react";
import type { ZhiJianTree } from "../tree";
import type { TreeStore } from "./TreeStore";

export function useTree(store: TreeStore): ZhiJianTree {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
