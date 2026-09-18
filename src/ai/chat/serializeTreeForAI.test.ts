import { describe, expect, it } from "vitest";
import { plainTextContent, type ZhiJianTree } from "../../core/tree";
import { serializeTreeForAI } from "./serializeTreeForAI";

function tree(): ZhiJianTree {
  return {
    rootId: "root",
    nodes: {
      root: { id: "root", parentId: null, children: ["child"], content: plainTextContent("标题"), type: "heading", meta: { createdAt: 1, updatedAt: 1 } },
      child: {
        id: "child", parentId: "root", children: [], content: plainTextContent("重点"), type: "todo",
        props: { checked: true }, description: plainTextContent("说明"),
        blocks: [
          { id: "quote", type: "quote", content: plainTextContent("引用") },
          { id: "image", type: "image", image: { assetId: "secret", url: "https://secret.test/image.png", caption: "截图" } },
        ], meta: { createdAt: 1, updatedAt: 1 },
      },
    },
  };
}

describe("serializeTreeForAI", () => {
  it("serializes visible document content without internal metadata or URLs", () => {
    const result = serializeTreeForAI(tree());
    expect(result.title).toBe("标题");
    expect(result.content).toContain("- [x] 重点");
    expect(result.content).toContain("> 说明");
    expect(result.content).toContain("[图片：截图]");
    expect(result.content).not.toContain("secret");
    expect(result.content).not.toContain("https://");
    expect(result.nodeCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("truncates deterministically from the beginning", () => {
    const result = serializeTreeForAI({ rootId: "root", nodes: {
      root: { id: "root", parentId: null, children: [], content: plainTextContent("x".repeat(90_000)), type: "text", meta: { createdAt: 1, updatedAt: 1 } },
    } });
    expect(result.truncated).toBe(true);
    expect(result.content).toHaveLength(80_000);
    expect(result.charCount).toBe(90_000);
  });
});
