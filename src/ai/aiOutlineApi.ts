import type { WorkspaceSession } from "../workspace/auth";
import type { AIProviderConfig } from "./aiProviderConfig";
import { validateAIOutlineDraft } from "./outlineDraft";
import type { AIOutlineDraft, SourceChunk, SourceDocument } from "./types";

export class AIOutlineGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIOutlineGenerationError";
  }
}

export async function generateAIOutline(
  session: WorkspaceSession,
  document: SourceDocument,
  chunks: SourceChunk[],
  options: { signal?: AbortSignal; provider?: AIProviderConfig } = {},
): Promise<AIOutlineDraft> {
  let response: Response;
  try {
    response = await fetch("/api/ai/outline", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: document.type === "pdf"
          ? { format: "pdf", fileName: document.fileName, title: document.title, pageCount: document.pageCount }
          : { format: "docx", fileName: document.fileName, title: document.title, sectionCount: document.sections.length },
        chunks: chunks.map((chunk) => {
          if ("startPage" in chunk) {
            return { title: chunk.title, startPage: chunk.startPage, endPage: chunk.endPage, text: chunk.text };
          }
          return { title: chunk.title, startSection: chunk.startSection, endSection: chunk.endSection, text: chunk.text };
        }),
        ...(options.provider ? { provider: { apiKey: options.provider.apiKey, model: options.provider.model, apiUrl: options.provider.apiUrl } } : {}),
      }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new AIOutlineGenerationError("无法连接 AI 服务，请检查网络后重试。");
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw new AIOutlineGenerationError(typeof payload.error === "string" ? payload.error : "AI 生成失败，请稍后重试。");
  }
  try {
    return validateAIOutlineDraft(payload);
  } catch {
    throw new AIOutlineGenerationError("AI 返回的大纲格式不正确，请重试。");
  }
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  } catch {
    throw new AIOutlineGenerationError("AI 服务返回的数据格式不正确。");
  }
}
