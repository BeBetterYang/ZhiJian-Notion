import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import { clearToasts, getToastSnapshot } from "../shared/toast/toast";
import { ToastProvider } from "../shared/toast/ToastProvider";
import type { WorkspaceSession } from "./auth";

const serverMocks = vi.hoisted(() => ({
  deleteWorkspaceDocument: vi.fn(),
  loadDocumentShare: vi.fn(),
  loadWorkspaceDocument: vi.fn(),
  loadWorkspaceState: vi.fn(),
  saveWorkspaceDocument: vi.fn(),
  saveWorkspaceState: vi.fn(),
  updateDocumentShare: vi.fn(),
  updateWorkspaceAccount: vi.fn(),
}));
const editorPreloadMocks = vi.hoisted(() => ({ preloadEditorView: vi.fn() }));

vi.mock("../App", () => ({
  default: ({ store, onShare }: { store: TreeStore; onShare?: () => void }) => {
    const tree = store.getSnapshot();
    return (
      <div
        data-testid="document-editor"
        data-theme={tree.mindMap?.theme?.id ?? ""}
        data-layout={tree.mindMap?.layout?.type ?? ""}
      >
        {tree.nodes[tree.rootId]?.content.text}
        {onShare ? <button type="button" onClick={onShare}>分享</button> : null}
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
import { WorkspaceApiError } from "./serverApi";
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
  clearToasts();
  editorPreloadMocks.preloadEditorView.mockReset().mockResolvedValue({});
  serverMocks.loadDocumentShare.mockReset().mockResolvedValue({ enabled: false });
  serverMocks.updateDocumentShare.mockReset().mockResolvedValue({ enabled: false });
  serverMocks.updateWorkspaceAccount.mockReset().mockResolvedValue({ user: { email: session.email, user_metadata: { name: session.name } } });
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

  it("uses the ZhiJian logo when the user has not uploaded an avatar", async () => {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByAltText("枝间默认头像")).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: "新增" }));
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
    render(<ToastProvider><WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} /></ToastProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /枝间用户/ }));
    fireEvent.click(screen.getByRole("button", { name: /回收站/ }));
    return screen.getByRole("button", { name: "清空回收站" });
  }

  it("服务端删除失败时保留回收站项目并报错", async () => {
    serverMocks.deleteWorkspaceDocument.mockRejectedValue(new Error("网络不可用"));

    fireEvent.click(await openTrash());

    expect(await screen.findByText("删除失败：网络不可用")).toBeInTheDocument();
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

describe("工作区 Toast 反馈", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/workspace.html");
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [{ id: "file-1", title: "产品规划", type: "file", parentId: null, order: 0, favorite: false, openedAt: 1 }],
      documents: { "file-1": createInitialTree() },
      documentRevisions: { "file-1": 1 },
    });
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue({ revision: 2 });
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  function renderWithToasts() {
    return render(<ToastProvider><WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} /></ToastProvider>);
  }

  async function openNodeMenu() {
    fireEvent.click(await screen.findByRole("button", { name: "产品规划的更多操作" }));
  }

  async function openSettings() {
    fireEvent.click(await screen.findByRole("button", { name: /枝间用户/ }));
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
  }

  it("复制节点链接成功和失败都使用 Toast，侧栏不再插入状态行", async () => {
    renderWithToasts();
    await openNodeMenu();
    fireEvent.click(screen.getByRole("button", { name: "拷贝链接" }));
    expect(await screen.findByText("链接已复制")).toBeInTheDocument();
    expect(document.querySelector(".server-status")).toBeNull();

    act(() => { clearToasts(); });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("clipboard denied"));
    await openNodeMenu();
    fireEvent.click(screen.getByRole("button", { name: "拷贝链接" }));
    expect(await screen.findByText("复制失败，请手动复制链接。")).toBeInTheDocument();
  });

  it("分享链接复制使用 Toast，按钮文案始终保持为复制链接", async () => {
    serverMocks.loadDocumentShare.mockResolvedValue({ enabled: true, token: "share-token" });
    renderWithToasts();
    fireEvent.click(await screen.findByRole("button", { name: "分享" }));
    const copyButton = await screen.findByRole("button", { name: "复制链接" });

    fireEvent.click(copyButton);
    expect(await screen.findByText("分享链接已复制")).toBeInTheDocument();
    expect(copyButton).toHaveTextContent("复制链接");

    act(() => { clearToasts(); });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("clipboard denied"));
    fireEvent.click(copyButton);
    expect(await screen.findByText("复制失败，请手动复制链接。")).toBeInTheDocument();
    expect(copyButton).toHaveTextContent("复制链接");
  });

  it("账号设置成功和失败使用 Toast", async () => {
    renderWithToasts();
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(await screen.findByText("账号设置已保存")).toBeInTheDocument();

    act(() => { clearToasts(); });
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "修改邮箱" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新邮箱地址" }), { target: { value: "next@example.com" } });
    serverMocks.updateWorkspaceAccount.mockRejectedValueOnce(new Error("认证服务不可用"));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(await screen.findByText("账号修改失败：认证服务不可用")).toBeInTheDocument();
  });

  it("工作区保存失败显示 Toast 且不改变侧栏布局", async () => {
    serverMocks.saveWorkspaceState.mockRejectedValue(new Error("网络不可用"));
    renderWithToasts();

    expect(await screen.findByText("工作区保存失败：网络不可用", {}, { timeout: 2500 })).toBeInTheDocument();
    expect(document.querySelector(".server-status")).toBeNull();
  });

  it("文档停止编辑约 2 秒后保存，正常保存状态不显示", async () => {
    renderWithToasts();
    await screen.findByTestId("document-editor");

    await openNodeMenu();
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    const input = document.querySelector<HTMLInputElement>(".tree-rename-input");
    if (!input) throw new Error("重命名输入框没有出现。");
    fireEvent.change(input, { target: { value: "等待自动保存" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    expect(serverMocks.saveWorkspaceDocument).not.toHaveBeenCalled();
    expect(screen.queryByText("保存中…")).not.toBeInTheDocument();
    expect(screen.queryByText("已保存")).not.toBeInTheDocument();

    await waitFor(() => expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalledTimes(1), { timeout: 1800 });
    expect(screen.queryByText("保存中…")).not.toBeInTheDocument();
    expect(screen.queryByText("已保存")).not.toBeInTheDocument();
  });

  it("文档保存失败只显示原有保存状态，不重复弹 Toast", async () => {
    serverMocks.saveWorkspaceDocument.mockRejectedValue(new Error("写入失败"));
    renderWithToasts();
    await screen.findByTestId("document-editor");

    await openNodeMenu();
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    const input = document.querySelector<HTMLInputElement>(".tree-rename-input");
    if (!input) throw new Error("重命名输入框没有出现。");
    fireEvent.change(input, { target: { value: "触发文档保存" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByText("保存中…")).not.toBeInTheDocument();
    expect(screen.queryByText("已保存")).not.toBeInTheDocument();
    expect(await screen.findByText("保存失败", {}, { timeout: 3500 })).toBeInTheDocument();
    expect(getToastSnapshot().some((item) => item.message.includes("文档保存"))).toBe(false);
  });
});

describe("文档服务器记录的生命周期", () => {
  /** `Folder ├─ 需求 └─ 子文件夹 └─ 会议记录`，用来验证文件夹副本连子文档内容一起复制。 */
  const folderNodes = [
    { id: "folder", title: "项目 A", type: "folder" as const, parentId: null, order: 0 },
    { id: "file-a", title: "需求", type: "file" as const, parentId: "folder", order: 0, favorite: false, openedAt: 1 },
    { id: "sub", title: "子文件夹", type: "folder" as const, parentId: "folder", order: 1 },
    { id: "file-b", title: "会议记录", type: "file" as const, parentId: "sub", order: 0, favorite: false, openedAt: 2 },
  ];

  function treeWithRootText(text: string) {
    const tree = createInitialTree();
    tree.nodes[tree.rootId].content.text = text;
    return tree;
  }

  beforeEach(() => {
    window.localStorage.clear();
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue({ ok: true, revision: 1 });
    serverMocks.loadWorkspaceDocument.mockReset().mockResolvedValue(null);
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [{ id: "file-1", title: "产品规划", type: "file", parentId: null, order: 0, favorite: false, openedAt: 1 }],
      documents: { "file-1": treeWithRootText("产品规划") },
      documentRevisions: { "file-1": 3 },
    });
  });

  function renderShell() {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
  }

  function sidebar() {
    const section = document.querySelector<HTMLElement>(".workspace-files");
    if (!section) throw new Error("侧栏文件树还没渲染出来。");
    return section;
  }

  async function openNodeMenu(title: string) {
    fireEvent.click(await screen.findByRole("button", { name: `${title}的更多操作` }));
  }

  it("新建文档立刻建立服务器记录，首存用 revision 0", async () => {
    renderShell();
    await screen.findByTestId("document-editor");

    fireEvent.click(await screen.findByRole("button", { name: "新增" }));
    fireEvent.click(screen.getByRole("button", { name: "新增文档" }));

    await waitFor(() => expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalledTimes(1));
    const [, fileId, , revision] = serverMocks.saveWorkspaceDocument.mock.calls[0]!;
    expect(fileId).not.toBe("file-1");
    expect(revision).toBe(0);
  });

  it("复制单篇文档：新 fileId、内容一致、立刻保存", async () => {
    renderShell();
    await openNodeMenu("产品规划");
    fireEvent.click(screen.getByRole("button", { name: "创建副本" }));

    await waitFor(() => expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalledTimes(1));
    const [, copyId, copyTree, revision] = serverMocks.saveWorkspaceDocument.mock.calls[0]!;
    expect(copyId).not.toBe("file-1");
    // 副本是自己的一行，首存从 revision 0 开始，不会去撞源文档的 revision 3。
    expect(revision).toBe(0);
    // 标题以文档根节点为准，所以副本的根节点也叫「… 副本」。
    expect(copyTree.nodes[copyTree.rootId].content.text).toBe("产品规划 副本");
    expect(within(sidebar()).getByText("产品规划 副本")).toBeInTheDocument();
    expect(within(sidebar()).getByText("产品规划")).toBeInTheDocument();
  });

  it("复制文件夹：每一层的文档都各写一行，只有根节点加「副本」", async () => {
    serverMocks.loadWorkspaceState.mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: folderNodes,
      documents: { "file-a": treeWithRootText("需求"), "file-b": treeWithRootText("会议记录") },
    });

    renderShell();
    await openNodeMenu("项目 A");
    fireEvent.click(screen.getByRole("button", { name: "创建副本" }));

    await waitFor(() => expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalledTimes(2));
    const saved = serverMocks.saveWorkspaceDocument.mock.calls.map((call) => {
      const tree = call[2] as ReturnType<typeof createInitialTree>;
      return { fileId: call[1] as string, text: tree.nodes[tree.rootId].content.text };
    });
    expect(new Set(saved.map((entry) => entry.fileId)).size).toBe(2);
    expect(saved.some((entry) => entry.fileId === "file-a" || entry.fileId === "file-b")).toBe(false);
    expect(saved.map((entry) => entry.text).sort()).toEqual(["会议记录", "需求"]);
    // 只有用户点的那个根节点带「副本」，子节点保持原名。
    expect(within(sidebar()).getByText("项目 A 副本")).toBeInTheDocument();
    expect(within(sidebar()).queryByText("需求 副本")).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText("子文件夹 副本")).not.toBeInTheDocument();
  });
});

