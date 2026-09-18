import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialTree } from "../core/tree";
import { TreeStore } from "../core/treeStore";
import {
  FOLDER_VIEW_SORT_STORAGE_KEY,
  FolderView,
  formatFolderDateCompact,
  sortFolderFileItems,
  type FolderFileViewItem,
} from "./FolderView";
import type { WorkspaceFolder, WorkspaceNode } from "./workspaceData";

const folder: WorkspaceFolder = { id: "folder", title: "项目", type: "folder", parentId: null, order: 0 };

function file(id: string, title: string, order: number, createdAt = 1_000, lastEditedAt = 2_000): FolderFileViewItem {
  return {
    file: { id, title, type: "file", parentId: "folder", order, favorite: false, openedAt: order },
    createdAt,
    lastEditedAt,
  };
}

function itemTitles(items: FolderFileViewItem[]) {
  return items.map((item) => item.file.title);
}

function renderFolder(items: FolderFileViewItem[]) {
  const stores = new Map(items.map((item) => {
    const tree = createInitialTree();
    tree.nodes[tree.rootId].content.text = item.file.title;
    tree.nodes[tree.rootId].meta = { createdAt: item.createdAt, updatedAt: item.lastEditedAt };
    Object.values(tree.nodes).forEach((node) => {
      if (node.id !== tree.rootId) node.meta = { createdAt: 0, updatedAt: 0 };
    });
    return [item.file.id, new TreeStore(tree)] as const;
  }));
  const renderView = (currentFolder: WorkspaceFolder) => {
    const nodes: WorkspaceNode[] = [currentFolder, ...items.map((item) => ({ ...item.file, parentId: currentFolder.id }))];
    return (
      <FolderView
        folder={currentFolder}
        nodes={nodes}
        stores={stores}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
        onCreateFile={vi.fn()}
        onCreateFolder={vi.fn()}
        onMoveNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
        openMenuNodeId={null}
        renderNodeMenu={() => null}
      />
    );
  };
  const view = render(renderView(folder));
  return { ...view, rerenderFolder: (currentFolder: WorkspaceFolder) => view.rerender(renderView(currentFolder)) };
}

function visibleTitles() {
  return Array.from(document.querySelectorAll(".folder-view-row-main .folder-view-row-copy > span:first-child"), (element) => element.textContent);
}

describe("Folder View sorting", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps custom order, sorts titles naturally, and does not mutate source order", () => {
    const items = [file("a", "文档10", 1), file("b", "文档2", 0), file("c", "Alpha", 2), file("d", "alpha", 3), file("e", "中文标题", 4)];
    expect(itemTitles(sortFolderFileItems(items, "custom", "asc"))).toEqual(["文档2", "文档10", "Alpha", "alpha", "中文标题"]);
    expect(itemTitles(sortFolderFileItems(items, "custom", "desc"))).toEqual(["中文标题", "alpha", "Alpha", "文档10", "文档2"]);
    expect(itemTitles(sortFolderFileItems(items, "title", "asc"))).toEqual(["文档2", "文档10", "中文标题", "Alpha", "alpha"]);
    expect(items.map((item) => item.file.order)).toEqual([1, 0, 2, 3, 4]);
  });

  it("puts unknown timestamps last in either direction and uses order then id as tie-breakers", () => {
    const items = [file("b", "B", 1, 0, 0), file("a", "A", 0, 0, 0), file("new", "New", 2, 3_000, 3_000), file("tie-b", "Tie B", 4, 2_000, 2_000), file("tie-a", "Tie A", 3, 2_000, 2_000)];
    expect(itemTitles(sortFolderFileItems(items, "createdAt", "asc"))).toEqual(["Tie A", "Tie B", "New", "A", "B"]);
    expect(itemTitles(sortFolderFileItems(items, "lastEditedAt", "desc"))).toEqual(["New", "Tie A", "Tie B", "A", "B"]);
  });

  it("formats compact dates without a live timer", () => {
    const now = new Date(2026, 8, 18, 12, 34).getTime();
    expect(formatFolderDateCompact(new Date(2026, 8, 18, 9, 5).getTime(), now)).toBe("今天 09:05");
    expect(formatFolderDateCompact(new Date(2026, 8, 17, 18, 41).getTime(), now)).toBe("昨天 18:41");
    expect(formatFolderDateCompact(new Date(2026, 8, 15, 18, 41).getTime(), now)).toBe("9月15日");
    expect(formatFolderDateCompact(new Date(2025, 11, 18, 18, 41).getTime(), now)).toBe("2025年12月18日");
    expect(formatFolderDateCompact(0, now)).toBe("未知");
  });

  it("persists each folder preference and disables file reorder outside custom ascending", () => {
    const items = [file("a", "A", 0, 1_000, 4_000), file("b", "B", 1, 2_000, 3_000)];
    const view = renderFolder(items);

    fireEvent.click(screen.getByRole("button", { name: /自定义/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "最后编辑时间" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "倒序" }));

    expect(visibleTitles()).toEqual(["A", "B"]);
    expect(JSON.parse(window.localStorage.getItem(FOLDER_VIEW_SORT_STORAGE_KEY) ?? "{}"))
      .toEqual({ folder: { key: "lastEditedAt", direction: "desc" } });
    expect(document.querySelector(".folder-view-row[draggable='true']")).toBeNull();

    const anotherFolder: WorkspaceFolder = { ...folder, id: "another", title: "另一个文件夹" };
    view.rerenderFolder(anotherFolder);
    fireEvent.click(screen.getByRole("button", { name: /自定义/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "标题" }));
    expect(JSON.parse(window.localStorage.getItem(FOLDER_VIEW_SORT_STORAGE_KEY) ?? "{}"))
      .toEqual({ folder: { key: "lastEditedAt", direction: "desc" }, another: { key: "title", direction: "asc" } });

    view.rerenderFolder(folder);
    expect(screen.getByRole("button", { name: /最后编辑时间/ })).toBeInTheDocument();
  });
});
