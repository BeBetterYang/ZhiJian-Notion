import { markdownImportTitle, markdownToTree } from "../core/markdown/markdownDocument";
import { richTextToPlainText, type ZhiJianTree } from "../core/tree";
import type { ImageAssetReference } from "../shared/imageAssetStore";

export interface ImportedImageAsset extends ImageAssetReference {
  name?: string;
}

export interface RemoteImageLocalizationResult {
  tree: ZhiJianTree;
  failedCount: number;
}

export type RemoteImageImporter = (url: string, name?: string) => Promise<ImportedImageAsset>;

export async function localizeRemoteImages(
  tree: ZhiJianTree,
  importImage: RemoteImageImporter,
): Promise<RemoteImageLocalizationResult> {
  const imports = new Map<string, Promise<ImportedImageAsset | null>>();
  let failedCount = 0;
  const nodes = Object.fromEntries(await Promise.all(Object.entries(tree.nodes).map(async ([nodeId, node]) => {
    if (!node.blocks?.some((block) => block.type === "image" && isRemoteImageUrl(block.image.url))) {
      return [nodeId, node] as const;
    }
    const blocks = await Promise.all(node.blocks.map(async (block) => {
      if (block.type !== "image" || !isRemoteImageUrl(block.image.url)) return block;
      const remoteUrl = block.image.url;
      let imported = imports.get(remoteUrl);
      if (!imported) {
        imported = importImage(remoteUrl, block.image.name).catch(() => null);
        imports.set(remoteUrl, imported);
      }
      const asset = await imported;
      if (!asset) {
        failedCount += 1;
        return block;
      }
      const image = {
        ...block.image,
        assetId: asset.assetId,
        storagePath: asset.storagePath,
        name: block.image.name || asset.name || "image",
      };
      delete image.url;
      return { ...block, image };
    }));
    return [nodeId, { ...node, blocks }] as const;
  })));
  return { tree: { ...tree, nodes }, failedCount };
}

export async function importMarkdownFiles(files: File[], importImage: RemoteImageImporter) {
  const documents: Array<{ title: string; tree: ZhiJianTree }> = [];
  const failedFiles: string[] = [];
  let failedImageCount = 0;
  for (const file of files) {
    try {
      const fallbackTitle = markdownImportTitle(file.name);
      const parsedTree = markdownToTree(await file.text(), { fallbackTitle });
      const localized = await localizeRemoteImages(parsedTree, importImage);
      const root = localized.tree.nodes[localized.tree.rootId];
      const title = root ? richTextToPlainText(root.content).trim() : "";
      documents.push({ title: title || fallbackTitle || "无标题", tree: localized.tree });
      failedImageCount += localized.failedCount;
    } catch {
      failedFiles.push(file.name);
    }
  }
  return { documents, failedFiles, failedImageCount };
}

function isRemoteImageUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
