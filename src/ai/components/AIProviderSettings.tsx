import { useEffect, useState } from "react";
import {
  DEFAULT_AI_OUTLINE_API_URL,
  isAIProviderConfigComplete,
  normalizeAIProviderConfig,
  type AIProviderConfig,
} from "../aiProviderConfig";

interface AIProviderSettingsProps {
  value: AIProviderConfig;
  onSave: (config: AIProviderConfig) => void;
}

export function AIProviderSettings({ value, onSave }: AIProviderSettingsProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);

  const update = <K extends keyof AIProviderConfig>(field: K, nextValue: AIProviderConfig[K]) => {
    setDraft((current) => ({ ...current, [field]: nextValue }));
    setError("");
  };

  const save = () => {
    const next = normalizeAIProviderConfig(draft);
    if (next.enabled && !isAIProviderConfigComplete(next)) {
      setError("请填写 API 密钥、模型名称和 API 地址。");
      return;
    }
    onSave(next);
  };

  return (
    <section className="settings-section ai-provider-settings">
      <h3>AI 大纲服务</h3>
      <p className="settings-section-description">使用你配置的 AI 服务生成 PDF 或 Word 大纲，并和当前文档 AI 对话共用配置。API 密钥会保存在当前浏览器中。</p>
      <div className="settings-rule settings-ai-toggle-row">
        <span><strong>启用 AI 文档导入</strong><small>开启后，侧边栏导入菜单中显示 AI 文档导入入口。</small></span>
        <button
          type="button"
          role="switch"
          aria-label="启用 AI 文档导入"
          aria-checked={draft.enabled}
          className={`toolbar-menu-switch settings-ai-toggle${draft.enabled ? " is-active" : ""}`}
          onClick={() => update("enabled", !draft.enabled)}
        >
          <span />
        </button>
      </div>
      <label className="settings-ai-field">
        <span>API 密钥</span>
        <input aria-label="AI API 密钥" type="password" autoComplete="off" value={draft.apiKey} onChange={(event) => update("apiKey", event.target.value)} placeholder="输入服务商 API 密钥" />
      </label>
      <label className="settings-ai-field">
        <span>API 地址</span>
        <input aria-label="AI API 地址" value={draft.apiUrl} onChange={(event) => update("apiUrl", event.target.value)} placeholder={DEFAULT_AI_OUTLINE_API_URL} />
      </label>
      <label className="settings-ai-field">
        <span>模型名称</span>
        <input aria-label="AI 模型名称" value={draft.model} onChange={(event) => update("model", event.target.value)} placeholder="输入服务商提供的模型名称" />
      </label>
      {error ? <p className="settings-ai-error" role="alert">{error}</p> : null}
      <div className="settings-ai-actions">
        <button type="button" className="settings-save" onClick={save}>保存 AI 设置</button>
      </div>
    </section>
  );
}
