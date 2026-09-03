import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "./core/tree";
import { TreeStore } from "./core/treeStore";
import { SHORTCUTS, formatShortcutHint } from "./shared/shortcuts/shortcutRegistry";

// 两个编辑器都是懒加载的重依赖（BlockNote / MindElixir），这里只看标题栏的菜单，换成占位。
vi.mock("./outline/OutlineEditor", () => ({ OutlineEditor: () => <div data-testid="outline-editor" /> }));
vi.mock("./mindmap/MindMapEditor", () => ({
  // 「聚焦到某个节点」是 App 递给导图的一次性请求，占位把它摊在属性上，好断言。
  MindMapEditor: ({ focusNodeRequest }: { focusNodeRequest?: { nodeId: string; requestId: number } | null }) => (
    <div
      data-testid="mindmap-editor"
      data-focus-node-id={focusNodeRequest?.nodeId ?? ""}
      data-focus-request-id={focusNodeRequest?.requestId ?? ""}
    />
  ),
}));

import App from "./App";

function registryHint(id: Parameters<typeof formatShortcutHint>[0]["id"]) {
  return formatShortcutHint(SHORTCUTS.find((shortcut) => shortcut.id === id)!);
}

describe("标题栏「更多」菜单", () => {
  let store: TreeStore;

  beforeEach(() => {
    window.localStorage.clear();
    store = new TreeStore(createInitialTree());
  });

  async function renderApp(props: Partial<Parameters<typeof App>[0]> = {}) {
    render(<App store={store} {...props} />);
    // 编辑器是 lazy 的，等它挂上来再操作，不然 Suspense 会在断言之后才 resolve。
    await screen.findByTestId("outline-editor");
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    return screen.getByRole("menu");
  }

  it("列出撤销、重做、星标、删除和快捷键列表", async () => {
    const menu = await renderApp({ onToggleFavorite: () => undefined, onDeleteDocument: () => undefined });

    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "撤销Ctrl Z",
      "重做Ctrl Shift Z",
      "导入",
      "导出",
      "添加星标",
      "删除",
      `快捷键列表${registryHint("shortcut-help")}`,
    ]);
  });

  it("快捷键提示照 registry 显示，用的是现有的 kbd", async () => {
    const menu = await renderApp();
    const help = within(menu).getByRole("menuitem", { name: /快捷键列表/ });

    // 断言值从 registry 算出来：改了 registry 这里跟着变，菜单里没有第二份配置。
    expect(within(help).getByText(registryHint("shortcut-help"), { selector: "kbd" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /撤销/ }).querySelector("kbd")).toHaveTextContent("Ctrl Z");
  });

  it("撤销和重做走文档自己的历史，没有可撤销的一步时是灰的", async () => {
    const menu = await renderApp();
    const undo = within(menu).getByRole("menuitem", { name: /撤销/ });
    const redo = within(menu).getByRole("menuitem", { name: /重做/ });

    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    // 编辑一次之后菜单项自己就亮了：订阅了 store，每次提交都会重新渲染。
    const rootId = store.getSnapshot().rootId;
    act(() => store.updateContent(rootId, "改过的标题"));
    expect(undo).toBeEnabled();

    fireEvent.click(undo);
    expect(store.getSnapshot().nodes[rootId].content.text).not.toBe("改过的标题");

    // 上一步点完菜单收起来了，重做得重新打开菜单。
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /重做/ }));

    expect(store.getSnapshot().nodes[rootId].content.text).toBe("改过的标题");
  });

  it("星标的文案跟着当前状态翻转", async () => {
    const onToggleFavorite = vi.fn();
    const menu = await renderApp({ favorite: true, onToggleFavorite });

    fireEvent.click(within(menu).getByRole("menuitem", { name: "取消星标" }));

    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    // 点完菜单收起来，不挡着正文。
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("删除交给外面处理，自己不动文档", async () => {
    const onDeleteDocument = vi.fn();
    const menu = await renderApp({ onDeleteDocument });

    fireEvent.click(within(menu).getByRole("menuitem", { name: "删除" }));

    expect(onDeleteDocument).toHaveBeenCalledTimes(1);
  });

  it("快捷键列表打开的是同一个帮助面板", async () => {
    const menu = await renderApp();

    fireEvent.click(within(menu).getByRole("menuitem", { name: /快捷键列表/ }));

    const dialog = screen.getByRole("dialog", { name: "快捷键" });
    expect(within(dialog).getByRole("heading", { level: 3, name: "主题操作" })).toBeInTheDocument();
    expect(within(dialog).getByText("Mac 上的 Ctrl 为 ⌘")).toBeInTheDocument();
  });

  it("只读时不给改文档的入口，但快捷键列表还在", async () => {
    const menu = await renderApp({ readOnly: true, onToggleFavorite: () => undefined });

    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "导出",
      "添加星标",
      `快捷键列表${registryHint("shortcut-help")}`,
    ]);
  });

  it("没有工作区给的回调时不显示星标和删除", async () => {
    const menu = await renderApp();

    expect(within(menu).queryByRole("menuitem", { name: "添加星标" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "删除" })).not.toBeInTheDocument();
  });
});

