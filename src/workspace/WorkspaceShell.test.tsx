import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import type { WorkspaceSession } from "./auth";

const serverMocks = vi.hoisted(() => ({
  loadWorkspaceState: vi.fn(),
  saveWorkspaceDocument: vi.fn(),
  saveWorkspaceState: vi.fn(),
}));

vi.mock("../App", () => ({
  default: () => <div data-testid="document-editor" />,
}));

vi.mock("./serverApi", () => ({
  ...serverMocks,
  WorkspaceApiError: class WorkspaceApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));

import { WorkspaceShell } from "./WorkspaceShell";

const session: WorkspaceSession = {
  email: "user@example.com",
  name: "枝间用户",
  userId: "user-1",
  accessToken: "initial-token",
  refreshToken: "refresh-token",
  expiresAt: 1000,
};

describe("WorkspaceShell session refresh", () => {
  beforeEach(() => {
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [{
        id: "file-1",
        title: "产品规划",
        type: "file",
        parentId: null,
        order: 0,
        favorite: false,
        openedAt: 1,
      }],
      documents: { "file-1": createInitialTree() },
    });
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue(undefined);
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
  });

  it("does not reload workspace data when only the access token changes", async () => {
    const onSessionRefresh = vi.fn();
    const onLogout = vi.fn();
    const { rerender } = render(
      <WorkspaceShell session={session} onSessionRefresh={onSessionRefresh} onLogout={onLogout} />,
    );

    expect(await screen.findByTestId("document-editor")).toBeInTheDocument();
    expect(serverMocks.loadWorkspaceState).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceShell
        session={{ ...session, accessToken: "refreshed-token", refreshToken: "next-refresh", expiresAt: 2000 }}
        onSessionRefresh={onSessionRefresh}
        onLogout={onLogout}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("document-editor")).toBeInTheDocument());
    expect(screen.queryByText("正在加载服务器数据")).not.toBeInTheDocument();
    expect(serverMocks.loadWorkspaceState).toHaveBeenCalledTimes(1);
  });
});
