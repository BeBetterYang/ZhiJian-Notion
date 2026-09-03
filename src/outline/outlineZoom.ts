import { richTextToPlainText, type ZhiJianTree } from "../core/tree";

export function isProtectedOutlineRoot(
  nodeId: string,
  documentRootId: string | null,
  zoomedNodeId: string | null,
) {
  return nodeId === documentRootId || nodeId === zoomedNodeId;
}

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
  const visibleNodeIds = zoomVisibleNodeIds(tree, path);
  const hiddenNodes = Object.keys(tree.nodes)
    .filter((nodeId) => !visibleNodeIds.has(nodeId))
    .map(block);
  if (hiddenNodes.length) {
    rules.push(`.outline-panel :is(${hiddenNodes.join(", ")}) { display: none !important; }`);
  }
  for (let index = 0; index < path.length - 1; index += 1) {
    const ancestor = block(path[index]);
    const next = path[index + 1];
    rules.push(
      `.outline-panel ${ancestor} > .bn-block > .bn-block-content { display: none; }`,
      `.outline-panel ${ancestor} > .bn-block > .bn-block-group > .bn-block-outer:not([data-id="${escapeCssString(next)}"]) { display: none; }`,
      `.outline-panel ${ancestor} > .bn-block > .bn-block-group { margin-left: 0; margin-top: 0; padding-left: 0; }`,
      // The guide line belongs to a level that is no longer on screen.
      `.outline-panel ${block(next)}::before { display: none !important; }`,
    );
  }

  const zoomed = block(path.at(-1)!);
  rules.push(
    // The focused node takes the same visual role as the document root. It is
    // still the same Tree node and BlockNote block; only its outline projection
    // changes while focus mode is active.
    //
    // 只放大、不加粗：升格是这个节点临时坐了标题的位子，不代表它的文字变粗了。写死 700 的话，
    // 用户自己有没有加粗就看不出来——而手动加的粗还在 `<strong>` 上，照旧显示。
    `.outline-panel ${zoomed} > .bn-block > .bn-block-content { font-size: 34px; font-weight: 400; line-height: 1.2; }`,
    // 本身是 heading 的节点，里面那层 `h1/h2/h3` 自带字号和粗细，不继承就压过上面这条。
    `.outline-panel ${zoomed} > .bn-block > .bn-block-content[data-content-type="heading"] > :is(h1, h2, h3) { font-size: inherit; font-weight: inherit; line-height: inherit; }`,
    `.outline-panel ${zoomed} > .bn-block > .bn-block-content::before { content: none !important; }`,
    // 和文档标题一样不向子级引一条线：留着的话，标题下面会多出一截没有下文的引导线。
    // `!important` 是因为画那条线的规则（`styles.css` 里 `:has(> .bn-block >
    // .bn-block-group)` 那条）选择器更长，光靠后加载压不过它。
    `.outline-panel ${zoomed} > .bn-block > .bn-block-content { background-image: none !important; }`,
    `.outline-panel ${zoomed} > .bn-block > .bn-block-content:has(.ProseMirror-trailingBreak:only-child)::after { content: "无标题" !important; }`,
    `.outline-panel ${zoomed} > .bn-block > .bn-block-group { margin-left: 0; margin-top: 16px; }`,
    `.outline-panel ${zoomed} > .bn-block > .bn-block-group > .bn-block-outer::before { display: none; }`,
  );
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

export interface FocusBreadcrumbSibling {
  id: string;
  label: string;
  /** 这一级面包屑当前落在的那个节点，弹层里高亮它。 */
  current: boolean;
}

export interface FocusBreadcrumbItem {
  id: string;
  label: string;
  /** 面包屑的最末一级，也就是当前专注的那个节点。 */
  current: boolean;
  /**
   * 同一个 parentId 下的全部 children，按父节点里的原顺序，包含自己。面包屑靠它做横向切换：
   * 悬浮某一级就能换到同级的另一个主题。只剩自己一个时不弹层。
   */
  siblings: FocusBreadcrumbSibling[];
}

/**
 * 文档内面包屑：文档标题之后的每一级，最后一级就是当前专注的节点。文档根不在里面——它由工作区
 * 用文件名画，点它是退出专注。
 */
export function focusBreadcrumbItems(
  tree: ZhiJianTree,
  zoomedNodeId: string | null,
): FocusBreadcrumbItem[] {
  return zoomPath(tree, zoomedNodeId).slice(1).map((nodeId, index, path) => {
    const parentId = tree.nodes[nodeId]?.parentId;
    // 顺序原样用父节点的 children，不重排也不过滤，弹层里的先后就是文档里的先后。
    const siblingIds = (parentId ? tree.nodes[parentId]?.children : undefined) ?? [nodeId];
    return {
      id: nodeId,
      label: focusBreadcrumbLabel(tree, nodeId),
      current: index === path.length - 1,
      siblings: siblingIds.map((siblingId) => ({
        id: siblingId,
        label: focusBreadcrumbLabel(tree, siblingId),
        current: siblingId === nodeId,
      })),
    };
  });
}

function focusBreadcrumbLabel(tree: ZhiJianTree, nodeId: string) {
  return richTextToPlainText(tree.nodes[nodeId]?.content ?? { text: "" }) || "未命名";
}

function zoomVisibleNodeIds(tree: ZhiJianTree, path: string[]) {
  const visible = new Set(path);
  const pending = [...(tree.nodes[path.at(-1)!]?.children ?? [])];
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (visible.has(nodeId)) continue;
    visible.add(nodeId);
    pending.push(...(tree.nodes[nodeId]?.children ?? []));
  }
  return visible;
}

function block(id: string) {
  return `.bn-block-outer[data-id="${escapeCssString(id)}"]`;
}

function escapeCssString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
