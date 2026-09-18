import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_OUTLINE_API_URL, type AIProviderConfig } from "../aiProviderConfig";
import { AIProviderSettings } from "./AIProviderSettings";

const value: AIProviderConfig = { enabled: false, apiKey: "", model: "", apiUrl: DEFAULT_AI_OUTLINE_API_URL };

describe("AIProviderSettings", () => {
  it("requires a complete provider config before saving", () => {
    const onSave = vi.fn();
    render(<AIProviderSettings value={value} onSave={onSave} />);
    fireEvent.click(screen.getByRole("switch", { name: "启用 AI 文档导入" }));
    fireEvent.click(screen.getByRole("button", { name: "保存 AI 设置" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请填写 API 密钥");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("returns the normalized provider config", () => {
    const onSave = vi.fn();
    render(<AIProviderSettings value={value} onSave={onSave} />);
    fireEvent.click(screen.getByRole("switch", { name: "启用 AI 文档导入" }));
    fireEvent.change(screen.getByLabelText("AI API 密钥"), { target: { value: "  test-key " } });
    fireEvent.change(screen.getByLabelText("AI 模型名称"), { target: { value: "  test-model " } });
    fireEvent.click(screen.getByRole("button", { name: "保存 AI 设置" }));
    expect(onSave).toHaveBeenCalledWith({ enabled: true, apiKey: "test-key", model: "test-model", apiUrl: DEFAULT_AI_OUTLINE_API_URL });
  });

  it("defaults to disabled and allows saving while disabled", () => {
    const onSave = vi.fn();
    render(<AIProviderSettings value={value} onSave={onSave} />);
    expect(screen.getByRole("switch", { name: "启用 AI 文档导入" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: "保存 AI 设置" }));
    expect(onSave).toHaveBeenCalledWith(value);
  });
});
