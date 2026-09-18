import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../../core/tree";
import { TreeStore } from "../../core/treeStore";
import type { WorkspaceSession } from "../../workspace/auth";
import { AIChatPanel, AIChatWidget } from "./AIChatWidget";

const session: WorkspaceSession = { email: "test@example.com", name: "测试", userId: "user-1", accessToken: "token" };

beforeEach(() => window.localStorage.clear());

function chat(overrides: Partial<ComponentProps<typeof AIChatPanel>["chat"]> = {}) {
  return {
    messages: [],
    contextTruncated: false,
    error: "",
    isStreaming: false,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  } as ComponentProps<typeof AIChatPanel>["chat"];
}

describe("AIChatPanel", () => {
  it("shows quick actions and sends the selected prompt", () => {
    const onSend = vi.fn();
    render(<AIChatPanel documentTitle="当前文档" chat={chat({ sendMessage: onSend })} onClose={vi.fn()} />);
    expect(screen.getByText("喵呜～人，你有什么要求？")).toBeInTheDocument();
    expect(screen.queryByText("新建 AI 对话")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "总结文档" }));
    expect(onSend).toHaveBeenCalledWith("总结文档");
  });

  it("opens the AI display mode menu from the header", () => {
    const onOpenLayoutMenu = vi.fn();
    render(<AIChatPanel documentTitle="当前文档" chat={chat()} onClose={vi.fn()} onOpenLayoutMenu={onOpenLayoutMenu} />);
    fireEvent.click(screen.getByRole("button", { name: "切换 AI 显示模式" }));
    expect(onOpenLayoutMenu).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "关闭 AI 聊天" })).toBeInTheDocument();
  });

  it("does not render a layout menu title", () => {
    render(<AIChatPanel documentTitle="当前文档" chat={chat()} onClose={vi.fn()} />);
    expect(screen.queryByText("AI 聊天布局")).not.toBeInTheDocument();
  });

  it("uses enter to send and shift-enter to keep composing", () => {
    const onSend = vi.fn();
    render(<AIChatPanel documentTitle="当前文档" chat={chat({ sendMessage: onSend })} onClose={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "输入问题" });
    fireEvent.change(input, { target: { value: "问题" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("问题");
  });

  it("opens the layout menu with right click and persists floating mode", () => {
    render(<AIChatWidget documentId="file-1" documentTitle="当前文档" store={new TreeStore(createInitialTree())} session={session} onSessionRefresh={vi.fn()} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "和 AI 聊聊" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "悬浮模式" }));
    fireEvent.click(screen.getByRole("button", { name: "和 AI 聊聊" }));
    expect(screen.getByRole("dialog", { name: "和 AI 聊聊" })).toHaveClass("is-floating");
    expect(window.localStorage.getItem("zhijian.ai-chat-layout.v1:user-1")).toBe("floating");
  });

  it("resizes and persists the sidebar width from its left edge", () => {
    render(<AIChatWidget documentId="file-1" documentTitle="当前文档" store={new TreeStore(createInitialTree())} session={session} onSessionRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "和 AI 聊聊" }));
    const resizer = screen.getByRole("separator", { name: "调整 AI 面板宽度" });
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(pointerDown, "clientX", { value: 500 });
    const pointerMove = new Event("pointermove");
    Object.defineProperty(pointerMove, "clientX", { value: 400 });
    act(() => {
      resizer.dispatchEvent(pointerDown);
      window.dispatchEvent(pointerMove);
      window.dispatchEvent(new Event("pointerup"));
    });
    expect(window.localStorage.getItem("zhijian.ai-chat-panel-width.v1:user-1")).toBe("492");
  });
});
