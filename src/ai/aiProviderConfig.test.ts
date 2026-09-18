import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AI_OUTLINE_API_URL,
  emptyAIProviderConfig,
  isAIProviderConfigComplete,
  loadAIProviderConfig,
  saveAIProviderConfig,
} from "./aiProviderConfig";

describe("AI provider config", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses a safe default endpoint and isolates config by user", () => {
    expect(loadAIProviderConfig("user-1")).toEqual(emptyAIProviderConfig());
    saveAIProviderConfig("user-1", { enabled: true, apiKey: " key ", model: " model ", apiUrl: "https://ai.test/v1/" });
    expect(loadAIProviderConfig("user-1")).toEqual({ enabled: true, apiKey: "key", model: "model", apiUrl: "https://ai.test/v1/chat/completions" });
    expect(loadAIProviderConfig("user-2")).toEqual(emptyAIProviderConfig());
  });

  it("keeps a complete chat completions endpoint unchanged", () => {
    saveAIProviderConfig("user-1", { enabled: true, apiKey: "key", model: "model", apiUrl: DEFAULT_AI_OUTLINE_API_URL });
    expect(loadAIProviderConfig("user-1").apiUrl).toBe(DEFAULT_AI_OUTLINE_API_URL);
  });

  it("checks whether all provider fields are ready", () => {
    expect(isAIProviderConfigComplete(emptyAIProviderConfig())).toBe(false);
    expect(isAIProviderConfigComplete({ enabled: true, apiKey: "key", model: "model", apiUrl: "https://ai.test/v1/chat/completions" })).toBe(true);
  });

  it("defaults older saved configs to disabled", () => {
    window.localStorage.setItem("zhijian.ai-provider-config.v1:user-1", JSON.stringify({ apiKey: "key", model: "model", apiUrl: DEFAULT_AI_OUTLINE_API_URL }));
    expect(loadAIProviderConfig("user-1").enabled).toBe(false);
  });
});
