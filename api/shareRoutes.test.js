/* global process, fetch, Response */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import shareHandler from "./shares/[token].js";
import shareAssetsHandler from "./shares/[token]/assets.js";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const TREE = {
  rootId: "root",
  nodes: {
    root: {
      id: "root",
      parentId: null,
      children: [],
      type: "paragraph",
      content: [],
      blocks: [{ id: "image-1", type: "image", image: { assetId: ASSET_ID, storagePath: "owner/image.webp" } }],
    },
  },
};

describe("share read APIs", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns the tree without waiting for or returning image assets", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("workspace_document_shares")) return jsonResponse([{ owner_user_id: "owner", file_id: "file-1" }]);
      if (url.includes("workspace_states")) return jsonResponse([{ nodes: [{ id: "file-1", type: "file", title: "分享文档" }] }]);
      if (url.includes("workspace_documents")) return jsonResponse([{ tree: TREE, revision: 1, schema_version: 1 }]);
      throw new Error(`unexpected request: ${url}`);
    });
    const response = createResponse();

    await shareHandler({ method: "GET", query: { token: TOKEN } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ token: TOKEN, title: "分享文档", tree: TREE });
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("workspace_assets"), expect.anything());
  });

  it("signs only assets referenced by the currently shared tree", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("workspace_document_shares")) return jsonResponse([{ owner_user_id: "owner", file_id: "file-1" }]);
      if (url.includes("workspace_documents")) return jsonResponse([{ tree: TREE, revision: 1, schema_version: 1 }]);
      if (url.includes("workspace_assets")) {
        expect(url).toContain(`asset_id=in.(${ASSET_ID})`);
        return jsonResponse([{ asset_id: ASSET_ID, storage_path: "owner/image.webp" }]);
      }
      if (url.includes("/storage/v1/object/sign/")) return jsonResponse({ signedURL: "/object/sign/workspace-images/signed" });
      throw new Error(`unexpected request: ${url}`);
    });
    const response = createResponse();

    await shareAssetsHandler({ method: "GET", query: { token: TOKEN } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.assets).toEqual([{
      assetId: ASSET_ID,
      storagePath: "owner/image.webp",
      url: "https://project.supabase.co/storage/v1/object/sign/workspace-images/signed",
    }]);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("enabled=eq.true");
  });

  it("does not expose assets when the share is disabled or missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));
    const response = createResponse();

    await shareAssetsHandler({ method: "GET", query: { token: TOKEN } }, response);

    expect(response.statusCode).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("enabled=eq.true");
  });
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function createResponse() {
  return {
    statusCode: 0,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
