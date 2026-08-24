import { describe, expect, it } from "vitest";
import type { ZhiJianTree } from "../tree";
import { markdownFileName, markdownToTree, treeToMarkdown } from "./markdownDocument";

/** The mubu export the user handed us as the import/export template. */
const TEMPLATE = `# 新手入门

字体测试
- **加粗**，*斜体*，下划线，~~删除线~~

颜色测试
- 字体颜色
- 背景颜色

表格测试
| 1 | 2 | 3 |
| --- | --- | --- |
| 4 | 5 | 6 |
| 7 | 8 | 9 |

图片测试
- 这是图片
  ![image-1](https://api2.mubu.com/v3/document_image/35569582_9b59bb08-669c-4906-a6e8-3e5b33fca308.png)

描述测试
- 我有一个描述
  > 这是描述内容

待办测试
- [ ] 1.未完成
- [x] 2.已完成

链接测试
- [百度](http://baidu.com/)

代码块测试
- \`this is code\`

挖空测试
- 你能看见挖空内容吗？

# 一级标题

## 二级标题

### 三级标题

正文
`;

function sequentialIds() {
  let counter = 0;
  return () => `n${(counter += 1)}`;
}

function importTemplate(markdown = TEMPLATE) {
  return markdownToTree(markdown, { createId: sequentialIds() });
}

function childByText(tree: ZhiJianTree, parentId: string, text: string) {
  const match = tree.nodes[parentId].children
    .map((id) => tree.nodes[id])
    .find((node) => node.content.text === text);
  if (!match) {
    throw new Error(`No child of ${parentId} with text ${text}`);
  }
  return match;
}

function topLevel(tree: ZhiJianTree, text: string) {
  return childByText(tree, tree.rootId, text);
}

describe("markdownToTree", () => {
  it("takes the first heading as the root node", () => {
    const tree = importTemplate();
    const root = tree.nodes[tree.rootId];
    expect(root.content.text).toBe("新手入门");
    expect(root.type).toBe("heading");
    expect(root.props?.headingLevel).toBe(1);
    expect(root.parentId).toBeNull();
  });

  it("falls back to the file name when the document has no heading", () => {
    const tree = markdownToTree("正文\n", { createId: sequentialIds(), fallbackTitle: "无标题文档" });
    expect(tree.nodes[tree.rootId].content.text).toBe("无标题文档");
    expect(topLevel(tree, "正文").type).toBe("text");
  });

  it("reads depth from the text column, not from the list markers", () => {
    const tree = markdownToTree("# T\n\na\n- b\n  - c\nd\n", { createId: sequentialIds() });
    const a = topLevel(tree, "a");
    const b = childByText(tree, a.id, "b");
    expect(childByText(tree, b.id, "c").content.text).toBe("c");
    expect(topLevel(tree, "d").content.text).toBe("d");
  });

  it("keeps inline marks that markdown can spell", () => {
    const tree = importTemplate();
    const fonts = topLevel(tree, "字体测试");
    const line = tree.nodes[fonts.children[0]];
    expect(line.content.spans).toEqual([
      { text: "加粗", marks: { bold: true } },
      { text: "，" },
      { text: "斜体", marks: { italic: true } },
      { text: "，下划线，" },
      { text: "删除线", marks: { strike: true } },
    ]);
  });

  it("keeps links as a mark on the linked run", () => {
    const tree = importTemplate();
    const link = tree.nodes[topLevel(tree, "链接测试").children[0]];
    expect(link.content.text).toBe("百度");
    expect(link.content.spans).toEqual([{ text: "百度", marks: { linkUrl: "http://baidu.com/" } }]);
  });

  it("hangs a table off the node above it as a table child", () => {
    const tree = importTemplate();
    const tables = topLevel(tree, "表格测试");
    expect(tables.children).toHaveLength(1);
    const table = tree.nodes[tables.children[0]];
    expect(table.type).toBe("table");
    expect(table.props?.table?.headerRows).toBe(1);
    expect(table.props?.table?.rows.map((row) => row.map((cell) => cell.content.text))).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
    ]);
  });

  it("reads an indented image as an image block on the node it sits under", () => {
    const tree = importTemplate();
    const owner = tree.nodes[topLevel(tree, "图片测试").children[0]];
    expect(owner.content.text).toBe("这是图片");
    expect(owner.blocks).toEqual([
      {
        id: expect.any(String),
        type: "image",
        image: {
          name: "image-1",
          url: "https://api2.mubu.com/v3/document_image/35569582_9b59bb08-669c-4906-a6e8-3e5b33fca308.png",
        },
      },
    ]);
  });

  it("reads an indented quote as the node's description", () => {
    const tree = importTemplate();
    const owner = tree.nodes[topLevel(tree, "描述测试").children[0]];
    expect(owner.description?.text).toBe("这是描述内容");
    expect(owner.blocks).toBeUndefined();
  });

  it("reads a run of quote lines as one quote of several lines", () => {
    const tree = markdownToTree("# T\n\na\n- b\n  > one\n  > two\n", { createId: sequentialIds() });
    const owner = childByText(tree, topLevel(tree, "a").id, "b");
    expect(owner.description?.text).toBe("one\ntwo");
    expect(owner.blocks).toBeUndefined();
    // And back out again as the two `>` lines it came from.
    expect(treeToMarkdown(tree)).toContain("  > one\n  > two\n");
  });

  it("keeps marks out of the break when a quote line is split back out", () => {
    const tree = markdownToTree("# T\n\na\n- b\n  > **one**\n  > **two**\n", {
      createId: sequentialIds(),
    });
    const owner = childByText(tree, topLevel(tree, "a").id, "b");
    expect(owner.description?.spans).toEqual([
      { text: "one", marks: { bold: true } },
      { text: "\n" },
      { text: "two", marks: { bold: true } },
    ]);
    expect(treeToMarkdown(tree)).toContain("  > **one**\n  > **two**\n");
  });

  it("starts a new quote after a line that is not one", () => {
    const tree = markdownToTree("# T\n\na\n- b\n  > one\n\n  > two\n", {
      createId: sequentialIds(),
    });
    const owner = childByText(tree, topLevel(tree, "a").id, "b");
    expect(owner.description?.text).toBe("one");
    expect(owner.blocks).toEqual([
      { id: expect.any(String), type: "quote", content: { text: "two" } },
    ]);
  });

  it("reads checkbox bullets as todo nodes", () => {
    const tree = importTemplate();
    const todos = topLevel(tree, "待办测试").children.map((id) => tree.nodes[id]);
    expect(todos.map((node) => [node.type, node.content.text, node.props?.checked])).toEqual([
      ["todo", "1.未完成", false],
      ["todo", "2.已完成", true],
    ]);
  });

  it("reads heading levels from the hash prefix", () => {
    const tree = importTemplate();
    expect(
      [...tree.nodes[tree.rootId].children]
        .map((id) => tree.nodes[id])
        .filter((node) => node.type === "heading")
        .map((node) => [node.content.text, node.props?.headingLevel]),
    ).toEqual([
      ["一级标题", 1],
      ["二级标题", 2],
      ["三级标题", 3],
    ]);
  });

  it("reads an image-only bullet as a node carrying just the image", () => {
    const tree = markdownToTree("# T\n\n- ![p](asset:abc)\n", { createId: sequentialIds() });
    const node = topLevel(tree, "");
    expect(node.blocks).toEqual([
      { id: expect.any(String), type: "image", image: { assetId: "abc", name: "p" } },
    ]);
  });
});

