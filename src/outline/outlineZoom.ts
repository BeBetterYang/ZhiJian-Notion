import type { ZhiJianTree } from "../core/tree";

/**
 * 进入当前主题 (Ctrl ]) shows one node's subtree as though it were the whole
 * document. Like collapsing, it is done with CSS over the full projection rather
 * than by projecting a different document: `blockNoteToTree` rebuilds a node's
 * children from what it is given, so an outline projected from a lower root would be
 * read back as every other node having been deleted.
 *
 * What the rules do, for a zoom on Z under root → a → Z:
 *   - hide each ancestor's own text row, so the page starts at Z;
 *   - hide each ancestor's other children, so nothing beside the path shows;
 *   - undo each ancestor's indent, so Z sits at the left edge instead of two levels in.
 */
export function zoomedOutlineCss(tree: ZhiJianTree, zoomedNodeId: string | null): string {
  const path = zoomPath(tree, zoomedNodeId);
  if (path.length < 2) {
    return "";
  }

  const rules: string[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const ancestor = block(path[index]);
    const next = path[index + 1];
    rules.push(
      `.outline-panel ${ancestor} > .bn-block > .bn-block-content { display: none; }`,
      `.outline-panel ${ancestor} > .bn-block > .bn-block-group > .bn-block-outer:not([data-id="${escapeCssString(next)}"]) { display: none; }`,
      `.outline-panel ${ancestor} > .bn-block > .bn-block-group { margin-left: 0; padding-left: 0; }`,
      // The guide line belongs to a level that is no longer on screen.
      `.outline-panel ${block(next)}::before { display: none; }`,
    );
  }
  return rules.join("\n");
}

/**
 * The nodes from the root down to the zoomed one, root first — the breadcrumb of
 * 进入当前主题, and empty when nothing is zoomed or the id is gone from the tree
 * (a zoomed node that was deleted leaves the zoom with nothing to show).
 */
export function zoomPath(tree: ZhiJianTree, zoomedNodeId: string | null): string[] {
  if (!zoomedNodeId || !tree.nodes[zoomedNodeId] || zoomedNodeId === tree.rootId) {
    return [];
  }
  const path: string[] = [];
  let current: string | null = zoomedNodeId;
  while (current) {
    path.unshift(current);
    current = tree.nodes[current]?.parentId ?? null;
  }
  return path;
}

function block(id: string) {
  return `.bn-block-outer[data-id="${escapeCssString(id)}"]`;
}

function escapeCssString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
