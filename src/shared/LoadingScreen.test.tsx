import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen } from "./LoadingScreen";

afterEach(() => {
  vi.useRealTimers();
});

describe("LoadingScreen", () => {
  it("does not flash when the workspace is ready within the delay", () => {
    vi.useFakeTimers();
    const { rerender } = render(<LoadingScreen ready={false}><div>工作区内容</div></LoadingScreen>);

    act(() => vi.advanceTimersByTime(200));
    rerender(<LoadingScreen ready><div>工作区内容</div></LoadingScreen>);
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.queryByRole("status", { name: "枝间" })).not.toBeInTheDocument();
    expect(screen.getByText("工作区内容").parentElement).toHaveClass("is-visible");
  });

  it("delays display, keeps the visible minimum, then removes the overlay", () => {
    vi.useFakeTimers();
    const { rerender } = render(<LoadingScreen ready={false}><div>工作区内容</div></LoadingScreen>);

    act(() => vi.advanceTimersByTime(239));
    expect(screen.queryByRole("status", { name: "枝间" })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status", { name: "枝间" })).toBeInTheDocument();

    rerender(<LoadingScreen ready><div>工作区内容</div></LoadingScreen>);
    act(() => vi.advanceTimersByTime(499));
    expect(screen.getByRole("status", { name: "枝间" })).not.toHaveClass("is-exiting");

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status", { name: "枝间" })).toHaveClass("is-exiting");
    expect(screen.getByText("工作区内容").parentElement).toHaveClass("is-visible");

    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("status", { name: "枝间" })).not.toBeInTheDocument();
  });
});
