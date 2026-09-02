import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./ToastProvider";
import { clearToasts, getToastSnapshot, toast } from "./toast";

afterEach(() => {
  act(() => { clearToasts(); });
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("portals notifications to document.body without stealing focus", () => {
    render(<ToastProvider><input aria-label="编辑标题" /></ToastProvider>);
    const input = screen.getByRole("textbox", { name: "编辑标题" });
    input.focus();

    act(() => { toast.success("已保存"); });

    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(screen.getByRole("status").parentElement).toBe(document.body.querySelector(".toast-viewport"));
    expect(input).toHaveFocus();
  });

  it("deduplicates repeated messages and keeps at most three notifications", () => {
    act(() => {
      toast.error("网络异常");
      toast.error("网络异常");
      toast.info("第一条");
      toast.warning("第二条");
      toast.success("第三条");
    });

    expect(getToastSnapshot()).toHaveLength(3);
    expect(getToastSnapshot().map((item) => item.message)).toEqual(["第一条", "第二条", "第三条"]);
  });

  it("automatically dismisses transient notifications after their default duration", () => {
    vi.useFakeTimers();
    render(<ToastProvider>{null}</ToastProvider>);
    act(() => { toast.success("链接已复制"); });

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole("status")).toHaveClass("is-exiting");

    act(() => { vi.advanceTimersByTime(180); });
    expect(screen.queryByText("链接已复制")).not.toBeInTheDocument();
  });

  it("keeps persistent errors until the user closes them", () => {
    vi.useFakeTimers();
    render(<ToastProvider>{null}</ToastProvider>);
    act(() => { toast.error("工作区加载失败：网络不可用", { persistent: true }); });

    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByRole("alert")).toHaveTextContent("工作区加载失败：网络不可用");

    fireEvent.click(screen.getByRole("button", { name: "关闭通知" }));
    act(() => { vi.advanceTimersByTime(180); });
    expect(screen.queryByText("工作区加载失败：网络不可用")).not.toBeInTheDocument();
  });
});
