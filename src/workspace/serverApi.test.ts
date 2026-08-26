import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import type { WorkspaceSession } from "./auth";
import { saveWorkspaceDocument, saveWorkspaceState } from "./serverApi";

const expiringSession: WorkspaceSession = {
  email: "user@example.com",
  name: "枝间用户",
  userId: "user-1",
  accessToken: "old-token",
  refreshToken: "refresh-token",
  expiresAt: 1000,
};

describe("workspace server API session refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("refreshes an expiring session before saving workspace state", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        session: { ...expiringSession, accessToken: "new-token", refreshToken: "next-refresh", expiresAt: 2000 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onSessionRefresh = vi.fn();

    await saveWorkspaceState(expiringSession, { nodes: [] }, { onSessionRefresh });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/auth/refresh", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ refreshToken: "refresh-token" }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/workspace", expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ Authorization: "Bearer new-token" }),
    }));
    expect(onSessionRefresh).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "new-token" }));
  });

  it("retries once with a refreshed session after a 401 response", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "expired" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        session: { ...expiringSession, accessToken: "retry-token", refreshToken: "next-refresh", expiresAt: 2000 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await saveWorkspaceDocument({ ...expiringSession, expiresAt: Math.floor(Date.now() / 1000) + 3600 }, "file-1", createInitialTree());

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/workspace/documents/file-1", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer old-token" }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/workspace/documents/file-1", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer retry-token" }),
    }));
  });
});
