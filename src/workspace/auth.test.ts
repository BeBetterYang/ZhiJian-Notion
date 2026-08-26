import { afterEach, describe, expect, it, vi } from "vitest";
import { login, refreshWorkspaceSession, register, shouldRefreshWorkspaceSession } from "./auth";

describe("workspace login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in through the auth API without retaining the password", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      session: { email: "yang.yang@example.com", name: "杨洋", userId: "user-1", accessToken: "token" },
    }), { status: 200 }));

    const result = await login(" Yang.Yang@example.com ", "123456");
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: " Yang.Yang@example.com ", password: "123456" }),
    }));
    expect(result.session).toMatchObject({ email: "yang.yang@example.com", accessToken: "token" });
    expect(result.session).not.toHaveProperty("password");
  });

  it("rejects invalid credentials before calling the auth API", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    expect((await login("invalid", "123456")).error).toContain("邮箱");
    expect((await login("user@example.com", "123")).error).toContain("6");
    expect(request).not.toHaveBeenCalled();
  });

  it("registers through the auth API with the registration code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      session: { email: "new.user@example.com", name: "枝间用户", userId: "user-2", accessToken: "token" },
    }), { status: 200 }));

    const result = await register("枝间用户", "new.user@example.com", "secure-password", "nihaozhijian");
    expect(fetch).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        name: "枝间用户",
        email: "new.user@example.com",
        password: "secure-password",
        code: "nihaozhijian",
      }),
    }));
    expect(result.session).toMatchObject({ email: "new.user@example.com", name: "枝间用户" });
  });

  it("requires a username when registering", async () => {
    expect((await register("  ", "new.user@example.com", "secure-password", "nihaozhijian")).error).toContain("用户名");
  });

  it("requires the registration code when registering", async () => {
    expect((await register("枝间用户", "new.user@example.com", "secure-password", "wrong")).error).toContain("注册码");
  });

  it("refreshes an existing Supabase session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      session: {
        email: "new.user@example.com",
        name: "枝间用户",
        userId: "user-2",
        accessToken: "new-token",
        refreshToken: "next-refresh",
        expiresAt: 2000,
      },
    }), { status: 200 }));

    const result = await refreshWorkspaceSession({
      email: "new.user@example.com",
      name: "枝间用户",
      userId: "user-2",
      accessToken: "old-token",
      refreshToken: "old-refresh",
      expiresAt: 1000,
    });

    expect(fetch).toHaveBeenCalledWith("/api/auth/refresh", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ refreshToken: "old-refresh" }),
    }));
    expect(result.session?.accessToken).toBe("new-token");
  });

  it("detects sessions that are close to access token expiry", () => {
    expect(shouldRefreshWorkspaceSession({
      email: "new.user@example.com",
      name: "枝间用户",
      userId: "user-2",
      accessToken: "old-token",
      refreshToken: "old-refresh",
      expiresAt: 1059,
    }, 1000)).toBe(true);
    expect(shouldRefreshWorkspaceSession({
      email: "new.user@example.com",
      name: "枝间用户",
      userId: "user-2",
      accessToken: "old-token",
      refreshToken: "old-refresh",
      expiresAt: 1200,
    }, 1000)).toBe(false);
  });
});
