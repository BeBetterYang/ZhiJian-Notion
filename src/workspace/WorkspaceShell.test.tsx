import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const editorPreloadMocks = vi.hoisted(() => ({ preloadEditorView: vi.fn() }));

vi.mock("../App", () => ({
  default: ({ store }: { store: TreeStore }) => {
    const tree = store.getSnapshot();
    return (
      <div
        data-testid="document-editor"
        data-theme={tree.mindMap?.theme?.id ?? ""}
        data-layout={tree.mindMap?.layout?.type ?? ""}
      >
        {tree.nodes[tree.rootId]?.content.text}
      </div>
    );
  },
}));

vi.mock("./serverApi", () => ({
  ...serverMocks,
  WorkspaceApiError: class WorkspaceApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));
vi.mock("../shared/editorPreload", () => editorPreloadMocks);

import { WorkspaceShell } from "./WorkspaceShell";
import { workspaceNodeMenuPosition } from "./workspaceNodeMenuPosition";

const session: WorkspaceSession = {
  email: "user@example.com",
  name: "枝间用户",
  userId: "user-1",
  accessToken: "initial-token",
  refreshToken: "refresh-token",
  expiresAt: 1000,
};

beforeEach(() => {
  editorPreloadMocks.preloadEditorView.mockReset().mockResolvedValue({});
});

describe("侧边栏更多菜单定位", () => {
  it("底部空间不足时显示在按钮上方", () => {
    expect(workspaceNodeMenuPosition(
      { top: 740, right: 300, bottom: 764 },
      { width: 206, height: 230 },
      { width: 1200, height: 800 },
    )).toEqual({ top: 506, left: 94 });
  });

  it("空间足够时显示在按钮下方并限制在视口内", () => {
    expect(workspaceNodeMenuPosition(
      { top: 100, right: 150, bottom: 124 },
      { width: 206, height: 230 },
      { width: 320, height: 800 },
    )).toEqual({ top: 128, left: 8 });
  });
});

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

  it("does not show loading status text while server data is loading", () => {
    editorPreloadMocks.preloadEditorView.mockReturnValue(new Promise(() => undefined));
    serverMocks.loadWorkspaceState.mockReturnValue(new Promise(() => undefined));

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.queryByText("正在连接服务器...")).not.toBeInTheDocument();
    expect(screen.queryByText("正在加载服务器数据")).not.toBeInTheDocument();
    expect(screen.queryByText("正在加载工作区")).not.toBeInTheDocument();
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

  it("starts the remembered editor preload before the workspace API settles", () => {
    const starts: string[] = [];
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-2");
    window.localStorage.setItem("zhijian.workspace.document.file-2.view-state.v1", JSON.stringify({ activeView: "mindmap" }));
    editorPreloadMocks.preloadEditorView.mockImplementation(() => {
      starts.push("editor");
      return new Promise(() => undefined);
    });
    serverMocks.loadWorkspaceState.mockImplementation(() => {
      starts.push("api");
      return new Promise(() => undefined);
    });

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(editorPreloadMocks.preloadEditorView).toHaveBeenCalledWith("mindmap");
    expect(starts).toEqual(["editor", "api"]);
  });

  it("falls back to the outline editor when the remembered view state is invalid", () => {
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-2");
    window.localStorage.setItem("zhijian.workspace.document.file-2.view-state.v1", "not-json");
    editorPreloadMocks.preloadEditorView.mockReturnValue(new Promise(() => undefined));
    serverMocks.loadWorkspaceState.mockReturnValue(new Promise(() => undefined));

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(editorPreloadMocks.preloadEditorView).toHaveBeenCalledWith("outline");
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

  it("keeps an existing document's choices and applies user defaults to a new document", async () => {
    const existing = createInitialTree();
    existing.mindMap = {
      theme: { id: "ocean", version: 1 },
      layout: { type: "logic", direction: "left" },
    };
    serverMocks.loadWorkspaceState.mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      preferences: {
        mindMapDefaults: {
          theme: { id: "yanpi", version: 1 },
          layout: { type: "mind-map", direction: "both", order: "alternating" },
        },
      },
      nodes: [{ id: "file-1", title: "产品规划", type: "file", parentId: null, order: 0, favorite: false, openedAt: 1 }],
      documents: { "file-1": existing },
    });

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    const existingEditor = await screen.findByTestId("document-editor");
    expect(existingEditor).toHaveAttribute("data-theme", "ocean");
    expect(existingEditor).toHaveAttribute("data-layout", "logic");

    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    fireEvent.click(screen.getByRole("button", { name: "新增文档" }));

    await waitFor(() => expect(screen.getByTestId("document-editor")).toHaveAttribute("data-theme", "yanpi"));
    expect(screen.getByTestId("document-editor")).toHaveAttribute("data-layout", "mind-map");
  });

  it("portals the sidebar node menu outside the scrolling sidebar", async () => {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "产品规划的更多操作" }));
    const menu = screen.getByRole("button", { name: "重命名" }).closest(".node-menu");

    await waitFor(() => expect(menu).toHaveStyle({ visibility: "visible" }));
    expect(menu?.parentElement).toBe(document.body);
    expect(menu).toHaveStyle({ position: "fixed" });
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

describe("批量导入文档", () => {
  beforeEach(() => {
    window.localStorage.clear();
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue({ revision: 1 });
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [{ id: "file-1", title: "产品规划", type: "file", parentId: null, order: 0, favorite: false, openedAt: 1 }],
      documents: { "file-1": createInitialTree() },
    });
  });

  function markdownFile(name: string, markdown: string) {
    const file = new File([markdown], name, { type: "text/markdown" });
    // jsdom 的 Blob 没有实现 text()，补上一份，浏览器里用的是原生实现。
    Object.defineProperty(file, "text", { value: async () => markdown });
    return file;
  }

  async function importFiles(files: File[]) {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByTestId("document-editor");
    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    if (!input) throw new Error("找不到导入用的文件输入框。");
    fireEvent.change(input, { target: { files } });
  }

  function fileTree() {
    const section = document.querySelector<HTMLElement>(".workspace-files");
    if (!section) throw new Error("侧栏文件树还没渲染出来。");
    return section;
  }

  it("一次导入多个文件，各自成为一篇新文档并保持选择顺序", async () => {
    await importFiles([
      markdownFile("甲.md", "# 文档甲\n\n甲的内容\n"),
      markdownFile("乙.md", "# 文档乙\n\n乙的内容\n"),
    ]);

    await waitFor(() => expect(within(fileTree()).getByText("文档甲")).toBeInTheDocument());
    expect(within(fileTree()).getByText("文档乙")).toBeInTheDocument();
    // 原有文档还在，导入不覆盖任何东西。
    expect(within(fileTree()).getByText("产品规划")).toBeInTheDocument();
    const tree = fileTree().textContent ?? "";
    expect(tree.indexOf("文档甲")).toBeLessThan(tree.indexOf("文档乙"));
  });

  it("导入的文档立刻写一次服务器，没打开过也不会丢", async () => {
    await importFiles([
      markdownFile("甲.md", "# 文档甲\n"),
      markdownFile("乙.md", "# 文档乙\n"),
    ]);

    await waitFor(() => expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalledTimes(2));
    // 两篇文档必须各写一行，共用 id 会让它们共用同一份内容。
    const savedIds = serverMocks.saveWorkspaceDocument.mock.calls.map((call) => call[1]);
    expect(new Set(savedIds).size).toBe(2);
  });

  it("没有 # 标题时用文件名命名", async () => {
    await importFiles([markdownFile("会议记录.md", "只有正文\n"), markdownFile("乙.md", "# 文档乙\n")]);

    await waitFor(() => expect(within(fileTree()).getByText("会议记录")).toBeInTheDocument());
  });
});
