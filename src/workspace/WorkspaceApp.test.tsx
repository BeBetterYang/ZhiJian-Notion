import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../shared/toast/ToastProvider";
import { clearToasts } from "../shared/toast/toast";
import type { WorkspaceSession } from "./auth";

const mocks = vi.hoisted(() => ({
  importSharedDocument: vi.fn(),
  loadWorkspaceSession: vi.fn(),
  saveWorkspaceSession: vi.fn(),
  clearWorkspaceSession: vi.fn(),
}));

vi.mock("./auth", () => ({
  loadWorkspaceSession: mocks.loadWorkspaceSession,
  saveWorkspaceSession: mocks.saveWorkspaceSession,
  clearWorkspaceSession: mocks.clearWorkspaceSession,
}));
vi.mock("./serverApi", () => ({ importSharedDocument: mocks.importSharedDocument }));
vi.mock("./LoginScreen", () => ({ LoginScreen: () => <div>登录</div> }));
vi.mock("./WorkspaceShell", () => ({ WorkspaceShell: () => <div>工作区</div> }));

import { WorkspaceApp } from "./WorkspaceApp";

const session: WorkspaceSession = {
  email: "user@example.com",
  name: "枝间用户",
  userId: "user-1",
  accessToken: "access-token",
};

beforeEach(() => {
  act(() => { clearToasts(); });
  window.localStorage.clear();
  mocks.loadWorkspaceSession.mockReset().mockReturnValue(session);
  mocks.importSharedDocument.mockReset();
  mocks.saveWorkspaceSession.mockReset();
  mocks.clearWorkspaceSession.mockReset();
});

describe("WorkspaceApp", () => {
  it("保存分享文档失败时显示 Toast，不再渲染旧的固定错误条", async () => {
    window.localStorage.setItem("zhijian.workspace.pending-share-token", "share-token");
    mocks.importSharedDocument.mockRejectedValue(new Error("保存分享文档失败：网络不可用"));

    render(<ToastProvider><WorkspaceApp /></ToastProvider>);

    expect(await screen.findByText("保存分享文档失败：网络不可用")).toBeInTheDocument();
    expect(await screen.findByText("工作区")).toBeInTheDocument();
    expect(document.querySelector(".workspace-import-error")).toBeNull();
  });
});
