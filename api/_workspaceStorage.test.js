/* global process, fetch, Response */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseRequest } from "./_workspaceStorage.js";

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
});
