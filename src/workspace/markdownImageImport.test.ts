import { describe, expect, it, vi } from "vitest";
import { markdownToTree } from "../core/markdown/markdownDocument";
import { importMarkdownFiles, localizeRemoteImages } from "./markdownImageImport";

describe("Markdown remote image localization", () => {
  it("keeps text and failed image URLs while replacing successful images with assets", async () => {
    const tree = markdownToTree([
      "# 文档",
      "",
      "正文",
      "![ok](https://example.com/ok.png)",
      "![bad](https://example.com/bad.png)",
    ].join("\n"));
    const importer = vi.fn(async (url: string) => {
      if (url.endsWith("bad.png")) throw new Error("403");
      return { assetId: "asset-ok", storagePath: "user/asset-ok.png", url: "/signed", name: "ok.png" };
    });

    const result = await localizeRemoteImages(tree, importer);
    const node = result.tree.nodes[result.tree.nodes[result.tree.rootId].children[0]];

    expect(node.content.text).toBe("正文");
    expect(result.failedCount).toBe(1);
    expect(node.blocks?.[0]).toMatchObject({ type: "image", image: { assetId: "asset-ok", storagePath: "user/asset-ok.png", name: "ok" } });
    expect(node.blocks?.[1]).toMatchObject({ type: "image", image: { url: "https://example.com/bad.png", name: "bad" } });
  });

  it("localizes every document in a batch and reports partial image failures", async () => {
    const files = [
      markdownFile("one.md", "# 一\n\n正文一\n![a](https://example.com/a.png)"),
      markdownFile("two.md", "# 二\n\n正文二\n![b](https://example.com/b.png)"),
    ];
    const importer = vi.fn(async (url: string) => {
      if (url.endsWith("b.png")) throw new Error("404");
      return { assetId: "asset-a", storagePath: "user/asset-a.png", url: "/signed" };
    });

    const result = await importMarkdownFiles(files, importer);

    expect(result.failedFiles).toEqual([]);
    expect(result.failedImageCount).toBe(1);
    expect(result.documents.map(({ title }) => title)).toEqual(["一", "二"]);
    const firstNode = result.documents[0].tree.nodes[result.documents[0].tree.nodes[result.documents[0].tree.rootId].children[0]];
    const secondNode = result.documents[1].tree.nodes[result.documents[1].tree.nodes[result.documents[1].tree.rootId].children[0]];
    expect(firstNode.blocks?.[0]).toMatchObject({ type: "image", image: { assetId: "asset-a" } });
    expect(secondNode.blocks?.[0]).toMatchObject({ type: "image", image: { url: "https://example.com/b.png" } });
  });

  it("does not send asset, blob, or data image references to the remote importer", async () => {
    const tree = markdownToTree("# T\n\n正文\n![asset](asset:123)\n![blob](blob:test)\n![data](data:image/png;base64,abc)");
    const importer = vi.fn();

    const result = await localizeRemoteImages(tree, importer);

    expect(result.failedCount).toBe(0);
    expect(importer).not.toHaveBeenCalled();
  });
});

function markdownFile(name: string, content: string) {
  return { name, text: async () => content } as File;
}