describe("Workspace Deep Link", () => {
  const nodes = [
    { id: "folder", title: "项目 A", type: "folder" as const, parentId: null, order: 0 },
    { id: "sub", title: "子文件夹", type: "folder" as const, parentId: "folder", order: 0 },
    { id: "file-2", title: "深层文档", type: "file" as const, parentId: "sub", order: 0, favorite: false, openedAt: 2 },
    { id: "file-1", title: "产品规划", type: "file" as const, parentId: null, order: 1, favorite: false, openedAt: 1 },
  ];

  function documents() {
    const first = createInitialTree();
    first.nodes[first.rootId].content.text = "产品规划";
    const second = createInitialTree();
    second.nodes[second.rootId].content.text = "深层文档";
    return { "file-1": first, "file-2": second };
  }

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/workspace.html");
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue({ ok: true, revision: 1 });
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes,
      documents: documents(),
    });
  });

  it("?file= 优先于上次打开的文档，并展开所有父文件夹", async () => {
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-1");
    window.history.replaceState(null, "", "/workspace.html?file=file-2");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByTestId("document-editor")).toHaveTextContent("深层文档");
    // 祖先都展开了，侧栏才真的定位到这一篇。
    const sidebar = document.querySelector<HTMLElement>(".workspace-files")!;
    expect(within(sidebar).getByText("深层文档")).toBeInTheDocument();
  });

  it("链接里的文档已被删除时安全退回上次打开的文档", async () => {
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-1");
    window.history.replaceState(null, "", "/workspace.html?file=file-gone");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByTestId("document-editor")).toHaveTextContent("产品规划");
  });

  it("?folder= 选中并展开文件夹，文档仍是记住的那一篇", async () => {
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-1");
    window.history.replaceState(null, "", "/workspace.html?folder=sub");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByTestId("document-editor")).toHaveTextContent("产品规划");
    const sidebar = document.querySelector<HTMLElement>(".workspace-files")!;
    expect(within(sidebar).getByText("深层文档")).toBeInTheDocument();
  });

  it("地址栏跟着当前文档走，用 replaceState 不堆历史记录", async () => {
    const beforeLength = window.history.length;

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByTestId("document-editor");

    await waitFor(() => expect(new URLSearchParams(window.location.search).get("file")).toBeTruthy());
    expect(window.history.length).toBe(beforeLength);
  });

  /**
   * file 和 folder 一起留在地址栏里，同一个链接会给出两套状态：刷新后正文打开的是那篇文档、
   * 侧栏选中的却是文件夹。所以这两个参数必须互斥，以最后一次选中的那个为准。
   */
  it("切换文档时地址栏只留 file，清掉原来的 folder", async () => {
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-1");
    window.history.replaceState(null, "", "/workspace.html?folder=sub");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    expect(await screen.findByTestId("document-editor")).toHaveTextContent("产品规划");
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("folder")).toBe("sub"));

    const sidebar = document.querySelector<HTMLElement>(".workspace-files")!;
    fireEvent.click(await within(sidebar).findByRole("button", { name: "深层文档" }));

    await waitFor(() => expect(new URLSearchParams(window.location.search).get("file")).toBe("file-2"));
    expect(new URLSearchParams(window.location.search).has("folder")).toBe(false);
  });

  it("选中文件夹时地址栏只留 folder，清掉原来的 file", async () => {
    window.history.replaceState(null, "", "/workspace.html?file=file-2");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    expect(await screen.findByTestId("document-editor")).toHaveTextContent("深层文档");

    const sidebar = document.querySelector<HTMLElement>(".workspace-files")!;
    // 加载遮罩没撤掉之前整块内容都是 aria-hidden 的，按 role 查要等它可访问。
    fireEvent.click(await within(sidebar).findByRole("button", { name: "项目 A" }));

    await waitFor(() => expect(new URLSearchParams(window.location.search).get("folder")).toBe("folder"));
    expect(new URLSearchParams(window.location.search).has("file")).toBe(false);
    // 选文件夹只挪侧栏，正文还是原来那一篇。
    expect(screen.getByTestId("document-editor")).toHaveTextContent("深层文档");
  });

  it("历史链接两个参数都在时以 file 为准，并把地址栏收敛成只有 file", async () => {
    window.history.replaceState(null, "", "/workspace.html?file=file-2&folder=folder");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByTestId("document-editor")).toHaveTextContent("深层文档");
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("folder")).toBe(false));
    expect(new URLSearchParams(window.location.search).get("file")).toBe("file-2");
  });

  it("链接里的文档不存在但文件夹有效时退回记住的文档，不白屏", async () => {
    window.localStorage.setItem("zhijian.workspace.last-open-file.v1:user-1", "file-1");
    window.history.replaceState(null, "", "/workspace.html?file=file-gone&folder=sub");

    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByTestId("document-editor")).toHaveTextContent("产品规划");
    // 文档链接是坏的，这时才轮到 folder 决定侧栏选中哪一个；坏掉的 file 参数一并清掉。
    const sidebar = document.querySelector<HTMLElement>(".workspace-files")!;
    expect(within(sidebar).getByText("深层文档")).toBeInTheDocument();
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("file")).toBe(false));
    expect(new URLSearchParams(window.location.search).get("folder")).toBe("sub");
  });
});

