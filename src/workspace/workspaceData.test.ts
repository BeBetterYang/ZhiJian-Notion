import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceNode,
  deleteWorkspaceNode,
  duplicateWorkspaceNode,
  folderPath,
  initialNodes,
  isWorkspaceFile,
  markFileOpened,
  moveWorkspaceNode,
  placeWorkspaceNode,
  searchFiles,
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

  it("moves an opened file to the top of recent ordering", () => {
    const updated = markFileOpened(initialNodes, "reading");
    expect(updated.filter(isWorkspaceFile).find((node) => node.id === "reading")?.openedAt).toBeGreaterThan(6);
  });
});
