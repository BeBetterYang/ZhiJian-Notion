import type { ZhiJianDocumentIcon } from "../../core/tree";

export function documentIconKey(icon?: ZhiJianDocumentIcon) {
  if (!icon) return "";
  return icon.type === "emoji" ? `emoji:${icon.value}` : `asset:${icon.assetId}`;
}
