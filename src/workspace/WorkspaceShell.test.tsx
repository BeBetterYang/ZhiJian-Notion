import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import type { WorkspaceSession } from "./auth";

const serverMocks = vi.hoisted(() => ({
  loadWorkspaceState: vi.fn(),
  saveWorkspaceDocument: vi.fn(),
  saveWorkspaceState: vi.fn(),
}));

vi.mock("../App", () => ({
  default: ({ store }: { store: TreeStore }) => (
    <div data-testid="document-editor">{store.getSnapshot().nodes[store.getSnapshot().rootId]?.content.text}</div>
  ),
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
    window.localStorage.clear();
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

  it("restores the last opened file for the signed-in user", async () => {
    const secondTree = createInitialTree();
    secondTree.nodes[secondTree.rootId].content.text = "第二个文档";
    serverMocks.loadWorkspaceState.mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [
        { id: "file-1", title: "产品规划", type: "file", parentId: null, order: 0, favorite: false, openedAt: 1 },
        { id: "file-2", title: "第二个文档", type: "file", parentId: null, order: 1, favorite: false, openedAt: 2 },
      ],
      documents: { "file-1": createInitialTree(), "file-2": secondTree },
    });
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-2");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByTestId("document-editor")).toHaveTextContent("第二个文档");
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
