import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureImageAssetUpload,
  getCachedImageAssetUrl,
  getImageAssetId,
  getImageAssetStoragePath,
  hydrateRemoteImageAssets,
  saveImageAsset,
} from "./imageAssetStore";

describe("image asset storage", () => {
  afterEach(() => configureImageAssetUpload(null));

  it("stores stable cloud references after upload", async () => {
    const upload = vi.fn().mockResolvedValue({
      assetId: "22222222-2222-4222-8222-222222222222",
      storagePath: "user/22222222-2222-4222-8222-222222222222.png",
      url: "https://storage.example/signed-image",
    });
    configureImageAssetUpload(upload);

    const result = await saveImageAsset(new File(["image"], "photo.png", { type: "image/png" }));

    expect(result.assetId).toBe("22222222-2222-4222-8222-222222222222");
    expect(getImageAssetId(result.url)).toBe(result.assetId);
    expect(getImageAssetStoragePath(result.url)).toBe(result.storagePath);
  });

  it("hydrates signed URLs supplied by workspace and share APIs", () => {
    hydrateRemoteImageAssets([{ assetId: "asset-1", storagePath: "user/asset-1.webp", url: "https://storage.example/asset-1" }]);
    expect(getCachedImageAssetUrl("asset-1")).toBe("https://storage.example/asset-1");
  });
});
