import { describe, expect, it, vi } from "vitest";
import {
  applyMindMapDefaults,
  createWorkspaceDocument,
  createWorkspaceNode,
  deleteWorkspaceNode,
  duplicateWorkspaceNode,
  folderPath,
  initialNodes,
  isWorkspaceFile,
  markFileOpened,
  moveWorkspaceNode,
  placeWorkspaceNode,
  restoreWorkspaceTrashEntry,
  searchFiles,
  trashWorkspaceNode,
} from "./workspaceData";
import type { WorkspaceNode } from "./workspaceData";

describe("workspace tree helpers", () => {
  it("searches file titles case-insensitively", () => {
    expect(searchFiles(initialNodes, "WEB").map((file) => file.id)).toEqual(["web-roadmap"]);
  });

  it("creates documents and limits folders to three levels", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const document = createWorkspaceNode(initialNodes, "file", "product");
    expect(document.node).toMatchObject({ title: "无标题", parentId: "product", favorite: false });
    expect(document.nodes.filter((node) => node.parentId === "product").sort((a, b) => a.order - b.order)[0]?.id).toBe(document.node?.id);
    const levelThree = createWorkspaceNode(initialNodes, "folder", "roadmaps");
    expect(levelThree.node?.type).toBe("folder");
    const blocked = createWorkspaceNode(levelThree.nodes, "folder", levelThree.node!.id);
    expect(blocked.node).toBeNull();
    vi.restoreAllMocks();
  });

  it("applies the user's default mind-map style and theme to new documents", () => {
    const defaults = {
      layout: { type: "mind-map" as const, direction: "both" as const, order: "alternating" as const },
      theme: { id: "yanpi", version: 1 },
      connector: { rounded: true },
      frame: { rounded: true },
      canvas: { background: "#faf9f7" },
    };

    const document = createWorkspaceDocument("新文档", defaults);

    expect(document.nodes[document.rootId].content.text).toBe("新文档");
    expect(document.mindMap).toMatchObject(defaults);
    expect(document.mindMap?.layout).not.toBe(defaults.layout);
    expect(document.mindMap?.theme).not.toBe(defaults.theme);
  });

  it("keeps a document's own mind-map choices ahead of user defaults", () => {
    const document = createWorkspaceDocument("已有文档");
    document.mindMap = {
      layout: { type: "logic", direction: "left" },
      theme: { id: "ocean", version: 1 },
    };

    const result = applyMindMapDefaults(document, {
      layout: { type: "mind-map", direction: "both", order: "left-first" },
      theme: { id: "yanpi", version: 1 },
      connector: { rounded: true },
    });

    expect(result.mindMap).toMatchObject({
      layout: { type: "logic", direction: "left" },
      theme: { id: "ocean", version: 1 },
      connector: { rounded: true },
    });
  });

  it("moves and reorders nodes without exceeding folder depth", () => {
    const reordered = placeWorkspaceNode(initialNodes, "personal", "product", "before");
    expect(reordered.filter((node) => node.parentId === null).sort((a, b) => a.order - b.order)[0]?.id).toBe("personal");
    const moved = moveWorkspaceNode(initialNodes, "meeting", "roadmaps");
    expect(moved.find((node) => node.id === "meeting")?.parentId).toBe("roadmaps");
    const blocked = moveWorkspaceNode(initialNodes, "product", "roadmaps");
    expect(blocked).toBe(initialNodes);
  });

  it("keeps the folder path for breadcrumbs", () => {
    expect(folderPath(initialNodes, "web-roadmap").map((folder) => folder.title)).toEqual(["产品", "路线图"]);
  });

  it("duplicates and recursively deletes a folder", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const duplicated = duplicateWorkspaceNode(initialNodes, "roadmaps");
    expect(duplicated.nodes).toHaveLength(initialNodes.length + 3);
    const deleted = deleteWorkspaceNode(duplicated.nodes, duplicated.node!.id);
    expect(deleted).toHaveLength(initialNodes.length);
    vi.restoreAllMocks();
  });

  it("只给复制的根节点加「副本」，子节点保持原名", () => {
    const duplicated = duplicateWorkspaceNode(initialNodes, "roadmaps");

    expect(duplicated.node?.title).toBe("路线图 副本");
    const childTitles = duplicated.nodes
      .filter((node) => node.parentId === duplicated.node!.id)
      .map((node) => node.title)
      .sort();
    expect(childTitles).toEqual(["App 端设计记录", "Web 端路线图"]);
  });

  it("复制文件夹时给出每一层的「源 id → 新 id」对照表", () => {
    // Folder ├─ A └─ Sub └─ B：子文件夹里的文档也必须出现在对照表里，
    // 否则调用方复制不到它的内容，刷新后就成了空文档。
    const nodes: WorkspaceNode[] = [
      { id: "folder", title: "项目 A", type: "folder", parentId: null, order: 0 },
      { id: "file-a", title: "需求", type: "file", parentId: "folder", order: 0, favorite: false, openedAt: 1 },
      { id: "sub", title: "子文件夹", type: "folder", parentId: "folder", order: 1 },
      { id: "file-b", title: "会议记录", type: "file", parentId: "sub", order: 0, favorite: false, openedAt: 2 },
    ];

    const duplicated = duplicateWorkspaceNode(nodes, "folder");

    expect(duplicated.nodes).toHaveLength(nodes.length * 2);
    expect(duplicated.duplicatedNodes.map((entry) => entry.sourceId).sort())
      .toEqual(["file-a", "file-b", "folder", "sub"]);
    const files = duplicated.duplicatedNodes.filter((entry) => entry.type === "file");
    expect(files).toHaveLength(2);
    for (const entry of duplicated.duplicatedNodes) {
      expect(entry.targetId).not.toBe(entry.sourceId);
      expect(duplicated.nodes.some((node) => node.id === entry.targetId)).toBe(true);
    }
    // 子文件夹的父节点要指向副本，不能还挂在源文件夹下面。
    const subCopyId = duplicated.duplicatedNodes.find((entry) => entry.sourceId === "sub")!.targetId;
    expect(duplicated.nodes.find((node) => node.id === subCopyId)?.parentId).toBe(duplicated.node!.id);
    const fileBCopyId = duplicated.duplicatedNodes.find((entry) => entry.sourceId === "file-b")!.targetId;
    expect(duplicated.nodes.find((node) => node.id === fileBCopyId)?.parentId).toBe(subCopyId);
  });

  it("复制单篇文档得到新的 fileId", () => {
    const duplicated = duplicateWorkspaceNode(initialNodes, "product-plan");

    expect(duplicated.node?.title).toBe("产品规划 副本");
    expect(duplicated.duplicatedNodes).toEqual([
      { sourceId: "product-plan", targetId: duplicated.node!.id, type: "file" },
    ]);
  });

  it("moves a subtree to trash and restores it", () => {
    const trashed = trashWorkspaceNode(initialNodes, "product");
    expect(trashed.nodes.some((node) => node.id === "product-plan")).toBe(false);
    expect(trashed.entry?.nodes.map((node) => node.id)).toContain("web-roadmap");

    const restored = restoreWorkspaceTrashEntry(trashed.nodes, trashed.entry!);
    expect(restored.find((node) => node.id === "product-plan")?.parentId).toBe("product");
    expect(restored.find((node) => node.id === "product")?.parentId).toBeNull();
  });

  it("restores an item at the root when its original folder no longer exists", () => {
    const trashed = trashWorkspaceNode(initialNodes, "product-plan");
    const withoutParent = deleteWorkspaceNode(trashed.nodes, "product");
    const restored = restoreWorkspaceTrashEntry(withoutParent, trashed.entry!);
    expect(restored.find((node) => node.id === "product-plan")?.parentId).toBeNull();
  });

  it("moves an opened file to the top of recent ordering", () => {
    const updated = markFileOpened(initialNodes, "reading");
    expect(updated.filter(isWorkspaceFile).find((node) => node.id === "reading")?.openedAt).toBeGreaterThan(6);
  });
});