describe("treeToMarkdown", () => {
  it("round trips the template byte for byte", () => {
    expect(treeToMarkdown(importTemplate())).toBe(TEMPLATE);
  });

  it("round trips a template saved without a trailing newline", () => {
    expect(treeToMarkdown(importTemplate(TEMPLATE.trimEnd()))).toBe(TEMPLATE);
  });

  it("round trips again from its own output", () => {
    const once = treeToMarkdown(importTemplate());
    expect(treeToMarkdown(markdownToTree(once, { createId: sequentialIds() }))).toBe(once);
  });

  it("writes local images as asset references", () => {
    const markdown = "# T\n\na\n- b\n  ![shot](asset:img-1)\n";
    const tree = markdownToTree(markdown, { createId: sequentialIds() });
    expect(childByText(tree, topLevel(tree, "a").id, "b").blocks?.[0]).toMatchObject({
      image: { assetId: "img-1", name: "shot" },
    });
    expect(treeToMarkdown(tree)).toBe(markdown);
  });

  it("escapes pipes inside table cells", () => {
    const tree = markdownToTree("# T\n\na\n| x \\| y | z |\n", { createId: sequentialIds() });
    const table = tree.nodes[topLevel(tree, "a").children[0]];
    expect(table.props?.table?.rows[0][0].content.text).toBe("x | y");
    expect(treeToMarkdown(tree)).toBe("# T\n\na\n| x \\| y | z |\n| --- | --- |\n");
  });

  it("returns an empty document when the root is missing", () => {
    expect(treeToMarkdown({ rootId: "gone", nodes: {} })).toBe("");
  });
});

describe("markdownFileName", () => {
  it("names the file after the root node", () => {
    expect(markdownFileName(importTemplate())).toBe("新手入门.md");
  });

  it("replaces characters a file name cannot hold", () => {
    const tree = markdownToTree("# a/b:c\n", { createId: sequentialIds() });
    expect(markdownFileName(tree)).toBe("a_b_c.md");
  });

  it("falls back when the root has no text", () => {
    const tree = markdownToTree("#  \n", { createId: sequentialIds() });
    expect(markdownFileName(tree)).toBe("未命名.md");
  });
});
