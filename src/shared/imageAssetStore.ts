const DATABASE_NAME = "zhijian-assets";
const STORE_NAME = "images";
const assetReferencesByUrl = new Map<string, { assetId: string; storagePath?: string }>();
const urlsByAssetId = new Map<string, string>();
const remoteAssetsById = new Map<string, ImageAssetReference>();

export interface ImageAssetReference {
  assetId: string;
  storagePath: string;
  url: string;
}

let uploadImage: ((file: File) => Promise<ImageAssetReference>) | null = null;

export function configureImageAssetUpload(upload: ((file: File) => Promise<ImageAssetReference>) | null) {
  uploadImage = upload;
}

export function hydrateRemoteImageAssets(assets: ImageAssetReference[] | undefined) {
  for (const asset of assets ?? []) {
    remoteAssetsById.set(asset.assetId, asset);
    // A blob URL from the local cache never expires, so it keeps the slot if it is already there.
    if (!urlsByAssetId.get(asset.assetId)?.startsWith("blob:")) cacheAsset(asset.assetId, asset.url, asset.storagePath);
  }
}

export async function saveImageAsset(file: File) {
  if (!uploadImage) throw new Error("图片云存储尚未准备好，请稍后重试。");
  const asset = await uploadImage(file);
  remoteAssetsById.set(asset.assetId, asset);
  cacheAsset(asset.assetId, asset.url, asset.storagePath);
  await cacheBlob(asset.assetId, file);
  return asset;
}

export function getImageAssetId(url: string) { return assetReferencesByUrl.get(url)?.assetId; }
export function getImageAssetStoragePath(url: string) { return assetReferencesByUrl.get(url)?.storagePath; }
export function getCachedImageAssetUrl(assetId: string) { return urlsByAssetId.get(assetId) ?? ""; }

/**
 * Storage keeps the images, but its signed URLs expire after an hour, so every asset the
 * document mentions is also kept as a blob in IndexedDB: cached ones are adopted first
 * because their URLs outlive the signature, and the rest are downloaded once so that a
 * second device stops depending on a fresh signature to show a picture it has seen.
 */
export async function rehydrateImageAssets(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  let database: IDBDatabase;
  try { database = await openDatabase(); } catch { return; }
  const cachedIds = new Set<string>();
  try {
    const entries = await new Promise<Array<{ assetId: IDBValidKey; file: unknown }>>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      transaction.oncomplete = () => resolve(keysRequest.result.map((assetId, index) => ({ assetId, file: valuesRequest.result[index] })));
      transaction.onerror = () => reject(transaction.error);
    });
    entries.forEach(({ assetId, file }) => {
      if (typeof assetId !== "string" || !(file instanceof Blob)) return;
      cachedIds.add(assetId);
      if (!urlsByAssetId.get(assetId)?.startsWith("blob:")) {
        cacheAsset(assetId, URL.createObjectURL(file), remoteAssetsById.get(assetId)?.storagePath);
      }
    });
  } catch {
    // IndexedDB is a best-effort cache; Storage remains the source of truth.
  } finally { database.close(); }
  await cacheRemoteImageAssets(cachedIds);
}

async function cacheRemoteImageAssets(cachedIds: Set<string>) {
  for (const asset of remoteAssetsById.values()) {
    if (cachedIds.has(asset.assetId)) continue;
    try {
      const response = await fetch(asset.url);
      if (!response.ok) continue;
      const blob = await response.blob();
      await cacheBlob(asset.assetId, blob);
      cacheAsset(asset.assetId, URL.createObjectURL(blob), asset.storagePath);
    } catch {
      // The signed URL still works for this session; the download can be retried next load.
    }
  }
}

function cacheAsset(assetId: string, url: string, storagePath?: string) {
  const previousUrl = urlsByAssetId.get(assetId);
  if (previousUrl?.startsWith("blob:") && previousUrl !== url) URL.revokeObjectURL(previousUrl);
  urlsByAssetId.set(assetId, url);
  assetReferencesByUrl.set(url, { assetId, storagePath });
}

async function cacheBlob(assetId: string, file: Blob) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(file, assetId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