describe("保存冲突（409）", () => {
  const AUTOSAVE_DEBOUNCE_MS = 2000;

  function treeWithRootText(text: string) {
    const tree = createInitialTree();
    tree.nodes[tree.rootId].content.text = text;
    return tree;
  }

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/workspace.html");
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    serverMocks.loadWorkspaceDocument.mockReset();
    serverMocks.saveWorkspaceDocument.mockReset().mockRejectedValue(new WorkspaceApiError("文档已在其他窗口更新。", 409));
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [{ id: "file-1", title: "产品规划", type: "file", parentId: null, order: 0, favorite: false, openedAt: 1 }],
      documents: { "file-1": treeWithRootText("产品规划") },
      documentRevisions: { "file-1": 3 },
    });
  });

  /** 改标题会写进文档根节点，也就是走一次真正的自动保存。 */
  async function renameActiveDocument(from: string, to: string) {
    fireEvent.click(await screen.findByRole("button", { name: `${from}的更多操作` }));
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    const input = document.querySelector<HTMLInputElement>(".tree-rename-input");
    if (!input) throw new Error("重命名输入框没有出现。");
    fireEvent.change(input, { target: { value: to } });
    fireEvent.keyDown(input, { key: "Enter" });
    // 自动保存有 2000ms 防抖，等它真的发出去（或确认它没发）。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 120));
    });
  }

  it("进入冲突后暂停自动保存，换成服务器版本后恢复", async () => {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByTestId("document-editor");

    await renameActiveDocument("产品规划", "改过的标题");

    expect(await screen.findByText("存在保存冲突")).toBeInTheDocument();
    expect(screen.getByText(/此文档已在其他窗口或设备更新/)).toBeInTheDocument();
    const conflictedCalls = serverMocks.saveWorkspaceDocument.mock.calls.length;
    expect(conflictedCalls).toBeGreaterThan(0);

    // 冲突之后继续改内容，也不能再往服务器发注定失败的 PUT。
    await renameActiveDocument("改过的标题", "又改了一次");
    expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalledTimes(conflictedCalls);

    // 换成服务器版本：读回服务器的 tree 和 revision，冲突解除，自动保存恢复。
    serverMocks.loadWorkspaceDocument.mockResolvedValue({ tree: treeWithRootText("服务器版本"), revision: 9 });
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue({ ok: true, revision: 10 });
    fireEvent.click(screen.getByRole("button", { name: "重新加载服务器版本" }));

    await waitFor(() => expect(screen.getByTestId("document-editor")).toHaveTextContent("服务器版本"));
    expect(serverMocks.loadWorkspaceDocument).toHaveBeenCalledWith(expect.anything(), "file-1", expect.anything());

    await renameActiveDocument("服务器版本", "冲突之后的新标题");
    await waitFor(() => expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalled());
    // 用服务器给的 revision 9 继续保存，而不是本地那个已经过期的 3。
    expect(serverMocks.saveWorkspaceDocument.mock.calls.at(-1)?.[3]).toBe(9);
  }, 12000);

  /**
   * 「重新加载服务器版本」自己也会失败（断网、服务器 500）。这时候一旦把状态降级成 error，界面
   * 给出的就是「保存失败 [重试]」，而重试走的 persistDocument() 会因为这篇还在 conflictedDocuments
   * 里直接返回——按钮按下去什么都不会发生。所以读失败要留在冲突态，让用户能再读一次。
   */
  it("重新加载服务器版本失败后仍留在冲突态，可以再读一次", async () => {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByTestId("document-editor");

    await renameActiveDocument("产品规划", "本地改的标题");
    expect(await screen.findByText("存在保存冲突")).toBeInTheDocument();
    const conflictedCalls = serverMocks.saveWorkspaceDocument.mock.calls.length;
    expect(conflictedCalls).toBeGreaterThan(0);

    // 第一次读服务器版本卡在路上：按钮换成「正在重新加载…」并且点不动，避免连点发起第二次读取。
    let rejectReload: ((error: Error) => void) | undefined;
    serverMocks.loadWorkspaceDocument.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectReload = reject; }),
    );
    fireEvent.click(screen.getByRole("button", { name: "重新加载服务器版本" }));
    expect(screen.getByRole("button", { name: "正在重新加载…" })).toBeDisabled();

    await act(async () => {
      rejectReload?.(new WorkspaceApiError("网络不可用。", 0));
      await Promise.resolve();
    });

    // 读失败：仍然是冲突，只是多了一行失败原因；不是「保存失败 [重试]」。
    expect(await screen.findByText("重新加载失败：网络不可用。")).toBeInTheDocument();
    expect(screen.getByText("存在保存冲突")).toBeInTheDocument();
    expect(screen.queryByText("保存失败")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载服务器版本" })).toBeEnabled();
    // 也没有拿服务器内容悄悄盖掉本地这一版。
    expect(screen.getByTestId("document-editor")).toHaveTextContent("本地改的标题");

    // 冲突还挂着，自动保存也就还停着：继续编辑只留在内存里，不发新的 PUT。
    await renameActiveDocument("本地改的标题", "又改了一次");
    expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalledTimes(conflictedCalls);

    // 再读一次，这次成功：换成服务器版本，revision 跟着更新，冲突解除。
    serverMocks.loadWorkspaceDocument.mockResolvedValue({ tree: treeWithRootText("服务器版本"), revision: 9 });
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue({ ok: true, revision: 10 });
    fireEvent.click(screen.getByRole("button", { name: "重新加载服务器版本" }));

    await waitFor(() => expect(screen.getByTestId("document-editor")).toHaveTextContent("服务器版本"));
    expect(screen.queryByText("存在保存冲突")).not.toBeInTheDocument();
    expect(serverMocks.loadWorkspaceDocument).toHaveBeenCalledTimes(2);

    // 自动保存恢复，并且用服务器给回来的 revision 9 继续保存。
    await renameActiveDocument("服务器版本", "恢复之后的标题");
    await waitFor(() => expect(serverMocks.saveWorkspaceDocument).toHaveBeenCalled());
    expect(serverMocks.saveWorkspaceDocument.mock.calls.at(-1)?.[3]).toBe(9);
  }, 12000);
});

