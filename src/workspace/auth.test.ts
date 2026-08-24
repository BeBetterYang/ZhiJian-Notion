import { describe, expect, it } from "vitest";
import { validateLogin, validateRegistration } from "./auth";

describe("workspace login", () => {
  it("accepts a valid local preview session without retaining the password", () => {
    const result = validateLogin(" Yang.Yang@example.com ", "123456");
    expect(result.session).toEqual({ email: "yang.yang@example.com", name: "Yang Yang" });
    expect(result.session).not.toHaveProperty("password");
  });

  it("rejects invalid credentials", () => {
    expect(validateLogin("invalid", "123456").error).toContain("邮箱");
    expect(validateLogin("user@example.com", "123").error).toContain("6");
  });

  it("registers a local preview session without retaining the password", () => {
    const result = validateRegistration("枝间用户", "new.user@example.com", "secure-password", "nihaozhijian");
    expect(result.session).toEqual({ email: "new.user@example.com", name: "枝间用户" });
    expect(result.session).not.toHaveProperty("password");
  });

  it("requires a username when registering", () => {
    expect(validateRegistration("  ", "new.user@example.com", "secure-password", "nihaozhijian").error).toContain("用户名");
  });

  it("requires the registration code when registering", () => {
    expect(validateRegistration("枝间用户", "new.user@example.com", "secure-password", "wrong").error).toContain("注册码");
  });
});
