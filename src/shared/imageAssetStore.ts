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

/**
 * Rebuild the in-memory assetId → object-URL map from IndexedDB. Object URLs do
 * not survive a page reload, so without this every persisted image would resolve
 * to an empty URL. Call once, before the editors first render, so
 * getCachedImageAssetUrl() can resolve assets saved in a previous session.
 */
export async function rehydrateImageAssets(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  let database: IDBDatabase;
  try {
    database = await openDatabase();
  } catch {
    return;
  }
  try {
    const entries = await new Promise<Array<{ assetId: IDBValidKey; file: unknown }>>(
      (resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const keysRequest = store.getAllKeys();
        const valuesRequest = store.getAll();
        transaction.oncomplete = () =>
          resolve(
            keysRequest.result.map((assetId, index) => ({
              assetId,
              file: valuesRequest.result[index],
            })),
          );
        transaction.onerror = () => reject(transaction.error);
      },
    );
    entries.forEach(({ assetId, file }) => {
      if (typeof assetId === "string" && file instanceof Blob && !urlsByAssetId.has(assetId)) {
        const url = URL.createObjectURL(file);
        urlsByAssetId.set(assetId, url);
        assetIdsByUrl.set(url, assetId);
      }
    });
  } catch {
    // Ignore rehydration failures; affected images simply stay unavailable.
  } finally {
    database.close();
  }
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
