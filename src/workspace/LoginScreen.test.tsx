import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";

vi.mock("./auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

describe("LoginScreen form semantics", () => {
  it("keeps only login credentials in the login form", () => {
    window.history.replaceState({}, "", "/workspace.html");
    render(<LoginScreen onLogin={vi.fn()} />);

    const form = document.querySelector("form");
    expect(form).toHaveAttribute("autocomplete", "on");
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("name", "username");
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("密码")).toHaveAttribute("name", "password");
    expect(screen.getByLabelText("密码")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.queryByLabelText("用户名")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("注册码")).not.toBeInTheDocument();
  });

  it("mounts registration fields with non-credential semantics", () => {
    window.history.replaceState({}, "", "/workspace.html");
    render(<LoginScreen onLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole("link", { name: "注册" }));

    expect(screen.getByLabelText("用户名")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("用户名")).toHaveAttribute("autocomplete", "nickname");
    expect(screen.getByLabelText("注册码")).toHaveAttribute("name", "registrationCode");
    expect(screen.getByLabelText("注册码")).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("密码")).toHaveAttribute("autocomplete", "new-password");
  });
});
