import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import type { WorkspaceSession } from "./auth";

const serverMocks = vi.hoisted(() => ({
  deleteWorkspaceDocument: vi.fn(),
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
    serverMocks.deleteWorkspaceDocument.mockReset().mockResolvedValue(undefined);
  });

  it("does not show a connection status while server data is loading", () => {
    serverMocks.loadWorkspaceState.mockReturnValue(new Promise(() => undefined));

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.queryByText("正在连接服务器...")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载服务器数据")).toBeInTheDocument();
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

describe("回收站彻底删除", () => {
  const trashedFile = { id: "file-9", title: "旧文档", type: "file" as const, parentId: null, order: 0, favorite: false, openedAt: 1 };

  beforeEach(() => {
    window.localStorage.clear();
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    serverMocks.deleteWorkspaceDocument.mockReset().mockResolvedValue(undefined);
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [],
      documents: {},
      trash: [{ id: trashedFile.id, deletedAt: 1, nodes: [trashedFile] }],
    });
  });

  async function openTrash() {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /枝间用户/ }));
    fireEvent.click(screen.getByRole("button", { name: /回收站/ }));
    return screen.getByRole("button", { name: "清空回收站" });
  }

  it("服务端删除失败时保留回收站项目并报错", async () => {
    serverMocks.deleteWorkspaceDocument.mockRejectedValue(new Error("网络不可用"));

    fireEvent.click(await openTrash());

    expect(await screen.findByText("服务器删除文档失败：网络不可用")).toBeInTheDocument();
    expect(screen.getByText("旧文档")).toBeInTheDocument();
  });

  it("服务端删除成功后才清空回收站", async () => {
    fireEvent.click(await openTrash());

    await waitFor(() => expect(screen.getByText("回收站为空")).toBeInTheDocument());
    expect(serverMocks.deleteWorkspaceDocument).toHaveBeenCalledWith(
      expect.anything(),
      "file-9",
      expect.anything(),
    );
  });
});
