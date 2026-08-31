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
