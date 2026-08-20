const DATABASE_NAME = "zhijian-assets";
const STORE_NAME = "images";
const assetIdsByUrl = new Map<string, string>();
const urlsByAssetId = new Map<string, string>();

export async function saveImageAsset(file: File) {
  const assetId =
    globalThis.crypto?.randomUUID?.() ?? `image_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = URL.createObjectURL(file);
  assetIdsByUrl.set(url, assetId);
  urlsByAssetId.set(assetId, url);

  if (typeof indexedDB !== "undefined") {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(file, assetId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  return { assetId, url };
}

export function getImageAssetId(url: string) {
  return assetIdsByUrl.get(url);
}

export function getCachedImageAssetUrl(assetId: string) {
  return urlsByAssetId.get(assetId) ?? "";
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
