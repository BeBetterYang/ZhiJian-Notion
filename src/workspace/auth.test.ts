import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceSession, loadWorkspaceSession, login, refreshWorkspaceSession, register, saveWorkspaceSession, shouldRefreshWorkspaceSession } from "./auth";

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

/**
 * 登录态存哪里，决定的是「拷贝文档链接、在新标签页打开」还要不要再登一次。
 *
 * sessionStorage 一个标签页一份，新标签页读不到；localStorage 同源共用一份，所以下面这几条都盯着
 * localStorage。新标签页那一条没法真开一个标签页，但同源新标签页读到的就是同一个 localStorage，
 * 只要 session 不在 sessionStorage 里、且能从 localStorage 读回来，就等于新标签页也能读到。
 */
describe("workspace session storage", () => {
  const session = {
    email: "user@example.com",
    name: "枝间用户",
    userId: "user-1",
    accessToken: "token",
    refreshToken: "refresh-token",
    expiresAt: 2000,
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("saves the session to localStorage so other tabs on the same origin can read it", () => {
    saveWorkspaceSession(session);

    expect(JSON.parse(localStorage.getItem("zhijian.workspace.session") ?? "null")).toEqual(session);
    expect(sessionStorage.getItem("zhijian.workspace.session")).toBeNull();
  });

  it("loads the saved session back with refreshToken and expiresAt intact", () => {
    saveWorkspaceSession(session);

    expect(loadWorkspaceSession()).toEqual(session);
  });

  it("clears the session on logout", () => {
    saveWorkspaceSession(session);

    clearWorkspaceSession();

    expect(loadWorkspaceSession()).toBeNull();
    expect(localStorage.getItem("zhijian.workspace.session")).toBeNull();
  });

  it("treats a missing or damaged stored value as signed out", () => {
    expect(loadWorkspaceSession()).toBeNull();

    localStorage.setItem("zhijian.workspace.session", "{ not json");
    expect(loadWorkspaceSession()).toBeNull();

    // 缺 accessToken 的残留数据不能当成已登录，否则后面每个请求都会带着空 token 打 401。
    localStorage.setItem("zhijian.workspace.session", JSON.stringify({ email: "user@example.com", name: "枝间用户" }));
    expect(loadWorkspaceSession()).toBeNull();
  });
});