describe("侧栏收起状态记忆", () => {
  const SIDEBAR_COLLAPSED_KEY = "zhijian.workspace.sidebar-collapsed.v1";

  /**
   * 断点是 CSS 说了算的（`@media (max-width: 720px)`），jsdom 既不套样式表也没有 matchMedia，
   * 所以直接把这个接口顶掉，用它来声明「这次跑的是桌面端还是移动端」。
   */
  function stubViewport(mobile: boolean) {
    const query = { matches: mobile, addEventListener: () => undefined, removeEventListener: () => undefined };
    vi.stubGlobal("matchMedia", () => query as unknown as MediaQueryList);
  }

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/workspace.html");
    stubViewport(false);
    serverMocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    serverMocks.saveWorkspaceDocument.mockReset().mockResolvedValue({ ok: true, revision: 1 });
    serverMocks.loadWorkspaceState.mockReset().mockResolvedValue({
      profile: { name: "枝间用户", email: session.email, avatarUrl: "" },
      nodes: [{ id: "file-1", title: "产品规划", type: "file", parentId: null, order: 0, favorite: false, openedAt: 1 }],
      documents: { "file-1": createInitialTree() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function shell() {
    return document.querySelector<HTMLElement>(".workspace-shell-ui")!;
  }

  async function renderShell() {
    render(<WorkspaceShell session={session} onSessionRefresh={vi.fn()} onLogout={vi.fn()} />);
    // 加载遮罩撤掉之前整块内容都是 aria-hidden 的，按 role 查要等它可访问。
    await screen.findByTestId("document-editor");
  }

  it("桌面端没有记录时默认收起", async () => {
    await renderShell();

    expect(shell()).toHaveClass("is-collapsed");
    expect(await screen.findByRole("button", { name: "展开侧栏" })).toBeInTheDocument();
    // 只是默认值，还不是用户的选择：没人按过按钮就不该往浏览器里写东西。
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
  });

  it("记录为展开时保持展开", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "false");

    await renderShell();

    expect(shell()).not.toHaveClass("is-collapsed");
    expect(await screen.findByRole("button", { name: "收起侧栏" })).toBeInTheDocument();
  });

  it("记录为收起时保持收起", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");

    await renderShell();

    expect(shell()).toHaveClass("is-collapsed");
  });

  it("用户收起再展开，两次都记进 localStorage", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "false");
    await renderShell();

    fireEvent.click(await screen.findByRole("button", { name: "收起侧栏" }));
    expect(shell()).toHaveClass("is-collapsed");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("true");

    fireEvent.click(await screen.findByRole("button", { name: "展开侧栏" }));
    expect(shell()).not.toHaveClass("is-collapsed");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("false");
  });

  /** 移动端侧栏是抽屉，进了 `is-collapsed` 会连着被按成透明且点不动的，所以那边不读这条偏好。 */
  it("移动端不读桌面偏好，侧栏保持关着的抽屉", async () => {
    stubViewport(true);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");

    await renderShell();

    expect(shell()).not.toHaveClass("is-collapsed");
    expect(document.querySelector(".workspace-sidebar")).not.toHaveClass("is-open");
    expect(screen.queryByRole("button", { name: "展开侧栏" })).not.toBeInTheDocument();
  });
});
