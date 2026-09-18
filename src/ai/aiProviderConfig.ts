export const DEFAULT_AI_OUTLINE_API_URL = "https://api.openai.com/v1/chat/completions";

export interface AIProviderConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  apiUrl: string;
}

const AI_PROVIDER_STORAGE_PREFIX = "zhijian.ai-provider-config.v1:";

export function emptyAIProviderConfig(): AIProviderConfig {
  return { enabled: false, apiKey: "", model: "", apiUrl: DEFAULT_AI_OUTLINE_API_URL };
}

export function loadAIProviderConfig(userId: string): AIProviderConfig {
  const fallback = emptyAIProviderConfig();
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "null") as Partial<AIProviderConfig> | null;
    return normalizeAIProviderConfig({
      enabled: value?.enabled === true,
      apiKey: typeof value?.apiKey === "string" ? value.apiKey : fallback.apiKey,
      model: typeof value?.model === "string" ? value.model : fallback.model,
      apiUrl: typeof value?.apiUrl === "string" && value.apiUrl.trim() ? value.apiUrl : fallback.apiUrl,
    });
  } catch {
    return fallback;
  }
}

export function saveAIProviderConfig(userId: string, config: AIProviderConfig) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(normalizeAIProviderConfig(config)));
}

export function normalizeAIProviderConfig(config: AIProviderConfig): AIProviderConfig {
  return {
    enabled: config.enabled === true,
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    apiUrl: normalizeAIProviderUrl(config.apiUrl),
  };
}

export function isAIProviderConfigComplete(config: AIProviderConfig) {
  return Boolean(config.apiKey.trim() && config.model.trim() && config.apiUrl.trim());
}

function storageKey(userId: string) {
  return `${AI_PROVIDER_STORAGE_PREFIX}${userId}`;
}

function normalizeAIProviderUrl(value: string) {
  const url = value.trim().replace(/\/+$/, "");
  if (!url) return DEFAULT_AI_OUTLINE_API_URL;
  return /\/chat\/completions$/i.test(url) ? url : `${url}/chat/completions`;
}