describe("默认视图", () => {
  const viewStateStorageKey = "zhijian.test.document.view-state.v1";
  let store: TreeStore;

  beforeEach(() => {
    window.localStorage.clear();
    store = new TreeStore(createInitialTree());
  });

  // 切换按钮上写的是「要切去哪」，所以它的名字反过来告诉我们现在开着的是哪个视图。
  async function renderApp(props: Partial<Parameters<typeof App>[0]> = {}) {
    render(<App store={store} viewStateStorageKey={viewStateStorageKey} {...props} />);
    return screen.findByRole("button", { name: /切换到/ });
  }

  it("没给偏好时开大纲笔记", async () => {
    expect(await renderApp()).toHaveAccessibleName("切换到思维导图");
    expect(screen.getByTestId("outline-editor")).toBeInTheDocument();
  });

  it("偏好选了思维导图，没记过视图的文档就直接开导图", async () => {
    expect(await renderApp({ defaultView: "mindmap" })).toHaveAccessibleName("切换到大纲笔记");
    expect(await screen.findByTestId("mindmap-editor")).toBeInTheDocument();
  });

  it("这篇自己记过视图时以它为准，偏好不覆盖", async () => {
    window.localStorage.setItem(viewStateStorageKey, JSON.stringify({ activeView: "outline" }));

    expect(await renderApp({ defaultView: "mindmap" })).toHaveAccessibleName("切换到思维导图");
    expect(screen.getByTestId("outline-editor")).toBeInTheDocument();
  });
});

describe("导图里的查找定位", () => {
  let store: TreeStore;

  beforeEach(() => {
    window.localStorage.clear();
    // createInitialTree: 产品规划 →（Web端、App端），搜「端」正好两处命中，顺序是 web、app。
    store = new TreeStore(createInitialTree());
  });

  async function openSearch(defaultView: "outline" | "mindmap") {
    render(<App store={store} defaultView={defaultView} />);
    await screen.findByTestId(defaultView === "mindmap" ? "mindmap-editor" : "outline-editor");
    fireEvent.click(screen.getByRole("button", { name: "查找替换" }));
    return screen.getByPlaceholderText("搜索关键词");
  }

  function focusedNodeId() {
    return screen.getByTestId("mindmap-editor").getAttribute("data-focus-node-id");
  }

  function focusRequestId() {
    return screen.getByTestId("mindmap-editor").getAttribute("data-focus-request-id");
  }

  it("输入关键词就把第一处命中递给导图去定位", async () => {
    const input = await openSearch("mindmap");
    expect(focusedNodeId()).toBe("");

    fireEvent.change(input, { target: { value: "端" } });

    expect(focusedNodeId()).toBe("web");
  });

  it("上一处下一处换命中项，每次都是新的请求号", async () => {
    const input = await openSearch("mindmap");
    fireEvent.change(input, { target: { value: "端" } });
    const firstRequestId = focusRequestId();

    // 上一处/下一处挂在替换那一行里，先把它展开。
    fireEvent.click(screen.getByRole("button", { name: "查找" }));
    fireEvent.click(screen.getByRole("button", { name: "下一处" }));

    expect(focusedNodeId()).toBe("app");
    expect(Number(focusRequestId())).toBeGreaterThan(Number(firstRequestId));

    // 走到头绕回第一处，画布也得跟着回去，所以请求号还得再涨一次。
    fireEvent.click(screen.getByRole("button", { name: "下一处" }));
    expect(focusedNodeId()).toBe("web");

    fireEvent.click(screen.getByRole("button", { name: "上一处" }));
    expect(focusedNodeId()).toBe("app");
  });

  it("关键词换成没有命中的，画布留在原处", async () => {
    const input = await openSearch("mindmap");
    fireEvent.change(input, { target: { value: "端" } });
    const requestId = focusRequestId();

    fireEvent.change(input, { target: { value: "查无此词" } });

    expect(focusedNodeId()).toBe("web");
    expect(focusRequestId()).toBe(requestId);
  });

  it("在大纲里搜好再切到导图，命中项跟着定位过去", async () => {
    const input = await openSearch("outline");
    fireEvent.change(input, { target: { value: "端" } });

    fireEvent.click(screen.getByRole("button", { name: "切换到思维导图" }));
    await screen.findByTestId("mindmap-editor");

    expect(focusedNodeId()).toBe("web");
  });
});
