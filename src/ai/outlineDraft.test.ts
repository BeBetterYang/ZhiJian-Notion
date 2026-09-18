import { describe, expect, it } from "vitest";
import {
  AIOutlineDraftValidationError,
  MAX_AI_DRAFT_DEPTH,
  validateAIOutlineDraft,
} from "./outlineDraft";

const validDraft = {
  type: "ai-outline-draft",
  version: 1,
  title: "市场营销课程",
  source: { fileName: "课程.pdf", title: "课程讲义", pageCount: 20 },
  nodes: [{
    id: "node-1",
    title: "第一章 市场概述",
    summary: "介绍市场营销的基本概念。",
    sourcePages: { startPage: 1, endPage: 4 },
    children: [{ id: "node-2", title: "核心概念", children: [] }],
  }],
};

describe("validateAIOutlineDraft", () => {
  it("normalizes valid draft text and keeps page references", () => {
    const draft = validateAIOutlineDraft({
      ...validDraft,
      title: "  市场营销课程  ",
      nodes: [{ ...validDraft.nodes[0], title: " 第一章市场概述 " }],
    });
    expect(draft.title).toBe("市场营销课程");
    expect(draft.nodes[0].title).toBe("第一章市场概述");
    expect(draft.nodes[0].sourcePages).toEqual({ startPage: 1, endPage: 4 });
  });

  it("rejects unsupported versions, duplicate ids and invalid page ranges", () => {
    expect(() => validateAIOutlineDraft({ ...validDraft, version: 2 })).toThrow(AIOutlineDraftValidationError);
    expect(() => validateAIOutlineDraft({
      ...validDraft,
      nodes: [{ ...validDraft.nodes[0], children: [{ id: "node-1", title: "重复", children: [] }] }],
    })).toThrow("重复节点 ID");
    expect(() => validateAIOutlineDraft({
      ...validDraft,
      nodes: [{ ...validDraft.nodes[0], sourcePages: { startPage: 4, endPage: 21 } }],
    })).toThrow("超出 PDF 范围");
  });

  it("rejects drafts deeper than the supported limit", () => {
    let node: Record<string, unknown> = { id: "node-0", title: "节点", children: [] };
    for (let depth = 1; depth <= MAX_AI_DRAFT_DEPTH + 1; depth += 1) {
      node = { id: `node-${depth}`, title: "节点", children: [node] };
    }
    expect(() => validateAIOutlineDraft({ ...validDraft, nodes: [node] })).toThrow("层级不能超过");
  });
});
