/* global process, fetch, Response */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupUnreferencedAssets, readWorkspaceState, supabaseRequest, upsertWorkspace } from "./_workspaceStorage.js";

describe("Supabase service requests", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  // fetch labels a string body as text/plain, and PostgREST answers PGRST102 instead of writing,
  // so every save has to declare JSON itself.
  it("declares a JSON content type for a body it serialized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await supabaseRequest("workspace_states", { method: "POST", body: JSON.stringify({ user_id: "user-1" }) });

    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/workspace_states",
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) }),
    );
  });

  it("keeps a caller's own content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await supabaseRequest("workspace_assets", { method: "POST", headers: { "Content-Type": "image/png" }, body: "bytes" });

    expect(vi.mocked(fetch).mock.calls[0][1].headers["Content-Type"]).toBe("image/png");
  });

  it("does not add a content type to a request without a body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await supabaseRequest("workspace_states?user_id=eq.user-1", { method: "GET" });

    expect(vi.mocked(fetch).mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
  });

  it("reads mind-map defaults with the workspace preferences", async () => {
    const preferences = { mindMapDefaults: { theme: { id: "yanpi", version: 1 } } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{ preferences }]), { status: 200 }));

    await expect(readWorkspaceState("user-1")).resolves.toMatchObject({ preferences });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("select=profile,preferences,nodes,trash");
  });

  it("persists mind-map defaults with the workspace preferences", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const preferences = { mindMapDefaults: { layout: { type: "logic", direction: "right" } } };

    await upsertWorkspace("user-1", { preferences });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1].body));
    expect(body.preferences).toEqual(preferences);
  });
});

describe("无引用图片清理", () => {
  const KEPT = "11111111-1111-4111-8111-111111111111";
  const ORPHAN = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  /** 文档里引用了 KEPT，`workspace_assets` 里够旧的候选是 `agedAssetIds`。 */
  function mockSupabase(agedAssetIds, { storageFails = false } = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const target = String(url);
      if (target.includes("/storage/v1/")) {
        return Promise.resolve(storageFails
          ? new Response("gone", { status: 404 })
          : new Response(null, { status: 204 }));
      }
      if (target.includes("workspace_documents")) {
        return Promise.resolve(new Response(JSON.stringify([
          { tree: { nodes: { a: { content: { attachments: [{ assetId: KEPT, storagePath: `u/${KEPT}` }] } } } } },
        ]), { status: 200 }));
      }
      if (init.method === "DELETE") {
        const ids = target.match(/asset_id=in\.\(([^)]*)\)/)?.[1].split(",") ?? [];
        return Promise.resolve(new Response(JSON.stringify(ids.map((assetId) => ({ asset_id: assetId, storage_path: `u/${assetId}` }))), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(agedAssetIds.map((assetId) => ({ asset_id: assetId }))), { status: 200 }));
    });
  }

  it("只删除没有文档引用的那一张，并连带清掉 Storage 对象", async () => {
    mockSupabase([KEPT, ORPHAN]);

    await expect(cleanupUnreferencedAssets("user-1")).resolves.toEqual({ removed: 1 });

    const calls = vi.mocked(fetch).mock.calls.map(([url, init]) => `${init.method} ${url}`);
    expect(calls.some((call) => call.includes(`asset_id=in.(${ORPHAN})`))).toBe(true);
    expect(calls.some((call) => call.includes(KEPT))).toBe(false);
    expect(calls).toContain(`DELETE https://project.supabase.co/storage/v1/object/workspace-images/u/${ORPHAN}`);
  });

  // 刚上传的图片要等文档 autosave 写回才有引用；安全窗口交给 PostgREST 过滤，够旧的行才是候选。
  it("只把上传超过 24 小时的图片当候选", async () => {
    mockSupabase([]);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-31T12:00:00.000Z"));

    await expect(cleanupUnreferencedAssets("user-1")).resolves.toEqual({ removed: 0 });

    const assetQuery = vi.mocked(fetch).mock.calls.map(([url]) => String(url)).find((url) => url.includes("workspace_assets"));
    expect(assetQuery).toContain(`created_at=lt.${encodeURIComponent("2026-08-30T12:00:00.000Z")}`);
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init.method === "DELETE")).toBe(false);
  });

  // 行已经删了，残留对象只占存储，不该让整次清理报错。
  it("Storage 删除失败也算清理成功", async () => {
    mockSupabase([ORPHAN], { storageFails: true });

    await expect(cleanupUnreferencedAssets("user-1")).resolves.toEqual({ removed: 1 });
  });
});
